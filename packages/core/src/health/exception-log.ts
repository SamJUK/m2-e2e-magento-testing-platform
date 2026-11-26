/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

import fs from 'fs';
import path from 'path';
import type { ProjectConfig } from '../config/schema';

const LOG = 'var/log/exception.log';
const ENTRY = /^\[\d{4}-\d\d-\d\d[T ][^\]]*\] \S+\.[A-Z]+: /;
const SAVED_TO = path.join('test-results', 'magento-exception.log');
// ponytail: a log flooding faster than this is reported from its first 5MB.
const MAX_BYTES = 5_000_000;
// The store and the runner share a clock in CI and locally (measured within 15ms); this covers the rest.
const CLOCK_SLACK_MS = 250;

interface TestWindow {
  title: string;
  retry: number;
  start: number;
  end: number;
  requests?: { label: string; start: number; end: number }[];
}

let offset: number | undefined;

function failsRun(config: ProjectConfig): boolean {
  const env = process.env.E2E_FAIL_ON_EXCEPTIONS;
  return env ? env === '1' : (config.failOnExceptions ?? false);
}

/** Before anything writes to the store, so refusing leaves nothing to undo. */
export function assertExceptionCheckPossible(config: ProjectConfig): void {
  if (failsRun(config) && !config.shell?.exec) {
    throw new Error('[e2e-core] failOnExceptions is on, but shell.exec is not set, so the exception log cannot be read.');
  }
}

/** Call at the end of global setup, so the seed's own entries are not counted. */
export async function markExceptionLog(config: ProjectConfig): Promise<void> {
  if (!config.shell?.exec) return;
  let size: string;
  try {
    const out = await config.shell.exec(`wc -c < ${LOG} 2>/dev/null || echo 0`, { quiet: true });
    // The last line only: a DDEV or Warden shell can print a banner first.
    size = typeof out === 'string' ? (out.trim().split(/\r?\n/).pop()?.trim() ?? '') : 'nothing: this shell.exec does not return its output';
  } catch (error) {
    size = String(error);
  }
  if (!/^\d+$/.test(size)) {
    const message = `[e2e-core] Could not read the size of ${LOG} (got "${size.slice(0, 80)}"), so new exceptions cannot be checked.`;
    if (failsRun(config)) throw new Error(message);
    console.warn(message);
    return;
  }
  offset = Number(size);
  // Set here so the workers, started after global setup, inherit it.
  process.env.E2E_TEST_WINDOWS = path.resolve('test-results', '.test-windows.jsonl');
  fs.mkdirSync(path.dirname(process.env.E2E_TEST_WINDOWS), { recursive: true });
  // Emptied, as a kept output dir would otherwise hold the last run's tests.
  fs.writeFileSync(process.env.E2E_TEST_WINDOWS, '');
}

/** What the store added to its exception log since markExceptionLog. Empty when nothing was marked. */
export async function readNewExceptions(config: ProjectConfig): Promise<string> {
  if (offset === undefined || !config.shell?.exec) return '';
  try {
    // A log rotated or truncated during the run is read from the start.
    const log = await config.shell.exec(
      `[ -f ${LOG} ] || exit 0; if [ "$(wc -c < ${LOG})" -lt ${offset} ]; then cat ${LOG}; else tail -c +${offset + 1} ${LOG}; fi | head -c ${MAX_BYTES}`,
      { quiet: true },
    );
    return typeof log === 'string' ? log.replace(/\r\n/g, '\n') : '';
  } catch (error) {
    // Never in the way of the restores that follow it in teardown.
    console.warn(`[e2e-core] Could not read ${LOG}, so new exceptions were not checked: ${String(error)}`);
    return '';
  }
}

/** Warns, or throws when failOnExceptions is on, which fails the run from global teardown. */
export function reportExceptions(config: ProjectConfig, log: string): void {
  const headlines = log.split(/\r?\n/).filter((line) => ENTRY.test(line));
  if (headlines.length === 0) return;

  const windows = readTestWindows();
  const attributed = headlines.map((line) => `  ${line.slice(0, 240)}\n    while running: ${runningAt(line, windows)}`);
  fs.mkdirSync(path.dirname(SAVED_TO), { recursive: true });
  fs.writeFileSync(SAVED_TO, `${attributed.join('\n')}\n\n${log}`);

  const shown = attributed.slice(0, 5);
  const more = headlines.length > shown.length ? [`  …and ${headlines.length - shown.length} more`] : [];
  const message = [
    `[e2e-core] The store logged ${headlines.length} exception(s) to ${LOG} during the run:`,
    ...shown,
    ...more,
    `Full entries: ${SAVED_TO}`,
  ].join('\n');

  if (!failsRun(config)) {
    console.warn(message);
    return;
  }
  throw new Error(`${message}\nTo report them without failing, set E2E_FAIL_ON_EXCEPTIONS=0.`);
}

function readTestWindows(): TestWindow[] {
  const file = process.env.E2E_TEST_WINDOWS;
  if (!file || !fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').flatMap((line) => {
    // A worker killed mid-write leaves a partial line.
    try {
      return [JSON.parse(line) as TestWindow];
    } catch {
      return [];
    }
  });
}

/** The requests in flight when the entry was logged, or failing that every test running then. */
function runningAt(headline: string, windows: TestWindow[]): string {
  const stamp = headline.slice(1, headline.indexOf(']'));
  // Magento logs in UTC (app/bootstrap.php); older formats leave the zone off.
  const at = Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(stamp) ? stamp : `${stamp.replace(' ', 'T')}Z`);
  if (Number.isNaN(at)) return 'unknown (no readable timestamp)';
  // A stamp without a fraction (older Monolog) means any time in that second.
  const width = /\d\d:\d\d:\d\d\.\d/.test(stamp) ? 0 : 999;
  const within = (slack: number) => (w: { start: number; end: number }) => w.start - slack <= at + width && at <= w.end + slack;
  const during = within(CLOCK_SLACK_MS);
  const named = (w: TestWindow) => (w.retry ? `${w.title} (retry ${w.retry})` : w.title);
  const inFlight = (match: (r: { start: number; end: number }) => boolean) =>
    windows.flatMap((w) => (w.requests ?? []).filter(match).map((r) => `${r.label} in ${named(w)}`));

  // Requests that strictly contain the moment first; the slack only when none do.
  const strict = inFlight(within(0));
  const requests = strict.length ? strict : inFlight(during);
  if (requests.length) return requests.join(' | ');
  const tests = windows.filter(during).map(named);
  return tests.length
    ? `no request in flight (cron, a queue or a background job?); tests running: ${tests.join(' | ')}`
    : 'no test (between tests, or in setup or teardown)';
}
