import dotenv from 'dotenv';
import path from 'path';
import { createPlaywrightConfig, defineProjectConfig, wardenShell } from '@samjuk/e2e-m2-playwright-core';

dotenv.config({ path: path.join(__dirname, '.env') });

if (!process.env.PLAYWRIGHT_BASE_URL) {
  throw new Error('PLAYWRIGHT_BASE_URL is required. Set it in dev/tests/e2e/.env');
}

// <magento root>, assuming this lives at <magento root>/dev/tests/e2e
const projectRoot = path.resolve(__dirname, '../../..');

export const config = defineProjectConfig({
  baseUrl: process.env.PLAYWRIGHT_BASE_URL,
  mailpitUrl: process.env.MAILPIT_URL,

  // 'luma' | 'hyva' — must match an installed @samjuk/e2e-m2-theme-* package.
  theme: 'luma',

  admin: {
    slug: process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/admin',
    username: process.env.PLAYWRIGHT_ADMIN_USERNAME ?? 'playwright',
    password: process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'Password1',
  },

  db: {
    // 'none' leaves the database alone. On any store you care about, use
    // 'dump-restore': the suite places orders, registers customers and changes
    // config, and without a rollback that residue accumulates — MSI
    // reservations in particular build up until add-to-cart starts failing
    // while the product page still reads "In stock".
    strategy: (process.env.DB_STRATEGY as 'none' | 'dump-restore' | 's3-import') ?? 'none',
    dumpPath: path.join(__dirname, 'var', 'e2e-db-backup.sql'),
    // Set if the store uses one (env.php `db/table_prefix`), e.g. 'el_'.
    // tablePrefix: '',
  },

  // wardenShell wires exec/dbDump/dbImport/dbQuery. ddevShell is the other
  // preset; any other setup declares the four hooks itself. dbQuery is what
  // the dirty-run guard needs.
  shell: wardenShell(projectRoot),

  // seed: {
  //   // `module:disable` REWRITES app/etc/config.php. If that file is tracked
  //   // in the store's git repo, set this false or the seed dirties the tree.
  //   disableTwoFactorModules: false,
  //   // Store-specific config the shared seed cannot know about.
  //   commands: ['php bin/magento config:set some/path 1 || true'],
  // },
});

export default createPlaywrightConfig(config, {
  testDir: './tests',
  globalSetup: require.resolve('./globalSetup'),
  globalTeardown: require.resolve('./globalTeardown'),

  // Tests this store cannot run. Each needs a reason code, and the reasons are
  // printed at the start of every run:
  //   'not-applicable' — the store genuinely lacks the feature. Permanent.
  //   'platform-gap'   — it works for customers, our page objects can't drive
  //                      it yet. This is OUR debt and should shrink over time.
  //   'client-bug'     — it is actually broken on the store. Report it.
  // Prefer config/features.json where the store simply lacks a core feature:
  // that asserts the absence rather than hiding the test.
  // exclusions: [
  //   {
  //     pattern: /@currency/,
  //     reason: 'not-applicable' as const,
  //     note: 'Single-currency store, so no switcher can render.',
  //   },
  // ],
});
