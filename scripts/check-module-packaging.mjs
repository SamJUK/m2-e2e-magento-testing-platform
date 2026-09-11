#!/usr/bin/env node
/**
 * A module package's specs have to be discoverable from a REGISTRY install,
 * not just from a workspace link. Two separate things broke that, and both
 * were invisible in this repo:
 *
 *   1. `e2eModule.testDir` pointed at `src/tests`. Playwright does not
 *      transpile TypeScript under `node_modules`, so a registry-installed
 *      package's `.ts` specs fail to parse — "Unexpected token '{'". Workspace
 *      links hid it because pnpm symlinks resolve to a real path outside
 *      node_modules, where the transform does apply.
 *   2. `files` did not include the directory `testDir` names, so the specs
 *      were absent from the tarball altogether.
 *
 * The theme packages had always shipped `dist/tests`; the module template had
 * not. This gate holds every module package to the same shape.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const problems = [];

for (const pkg of readdirSync('packages').filter((d) => d.startsWith('module-'))) {
  const manifestPath = `packages/${pkg}/package.json`;
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  const testDir = manifest.e2eModule?.testDir;
  if (!testDir) {
    problems.push(`${pkg}: no e2eModule.testDir, so nothing discovers its specs`);
    continue;
  }

  if (testDir.startsWith('src/')) {
    problems.push(
      `${pkg}: e2eModule.testDir is "${testDir}" — TypeScript under node_modules is not ` +
        'transpiled, so this only works through a workspace link. Point it at dist/tests.',
    );
  }

  const shippedRoot = testDir.split('/')[0];
  if (!(manifest.files ?? []).includes(shippedRoot)) {
    problems.push(`${pkg}: files does not include "${shippedRoot}", so "${testDir}" is not published`);
  }

  // Built output is the thing consumers actually run.
  const built = `packages/${pkg}/${testDir}`;
  if (!existsSync(built)) {
    problems.push(`${pkg}: ${testDir} does not exist — run the build before this gate`);
  } else if (!readdirSync(built).some((f) => f.endsWith('.spec.js'))) {
    problems.push(`${pkg}: ${testDir} holds no compiled .spec.js`);
  }
}

if (problems.length) {
  console.error('Module packages that would not be discoverable once installed:\n');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log('Module packages ship discoverable, compiled specs.');
