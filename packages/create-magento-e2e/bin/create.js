#!/usr/bin/env node
/**
 * Scaffolds either the E2E suite into a Magento store, or a module test
 * package for people extending the platform with their own tests.
 *
 *   npx @samjuk/create-magento-e2e [target]
 *   npx @samjuk/create-magento-e2e --module <vendor>-<module> [target] [--scope acme]

 *
 * Default suite target is dev/tests/e2e relative to the current directory,
 * which is where the platform expects to live: the config resolves the Magento
 * root as three levels up, and app/code module specs are discovered from there.
 */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));

const moduleName = flag('module');
if (moduleName !== undefined) {
  scaffoldModule(moduleName, positional[0], flag('scope') || 'samjuk');
  process.exit(0);
}

const TEMPLATE = path.join(__dirname, '..', 'template');
const target = path.resolve(positional[0] || 'dev/tests/e2e');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    else console.log(`  kept existing ${path.relative(target, dest)}`);
  }
}

function scaffoldModule(name, dir, scope) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    console.error(`Invalid module name "${name}" — use lowercase kebab-case, e.g. acme-widgets`);
    process.exit(1);
  }

  const words = name.split('-');
  const pascal = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  const camel = pascal[0].toLowerCase() + pascal.slice(1);
  const to = path.resolve(dir || `packages/module-${name}`);

  if (fs.existsSync(to)) {
    console.error(`Refusing to overwrite: ${to} already exists`);
    process.exit(1);
  }

  const substitute = (text) =>
    text
      .replace(/__PACKAGE__/g, name)
      .replace(/__PASCAL__/g, pascal)
      .replace(/__CAMEL__/g, camel)
      .replace(/__SCOPE__/g, scope);

  (function walk(from, into) {
    fs.mkdirSync(into, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name);
      const dest = path.join(into, entry.name);
      if (entry.isDirectory()) walk(src, dest);
      else fs.writeFileSync(dest, substitute(fs.readFileSync(src, 'utf8')));
    }
  })(path.join(__dirname, '..', 'module-template'), to);

  console.log(`
Scaffolded ${path.relative(process.cwd(), to) || '.'}  (@${scope}/e2e-m2-module-${name})

Next:
  1. rename src/pages/module.page.ts's selectors to the module's real markup
  2. write the specs in src/tests/ — assertions live in the page object
  3. pnpm install && pnpm build

Install it into a store that has the Magento module and it is discovered
automatically through its e2eModule.testDir field.
`);
}

if (fs.existsSync(path.join(target, 'playwright.config.ts'))) {
  console.error(`Refusing to overwrite: ${target} already has a playwright.config.ts`);
  process.exit(1);
}

// A Magento root three levels up is the layout everything else assumes; warn
// rather than refuse, since someone may deliberately be putting it elsewhere.
const magentoRoot = path.resolve(target, '..', '..', '..');
if (!fs.existsSync(path.join(magentoRoot, 'bin', 'magento'))) {
  console.warn(`Warning: no bin/magento at ${magentoRoot} — is this a Magento root?`);
}

copyDir(TEMPLATE, target);

// Seeded once, never replaced. copyDir keeps every other existing file, and
// this is the one that ends up holding an admin password — overwriting it on
// a re-run would throw away real credentials. Mode 0600 for the same reason.
const envPath = path.join(target, '.env');
if (fs.existsSync(envPath)) {
  console.log('  kept existing .env');
} else {
  fs.copyFileSync(path.join(target, '.env.example'), envPath);
  fs.chmodSync(envPath, 0o600);
}

const rel = path.relative(process.cwd(), target) || '.';
console.log(`
Scaffolded ${rel}

Next:
  1. edit ${rel}/.env            base URL, admin path, DB strategy
  2. edit ${rel}/playwright.config.ts   theme, table prefix, shell preset
  3. cd ${rel} && pnpm install
  4. npx playwright install chromium
  5. pnpm test

Expect failures on a store the suite has not seen before — they are the store
telling you what to override in config/*.json. Read test-results/*/error-context.md:
it holds an accessibility snapshot, usually enough to find the real label.
`);
