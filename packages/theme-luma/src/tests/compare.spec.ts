import { lumaTest as test, expect } from '../fixtures';

test.describe('Product Compare', () => {
  test(
    'can compare two products',
    { tag: ['@compare'] },
    async ({ comparePage, data }) => {
      // Two PDP loads and two comparison-page loads do not fit the default
      // budget on a dev-mode store.
      test.slow();
      const first = data.fixtures.product.simpleProductTitle;
      const second = data.fixtures.product.secondaryProductTitle;

      await comparePage.addFromProductPage(data.slugs.products.simpleProduct, first);
      await comparePage.addFromProductPage(data.slugs.products.secondaryProduct, second);

      await comparePage.open();
      const names = await comparePage.getProductNames();
      expect(names, 'the comparison page lists both products, and only those').toEqual([
        first,
        second,
      ]);
    },
  );

  test(
    'can add a product to the cart from the comparison page',
    { tag: ['@compare', '@cart'] },
    async ({ comparePage, cartPage, data }) => {
      test.slow();
      const productTitle = data.fixtures.product.simpleProductTitle;

      await comparePage.addFromProductPage(data.slugs.products.simpleProduct, productTitle);
      await comparePage.addProductToCart(productTitle);

      // Read the cart back off the server; the comparison page's own reaction
      // says nothing about the quote.
      await cartPage.open();
      await expect(
        cartPage.getProductRow(productTitle),
        'the compared product reached the cart',
      ).toHaveCount(1);
      await cartPage.expectTotalsAreCoherent(productTitle);
    },
  );

  test(
    'can remove a product from the comparison list',
    { tag: ['@compare'] },
    async ({ comparePage, data }) => {
      test.slow();
      const first = data.fixtures.product.simpleProductTitle;
      const second = data.fixtures.product.secondaryProductTitle;

      await comparePage.addFromProductPage(data.slugs.products.simpleProduct, first);
      await comparePage.addFromProductPage(data.slugs.products.secondaryProduct, second);
      // The precondition. Removing from a list that never filled would make the
      // absence asserted below vacuously true.
      expect(
        await comparePage.getProductNames(),
        'both products are on the comparison list before one is removed',
      ).toEqual([first, second]);

      await comparePage.removeProduct(first);

      expect(
        await comparePage.getProductNames(),
        'only the product that was not removed is left',
      ).toEqual([second]);
    },
  );
});
