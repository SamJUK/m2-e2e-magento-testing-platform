import { hyvaTest as test, expect } from '../fixtures';

test.describe('Minicart (Guest)', () => {
  test.beforeEach(async ({ productPage, data }) => {
    await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
  });

  test(
    'product is visible in minicart',
    { tag: ['@minicart', '@smoke'] },
    async ({ minicartPage, data }) => {
      const item = await minicartPage.getProductInMinicart(data.fixtures.product.simpleProductTitle);
      await expect(item, 'Product is visible in minicart').toBeVisible();
    },
  );

  test(
    'can remove product from minicart',
    { tag: ['@minicart'] },
    async ({ minicartPage, data }) => {
      await minicartPage.ensureMinicartIsOpen();
      // Prove the counter is live before relying on it as the removal proof.
      await expect
        .poll(() => minicartPage.getItemCount(), {
          timeout: 30_000,
          message: 'minicart counter reports the added item',
        })
        .toBe(1);

      await minicartPage.removeProduct(data.fixtures.product.simpleProductTitle);

      await expect
        .poll(() => minicartPage.getItemCount(), {
          timeout: 30_000,
          message: 'minicart counter reached zero after removal',
        })
        .toBe(0);
    },
  );

  test(
    'can proceed to cart from minicart',
    { tag: ['@minicart'] },
    async ({ minicartPage, page, data }) => {
      await minicartPage.ensureMinicartIsOpen();
      const cartLink = minicartPage.minicart.getByRole('link', {
        name: data.selectors.minicart.viewCartLinkLabel,
      });
      await expect(cartLink).toBeVisible();
      await cartLink.click();
      // Anchored: an unanchored /cart/ also matches /checkout/cart/configure/
      // and any URL that merely contains the word.
      await expect(page).toHaveURL(new RegExp(`${data.slugs.cart}$`));
      // Hyvä renders each cart line's title as a heading (see cart.spec.ts).
      await expect(
        page.getByRole('heading', { name: data.fixtures.product.simpleProductTitle }),
        'the cart page itself rendered, not just its URL',
      ).toBeVisible();
    },
  );

  test(
    'can proceed to checkout from minicart',
    { tag: ['@minicart'] },
    async ({ minicartPage, page, data }) => {
      await minicartPage.ensureMinicartIsOpen();
      // Hyvä renders the cart drawer's checkout control as an <a>, not a <button>.
      const checkoutLink = minicartPage.minicart.getByRole('link', {
        name: data.selectors.minicart.checkoutButtonLabel,
      });
      await expect(checkoutLink).toBeVisible();
      await checkoutLink.click();
      // Anchored: /checkout/ unanchored is also satisfied by /checkout/cart/,
      // i.e. by never leaving the cart at all.
      await expect(page).toHaveURL(new RegExp(`${data.slugs.checkout}(#.*)?$`));
      await expect(
        page.getByRole('button', { name: data.selectors.checkout.nextStepButtonLabel }),
        'checkout itself rendered, not just its URL',
      ).toBeVisible({ timeout: 60_000 });
    },
  );
});
