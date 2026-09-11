import { fakerEN_GB as faker } from '@faker-js/faker';
import { readMoney } from '@samjuk/e2e-m2-playwright-core';
import { hyvaTest as test, expect } from '../fixtures';

/**
 * Signing in must merge the guest quote into the customer's, not replace it.
 *
 * This is a silent-loss bug when it breaks: the customer signs in at the
 * checkout, the basket empties, and nothing anywhere says so.
 */
test.describe('Cart merge on sign-in', () => {
  // Reset storageState so the customer registered here is the only session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    'a guest cart survives signing in',
    { tag: ['@cart', '@customer'] },
    async ({ registerPage, accountPage, productPage, cartPage, data }) => {
      // register + sign out + add to cart + sign in + two cart reads.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();
      const password = faker.internet.password({ prefix: 'X1@' });
      const title = data.fixtures.product.simpleProductTitle;
      // More than one, so a merge that silently resets the line to a default
      // quantity fails as loudly as one that drops the line altogether.
      const quantity = data.inputs.product.custom_quantity;

      // The account has to exist before the guest cart does — registering
      // signs the customer in, so it cannot happen the other way round.
      await registerPage.createNewAccount({ firstName, lastName, email, password });
      await accountPage.logout();

      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct, quantity);

      // Precondition, read back off the server: without it the assertions
      // after signing in could pass against a cart that was never filled.
      await cartPage.open();
      await expect(
        cartPage.getProductRow(title),
        'the guest cart holds the product before signing in',
      ).toHaveCount(1);
      await expect(
        cartPage.getQuantityField(title),
        'the guest cart holds the quantity that was added',
      ).toHaveValue(String(quantity));
      const guestLineTotal = await readMoney(
        cartPage.getLineTotal(title),
        'guest cart line total',
      );

      await accountPage.login({ email, password });

      // Re-request the cart as the signed-in customer, so every figure below
      // is the server's view of the merged quote.
      await cartPage.open();
      await expect(
        cartPage.getProductRow(title),
        'the guest cart line survived signing in',
      ).toHaveCount(1);
      await expect(
        cartPage.getQuantityField(title),
        'the merged cart kept the quantity the guest had chosen',
      ).toHaveValue(String(quantity));
      expect(
        await readMoney(cartPage.getLineTotal(title), 'merged cart line total'),
        'the merged line is still priced as it was',
      ).toBeCloseTo(guestLineTotal, 2);

      await cartPage.expectTotalsAreCoherent(title);
    },
  );
});
