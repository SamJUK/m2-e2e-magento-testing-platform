import { hyvaTest as test } from '../fixtures';

test.describe('Configurable Product', () => {
  test(
    'can add to cart with options',
    { tag: ['@product', '@configurable', '@smoke'] },
    async ({ productPage, data }) => {
      await productPage.addConfigurableProductToCart(
        data.slugs.products.configurableProduct,
        data.inputs.product.configurableProductOptions,
      );
    },
  );
});
