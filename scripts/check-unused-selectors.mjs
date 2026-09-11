#!/usr/bin/env node
/**
 * Every key in selectors.json is a promise: set it and the suite will use it.
 * A key nothing reads breaks that promise silently — a store overrides it,
 * nothing changes, and the selector it was meant to fix stays hardcoded in a
 * page object. That is how `checkout.billing.streetAddressFieldLabel` sat in
 * the data layer, documented and settable, while the page object addressed the
 * field by a hardcoded name attribute.
 *
 * `*Comment` keys are the documentation convention for the sibling key above
 * them and are meant to be unreferenced.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every package that ships selectors, not just core: a theme or module package
// that adds keys nothing reads breaks the same promise in the same way.
const packagesDir = path.join(root, 'packages');
const sourceDirs = [];
const leaves = [];

for (const pkg of fs.readdirSync(packagesDir).sort()) {
  const srcDir = path.join(packagesDir, pkg, 'src');
  if (!fs.existsSync(srcDir)) continue;
  sourceDirs.push(path.relative(root, srcDir));

  const selectorsFile = path.join(srcDir, 'data', 'selectors.json');
  if (!fs.existsSync(selectorsFile)) continue;
  (function walk(node, trail) {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      for (const [key, value] of Object.entries(node)) walk(value, [...trail, key]);
    } else {
      leaves.push([pkg, ...trail]);
    }
  })(JSON.parse(fs.readFileSync(selectorsFile, 'utf-8')), []);
}

const source = execFileSync('grep', ['-rh', '', '--include=*.ts', ...sourceDirs], {
  cwd: root,
  encoding: 'utf-8',
  maxBuffer: 64 * 1024 * 1024,
});

const unused = [];
for (const trail of leaves) {
  const key = trail[trail.length - 1];
  if (key.endsWith('Comment')) continue;
  const referenced =
    new RegExp(`\\.${key}\\b`).test(source) ||
    source.includes(`'${key}'`) ||
    source.includes(`"${key}"`);
  if (!referenced) unused.push(trail.join('.'));
}

if (unused.length) {
  console.error('selectors.json keys that nothing reads:\n');
  for (const key of unused) console.error(`  ${key}`);
  console.error(
    '\nEither use the key in a page object, or delete it. A key the suite ignores ' +
      'is worse than no key: a store can set it and see no effect.',
  );
  process.exit(1);
}

console.log(`Every selector key is read (${leaves.length} checked).`);
