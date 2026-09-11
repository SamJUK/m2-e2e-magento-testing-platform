import type { ProjectConfig } from '../config/schema';
import { seedFixtureEntities } from './fixture-entities';
import { takeConfigSnapshot } from './config-snapshot';

// Disable 2FA modules (prevents login redirect loops in tests).
//
// DEPENDENT FIRST. Magento_AdminAdobeImsTwoFactorAuth depends on
// Magento_TwoFactorAuth, so disabling the latter while the former is still
// enabled fails outright ("Cannot disable Magento_TwoFactorAuth because
// modules depend on it") — and the `|| true` swallows it. The store then
// serves every admin login the "You need to configure Two-Factor
// Authorization" screen and every @admin test fails at once. It hides well:
// a SECOND seed run succeeds, because by then the dependent is disabled, so
// only a genuinely fresh install ever shows it.
//
// One command per module: Mage-OS lacks the Adobe IMS module, and an
// unknown module aborts the whole module:disable invocation.
// Split out of MAGENTO_COMMANDS because `module:disable` REWRITES
// app/etc/config.php — on a real client store that file is git-tracked, so
// this must be opt-out-able (seed.disableTwoFactorModules: false) for
// stores that already handle 2FA some other way (env.php override, module
// not installed, etc.).
const TWO_FACTOR_DISABLE_COMMANDS = [
  'php bin/magento module:disable Magento_AdminAdobeImsTwoFactorAuth || true',
  'php bin/magento module:disable Magento_TwoFactorAuth || true',
];

// Commands that leave the store measurably LESS secure than they found it.
//
// Every one of these is necessary to automate a browser against Magento, and
// every one is fine on a store that gets restored afterwards. On a store that
// does not, they are permanent: no CAPTCHA on the admin or customer forms, no
// admin CSRF form key, no password-reset throttling, and concurrent admin
// sessions allowed. Nothing announces that afterwards — the store simply
// stays that way.
//
// Kept separate from MAGENTO_COMMANDS so the seed can refuse to apply them
// where nothing will undo them. See assertSecurityChangesAreReversible.
/** A default-scope config value the seed writes, and can therefore put back. */
export interface SeedConfigValue {
  path: string;
  value: string;
}

// Config the seed writes that leaves the store measurably LESS secure.
//
// Every one is needed to drive a browser through Magento, and every one is
// permanent on a store nothing restores: no CAPTCHA on the admin or customer
// forms, no admin CSRF form key, no password-reset throttling, and concurrent
// admin sessions allowed. Nothing announces that afterwards.
const SECURITY_RELAXING_CONFIG: SeedConfigValue[] = [
  // CAPTCHA blocks the suite's form submissions.
  { path: 'admin/captcha/enable', value: '0' },
  { path: 'customer/captcha/enable', value: '0' },
  { path: 'recaptcha_frontend/type_recaptcha/public_key', value: '' },
  { path: 'recaptcha_frontend/type_recaptcha/private_key', value: '' },
  // Amasty Invisible Captcha (common third-party extension) scores form POSTs
  // via Google reCAPTCHA v3 and silently bounces register/login/contact/
  // newsletter submissions back with an error alert. The path only exists
  // where the module is installed; writing it elsewhere is harmless.
  { path: 'aminvisiblecaptcha/general/enabledCaptcha', value: '0' },
  // Password-reset throttling: Magento allows 5 requests per IP per 10
  // minutes, which a suite running forgot-password flows from a single host
  // trips almost immediately.
  { path: 'customer/password/password_reset_protection_type', value: '0' },
  // Admin form key requirement, so tests can navigate the admin freely.
  { path: 'admin/security/use_form_key', value: '0' },
  // Concurrent admin sessions, so parallel workers can share the account.
  { path: 'admin/security/admin_account_sharing', value: '1' },
];

// Config the seed writes to make the store testable at all. Not a security
// question, but just as permanent, so it is snapshotted the same way.
const FUNCTIONAL_CONFIG: SeedConfigValue[] = [
  // Send order/invoice/shipment emails inline. Async sending defers them to
  // cron, which never runs inside a test window.
  { path: 'sales_email/general/async_sending', value: '0' },

  // Enable the transactional emails the suite asserts on. Sample-data stores
  // ship these on, but real stores routinely turn one off (one client store had
  // sales_email/invoice/enabled = 0). Magento does not just skip the mail: it
  // omits the "Email Copy of ..." checkbox from the admin invoice/shipment
  // form entirely, so the fulfilment flow itself becomes untestable.
  { path: 'sales_email/order/enabled', value: '1' },
  { path: 'sales_email/invoice/enabled', value: '1' },
  { path: 'sales_email/shipment/enabled', value: '1' },

  // Check / Money Order payment, which needs no gateway.
  { path: 'payment/checkmo/active', value: '1' },
  { path: 'payment/checkmo/title', value: 'Check Money Order' },

  // EUR for the currency-switch tests. USD must stay in the list — excluding
  // the default display currency makes config:set reject the value.
  { path: 'currency/options/allow', value: 'USD,GBP,EUR' },
  { path: 'currency/options/installed', value: 'USD,GBP,EUR' },
];

/** Every default-scope path the seed writes, in the order it writes them. */
export const SEED_CONFIG_PATHS = [...SECURITY_RELAXING_CONFIG, ...FUNCTIONAL_CONFIG].map(
  (entry) => entry.path,
);

// Commands that are not config, and so cannot be snapshotted and reverted.
const NON_CONFIG_COMMANDS = [
  // customer_grid only supports "Update on Save" (Adobe documents it as such).
  // Left on schedule, a newly registered customer never reaches the admin
  // customer grid because nothing drains the backlog without cron.
  // An invalid indexer also skips the on-save row update, so it has to be
  // rebuilt once before new customers start landing in the grid. Sub-second.
  'php bin/magento indexer:set-mode realtime customer_grid || true',
  'php bin/magento indexer:reindex customer_grid || true',
];

/**
 * Wraps a value so a POSIX shell reads it literally.
 *
 * shell.exec takes a command STRING (that is the hook's contract — Warden,
 * DDEV and docker compose all take `-c`), so anything interpolated into one
 * is shell syntax until quoted. Admin passwords routinely contain `$`, `!` or
 * a backtick: unquoted, the shell expands them, and the account is created
 * with a password that is not the one the tests then log in with — which
 * surfaces as "the admin credentials are wrong" rather than as a quoting bug.
 * A `"` or a `;` in the value is command injection outright.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** `config:set` for one seed value, quoted so the shell reads it literally. */
function configCommand({ path, value }: SeedConfigValue): string {
  return `php bin/magento config:set ${path} ${shellQuote(value)} || true`;
}

/**
 * Refuses to change a store that nothing will change back.
 *
 * Under `db.strategy: 'dump-restore'` (or `'s3-import'`) the database restore
 * undoes the seed. Under `'none'` the seed instead snapshots the config it is
 * about to write and puts it back in teardown — which needs `shell.dbQuery`,
 * because `shell.exec` cannot read a value back and only SQL can express "this
 * row did not exist before".
 *
 * With neither, the changes are permanent: no admin or customer CAPTCHA, no
 * admin CSRF form key, no password-reset throttling, concurrent admin sessions
 * allowed. That protection should not rest on a line in an untracked .env file,
 * which is where it rested before — delete `DB_STRATEGY=dump-restore` from a
 * client store's .env and the next run quietly weakens the live store.
 *
 * A genuinely disposable store (a CI container, a scratch install) says so with
 * `seed.disposableStore: true`.
 */
function assertSeedChangesAreReversible(config: ProjectConfig): void {
  const strategy = config.db?.strategy ?? 'none';
  if (strategy !== 'none') return;
  if (config.seed?.disposableStore) return;
  if (config.shell?.dbQuery) return;

  throw new Error(
    `[e2e-core] REFUSING TO SEED: db.strategy is 'none' and no shell.dbQuery hook is ` +
      `configured, so nothing can undo the changes the seed makes — and some of them ` +
      `weaken the store permanently: admin and customer CAPTCHA off, admin CSRF form ` +
      `key off, password-reset throttling off, concurrent admin sessions allowed.\n` +
      `Pick one:\n` +
      `  1. Supply a shell.dbQuery hook (every built-in preset has one), and the seed ` +
      `will snapshot these values and restore them in teardown; or\n` +
      `  2. Set db.strategy to 'dump-restore' (or 's3-import') so the whole database ` +
      `goes back; or\n` +
      `  3. Set seed.disposableStore: true if this store really is throwaway (a CI ` +
      `container, a scratch install) and permanent changes to it do not matter.`,
  );
}

/** Whether this run should snapshot the config it writes and revert it later. */
export function usesConfigSnapshot(config: ProjectConfig): boolean {
  const strategy = config.db?.strategy ?? 'none';
  return strategy === 'none' && Boolean(config.shell?.dbQuery);
}

/**
 * Seeds the Magento instance with configuration required for test runs.
 * Runs Magento CLI commands via the project's shell.exec hook.
 * No-ops gracefully if shell.exec is not configured.
 */
export async function runSeed(config: ProjectConfig): Promise<void> {
  if (!config.shell?.exec) {
    console.log('[e2e-core] No shell.exec hook configured, skipping Magento seed.');
    return;
  }

  assertSeedChangesAreReversible(config);

  console.log('[e2e-core] Seeding Magento instance...');

  // Create or recreate dedicated playwright test admin user
  const { username, password, slug: _slug } = config.admin;
  await config.shell.exec(
    `php bin/magento admin:user:delete playwright-tests@example.com -f || true`,
  );
  await config.shell.exec(
    `php bin/magento admin:user:create ` +
    `--admin-email='playwright-tests@example.com' ` +
    `--admin-firstname='Playwright' --admin-lastname='Tests' ` +
    `--admin-user=${shellQuote(username)} --admin-password=${shellQuote(password)} || true`,
  );

  // Record what these paths hold before touching them, so teardown can put
  // them back on a store the database strategy will not restore.
  if (usesConfigSnapshot(config)) {
    await takeConfigSnapshot(config, SEED_CONFIG_PATHS);
  }

  const commands = [
    ...SECURITY_RELAXING_CONFIG.map(configCommand),
    ...FUNCTIONAL_CONFIG.map(configCommand),
    ...NON_CONFIG_COMMANDS,
    'php bin/magento cache:flush',
  ];
  if (config.seed?.disableTwoFactorModules !== false) {
    // Run the config.php-rewriting commands before the final cache:flush.
    commands.splice(commands.length - 1, 0, ...TWO_FACTOR_DISABLE_COMMANDS);
  }
  if (config.seed?.commands?.length) {
    // Project-specific seed commands, before the final cache:flush.
    commands.splice(commands.length - 1, 0, ...config.seed.commands);
  }

  for (const cmd of commands) {
    await config.shell.exec(cmd);
  }

  if (config.seed?.createFixtureEntities !== false) {
    await seedFixtureEntities(config);

    // Push the quantities just written into the stock indexes.
    //
    // The stock indexers ship in "Update by Schedule", whose changelog is only
    // drained by cron — which never runs inside a test window — so the seeded
    // quantities, and the stock the suite's own orders consume, never reach
    // Magento's salability check. The symptom is not an out-of-stock
    // storefront (the PDP reads a different index and looks fine): it is admin
    // order creation refusing the product with "Not enough items for sale"
    // while the source item shows thousands in stock. Has to run after the
    // fixture products exist, which is why it is here and not in the command
    // list above. Sub-second on a demo catalogue, once per run.
    await config.shell.exec(
      'php bin/magento indexer:reindex cataloginventory_stock inventory || true',
    );

    // The new product is only reachable once the full page cache lets go of
    // the 404 it may already have stored for its URL.
    await config.shell.exec('php bin/magento cache:flush');
  }

  console.log('[e2e-core] Seed complete.');
}
