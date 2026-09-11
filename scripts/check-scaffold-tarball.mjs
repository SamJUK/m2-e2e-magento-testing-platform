#!/usr/bin/env node
/**
 * The scaffolder is only correct as a TARBALL. A checkout of this repo is not
 * what anybody runs: `npx` fetches what npm packed, and npm does not pack
 * everything the directory holds.
 *
 * This exists because of one such difference. npm refuses to include a file
 * called `.gitignore` in a tarball, so a template shipping one scaffolds it
 * from a checkout and silently omits it from the registry. The scaffolded
 * `.env` holds the store's admin credentials, and the scaffolded README tells
 * you to negate any `/dev/*` rule that would cover the directory, so that
 * omission left credentials committable on a real store.
 *
 * Packs the scaffolder, scaffolds out of the tarball into a temporary
 * directory, and asserts the result. Anything the template is expected to
 * produce belongs in EXPECTED below.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PKG = 'packages/create-magento-e2e';

/** Files the scaffolded project must contain, whatever npm did to the tarball. */
const EXPECTED = ['.gitignore', '.env', '.env.example', 'package.json', 'playwright.config.ts'];

/** Patterns the scaffolded .gitignore must cover. `.env` is the load-bearing one. */
const MUST_IGNORE = ['.env', 'node_modules/', 'test-results/'];

const work = mkdtempSync(path.join(tmpdir(), 'scaffold-gate-'));
try {
  const packed = execFileSync('npm', ['pack', '--pack-destination', work, '--silent'], {
    cwd: PKG,
    encoding: 'utf8',
  }).trim().split('\n').pop();

  execFileSync('tar', ['xzf', path.join(work, packed)], { cwd: work });

  const store = path.join(work, 'store');
  execFileSync('mkdir', ['-p', path.join(store, 'bin')]);
  execFileSync('touch', [path.join(store, 'bin', 'magento')]);
  execFileSync('node', [path.join(work, 'package', 'bin', 'create.js')], {
    cwd: store,
    stdio: 'ignore',
  });

  const out = path.join(store, 'dev', 'tests', 'e2e');
  const errors = [];

  for (const file of EXPECTED) {
    if (!existsSync(path.join(out, file))) {
      errors.push(`the scaffolder's tarball does not produce ${file}`);
    }
  }

  if (existsSync(path.join(out, '.gitignore'))) {
    const ignored = readFileSync(path.join(out, '.gitignore'), 'utf8');
    for (const pattern of MUST_IGNORE) {
      if (!ignored.split('\n').some((line) => line.trim() === pattern)) {
        errors.push(`the scaffolded .gitignore does not cover ${pattern}`);
      }
    }
  }

  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    process.exit(1);
  }

  console.log(
    `Scaffolder tarball produces ${EXPECTED.length} expected files, ` +
      `and ignores ${MUST_IGNORE.join(', ')}.`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
