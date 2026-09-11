import { faker } from '@faker-js/faker';
import { hyvaTest as test, expect } from '../fixtures';
import type { RegisterPage } from '../pages/account.page';

/** Registers a throwaway customer and leaves the browser signed in as them. */
async function signUp(registerPage: RegisterPage) {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  await registerPage.createNewAccount({
    firstName,
    lastName,
    email: faker.internet.exampleEmail({ firstName, lastName }).toLowerCase(),
    password: faker.internet.password({ prefix: 'X1@' }),
  });
}

test.describe('Wishlist', () => {
  // A wishlist belongs to a customer, so every test here registers its own.
  // Reset storageState so that registration is the only session in play.
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    'customer can add a product to their wish list',
    { tag: ['@wishlist', '@customer'] },
    async ({ registerPage, wishlistPage, page, data }) => {
      // Registration plus a PDP load plus the wishlist page is four full
      // round-trips, which does not fit the default budget on a dev-mode store.
      test.slow();
      await signUp(registerPage);

      await wishlistPage.addFromProductPage(data.slugs.products.simpleProduct);

      // Re-request the wishlist so what is asserted is the server's list, not
      // the confirmation the click painted on its way past.
      await wishlistPage.open();
      // `level: 1` is load-bearing: the sidebar's own "My Wish List" block is
      // marked up as an aria-level 2 heading with the same name.
      await expect(
        page.getByRole('heading', {
          name: data.selectors.wishlistPage.headingText,
          level: 1,
        }),
      ).toBeVisible();
      await expect(
        wishlistPage.items,
        'the wish list holds exactly the one product that was added',
      ).toHaveCount(1);
      await expect(
        wishlistPage.getItem(data.fixtures.product.simpleProductTitle),
        'the wish list holds the product it was given',
      ).toHaveCount(1);
    },
  );

  test(
    'guest cannot add a product to a wish list',
    { tag: ['@wishlist', '@negative'] },
    async ({ wishlistPage, data }) => {
      await wishlistPage.expectGuestIsRedirectedToLogin(data.slugs.products.simpleProduct);
    },
  );

  test(
    'customer can remove a product from their wish list',
    { tag: ['@wishlist', '@customer'] },
    async ({ registerPage, wishlistPage, data }) => {
      test.slow();
      await signUp(registerPage);

      await wishlistPage.addFromProductPage(data.slugs.products.simpleProduct);
      // The precondition, asserted before anything is removed: without it the
      // emptiness below would be satisfied by a wish list that never filled.
      expect(await wishlistPage.countItems(), 'the wish list holds one product').toBe(1);

      await wishlistPage.removeProduct(data.fixtures.product.simpleProductTitle);

      expect(await wishlistPage.countItems(), 'the wish list is empty again').toBe(0);
    },
  );

  test(
    'customer can add a wish list item to the cart',
    { tag: ['@wishlist', '@cart'] },
    async ({ registerPage, wishlistPage, cartPage, page, data }) => {
      test.slow();
      await signUp(registerPage);

      const productTitle = data.fixtures.product.simpleProductTitle;
      await wishlistPage.addFromProductPage(data.slugs.products.simpleProduct);
      await wishlistPage.addProductToCart(productTitle);

      // Read the cart back off the server: the wishlist's own confirmation says
      // nothing about the quote.
      await cartPage.open();
      await expect(
        cartPage.getProductRow(productTitle),
        'the wish list item reached the cart',
      ).toHaveCount(1);
      await cartPage.expectTotalsAreCoherent(productTitle);
      await expect(page).toHaveURL(new RegExp(data.slugs.cart));
    },
  );
});
