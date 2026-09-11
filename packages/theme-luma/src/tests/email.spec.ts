import { faker, fakerEN_GB } from '@faker-js/faker';
import { cityName } from '@samjuk/e2e-m2-playwright-core';
import { lumaTest as test } from '../fixtures';
import type { CheckoutOrderData } from '../index';

// Reset storageState to ensure tests always start logged-out.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Transactional email', () => {
  test(
    'customer receives a welcome email after registration',
    { tag: ['@customer', '@email'] },
    async ({ registerPage, mailpit, data }) => {
      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();

      await registerPage.createNewAccount({
        firstName,
        lastName,
        email,
        password: faker.internet.password({ prefix: 'X1@' }),
      });

      await mailpit.waitForMessage(
        [
          { key: 'subject', value: data.fixtures.account.register.mail.subject },
          { key: 'to', value: email },
        ],
        { message: 'Customer should receive a welcome email after registering' },
      );
    },
  );

  test(
    'customer receives a password reset email',
    { tag: ['@customer', '@email'] },
    async ({ registerPage, accountPage, forgotPasswordPage, mailpit, data }) => {
      // register + logout + reset request is three full page-load round-trips,
      // which does not fit the default budget on a dev-mode store.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();

      await registerPage.createNewAccount({
        firstName,
        lastName,
        email,
        password: faker.internet.password({ prefix: 'X1@' }),
      });
      await accountPage.logout();
      await forgotPasswordPage.requestPasswordReset(email);

      await mailpit.waitForMessage(
        [
          { key: 'subject', value: data.fixtures.account.forgotPassword.mail.subject },
          { key: 'to', value: email },
        ],
        { message: 'Customer should receive a password reset email' },
      );
    },
  );

  test(
    'customer receives an order confirmation email',
    { tag: ['@checkout', '@email'] },
    async ({ productPage, checkoutPage, mailpit, page, data }) => {
      // add to cart + the three checkout steps do not fit the default budget.
      test.slow();

      const firstName = fakerEN_GB.person.firstName();
      const lastName = fakerEN_GB.person.lastName();
      const email = fakerEN_GB.internet
        .exampleEmail({ firstName, lastName })
        .toLowerCase();
      const address = {
        firstName,
        lastName,
        company: fakerEN_GB.company.name(),
        streetAddress: fakerEN_GB.location.streetAddress(),
        country: 'United Kingdom',
        county: fakerEN_GB.location.county(),
        city: cityName(fakerEN_GB),
        postcode: fakerEN_GB.location.zipCode(),
        telephone: fakerEN_GB.phone.number(),
      };
      const order: CheckoutOrderData = {
        email,
        billingAddress: address,
        shippingAddress: address,
      };

      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
      await page.goto(data.slugs.checkout);
      const orderNumber = await checkoutPage.placeOrder(order);

      await mailpit.waitForMessage(
        [
          { key: 'subject', value: data.fixtures.checkout.mail.subject },
          { key: 'to', value: email },
          // Free-text segment: the increment ID must appear in the body, which
          // proves the mail belongs to the order we just placed.
          { value: orderNumber },
        ],
        { message: `Customer should receive an order confirmation for ${orderNumber}` },
      );
    },
  );

  test(
    'a password reset link actually sets a new password and signs in',
    { tag: ['@customer', '@password', '@email'] },
    async ({ registerPage, accountPage, forgotPasswordPage, mailpit, data }) => {
      // register + sign out + the reset request + the reset form + two
      // sign-in attempts is six full page-load round-trips.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();
      const password = faker.internet.password({ prefix: 'X1@' });
      const newPassword = faker.internet.password({ prefix: 'Y2@' });

      await registerPage.createNewAccount({ firstName, lastName, email, password });
      await accountPage.logout();
      await forgotPasswordPage.requestPasswordReset(email);

      // The link is pulled out of the mail rather than built from a token the
      // test already knows, so what gets followed is the URL a real customer
      // would have been sent.
      const resetUrl = await mailpit.findLinkInMessage(
        [
          { key: 'subject', value: data.fixtures.account.forgotPassword.mail.subject },
          { key: 'to', value: email },
        ],
        /https?:\/\/[^"'\s]*createPassword[^"'\s]*/i,
        { message: `the reset email for ${email} carries a createPassword link` },
      );

      await forgotPasswordPage.setNewPassword(resetUrl, newPassword);

      // "A reset email arrived" is already covered. What this adds is that the
      // token in it works and that it replaced the old credential: the old
      // password must now be refused and the new one must sign in.
      await accountPage.expectLoginIsRejected({ email, password });
      await accountPage.login({ email, password: newPassword });
    },
  );
});
