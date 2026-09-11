#!/usr/bin/env node
/**
 * The scaffolder's template pins @samjuk versions as literal strings, so a
 * release bumps every workspace package and leaves the template behind. That
 * failure is silent and slow: `npx @samjuk/create-magento-e2e` keeps working,
 * it just installs a superseded major, and the first sign is a consumer
 * reporting behaviour that was fixed months ago.
 *
 * Run by CI. Exits non-zero listing every stale pin.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.join(root, 'packages');

const current = new Map();
for (const dir of fs.readdirSync(packagesDir)) {
  const manifest = path.join(packagesDir, dir, 'package.json');
  if (!fs.existsSync(manifest)) continue;
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf-8'));
  current.set(pkg.name, pkg.version);
}

// Both scaffolder templates: the store suite, and the module package skeleton.
const templates = ['template', 'module-template'].map((dir) =>
  JSON.parse(fs.readFileSync(path.join(packagesDir, 'create-magento-e2e', dir, 'package.json'), 'utf-8')),
);

const problems = [];
for (const template of templates)
for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
  for (const [name, range] of Object.entries(template[field] ?? {})) {
    if (!current.has(name)) {
      // A @samjuk dependency the workspace no longer publishes would install
      // from the registry and never be updated again.
      if (name.startsWith('@samjuk/')) problems.push(`${name}: pinned to ${range}, no such workspace package`);
      continue;
    }
    const expected = `^${current.get(name)}`;
    if (range !== expected) problems.push(`${name}: template pins ${range}, workspace is at ${expected}`);
  }
}

if (problems.length) {
  console.error('The scaffolder template is out of step with the workspace:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    '\nUpdate packages/create-magento-e2e/template/package.json so a fresh scaffold ' +
      'installs what this repo actually publishes.',
  );
  process.exit(1);
}

console.log(`Scaffolder templates match the workspace (${current.size} packages checked).`);
