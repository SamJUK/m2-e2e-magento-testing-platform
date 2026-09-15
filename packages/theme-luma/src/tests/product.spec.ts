import { readMoney } from '@samjuk/e2e-m2-playwright-core';
import { lumaTest as test, expect } from '../fixtures';

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

test.describe('Custom options', () => {
  test(
    'a required custom option is asked for before the product can be added',
    { tag: ['@product', '@options', '@negative'] },
    async ({ productPage, data }) => {
      await productPage.expectRequiredOptionBlocksAddToCart(
        data.slugs.products.customOptionsProduct,
        data.fixtures.product.customOptions.requiredOptionTitle,
      );
    },
  );

  test(
    "an optional custom option's price reaches the cart",
    { tag: ['@product', '@options', '@cart'] },
    async ({ productPage, cartPage, data }) => {
      // A PDP round-trip and a cart read.
      test.slow();

      const o = data.fixtures.product.customOptions;

      await productPage.addProductWithOptionsToCart(data.slugs.products.customOptionsProduct, {
        [o.requiredOptionTitle]: 'ABC',
        [o.optionalOptionTitle]: 'Happy birthday',
      });

      await cartPage.open();

      // The option's surcharge has to be IN the line, not merely rendered
      // beside it. A store that displays the option and prices it at the base
      // product undercharges on every order, silently, until someone
      // reconciles the takings.
      const unitPrice = await readMoney(
        cartPage.getUnitPrice(o.title),
        'cart line unit price',
      );
      expect(
        unitPrice,
        `the line is priced at the product plus the ${o.optionalOptionTitle} option`,
      ).toBeCloseTo(o.price + o.optionalOptionPrice, 2);

      await cartPage.expectTotalsAreCoherent(o.title);
    },
  );
});
