import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadData } from '../data';
import type { ProjectConfig } from '../config/schema';

/**
 * Catalogue/promotion fixtures the suite needs but `bin/magento` cannot create.
 *
 * There is no CLI command for a cart price rule and none for stock levels, so
 * this is delivered as a short PHP script that boots Magento and uses its own
 * repositories. The alternative — driving the admin UI from a `beforeAll` —
 * was rejected on three counts: it costs a full admin round-trip per worker,
 * every worker would race to create the same coupon code (Magento rejects the
 * duplicate), and it cannot re-run against a store whose database is never
 * restored. This script is idempotent: each entity is looked up first and
 * updated in place, so a second run against a dirty store is a no-op.
 */
// A real .php file, so php -l and editors can see it.
const FIXTURE_SEED_PHP_PATH = join(__dirname, 'fixture-seed.php');

const SCRIPT_PATH = 'var/e2e-fixture-seed.php';

/**
 * Creates (or refreshes) the coupon, the out-of-stock product, the
 * admin-editable product and the bundle (plus the two simples it bundles) that
 * the shared suite asserts on. All of them are described by `fixtures.json`,
 * merged through the same core → project chain as everything else, so a store
 * re-points the seed and the tests together by overriding one file.
 */
export async function seedFixtureEntities(config: ProjectConfig): Promise<void> {
  const exec = config.shell?.exec;
  if (!exec) return;

  const { fixtures } = loadData({ projectRoot: process.cwd() });

  // Whether the seed may touch the stock of products it does not own. True
  // only where the change is undone for us (the whole database is restored) or
  // the store has declared itself throwaway. On any other store the ordered
  // products are left exactly as they are, because clearing reservations there
  // would release stock committed to real orders.
  const strategy = config.db?.strategy ?? 'none';
  const mayRestock = strategy !== 'none' || Boolean(config.seed?.disposableStore);

  const payload = Buffer.from(
    JSON.stringify({
      mayRestock,
      productAttributes: config.seed?.productAttributes ?? {},
      orderedSkus: fixtures.product.orderedSkus,
      coupon: {
        ruleName: fixtures.cart.coupon.ruleName,
        code: fixtures.cart.coupon.code,
        percent: fixtures.cart.coupon.percent,
      },
      outOfStock: {
        sku: fixtures.product.outOfStock.sku,
        urlKey: fixtures.product.outOfStock.urlKey,
        name: fixtures.product.outOfStock.title,
        price: fixtures.product.outOfStock.price,
      },
      adminEditable: {
        sku: fixtures.product.adminEditable.sku,
        urlKey: fixtures.product.adminEditable.urlKey,
        name: fixtures.product.adminEditable.title,
        price: fixtures.product.adminEditable.price,
      },
      adminOrderable: {
        sku: fixtures.product.adminOrderable.sku,
        urlKey: fixtures.product.adminOrderable.urlKey,
        name: fixtures.product.adminOrderable.title,
        price: fixtures.product.adminOrderable.price,
      },
      virtual: {
        sku: fixtures.product.virtual.sku,
        urlKey: fixtures.product.virtual.urlKey,
        name: fixtures.product.virtual.title,
        price: fixtures.product.virtual.price,
      },
      customOptions: {
        sku: fixtures.product.customOptions.sku,
        urlKey: fixtures.product.customOptions.urlKey,
        name: fixtures.product.customOptions.title,
        price: fixtures.product.customOptions.price,
        requiredOptionTitle: fixtures.product.customOptions.requiredOptionTitle,
        optionalOptionTitle: fixtures.product.customOptions.optionalOptionTitle,
        optionalOptionPrice: fixtures.product.customOptions.optionalOptionPrice,
      },
      bundle: {
        sku: fixtures.product.bundle.sku,
        urlKey: fixtures.product.bundle.urlKey,
        name: fixtures.product.bundle.title,
        basePrice: fixtures.product.bundle.basePrice,
        optionTitle: fixtures.product.bundle.optionTitle,
        // Order matters: the first selection is the one the PDP opens with, so
        // it is also the one `isDefault` marks.
        selections: [
          {
            sku: fixtures.product.bundle.defaultSelection.sku,
            name: fixtures.product.bundle.defaultSelection.title,
            price: fixtures.product.bundle.defaultSelection.price,
            isDefault: true,
          },
          {
            sku: fixtures.product.bundle.alternateSelection.sku,
            name: fixtures.product.bundle.alternateSelection.title,
            price: fixtures.product.bundle.alternateSelection.price,
            isDefault: false,
          },
        ],
      },
    }),
    'utf8',
  ).toString('base64');

  // base64 on both the script and its configuration keeps every character out
  // of the shell's reach — the command line is pure [A-Za-z0-9+/=] either way.
  const script = readFileSync(FIXTURE_SEED_PHP_PATH).toString('base64');

  console.log('[e2e-core] Seeding catalogue/promotion fixtures...');
  // Deliberately not `|| true`: a store that cannot create these has no coupon
  // and no out-of-stock product, and the tests that need them would fail with
  // a selector error instead of the real cause.
  await exec(
    `printf %s '${script}' | base64 -d > ${SCRIPT_PATH} && ` +
      `E2E_SEED_JSON='${payload}' php ${SCRIPT_PATH}; ` +
      `rc=$?; rm -f ${SCRIPT_PATH}; exit $rc`,
  );
}
