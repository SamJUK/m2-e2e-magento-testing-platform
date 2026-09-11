import { faker } from '@faker-js/faker';
import { lumaTest as test, expect } from '../fixtures';

// Reset storageState to ensure tests always start logged-out.
test.use({ storageState: { cookies: [], origins: [] } });

test(
  'can register a new customer account',
  { tag: ['@customer', '@smoke'] },
  async ({ registerPage }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    await registerPage.createNewAccount({
      firstName,
      lastName,
      email: faker.internet.exampleEmail({ firstName, lastName }),
      password: faker.internet.password({ prefix: 'X1@' }),
    });
  },
);

test(
  'can logout from customer account',
  { tag: ['@customer', '@smoke'] },
  async ({ registerPage, accountPage }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const password = faker.internet.password({ prefix: 'X1@' });
    await registerPage.createNewAccount({
      firstName,
      lastName,
      email: faker.internet.exampleEmail({ firstName, lastName }),
      password,
    });
    await accountPage.logout();
  },
);

test(
  'can login to customer account',
  { tag: ['@customer', '@smoke'] },
  async ({ registerPage, accountPage }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const password = faker.internet.password({ prefix: 'X1@' });
    const email = faker.internet.exampleEmail({ firstName, lastName });

    await registerPage.createNewAccount({ firstName, lastName, email, password });
    await accountPage.logout();
    await accountPage.login({ email, password });
  },
);

test(
  'order history is empty for a new customer account',
  { tag: ['@customer', '@orders'] },
  async ({ registerPage, accountPage, page, data }) => {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    await registerPage.createNewAccount({
      firstName,
      lastName,
      email: faker.internet.exampleEmail({ firstName, lastName }).toLowerCase(),
      password: faker.internet.password({ prefix: 'X1@' }),
    });

    await accountPage.viewOrderHistory();

    const f = data.fixtures.account.orderHistory;
    await expect(page.getByRole('heading', { name: f.headingText })).toBeVisible();
    await expect(
      page.locator(data.selectors.orderHistoryPage.emptyMessage),
    ).toContainText(f.emptyText);
  },
);

test(
  'login with invalid credentials is rejected',
  { tag: ['@customer', '@negative'] },
  async ({ accountPage, data }) => {
    await accountPage.expectLoginIsRejected(data.inputs.account.invalidLogin);
  },
);

test(
  'login without a password is rejected',
  { tag: ['@customer', '@negative'] },
  async ({ accountPage, data }) => {
    await accountPage.expectLoginIsRejectedForMissingPassword(
      data.inputs.account.invalidLogin.email,
    );
  },
);

test(
  'can request a password reset link',
  { tag: ['@customer', '@password'] },
  async ({ registerPage, accountPage, forgotPasswordPage }) => {
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
  },
);

test(
  'registering with an email that already exists is rejected',
  { tag: ['@customer', '@negative'] },
  async ({ registerPage, accountPage }) => {
    // register + sign out + a second registration attempt is three full
    // page-load round-trips, which does not fit the default budget on a
    // dev-mode store.
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

    // A different name and a different password on the same address, so what
    // gets refused is provably the email and not a repeated submission.
    await registerPage.expectRegistrationIsRejectedForDuplicateEmail({
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      email,
      password: faker.internet.password({ prefix: 'Y2@' }),
    });
    await accountPage.expectNotAuthenticated();
  },
);

test(
  'a signed-in customer can change their password',
  { tag: ['@customer', '@password'] },
  async ({ registerPage, accountPage }) => {
    // register + save + two sign-in attempts is four full page-load
    // round-trips, which does not fit the default budget on a dev-mode store.
    test.slow();

    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();
    const password = faker.internet.password({ prefix: 'X1@' });
    const newPassword = faker.internet.password({ prefix: 'Y2@' });

    await registerPage.createNewAccount({ firstName, lastName, email, password });
    await accountPage.changePassword(password, newPassword);

    // Both halves are the assertion. That the new password signs in proves the
    // change was applied; that the old one no longer does proves it replaced
    // the old rather than being stored alongside it.
    await accountPage.expectLoginIsRejected({ email, password });
    await accountPage.login({ email, password: newPassword });
  },
);

test(
  'a customer can edit their name and email',
  { tag: ['@customer', '@profile'] },
  async ({ registerPage, accountPage }) => {
    // register + save + sign in again + the dashboard read is five full
    // page-load round-trips, which does not fit the default budget on a
    // dev-mode store.
    test.slow();

    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();
    const password = faker.internet.password({ prefix: 'X1@' });

    await registerPage.createNewAccount({ firstName, lastName, email, password });

    // A new name AND a new address, so neither can be satisfied by the values
    // the account was created with.
    const newFirstName = faker.person.firstName();
    const newLastName = faker.person.lastName();
    const newEmail = faker.internet
      .exampleEmail({ firstName: newFirstName, lastName: newLastName })
      .toLowerCase();

    await accountPage.editAccountDetails(
      { firstName: newFirstName, lastName: newLastName, email: newEmail },
      password,
    );

    // The new address is now the credential. Signing in with it is what proves
    // the email actually moved rather than the form merely reporting success.
    await accountPage.login({ email: newEmail, password });
    await accountPage.expectDashboardShows({
      firstName: newFirstName,
      lastName: newLastName,
      email: newEmail,
    });
  },
);

test(
  'the newsletter subscription can be toggled from the account',
  { tag: ['@customer', '@newsletter'] },
  async ({ registerPage, accountPage }) => {
    // register + two saves, each read back from the server afterwards.
    test.slow();

    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    await registerPage.createNewAccount({
      firstName,
      lastName,
      email: faker.internet.exampleEmail({ firstName, lastName }).toLowerCase(),
      password: faker.internet.password({ prefix: 'X1@' }),
    });

    // Both directions. Subscribing alone would pass against a store that
    // cannot unsubscribe, which is the half that actually matters legally.
    await accountPage.setNewsletterSubscription(true);
    await accountPage.setNewsletterSubscription(false);
  },
);
