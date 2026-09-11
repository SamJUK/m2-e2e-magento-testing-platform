import { readMoney } from '@samjuk/e2e-m2-playwright-core';
import { lumaTest as test, expect } from '../fixtures';

test.describe('Bundle Product', () => {
  test(
    'bundle product renders its options and the price follows the selection',
    { tag: ['@product', '@bundle'] },
    async ({ productPage, data }) => {
      const b = data.fixtures.product.bundle;

      await productPage.openBundleOptions(data.slugs.products.bundleProduct);

      // Both selections have to be offered by name. Without this, a bundle that
      // rendered a single dead option would still satisfy the price assertions
      // below by never changing.
      await expect(
        productPage.bundleOptionLabels.filter({ hasText: b.defaultSelection.title }),
        'the bundle offers its default selection',
      ).toHaveCount(1);
      await expect(
        productPage.bundleOptionLabels.filter({ hasText: b.alternateSelection.title }),
        'the bundle offers its alternate selection',
      ).toHaveCount(1);

      // The seeded bundle has a FIXED price, so each figure below is exact:
      // the bundle's own price plus the chosen selection's price. Asserting the
      // arithmetic rather than "the price changed" is what makes this fail on a
      // theme that recalculates from the wrong base.
      await productPage.expectBundlePrice(
        b.basePrice + b.defaultSelection.price,
        `the bundle opens priced at its base plus "${b.defaultSelection.title}"`,
      );

      await productPage.selectBundleOption(b.alternateSelection.title);
      await productPage.expectBundlePrice(
        b.basePrice + b.alternateSelection.price,
        `choosing "${b.alternateSelection.title}" reprices the bundle to base plus that option`,
      );
    },
  );

  test(
    'bundle product can be added to the cart with its selections',
    { tag: ['@product', '@bundle', '@cart'] },
    async ({ productPage, cartPage, data }) => {
      // Opening the bundle, configuring it and loading the cart does not fit
      // the default budget on a dev-mode store.
      test.slow();
      const b = data.fixtures.product.bundle;

      await productPage.openBundleOptions(data.slugs.products.bundleProduct);
      await productPage.selectBundleOption(b.alternateSelection.title);
      await productPage.addBundleToCart();

      // Read the cart back off the server. This is also the check that would
      // catch a PDP price which disagrees with what the store actually charges.
      await cartPage.open();
      const row = cartPage.getProductRow(b.title);
      await expect(row, 'the bundle reached the cart').toHaveCount(1);
      await expect(
        row,
        'the cart line names the option that was chosen',
      ).toContainText(b.alternateSelection.title);
      await expect(
        row,
        'the cart line does not carry the option that was replaced',
      ).not.toContainText(b.defaultSelection.title);

      const unitPrice = await readMoney(cartPage.getUnitPrice(b.title), 'bundle unit price');
      expect(
        unitPrice,
        'the cart charges the bundle base price plus the chosen selection',
      ).toBeCloseTo(b.basePrice + b.alternateSelection.price, 2);
      await cartPage.expectTotalsAreCoherent(b.title);
    },
  );
});
