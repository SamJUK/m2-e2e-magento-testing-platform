import { test, expect } from '../fixtures/default';

/**
 * MagePal_GoogleTagManager renders no markup: it pushes objects onto a
 * JavaScript data layer, and everything downstream — every tag, every
 * conversion figure a merchant reports on — reads those objects. A silently
 * empty push is therefore invisible on the storefront and expensive in the
 * reports, which is exactly the kind of failure an E2E suite should catch.
 *
 * The module needs `googletagmanager/general/active` on and a container id in
 * `googletagmanager/general/account`; without both, the block renders nothing
 * and every test here fails on the page-type poll rather than silently passing.
 */
test.describe('MagePal_GoogleTagManager data layer', () => {
  test(
    'the homepage pushes its page type and the store currency',
    { tag: ['@magepal-googletagmanager', '@analytics', '@smoke'] },
    async ({ googleTagManager }) => {
      // The store root, as the theme suites also address it. Not a slug: a
      // Magento store's homepage is always '/'.
      await googleTagManager.expectPageType('/', googleTagManager.pageTypes.homepage);
    },
  );

  // Asserted against the seed's own fixture product rather than a sample-data
  // SKU: its SKU, name and price are all declared in config, so this fails on
  // a push of the wrong product or of a stale price — not merely on an absent
  // one.
  test(
    'a product page pushes the product sku, name and price the store declares',
    { tag: ['@magepal-googletagmanager', '@analytics', '@product', '@smoke'] },
    async ({ googleTagManager, data }) => {
      const product = data.fixtures.product.adminEditable;
      await googleTagManager.expectProductPush(data.slugs.products.adminEditableProduct, {
        sku: product.sku,
        name: product.title,
        price: product.price,
      });
    },
  );

  // The pushed path is the breadcrumb trail without "Home", which is the same
  // value the theme suite asserts on the rendered page — so the two agree or
  // one of them is wrong.
  test(
    'a category page pushes the category name and its full path',
    { tag: ['@magepal-googletagmanager', '@analytics', '@category'] },
    async ({ googleTagManager, data }) => {
      const trail = data.fixtures.category.listingPage.breadcrumbTrail;
      expect(trail.length, 'a breadcrumb trail of Home plus at least one category').toBeGreaterThan(1);

      await googleTagManager.expectCategoryPush(data.slugs.categories.listingPage, {
        name: trail[trail.length - 1],
        path: trail.slice(1).join(' > '),
      });
    },
  );

  test(
    'the search results page pushes its page type',
    { tag: ['@magepal-googletagmanager', '@analytics', '@search'] },
    async ({ googleTagManager, data }) => {
      const query = encodeURIComponent(data.inputs.search.query);
      await googleTagManager.expectPageType(
        `${data.slugs.search.resultsPagePrefix}/?q=${query}`,
        googleTagManager.pageTypes.search,
      );
    },
  );

  test(
    'the data layer reports a guest as not logged in with an empty cart',
    { tag: ['@magepal-googletagmanager', '@analytics', '@customer'] },
    async ({ googleTagManager }) => {
      await googleTagManager.expectGuestSession('/');
    },
  );

  test(
    'the cart page pushes an empty cart',
    { tag: ['@magepal-googletagmanager', '@analytics', '@cart'] },
    async ({ googleTagManager, data }) => {
      await googleTagManager.expectEmptyCartPush(data.slugs.cart);
    },
  );
});
