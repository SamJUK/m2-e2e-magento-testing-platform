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
// Allows for the store's clock and the runner's drifting apart a little.
const CLOCK_SLACK_MS = 1_000;

interface TestWindow {
  title: string;
  retry: number;
  start: number;
  end: number;
}

let offset: number | undefined;

function failsRun(config: ProjectConfig): boolean {
  const env = process.env.E2E_FAIL_ON_EXCEPTIONS;
  return env ? env === '1' : (config.failOnExceptions ?? false);
}

/** Before anything writes to the store, so refusing leaves nothing to undo. */
export function assertExceptionCheckPossible(config: ProjectConfig): void {
  if (failsRun(config) && !config.shell?.capture) {
    throw new Error('[e2e-core] failOnExceptions is on, but shell.capture is not set, so the exception log cannot be read.');
  }
}

/** Call at the end of global setup, so the seed's own entries are not counted. */
export async function markExceptionLog(config: ProjectConfig): Promise<void> {
  if (!config.shell?.capture) return;
  let size: string;
  try {
    // The last line only: a DDEV or Warden shell can print a banner first.
    size = (await config.shell.capture(`wc -c < ${LOG} 2>/dev/null || echo 0`)).trim().split(/\r?\n/).pop()?.trim() ?? '';
  } catch (error) {
    size = String(error);
  }
  if (!/^\d+$/.test(size)) {
    console.warn(`[e2e-core] Could not read the size of ${LOG} (got "${size.slice(0, 80)}"), so new exceptions will not be checked.`);
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
  if (offset === undefined || !config.shell?.capture) return '';
  try {
    // A log rotated or truncated during the run is read from the start.
    const log = await config.shell.capture(
      `[ -f ${LOG} ] || exit 0; if [ "$(wc -c < ${LOG})" -lt ${offset} ]; then cat ${LOG}; else tail -c +${offset + 1} ${LOG}; fi | head -c ${MAX_BYTES}`,
    );
    return log.replace(/\r\n/g, '\n');
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

/** Every test running when the entry was logged: one per worker at most, so with several workers it narrows rather than pins down. */
function runningAt(headline: string, windows: TestWindow[]): string {
  const at = Date.parse(headline.slice(1, headline.indexOf(']')));
  if (Number.isNaN(at)) return 'unknown (no readable timestamp)';
  const titles = windows
    .filter((w) => w.start - CLOCK_SLACK_MS <= at && at <= w.end + CLOCK_SLACK_MS)
    .map((w) => (w.retry ? `${w.title} (retry ${w.retry})` : w.title));
  return titles.length ? titles.join(' | ') : 'no test (between tests, or in setup or teardown)';
}
