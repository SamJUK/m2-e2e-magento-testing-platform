import { hyvaTest as test, expect } from '../fixtures';

test.describe('Simple Product', () => {
  test(
    'can add to cart',
    { tag: ['@product', '@simple', '@smoke'] },
    async ({ productPage, data }) => {
      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
    },
  );

  test(
    'out of stock product shows its status and cannot be added to cart',
    { tag: ['@product', '@negative'] },
    async ({ productPage, page, data }) => {
      // Two PDP loads plus a cart load does not fit the default budget on a
      // dev-mode store.
      test.slow();

      // The in-stock product first. It is what makes the assertions on the
      // out-of-stock one meaningful: the same availability and add-to-cart
      // locators have to resolve to something real here before their absence
      // over there can be read as the feature working.
      await productPage.expectStockStatus(data.slugs.products.simpleProduct, 'in');
      await productPage.expectStockStatus(data.slugs.products.outOfStockProduct, 'out');

      await page.goto(data.slugs.cart, { waitUntil: 'domcontentloaded' });
      await expect(
        page.locator(data.selectors.cart.cartItemSelector, {
          hasText: data.fixtures.product.outOfStock.title,
        }),
        'the out-of-stock product never reached the cart',
      ).toHaveCount(0);
    },
  );
});
