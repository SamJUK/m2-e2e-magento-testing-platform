<?php
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

    // Custom options, replaced wholesale on every run.
    //
    // Deleted first rather than merged: Magento keys options by id, not by
    // title, so re-saving a spec that already exists appends a second copy.
    // Left to accumulate, a store that has run the suite fifty times renders
    // fifty "Engraving" fields and the required-option test starts filling the
    // wrong one.
    if (!empty($spec['options'])) {
        $optionRepository = $om->get(\Magento\Catalog\Api\ProductCustomOptionRepositoryInterface::class);
        foreach ($optionRepository->getProductOptions($product) as $existingOption) {
            $optionRepository->delete($existingOption);
        }

        foreach ($spec['options'] as $index => $optionSpec) {
            $option = $om->create(\Magento\Catalog\Model\Product\Option::class);
            // Both identifiers: the repository resolves the product by SKU
            // (Option\Repository::save -> getProduct($option->getProductSku())),
            // while the option row itself is written against the product id.
            $option->setProductSku($sku)
                ->setProductId($product->getId())
                ->setStoreId($defaultStore)
                ->setTitle($optionSpec['title'])
                ->setType($optionSpec['type'] ?? 'field')
                ->setIsRequire((bool) ($optionSpec['required'] ?? false))
                ->setSortOrder($index + 1)
                ->setPrice((float) ($optionSpec['price'] ?? 0))
                ->setPriceType('fixed')
                ->setMaxCharacters(0);
            $optionRepository->save($option);
        }

        // Flag the product as CARRYING options.
        //
        // Magento derives has_options/required_options when a product is saved
        // WITH its options attached. This seed writes the option rows through
        // the option repository AFTER saving the product, so nothing ever
        // recomputes them and both stay 0 - at which point
        // $product->getOptions() comes back empty at add-to-cart and every
        // submitted option is silently discarded, while the PDP still renders
        // the fields because its block queries the option table directly. The
        // symptom is a product that takes the order at base price and drops
        // what the customer typed.
        //
        // Written as a direct UPDATE rather than by re-saving the product:
        // saving with options attached re-persists them and appends a second
        // copy of every one.
        //
        // This only ever bit stores on DB_STRATEGY=dump-restore. Where the
        // database is NOT rolled back the options survive, so the NEXT run's
        // product save finds them attached and sets the flags - which is why
        // this was invisible on a 'none' store and reproducible on every
        // dump-restore one.
        $hasRequiredOption = false;
        foreach ($spec['options'] as $optionSpec) {
            $hasRequiredOption = $hasRequiredOption || (bool) ($optionSpec['required'] ?? false);
        }
        $connection->update(
            $resource->getTableName('catalog_product_entity'),
            [
                'has_options' => 1,
                'required_options' => $hasRequiredOption ? 1 : 0,
            ],
            [$linkField . ' = ?' => (int) $product->getData($linkField)]
        );

        // The option rows are written against the product id, so the instance
        // in hand still has the pre-save option set on it.
        $product = $productRepository->get($sku, true, $defaultStore, true);
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

// Remove the admin users and roles the authorization test leaves behind: it
// ends signed in AS the restricted user, so it cannot clean up after itself.
// Ungated - these are accounts the suite itself created, so leaving them on a
// store that keeps its data is the dangerous option, not removing them.
$resource = $om->get(\Magento\Framework\App\ResourceConnection::class);
$connection = $resource->getConnection();
$userTable = $resource->getTableName('admin_user');
$roleTable = $resource->getTableName('authorization_role');
$ruleTable = $resource->getTableName('authorization_rule');

// Underscores are LIKE wildcards, so escape them or this matches far wider
// than the prefix it appears to.
$staleUserIds = array_filter(array_map('intval', $connection->fetchCol(
    $connection->select()->from($userTable, 'user_id')->where('username LIKE ?', 'e2e\_restricted\_%')
)));
$staleRoleIds = array_filter(array_map('intval', $connection->fetchCol(
    $connection->select()->from($roleTable, 'role_id')->where('role_name LIKE ?', 'E2E Restricted %')
)));

$deletedUsers = 0;
$deletedRoles = 0;

if ($staleRoleIds) {
    $connection->delete($ruleTable, ['role_id IN (?)' => $staleRoleIds]);
}

// User rows before their groups, or Acl\Builder throws on every admin request
// with "Parent Role id N does not exist". Matched on user_id as well as
// parent_id, to catch a link whose group was renamed out of the pattern.
$linkConditions = [];
if ($staleRoleIds) {
    $linkConditions[] = $connection->quoteInto('parent_id IN (?)', $staleRoleIds);
}
if ($staleUserIds) {
    $linkConditions[] = $connection->quoteInto('(user_type = 2 AND user_id IN (?))', $staleUserIds);
}
if ($linkConditions) {
    $deletedRoles += $connection->delete($roleTable, implode(' OR ', $linkConditions));
}
if ($staleRoleIds) {
    $deletedRoles += $connection->delete($roleTable, ['role_id IN (?)' => $staleRoleIds]);
}
if ($staleUserIds) {
    $deletedUsers = $connection->delete($userTable, ['user_id IN (?)' => $staleUserIds]);
}

if ($deletedUsers || $deletedRoles) {
    printf(
        "[e2e-seed] removed %d leftover admin user(s) and %d role row(s) from earlier authz runs\n",
        $deletedUsers,
        $deletedRoles
    );
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

// A product carrying custom options, because nothing in the sample data does
// and they are their own branch of add-to-cart: a REQUIRED option refuses the
// basket until it is answered, and an OPTIONAL one with a price has to reach
// the line total. Both are plain text fields rather than drop-downs, so the
// fixture needs no option VALUES and the test types a known string instead of
// picking from a list whose order the store controls.
$optioned = $cfg['customOptions'] ?? [];
$optionedProduct = $upsertProduct([
    'sku' => $optioned['sku'] ?? 'e2e-custom-options',
    'name' => $optioned['name'] ?? 'E2E Custom Options Product',
    'urlKey' => $optioned['urlKey'] ?? 'e2e-custom-options',
    'price' => $optioned['price'] ?? 30.00,
    'options' => [
        [
            'title' => $optioned['requiredOptionTitle'] ?? 'Engraving',
            'type' => 'field',
            'required' => true,
            'price' => 0,
        ],
        [
            'title' => $optioned['optionalOptionTitle'] ?? 'Gift Message',
            'type' => 'field',
            'required' => false,
            'price' => $optioned['optionalOptionPrice'] ?? 5.00,
        ],
    ],
], true);
printf("[e2e-seed] custom-options product #%d %s (url key: %s)\n", (int) $optionedProduct->getId(), $optionedProduct->getSku(), $optionedProduct->getUrlKey());

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
