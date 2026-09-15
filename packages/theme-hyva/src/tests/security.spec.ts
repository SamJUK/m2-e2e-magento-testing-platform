import { faker } from '@faker-js/faker';
import { getSessionId } from '@samjuk/e2e-m2-playwright-core';
import { hyvaTest as test, expect } from '../fixtures';

// Reset storageState so every test starts from a genuinely anonymous session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Session and CSRF', () => {
  test(
    'a password reset link cannot be used twice',
    { tag: ['@customer', '@password', '@security', '@negative'] },
    async ({ registerPage, accountPage, forgotPasswordPage, mailpit, data }) => {
      // register, sign out, request, consume the link, then follow it again:
      // six full page-load round-trips on a dev-mode store.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();
      const password = faker.internet.password({ prefix: 'X1@' });
      const newPassword = faker.internet.password({ prefix: 'Y2@' });

      await registerPage.createNewAccount({ firstName, lastName, email, password });
      await accountPage.logout();
      await forgotPasswordPage.requestPasswordReset(email);

      const resetUrl = await mailpit.findLinkInMessage(
        [
          { key: 'subject', value: data.fixtures.account.forgotPassword.mail.subject },
          { key: 'to', value: email },
        ],
        /https?:\/\/[^"'\s]*createPassword[^"'\s]*/i,
        { message: `the reset email for ${email} carries a createPassword link` },
      );

      await forgotPasswordPage.setNewPassword(resetUrl, newPassword);

      // A token that still works after it has been spent is a live account
      // takeover for anyone who reads the mailbox later: a forwarded mail, a
      // shared inbox, a backup. Sibling of the existing test that proves the
      // link works once.
      await forgotPasswordPage.expectResetLinkIsRefused(resetUrl);
    },
  );

  test(
    'the session id changes when a customer signs in',
    { tag: ['@customer', '@security'] },
    async ({ page, registerPage, accountPage }) => {
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();
      const password = faker.internet.password({ prefix: 'X1@' });

      await registerPage.createNewAccount({ firstName, lastName, email, password });
      await accountPage.logout();

      const anonymousSession = await getSessionId(page);
      expect(
        anonymousSession,
        'the store issues a session to an anonymous visitor',
      ).not.toBeNull();

      await accountPage.login({ email, password });

      // Magento regenerates the id in Account\\LoginPost. Carrying the
      // pre-login id into an authenticated session is session fixation: an
      // attacker who planted that id is signed in as the customer.
      expect(
        await getSessionId(page),
        'the session id is regenerated on sign-in',
      ).not.toEqual(anonymousSession);
    },
  );

  test(
    'a form submitted with an invalid form key is refused',
    { tag: ['@contact', '@security', '@negative'] },
    async ({ contactPage }) => {
      // The contact form stands in for every state-changing POST on the
      // storefront: they all go through the same FormKeyValidator, so if it is
      // wired up at all it is wired up here.
      await contactPage.expectContactFormIsRejectedForInvalidFormKey();
    },
  );

  test(
    'cookie restriction mode behaves as the store declares',
    { tag: ['@security', '@cookies'] },
    async ({ cookieNoticePage, data }) => {
      if (data.features.security.cookieRestriction) {
        await cookieNoticePage.expectNoticeIsAcceptable();
      } else {
        // Asserted in both directions on purpose: a store that later switches
        // Cookie Restriction Mode on fails here, rather than having every
        // other test quietly start fighting an overlay it knows nothing about.
        await cookieNoticePage.expectNoNoticeIsRendered();
      }
    },
  );
});
