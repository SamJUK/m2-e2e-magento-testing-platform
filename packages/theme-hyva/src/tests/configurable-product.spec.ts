import { expect } from '@playwright/test';

import { hyvaTest as test } from '../fixtures';

test.describe('Configurable Product', () => {
  test(
    'can add to cart with options',
    { tag: ['@product', '@configurable', '@smoke'] },
    async ({ productPage, cartPage, data }) => {
      await productPage.addConfigurableProductToCart(
        data.slugs.products.configurableProduct,
        data.inputs.product.configurableProductOptions,
      );

      // Read the cart back. The add itself only observes the POST response, and
      // Magento answers a refused add with a redirect as well - so an
      // out-of-stock variant or a mis-mapped swatch looked identical to success.
      const title = data.fixtures.product.configurableProductTitle;
      await cartPage.open();
      const row = cartPage.getProductRow(title);
      await expect(row, 'the configurable product reached the cart').toHaveCount(1);
      for (const [label, value] of data.inputs.product.configurableProductOptions) {
        await expect(
          row,
          `the cart line records the chosen ${label}`,
        ).toContainText(value);
      }
    },
  );
});
