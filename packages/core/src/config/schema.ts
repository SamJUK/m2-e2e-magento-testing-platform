// Shell hooks let projects plug in however they exec into their container.
// Each hook is optional, EXCEPT where db.strategy needs it: 'dump-restore'
// requires dbDump, dbImport and dbQuery, and 's3-import' requires dbImport.
// Global setup refuses to run otherwise rather than skipping silently.
//
// Example patterns:
//   Warden:  exec: (cmd) => execa('warden', ['shell', '-c', cmd])
//   Docker:  exec: (cmd) => execa('docker', ['exec', '-T', 'magento', 'bash', '-c', cmd])
//   SSH:     exec: (cmd) => execa('ssh', ['user@host', cmd])
//   Direct:  exec: (cmd) => execa('bash', ['-c', cmd], { cwd: '/var/www/html' })
export interface ProjectShellHooks {
  /** Run a command inside the Magento container/host (e.g. bin/magento …) */
  exec?: (cmd: string) => Promise<void>;
  /** Dump the Magento database to a local file path */
  dbDump?: (outPath: string) => Promise<void>;
  /** Import a database from a local file path */
  dbImport?: (inPath: string) => Promise<void>;
  /**
   * Run a SQL statement against the Magento database and return stdout.
   * Used by the dirty-run guard (dump-restore strategy) to track incomplete
   * runs via the Magento `flag` table. Required by 'dump-restore'.
   */
  dbQuery?: (sql: string) => Promise<string>;
}

export interface ProjectAdminConfig {
  /** Admin panel URL slug, e.g. '/backend' */
  slug: string;
  username: string;
  password: string;
}

export interface ProjectDbConfig {
  /**
   * 'none'          — no DB management (default)
   * 'dump-restore'  — dump at start of run, restore at end (good for local dev)
   * 's3-import'     — download a fresh DB snapshot from S3 before the run (good for CI)
   */
  strategy: 'none' | 'dump-restore' | 's3-import';
  /** Path for local DB dump file when using 'dump-restore' strategy */
  dumpPath?: string;
  /** Magento DB table prefix (env.php `db/table_prefix`), e.g. 'el_'. Default ''. */
  tablePrefix?: string;
  /** S3 bucket name when using 's3-import' strategy */
  s3Bucket?: string;
  /** S3 object key when using 's3-import' strategy */
  s3Key?: string;
}

export interface ProjectSeedConfig {
  /**
   * Declares this store throwaway, permitting seed changes that nothing will
   * undo. Default false.
   *
   * Rarely needed. The seed turns off admin and customer CAPTCHA, the admin
   * CSRF form key and password-reset throttling, and allows concurrent admin
   * sessions — all necessary to drive a browser through Magento, and all
   * reverted automatically in one of two ways:
   *
   *   - `db.strategy: 'dump-restore'` / `'s3-import'` restores the database;
   *   - `db.strategy: 'none'` with a `shell.dbQuery` hook (every built-in
   *     preset has one) snapshots these config values before writing them and
   *     puts them back in teardown, including deleting rows that did not exist.
   *
   * This flag is only for the remaining case: strategy `'none'` AND no
   * `dbQuery`, where the changes really are permanent. Set it for CI containers
   * and scratch installs. Do NOT set it for a client store — give that a
   * `dbQuery` hook or a real `db.strategy` instead.
   */
  disposableStore?: boolean;
  /**
   * Whether the seed may run `bin/magento module:disable` for the 2FA
   * modules (Magento_TwoFactorAuth, Magento_AdminAdobeImsTwoFactorAuth).
   * Default true.
   *
   * IMPORTANT: `module:disable` REWRITES app/etc/config.php. On client
   * stores that file is usually git-tracked — set this to false when the
   * store already disables 2FA another way (env.php override, module
   * removed), or the seed will silently dirty the client working tree.
   */
  disableTwoFactorModules?: boolean;
  /**
   * Whether the seed may create the catalogue/promotion fixtures the shared
   * suite asserts on — a percent-off cart price rule with a known coupon code,
   * and a dedicated out-of-stock product. Default true.
   *
   * Both are described by `fixtures.cart.coupon` and
   * `fixtures.product.outOfStock`, so a store that already owns equivalent
   * entities points those keys at them and sets this to false rather than
   * having the suite write to its catalogue.
   */
  createFixtureEntities?: boolean;
  /**
   * Extra store-specific shell commands run at the end of the seed (before
   * the final cache:flush), via shell.exec — e.g.
   * `'php bin/magento config:set some/store/path 1 || true'`.
   *
   * This is the escape hatch for store realities the shared seed cannot
   * know about (third-party captchas, feature toggles). config:set values
   * are local-dev only under dump-restore — teardown reverts them.
   */
  commands?: string[];
}

export interface ProjectConfig {
  /** Seed behaviour toggles */
  seed?: ProjectSeedConfig;
  /** Magento storefront base URL */
  baseUrl: string;
  /** Mailpit API URL, e.g. 'http://localhost:8025' */
  mailpitUrl?: string;
  /** Theme identifier, e.g. 'luma' | 'hyva' */
  theme?: string;
  /** Store locale, e.g. 'en_GB' */
  locale?: string;
  /** Admin panel credentials */
  admin: ProjectAdminConfig;
  /** Database management strategy */
  db?: ProjectDbConfig;
  /** Async shell hooks for container/host interaction */
  shell?: ProjectShellHooks;
  /**
   * Module package names to exclude from auto-discovery.
   * Example: ['@acme/e2e-m2-module-acme-widgets']
   */
  excludeModules?: string[];
  /**
   * Path to the Magento `app/code` directory to scan for local module specs.
   * Any module containing a `Test/E2E/` subdirectory becomes a Playwright project.
   *
   * - Omitted (default): auto-detects `../../../app/code` relative to the
   *   e2e project root (i.e. `<magento root>/app/code` for the documented
   *   `dev/tests/e2e` layout).
   * - `false`: disables local module scanning entirely.
   * - string: explicit absolute or relative path override.
   */
  appCodeDir?: string | false;
  /**
   * Composer-installed Magento modules that ship E2E specs, by composer
   * package name. Opt-in allowlist — `vendor/` is never scanned blindly,
   * since that would auto-execute specs from arbitrary third-party packages.
   *
   * Each entry resolves `<magento root>/vendor/<name>/Test/E2E/` by default;
   * a package can point elsewhere via `extra.e2e.testDir` in its
   * composer.json. Specs use `import { test, expect } from '#test'`, resolved
   * through the Magento root package.json `imports` field (same as app/code
   * module specs).
   *
   * Example: ['samjuk/module-foo']
   */
  vendorModules?: string[];
}
