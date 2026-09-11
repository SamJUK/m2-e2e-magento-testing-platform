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
 *
 * `String.raw` is load-bearing: PHP's leading-backslash FQCNs would otherwise
 * be eaten as (invalid, silently dropped) template-literal escapes.
 */
const FIXTURE_SEED_PHP = String.raw`<?php
/**
 * Written to var/ and executed by the E2E global setup. Not part of the store.
 * Configuration arrives base64-encoded in E2E_SEED_JSON so no value in it can
 * be mangled by shell quoting on the way in.
 */
declare(strict_types=1);

use Magento\Framework\App\Bootstrap;

require __DIR__ . '/../app/bootstrap.php';

$cfg = json_decode(base64_decode(getenv('E2E_SEED_JSON') ?: ''), true) ?: [];

$bootstrap = Bootstrap::create(BP, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode('adminhtml');

$storeManager = $om->get(\Magento\Store\Model\StoreManagerInterface::class);
$websiteIds = array_map('intval', array_keys($storeManager->getWebsites()));

// Write catalogue data at DEFAULT (admin) scope, not at whichever store view
// this script happens to boot into. Setting the area code to adminhtml does
// NOT set the store: the current store stays the default *store view*, so an
// unqualified product save lands a store-scoped row that then overrides the
// default value everywhere it matters. The admin product form, meanwhile,
// edits "All Store Views" — default scope — so a seed writing at store scope
// makes the two disagree permanently: the admin edit-and-save test renames the
// product at default scope, the storefront keeps reading the store-scoped row,
// and the next seed run cannot repair the name it never wrote.
$storeManager->setCurrentStore(\Magento\Store\Model\Store::DEFAULT_STORE_ID);

/* ------------------------------------------------------- cart price rule */
$coupon = $cfg['coupon'] ?? [];
$ruleName = $coupon['ruleName'] ?? 'E2E Percent Off';
$code = $coupon['code'] ?? 'E2ETEST10';
$percent = (float) ($coupon['percent'] ?? 10);

$groupIds = $om->create(\Magento\Customer\Model\ResourceModel\Group\Collection::class)->getAllIds();

$rules = $om->create(\Magento\SalesRule\Model\ResourceModel\Rule\Collection::class);
$rules->addFieldToFilter('name', $ruleName);
/** @var \Magento\SalesRule\Model\Rule $rule */
$rule = $rules->getFirstItem();
if (!$rule->getId()) {
    $rule = $om->create(\Magento\SalesRule\Model\Rule::class);
}

$rule->setName($ruleName)
    ->setDescription('Created by the E2E suite seed. Safe to delete.')
    ->setIsActive(1)
    ->setWebsiteIds($websiteIds)
    ->setCustomerGroupIds($groupIds)
    ->setCouponType(\Magento\SalesRule\Model\Rule::COUPON_TYPE_SPECIFIC)
    ->setUseAutoGeneration(0)
    ->setCouponCode($code)
    ->setUsesPerCoupon(0)
    ->setUsesPerCustomer(0)
    ->setFromDate(null)
    ->setToDate(null)
    ->setSortOrder(0)
    ->setIsRss(0)
    ->setSimpleAction(\Magento\SalesRule\Model\Rule::BY_PERCENT_ACTION)
    ->setDiscountAmount($percent)
    ->setDiscountQty(0)
    ->setDiscountStep(0)
    ->setApplyToShipping(0)
    ->setSimpleFreeShipping(0)
    ->setStopRulesProcessing(0)
    ->setIsAdvanced(1)
    ->setProductIds(null)
    ->setTimesUsed(0)
    ->setStoreLabels([]);
// No conditions and no actions: the rule applies to every cart, every group
// and every website, so the discount a test asserts is a pure percentage of
// the cart subtotal and never depends on which product the test added.
$rule->getConditions()->setConditions([]);
$rule->getActions()->setConditions([]);
$rule->save();

printf("[e2e-seed] cart price rule #%d \"%s\": coupon %s, %s%% off\n", $rule->getId(), $ruleName, $code, $percent);

/* -------------------------------------------------------- fixture products */
$productRepository = $om->get(\Magento\Catalog\Api\ProductRepositoryInterface::class);
$stockRegistry = $om->get(\Magento\CatalogInventory\Api\StockRegistryInterface::class);

// Guard on the module being ENABLED, not on the class or interface existing.
// Composer leaves both packages in vendor/ even when the modules are disabled,
// so interface_exists()/class_exists() are still true — but DI never binds the
// preference, and instantiating the factory throws "Cannot instantiate
// interface ...SourceItemInterface", which aborted global setup for the whole
// store. (A real client store runs exactly this shape: MSI present in vendor,
// both Magento_Inventory and Magento_InventoryApi disabled.)
$msiEnabled = $om->get(\Magento\Framework\Module\Manager::class)->isEnabled('Magento_Inventory');

/**
 * Creates or refreshes one simple product, stock included.
 *
 * Every attribute the suite depends on is written on every run, not just at
 * creation. That is what makes a fixture product self-repairing: the admin
 * edit-and-save test deliberately renames one of these, and a run killed
 * between the rename and the restore would otherwise leave the store holding
 * the temporary name for good.
 */
$upsertProduct = function (array $spec, bool $inStock) use ($om, $productRepository, $stockRegistry, $websiteIds, $msiEnabled) {
    $sku = $spec['sku'];
    $qty = $inStock ? 1000 : 0;
    $type = $spec['type'] ?? \Magento\Catalog\Model\Product\Type::TYPE_SIMPLE;
    $defaultStore = (int) \Magento\Store\Model\Store::DEFAULT_STORE_ID;

    try {
        $product = $productRepository->get($sku, true, $defaultStore, true);
    } catch (\Magento\Framework\Exception\NoSuchEntityException $e) {
        $product = $om->create(\Magento\Catalog\Model\Product::class);
        $product->setSku($sku)
            ->setTypeId($type)
            ->setAttributeSetId($product->getDefaultAttributeSetId());
    }

    $product->setStoreId($defaultStore)
        ->setName($spec['name'])
        ->setPrice((float) $spec['price'])
        ->setUrlKey($spec['urlKey'])
        ->setStatus(\Magento\Catalog\Model\Product\Attribute\Source\Status::STATUS_ENABLED)
        ->setVisibility(\Magento\Catalog\Model\Product\Visibility::VISIBILITY_BOTH)
        ->setWebsiteIds($websiteIds)
        ->setStockData([
            'use_config_manage_stock' => 1,
            'manage_stock' => 1,
            'is_in_stock' => $inStock ? 1 : 0,
            'qty' => $qty,
        ]);
    $product = $productRepository->save($product);

    // Drop any STORE-SCOPED override of the attributes written above, so the
    // default-scope values are what every store view actually reads.
    //
    // Two reasons this is not merely tidy. Earlier versions of this seed wrote
    // at store scope (see setCurrentStore above), so stores that have already
    // run it carry override rows that would keep shadowing the values written
    // here — on a store whose database is never restored, for good. And the
    // admin edit-and-save test edits at default scope: if a store-scoped name
    // survived, the storefront would keep rendering the old one and the test
    // would be asserting against a value no admin edit can ever change.
    // Confined to the fixture products' own rows, which this seed owns outright.
    $eavConfig = $om->get(\Magento\Eav\Model\Config::class);
    $resource = $om->get(\Magento\Framework\App\ResourceConnection::class);
    $connection = $resource->getConnection();
    // entity_id on Open Source, row_id where content staging is installed —
    // ask the metadata pool rather than assuming either.
    $linkField = $om->get(\Magento\Framework\EntityManager\MetadataPool::class)
        ->getMetadata(\Magento\Catalog\Api\Data\ProductInterface::class)
        ->getLinkField();
    foreach (['name', 'price', 'url_key', 'status', 'visibility'] as $attributeCode) {
        $attribute = $eavConfig->getAttribute(\Magento\Catalog\Model\Product::ENTITY, $attributeCode);
        if (!$attribute || !$attribute->getId() || !$attribute->getBackendTable()) {
            continue;
        }
        $connection->delete($attribute->getBackendTable(), [
            'attribute_id = ?' => (int) $attribute->getId(),
            $linkField . ' = ?' => (int) $product->getData($linkField),
            'store_id <> ?' => $defaultStore,
        ]);
    }

    $stockItem = $stockRegistry->getStockItemBySku($sku);
    $stockItem->setQty($qty);
    $stockItem->setIsInStock($inStock);
    $stockRegistry->updateStockItemBySku($sku, $stockItem);

    // Drop this product's outstanding inventory reservations.
    //
    // Multi-Source Inventory computes salable quantity as source qty MINUS
    // reservations, and a reservation is only compensated when its order ships
    // or is cancelled. The suite places orders it never fulfils, so on a store
    // whose database is never rolled back the reservations accumulate forever
    // and the quantity written above is steadily eaten away until the product
    // stops being orderable. Clearing them is what makes the seeded quantity
    // mean what it says on every run. Confined to fixture SKUs this seed owns.
    $reservationTable = $resource->getTableName('inventory_reservation');
    if ($msiEnabled && $connection->isTableExists($reservationTable)) {
        $connection->delete($reservationTable, ['sku = ?' => $sku]);
    }

    // Multi-Source Inventory keeps its own source items. The legacy stock item
    // above only reaches them through a sync a bare qty update can miss, so
    // write the default source directly where MSI is installed.
    if ($msiEnabled) {
        $sourceItem = $om->get(\Magento\InventoryApi\Api\Data\SourceItemInterfaceFactory::class)->create();
        $sourceItem->setSourceCode('default');
        $sourceItem->setSku($sku);
        $sourceItem->setQuantity($qty);
        $sourceItem->setStatus($inStock ? 1 : 0);
        $om->get(\Magento\InventoryApi\Api\SourceItemsSaveInterface::class)->execute([$sourceItem]);
    }

    return $product;
};

/* -------------------------------------------- restock the ordered products */
// Products the suite ORDERS but does not create. Every order leaves an MSI
// reservation that is only compensated when the order ships or is cancelled,
// and the suite never fulfils the orders it places - so on a store whose
// database is never rolled back the reservations accumulate until salable
// quantity hits zero and every checkout test fails with "The requested qty is
// not available". Measured on a demo store after 95 runs: source qty 93,
// reservations -93.
//
// Only stock is touched here, never name, price or URL key: these are the
// store's own products, not the seed's. And only when 'mayRestock' says the
// change is undone afterwards (the database is restored) or the store is
// declared disposable - clearing a real store's reservations would release
// stock that is genuinely committed to real orders.
if (!empty($cfg['mayRestock'])) {
    $restockQty = 1000;
    // Fetched here rather than reused from the closure above: that one declares
    // its own, in its own scope.
    $resource = $om->get(\Magento\Framework\App\ResourceConnection::class);
    $connection = $resource->getConnection();
    $reservationTable = $resource->getTableName('inventory_reservation');
    foreach (($cfg['orderedSkus'] ?? []) as $orderedSku) {
        try {
            $productRepository->get($orderedSku);
        } catch (\Magento\Framework\Exception\NoSuchEntityException $e) {
            printf("[e2e-seed] ordered sku %s does not exist, skipping restock\n", $orderedSku);
            continue;
        }

        if ($msiEnabled && $connection->isTableExists($reservationTable)) {
            $connection->delete($reservationTable, ['sku = ?' => $orderedSku]);
        }

        $stockItem = $stockRegistry->getStockItemBySku($orderedSku);
        $stockItem->setQty($restockQty);
        $stockItem->setIsInStock(true);
        $stockRegistry->updateStockItemBySku($orderedSku, $stockItem);

        if ($msiEnabled) {
            $sourceItem = $om->get(\Magento\InventoryApi\Api\Data\SourceItemInterfaceFactory::class)->create();
            $sourceItem->setSourceCode('default');
            $sourceItem->setSku($orderedSku);
            $sourceItem->setQuantity($restockQty);
            $sourceItem->setStatus(1);
            $om->get(\Magento\InventoryApi\Api\SourceItemsSaveInterface::class)->execute([$sourceItem]);
        }

        printf("[e2e-seed] restocked ordered sku %s to %d and cleared its reservations\n", $orderedSku, $restockQty);
    }
}

// A dedicated product rather than an existing sample-data SKU flipped out of
// stock: the suite must not make a real, sellable product unbuyable on a store
// whose database is not restored after the run.
$oos = $cfg['outOfStock'] ?? [];
$oosProduct = $upsertProduct([
    'sku' => $oos['sku'] ?? 'e2e-out-of-stock',
    'name' => $oos['name'] ?? 'E2E Out Of Stock Product',
    'urlKey' => $oos['urlKey'] ?? 'e2e-out-of-stock',
    'price' => $oos['price'] ?? 19.99,
], false);
printf("[e2e-seed] out-of-stock product #%d %s (url key: %s)\n", (int) $oosProduct->getId(), $oosProduct->getSku(), $oosProduct->getUrlKey());

// Likewise dedicated, for the opposite reason: the admin edit-and-save test
// renames this one, and that rename is visible on the storefront for as long
// as the test holds it. Pointing it at a product any other test asserts on
// would race that test at more than one worker.
$editable = $cfg['adminEditable'] ?? [];
$editableProduct = $upsertProduct([
    'sku' => $editable['sku'] ?? 'e2e-admin-edit',
    'name' => $editable['name'] ?? 'E2E Admin Edit Product',
    'urlKey' => $editable['urlKey'] ?? 'e2e-admin-edit',
    'price' => $editable['price'] ?? 24.99,
], true);
printf("[e2e-seed] admin-editable product #%d %s (url key: %s)\n", (int) $editableProduct->getId(), $editableProduct->getSku(), $editableProduct->getUrlKey());

// Dedicated again, this time so the admin order-creation tests have something
// to sell that nothing else depends on. Every order they place consumes stock,
// and pointing them at the sample-data simple product would slowly drain the
// one SKU the cart, minicart and checkout tests all add to a basket.
$orderable = $cfg['adminOrderable'] ?? [];
$orderableProduct = $upsertProduct([
    'sku' => $orderable['sku'] ?? 'e2e-admin-orderable',
    'name' => $orderable['name'] ?? 'E2E Admin Orderable Product',
    'urlKey' => $orderable['urlKey'] ?? 'e2e-admin-orderable',
    'price' => $orderable['price'] ?? 12.5,
], true);
printf("[e2e-seed] admin-orderable product #%d %s (url key: %s)\n", (int) $orderableProduct->getId(), $orderableProduct->getSku(), $orderableProduct->getUrlKey());

// A virtual product, because a virtual-only cart is a whole branch of checkout
// the simple-product path never reaches: Magento drops the shipping step, the
// rate list and the shipping address form, and puts the billing address inside
// the payment block instead. Nothing in the sample data is virtual.
$virtual = $cfg['virtual'] ?? [];
$virtualProduct = $upsertProduct([
    'sku' => $virtual['sku'] ?? 'e2e-virtual',
    'name' => $virtual['name'] ?? 'E2E Virtual Product',
    'urlKey' => $virtual['urlKey'] ?? 'e2e-virtual',
    'price' => $virtual['price'] ?? 9.99,
    'type' => \Magento\Catalog\Model\Product\Type::TYPE_VIRTUAL,
], true);
printf("[e2e-seed] virtual product #%d %s (url key: %s)\n", (int) $virtualProduct->getId(), $virtualProduct->getSku(), $virtualProduct->getUrlKey());

/* ------------------------------------------------------------ bundle product */
// A dedicated bundle rather than whichever bundle the catalogue happens to
// carry: with a FIXED price and known selection prices the PDP figure is an
// exact number (base + selected option), so the price test asserts arithmetic
// instead of "the price changed".
$bundleCfg = $cfg['bundle'] ?? [];
$bundleSku = $bundleCfg['sku'] ?? 'e2e-bundle';
$selections = $bundleCfg['selections'] ?? [];

$parts = [];
foreach ($selections as $selection) {
    $parts[] = $upsertProduct([
        'sku' => $selection['sku'],
        'name' => $selection['name'],
        'urlKey' => $selection['sku'],
        'price' => $selection['price'],
    ], true);
}

// Recreated outright rather than updated in place: re-saving bundle option data
// appends a second copy of every option, and a bundle carrying two identical
// option groups is worse than no fixture at all.
$registry = $om->get(\Magento\Framework\Registry::class);
$registry->unregister('isSecureArea');
$registry->register('isSecureArea', true);
try {
    $productRepository->deleteById($bundleSku);
} catch (\Magento\Framework\Exception\NoSuchEntityException $e) {
    // Nothing to replace on the first run.
}
$registry->unregister('isSecureArea');

$bundle = $om->create(\Magento\Catalog\Model\Product::class);
$bundle->setSku($bundleSku)
    ->setTypeId(\Magento\Bundle\Model\Product\Type::TYPE_CODE)
    ->setAttributeSetId($bundle->getDefaultAttributeSetId())
    ->setName($bundleCfg['name'] ?? 'E2E Bundle Product')
    ->setUrlKey($bundleCfg['urlKey'] ?? 'e2e-bundle')
    ->setStatus(\Magento\Catalog\Model\Product\Attribute\Source\Status::STATUS_ENABLED)
    ->setVisibility(\Magento\Catalog\Model\Product\Visibility::VISIBILITY_BOTH)
    ->setWebsiteIds($websiteIds)
    ->setPriceType(\Magento\Bundle\Model\Product\Price::PRICE_TYPE_FIXED)
    ->setPrice((float) ($bundleCfg['basePrice'] ?? 50))
    ->setPriceView(0)
    ->setSkuType(1)
    ->setWeightType(1)
    ->setWeight(1)
    ->setShipmentType(0)
    // The bundle's own salability is decided by its selections, and both of
    // those are stocked above; taking it out of stock management keeps the
    // fixture buyable on a store whose stock indexer is behind.
    ->setStockData([
        'use_config_manage_stock' => 0,
        'manage_stock' => 0,
        'is_in_stock' => 1,
        'qty' => 1000,
    ]);

$option = $om->get(\Magento\Bundle\Api\Data\OptionInterfaceFactory::class)->create();
$option->setTitle($bundleCfg['optionTitle'] ?? 'E2E Bundle Choice');
$option->setDefaultTitle($bundleCfg['optionTitle'] ?? 'E2E Bundle Choice');
// A radio group, not a select: both themes then render one <label for=...> per
// selection carrying its product name, which is how the tests pick an option
// without depending on the option/selection ids the database assigns.
$option->setType('radio');
$option->setRequired(true);
$option->setPosition(0);
$option->setSku($bundleSku);
$option->setOptionId(null);

$linkFactory = $om->get(\Magento\Bundle\Api\Data\LinkInterfaceFactory::class);
$links = [];
foreach ($selections as $i => $selection) {
    $link = $linkFactory->create();
    $link->setSku($parts[$i]->getSku());
    $link->setQty(1);
    $link->setCanChangeQuantity(0);
    // LinkInterface's own constant: on a SELECTION 0 means a fixed amount and 1
    // a percentage of the bundle price. Product\Price::PRICE_TYPE_FIXED is 1 and
    // means the opposite thing, so using it here would silently turn every
    // selection price into a percentage.
    $link->setPriceType(\Magento\Bundle\Api\Data\LinkInterface::PRICE_TYPE_FIXED);
    $link->setPrice((float) $selection['price']);
    $link->setIsDefault(!empty($selection['isDefault']));
    $link->setPosition($i);
    $links[] = $link;
}
$option->setProductLinks($links);

$extension = $bundle->getExtensionAttributes();
$extension->setBundleProductOptions([$option]);
$bundle->setExtensionAttributes($extension);
$bundle = $productRepository->save($bundle);

// Stock status and price are both read from indexes. Magento's default indexer
// mode is "Update by Schedule", and nothing drains that backlog without cron —
// so without this a product created seconds ago renders out of stock and
// unpriced for the whole run. Reindexed as a LIST of the rows just written, not
// as a full reindex: sub-second either way, and it cannot disturb the rest of
// the catalogue.
$bundleIds = array_map(static function ($p) { return (int) $p->getId(); }, $parts);
$bundleIds[] = (int) $bundle->getId();
$indexerRegistry = $om->get(\Magento\Framework\Indexer\IndexerRegistry::class);
foreach (['cataloginventory_stock', 'catalog_product_price'] as $indexerId) {
    try {
        $indexerRegistry->get($indexerId)->reindexList($bundleIds);
    } catch (\Throwable $e) {
        printf("[e2e-seed] could not reindex %s: %s\n", $indexerId, $e->getMessage());
    }
}

printf("[e2e-seed] bundle product #%d %s (url key: %s)\n", (int) $bundle->getId(), $bundle->getSku(), $bundle->getUrlKey());
`;

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
  const script = Buffer.from(FIXTURE_SEED_PHP, 'utf8').toString('base64');

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
