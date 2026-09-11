import { expect, type Locator, type Page } from '@playwright/test';
import { resetFormKey, sprintf, waitForFormKey } from '@samjuk/e2e-m2-playwright-core';
import type { HyvaData } from '../data/types';
import type {
  IAccountPage,
  IForgotPasswordPage,
  IRegisterPage,
  RegisterCredentials,
} from './types';

export type { RegisterCredentials };

/**
 * Magento serves the customer dashboard at both `/customer/account/` and
 * `/customer/account/index/`, and which one you land on depends on the
 * redirect that got you there (register vs login vs a theme's own redirect).
 * Accept either for the same configured slug.
 */
function accountUrlPattern(slug: string): RegExp {
  const escaped = slug.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(/index)?/?$`);
}

/**
 * Matches the login form's own URL.
 *
 * Deliberately open-ended after the slug: when Magento bounces a guest off a
 * protected route it appends the origin as extra PATH segments
 * (`/customer/account/login/referer/<base64>/`), not as a query string, so
 * anchoring on the slug alone would reject the very redirect this proves.
 */
function loginUrlPattern(slug: string): RegExp {
  const escaped = slug.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(/|$)`);
}

export class AccountPage implements IAccountPage {
  readonly page: Page;
  readonly loginForm: Locator;
  readonly loginEmailField: Locator;
  readonly loginPasswordField: Locator;
  readonly signInButton: Locator;
  readonly customerMenuTrigger: Locator;
  readonly customerMenu: Locator;

  constructor(page: Page, private data: HyvaData) {
    this.page = page;
    const s = data.selectors;
    // Hyvä ships a persistent "authenticate" login drawer (#login-form) in the
    // header on every page, whose fields are labelled "Email Address"/"Password"
    // and whose submit is also "Sign In". Everything must be scoped to the real
    // login form (#customer-login-form) or locators resolve to two elements.
    this.loginForm = page.locator(s.loginPage.formSelector);
    this.loginEmailField = this.loginForm.getByLabel(s.loginPage.emailFieldLabel, { exact: true });
    this.loginPasswordField = this.loginForm.getByLabel(s.loginPage.passwordFieldLabel, {
      exact: true,
    });
    this.signInButton = this.loginForm.getByRole('button', {
      name: s.loginPage.signInButtonLabel,
    });
    this.customerMenuTrigger = page.locator(s.accountOverviewPage.menuTriggerSelector);
    // The account dashboard's sidebar carries a second "Sign Out" link, so the
    // header dropdown must be scoped or the locator matches two elements.
    this.customerMenu = page.locator(s.accountOverviewPage.customerMenuSelector);
  }

  /**
   * Asks the server whether this session is authenticated.
   *
   * The customer dashboard is a protected route: Magento bounces a guest back
   * to the login form. That round-trip is what makes a rejected login provable
   * — a page that merely failed to navigate proves nothing about the session.
   */
  async expectNotAuthenticated(): Promise<void> {
    await this.page.goto(this.data.slugs.account.overview, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      this.page,
      'the customer dashboard still bounces this session to the login form',
    ).toHaveURL(loginUrlPattern(this.data.slugs.account.login), { timeout: 30_000 });
  }

  async expectLoginIsRejected(credentials: { email: string; password: string }): Promise<void> {
    // Dropped before the page loads, not after: a caller that just changed or
    // reset a password has been logged out server-side, and Magento's
    // `customer_logout` deletes the form key on both sides. See resetFormKey.
    await resetFormKey(this.page);
    await this.page.goto(this.data.slugs.account.login, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);
    await this.loginEmailField.fill(credentials.email);
    await this.loginPasswordField.fill(credentials.password);
    await this.signInButton.click();

    // KNOWN OPEN ISSUE, mageos target of the CI E2E stack only. This assertion
    // fails there whenever the sign-in follows a password change or reset,
    // reproducibly across all three attempts, and passes everywhere else
    // including against a real Mage-OS store locally.
    //
    // What the run artifacts show: the login page comes back with an EMPTY
    // messages container and an EMPTY email field. Magento redisplays
    // `login[username]` after a rejected credential, so an empty field means
    // LoginPost never processed this POST at all, and an empty container means
    // no message was ever queued for it. That is the shape of a form-key
    // rejection on a full-page-cached login form, not a slow render: raising
    // this wait to 90s changed nothing, so it is back at 45s rather than
    // making a real failure take twice as long to surface.
    await expect(
      this.page.getByText(this.data.fixtures.account.login.invalidCredentialsText),
      'the store explains the sign-in was refused',
    ).toBeVisible({ timeout: 45_000 });
    await expect(this.page, 'the browser stayed on the login form').toHaveURL(
      loginUrlPattern(this.data.slugs.account.login),
    );
    await this.expectNotAuthenticated();
  }

  async expectLoginIsRejectedForMissingPassword(email: string): Promise<void> {
    await this.page.goto(this.data.slugs.account.login, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);
    await this.loginEmailField.fill(email);
    await this.signInButton.click();

    // Hyvä's login form ships no JS validator: it declares `required` on the
    // password input and leaves the check to the browser, which refuses to
    // fire the submit event at all. There is no message element to read, so
    // the assertion is the browser's own verdict — and it is falsifiable in
    // exactly the way that matters: drop `required` from the template and
    // both of these flip, while the form starts submitting.
    await expect
      .poll(
        () =>
          this.loginPasswordField.evaluate(
            (element) => (element as HTMLInputElement).validity.valueMissing,
          ),
        { message: 'the empty password is reported as a missing required value', timeout: 15_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () => this.loginForm.evaluate((form) => (form as HTMLFormElement).checkValidity()),
        { message: 'the browser refuses to submit the login form', timeout: 15_000 },
      )
      .toBe(false);

    await expect(this.page, 'the browser stayed on the login form').toHaveURL(
      loginUrlPattern(this.data.slugs.account.login),
    );
    await this.expectNotAuthenticated();
  }

  async login(credentials: { email: string; password: string }): Promise<void> {
    // Same reason as expectLoginIsRejected: the caller may have just been
    // logged out server-side, taking the form key with it.
    await resetFormKey(this.page);
    await this.page.goto(this.data.slugs.account.login, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);
    await waitForFormKey(this.page);
    await this.loginEmailField.fill(credentials.email);
    await this.loginPasswordField.fill(credentials.password);
    await this.signInButton.click();
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(this.page).toHaveURL(accountUrlPattern(this.data.slugs.account.loginSuccess));
  }

  async logout(): Promise<void> {
    await this.page.goto(this.data.slugs.account.overview, {
      waitUntil: 'domcontentloaded',
    });
    const signOutLink = this.customerMenu.getByRole('link', {
      name: this.data.selectors.accountOverviewPage.logoutButtonLabel,
    });

    // The customer menu is an Alpine dropdown: the Sign Out link is only
    // rendered once the menu is toggled open, and the toggle only works after
    // Alpine has booted — an early click is a silent no-op on deferred-JS
    // stores. Retry until the link is actually reachable, opening the dropdown
    // only when it is not already showing (clicking again would close it).
    await expect(async () => {
      if (!(await signOutLink.isVisible())) {
        await this.customerMenuTrigger.click();
      }
      await expect(signOutLink).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });

    await signOutLink.click();
    // Sign-out is a full page round-trip that can take >10s on a dev-mode
    // store, so wait it out instead of racing the expect timeout.
    await this.page.waitForURL(`**${this.data.slugs.account.logoutSuccess}**`, {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    // `.first()`: themes repeat the confirmation in both the heading and the
    // "redirecting in 5 seconds" line below it.
    await expect(
      this.page.getByText(this.data.fixtures.account.logout.notificationText).first(),
      'the logout confirmation is shown',
    ).toBeVisible();
    await expect(this.page).toHaveURL(this.data.slugs.account.logoutSuccess);
    // Hyvä's logout.phtml carries the same 5s `setTimeout` bounce to the
    // homepage that Luma does. Left pending, it aborts whatever the test
    // navigates to next (surfacing as net::ERR_ABORTED). Go there ourselves to
    // drop the timer, falling back to waiting the bounce out if we lose the race.
    // Not a silent skip: the store's own 5s bounce can abort this navigation
    // mid-flight (net::ERR_ABORTED), which is the outcome we wanted anyway.
    // Either way the waitForURL below still has to prove we left logoutSuccess.
    await this.page
      .goto('/', { waitUntil: 'domcontentloaded' })
      .catch(() => undefined);
    await this.page.waitForURL((url) => !url.pathname.includes('logoutSuccess'), {
      timeout: 30_000,
      waitUntil: 'domcontentloaded',
    });
  }

  async viewOrderHistory(): Promise<void> {
    // `load` waits on every image, which routinely outlives the test budget on
    // a dev-mode store; the spec's assertions wait for content instead.
    await this.page.goto(this.data.slugs.account.orderHistory, {
      waitUntil: 'domcontentloaded',
    });
  }

  /** Opens an order from the history grid by its increment ID. */
  async viewOrder(orderNumber: string): Promise<void> {
    const s = this.data.selectors.orderHistoryPage;
    await this.viewOrderHistory();

    const row = this.page
      .locator(s.ordersTable)
      .locator('tbody tr', { hasText: orderNumber });
    await expect(row).toHaveCount(1);
    // Hyvä's view control is an icon-only <a> carrying BOTH title="View Order"
    // and aria-label="View order <id-without-leading-zeros>". The aria-label
    // wins the accessible name, so Luma's getByRole({ name: 'View Order' })
    // never matches — address it by the stable title attribute instead.
    await row.locator(s.viewOrderLinkSelector).click();
    await this.page.waitForURL('**/sales/order/view/**', {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });

    // The order number on this page is a plain <div class="text-2xl">, not a
    // heading; the only real heading is the <h1> page title that Magento sets
    // from pageConfig. Pin the level so the div can never be mistaken for it.
    await expect(
      this.page.getByRole('heading', {
        name: sprintf(this.data.fixtures.account.orderView.headingText, orderNumber),
        level: 1,
      }),
    ).toBeVisible();
  }
  /**
   * Asserts the order was recorded against the payment method the customer
   * actually selected at checkout.
   *
   * `expectedTitle` is read off the checkout's own checked radio rather than
   * hard-coded, so this compares the store against itself: a checkout that
   * selects one method while the quote is placed with another fails here.
   */
  async expectOrderPaymentMethod(orderNumber: string, expectedTitle: string): Promise<void> {
    await this.viewOrder(orderNumber);
    const method = this.page.locator(
      this.data.selectors.orderViewPage.paymentMethodSelector,
    );
    // Precondition for the text match below: a selector that matched nothing
    // would make `toContainText` fail for the wrong reason, and one that
    // matched several would compare against their concatenation.
    await expect(
      method,
      'the order view shows exactly one payment-method block',
    ).toHaveCount(1, { timeout: 30_000 });
    await expect(
      method,
      `the order was placed with the payment method selected at checkout ("${expectedTitle}")`,
    ).toContainText(expectedTitle);
  }

  /**
   * Changes the signed-in customer's password.
   *
   * The slug is the account-edit form with the change-password box already
   * ticked: the plain edit form renders the three password fields hidden, so
   * filling them would be filling nothing.
   *
   * Leaves the session signed out, which is what Magento does. That the OLD
   * password stops working and the new one starts is asserted by the spec.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const s = this.data.selectors.accountEditPage;
    await this.page.goto(this.data.slugs.account.changePassword, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);

    const form = this.page.locator(s.formSelector);
    await form.getByLabel(s.currentPasswordFieldLabel, { exact: true }).fill(currentPassword);
    await form.getByLabel(s.newPasswordFieldLabel, { exact: true }).fill(newPassword);
    await form.getByLabel(s.confirmPasswordFieldLabel, { exact: true }).fill(newPassword);
    await form.getByRole('button', { name: s.saveButtonLabel }).click();

    // Magento's own EditPost controller signs the customer out on a password
    // change and redirects to the login form. That is core behaviour, not a
    // store setting, so it is asserted rather than tolerated: a build that
    // stopped ending the session would leave a cookie valid after the
    // credential it was issued against had been replaced. The caller signs
    // back in with the new password.
    await this.page.waitForURL(loginUrlPattern(this.data.slugs.account.login), {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      this.page.getByText(this.data.fixtures.account.changePassword.notificationText),
      'the store confirms the account information was saved',
    ).toBeVisible();
  }

  /**
   * Reorders a past order from the history grid.
   *
   * Magento rebuilds the quote from the order's items and redirects to the
   * cart, so the caller is left on the cart page with the products in it.
   */
  async reorder(orderNumber: string): Promise<void> {
    const s = this.data.selectors.orderHistoryPage;
    await this.viewOrderHistory();

    const row = this.page
      .locator(s.ordersTable)
      .locator('tbody tr', { hasText: orderNumber });
    await expect(
      row,
      'the order has exactly one row in the history grid before reordering',
    ).toHaveCount(1, { timeout: 30_000 });

    // Hyvä's reorder control is a real form-submit button rather than Luma's
    // JS-posted anchor, so it does not depend on a late-bound widget. The form
    // key still has to be there for the POST to be accepted, and the retry
    // costs nothing while keeping the two themes the same shape.
    await waitForFormKey(this.page);

    const reorderControl = row.locator(s.reorderControlSelector);
    await expect(async () => {
      if (this.page.url().includes(this.data.slugs.cart)) return;
      await reorderControl.click({ timeout: 10_000 });
      // Reorder rebuilds the quote from the order's items and then renders the
      // whole cart, so this is generous per attempt rather than tight.
      await this.page.waitForURL(`**${this.data.slugs.cart}**`, {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });
    }).toPass({ timeout: 120_000 });
  }

  /**
   * Finds an order through Orders and Returns, the only route a guest has to
   * an order they placed without an account.
   *
   * `oar_type` already defaults to Email, but it is selected explicitly: a
   * store that reordered those options would otherwise silently submit the
   * email address as a postcode and fail as "order not found".
   */
  async lookUpGuestOrder(order: {
    orderNumber: string;
    email: string;
    lastName: string;
  }): Promise<void> {
    const s = this.data.selectors.guestOrderLookupPage;
    await this.page.goto(this.data.slugs.guestOrderLookup, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);

    const form = this.page.locator(s.formSelector);
    await form.getByLabel(s.orderIdFieldLabel, { exact: true }).fill(order.orderNumber);
    await form.getByLabel(s.lastNameFieldLabel, { exact: true }).fill(order.lastName);
    await form
      .getByLabel(s.searchByFieldLabel, { exact: true })
      .selectOption({ label: s.searchByEmailOptionLabel });
    await form.getByLabel(s.emailFieldLabel, { exact: true }).fill(order.email);
    await form.getByRole('button', { name: s.submitButtonLabel }).click();

    // The lookup is a full POST plus the order render, either of which can take
    // >10s on a dev-mode store.
    await this.page.waitForURL('**/sales/guest/view/**', {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      this.page.getByRole('heading', {
        name: sprintf(this.data.fixtures.account.orderView.headingText, order.orderNumber),
      }),
      'the guest order view opened on the order that was looked up',
    ).toBeVisible();
  }

  /**
   * Changes the customer's name and email address.
   *
   * The change-email box has to be TICKED here, not arrived at through a URL.
   * Magento honours a `changepass` parameter on this route and has no
   * equivalent for email (`Account\Edit` reads only `changepass`), so the
   * checkbox is what reveals the email and current-password fields. Whether
   * they appeared is then asserted, because that reveal is a widget bound
   * after the page settles and an early fill would silently target a hidden
   * input.
   *
   * Changing the email signs the customer out and redirects to the login form,
   * exactly as changing the password does: same branch of Magento's own
   * EditPost controller. The caller signs back in with the new address, which
   * is what proves the change took.
   */
  async editAccountDetails(
    details: { firstName: string; lastName: string; email: string },
    currentPassword: string,
  ): Promise<void> {
    const s = this.data.selectors.accountEditPage;
    await this.page.goto(this.data.slugs.account.editAccount, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);

    const form = this.page.locator(s.formSelector);
    const emailField = form.getByLabel(s.emailFieldLabel, { exact: true });

    // The checkbox handler is bound by a widget that initialises after the
    // form key lands, so an early click is dropped and the email field never
    // appears. Retry until it does.
    await expect(async () => {
      await form.locator(s.changeEmailCheckboxSelector).check();
      await expect(emailField).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });

    await form.getByLabel(s.firstNameFieldLabel, { exact: true }).fill(details.firstName);
    await form.getByLabel(s.lastNameFieldLabel, { exact: true }).fill(details.lastName);
    await emailField.fill(details.email);
    await form
      .getByLabel(s.currentPasswordFieldLabel, { exact: true })
      .fill(currentPassword);
    await form.getByRole('button', { name: s.saveButtonLabel }).click();

    await this.page.waitForURL(loginUrlPattern(this.data.slugs.account.login), {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      this.page.getByText(this.data.fixtures.account.editAccount.notificationText),
      'the store confirms the account information was saved',
    ).toBeVisible();
  }

  /**
   * Asserts the dashboard reports the customer the server actually holds.
   *
   * Read back off a page the test did not fill in, so it proves storage rather
   * than echo: a save that reported success but wrote nothing fails here.
   */
  async expectDashboardShows(details: {
    firstName: string;
    lastName: string;
    email: string;
    /** Omit when the customer has no stored address to check for. */
    streetAddress?: string;
  }): Promise<void> {
    const s = this.data.selectors.accountOverviewPage;
    await this.page.goto(this.data.slugs.account.overview, {
      waitUntil: 'domcontentloaded',
    });

    const info = this.page.locator(s.accountInformationBlock).first();
    await expect(info, 'the dashboard names the signed-in customer').toContainText(
      `${details.firstName} ${details.lastName}`,
      { timeout: 30_000 },
    );
    await expect(info, 'the dashboard shows the account email').toContainText(
      details.email,
    );
    // Only when the caller has an address to look for. A customer who has
    // stored none renders the block empty, and asserting on it would be
    // asserting on nothing.
    if (details.streetAddress !== undefined) {
      await expect(
        this.page.locator(s.addressBlockSelector).first(),
        "the dashboard shows the customer's default address",
      ).toContainText(details.streetAddress);
    }
  }

  /**
   * Opens an order's printable copy from its detail page.
   *
   * Magento gives the link `target="_blank"`, so the result is a new tab, not
   * a navigation. The increment ID is asserted in the tab that opens, which is
   * what makes this more than "a link was clickable".
   */
  async printOrder(orderNumber: string): Promise<void> {
    await this.viewOrder(orderNumber);

    const [printTab] = await Promise.all([
      this.page.context().waitForEvent('page'),
      this.page
        .getByRole('link', { name: this.data.selectors.orderViewPage.printOrderLinkLabel })
        .first()
        .click(),
    ]);

    try {
      await printTab.waitForLoadState('domcontentloaded');
      await expect(
        printTab,
        'the printable copy opened on the order print route',
      ).toHaveURL(/\/sales\/order\/print\//, { timeout: 45_000 });
      await expect(
        printTab.getByText(orderNumber).first(),
        'the printable copy is of the order that was opened',
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      await printTab.close();
    }
  }

  /**
   * Sets the newsletter subscription from the account and reads it back.
   *
   * The confirmation message says what the controller did; re-requesting the
   * form and checking the box says what the store now holds. A save that
   * flashed success and stored nothing fails on the second half.
   */
  async setNewsletterSubscription(subscribed: boolean): Promise<void> {
    const s = this.data.selectors.newsletterManagePage;
    const f = this.data.fixtures.account.newsletter;

    await this.page.goto(this.data.slugs.account.newsletter, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);

    const form = this.page.locator(s.formSelector);
    const checkbox = form.locator(s.subscriptionCheckboxSelector);
    await expect(
      checkbox,
      'the account offers exactly one subscription checkbox',
    ).toHaveCount(1, { timeout: 30_000 });
    await checkbox.setChecked(subscribed);
    await form.getByRole('button', { name: s.saveButtonLabel }).click();

    await expect(
      this.page.getByText(subscribed ? f.subscribedText : f.unsubscribedText),
      subscribed
        ? 'the store confirms the subscription was saved'
        : 'the store confirms the subscription was removed',
    ).toBeVisible({ timeout: 45_000 });

    await this.page.goto(this.data.slugs.account.newsletter, {
      waitUntil: 'domcontentloaded',
    });
    const saved = this.page.locator(s.formSelector).locator(s.subscriptionCheckboxSelector);
    if (subscribed) {
      await expect(saved, 'the stored subscription is on').toBeChecked({ timeout: 30_000 });
    } else {
      await expect(saved, 'the stored subscription is off').not.toBeChecked({
        timeout: 30_000,
      });
    }
  }
}

export class ForgotPasswordPage implements IForgotPasswordPage {
  readonly page: Page;
  readonly form: Locator;
  readonly emailField: Locator;
  readonly submitButton: Locator;

  constructor(page: Page, private data: HyvaData) {
    this.page = page;
    const s = data.selectors.forgotPasswordPage;
    // Scoped to the real form: the header login drawer is on this page too and
    // its field is labelled "Email Address", which a loose "Email" match hits.
    this.form = page.locator(s.formSelector);
    this.emailField = this.form.getByLabel(s.emailFieldLabel, { exact: true });
    this.submitButton = this.form.getByRole('button', { name: s.submitButtonLabel });
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.page.goto(this.data.slugs.account.forgotPassword, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);
    await this.emailField.fill(email);
    await this.submitButton.click();
    // Success redirects away from the forgot-password form; the POST can take
    // >10s on a dev-mode store, so wait it out before asserting the notice.
    // 90s, not 45s: the reset request queues a transactional email inside the
    // request, and on a CI runner the 45s this started with expired before the
    // redirect landed.
    await this.page.waitForURL((url) => !url.pathname.includes('forgotpassword'), {
      timeout: 90_000,
      waitUntil: 'domcontentloaded',
    });

    await expect(
      this.page.getByText(
        sprintf(this.data.fixtures.account.forgotPassword.notificationText, email),
      ),
    ).toBeVisible();
  }

  /**
   * Follows a reset link and sets a new password.
   *
   * `resetUrl` is taken out of the email rather than constructed: the token is
   * the only thing that makes the form reachable at all, so building the URL
   * by hand would prove a route works and say nothing about the mail the store
   * actually sent.
   */
  async setNewPassword(resetUrl: string, newPassword: string): Promise<void> {
    const s = this.data.selectors.resetPasswordPage;
    await this.page.goto(resetUrl, { waitUntil: 'domcontentloaded' });
    await waitForFormKey(this.page);

    const form = this.page.locator(s.formSelector);
    await form.getByLabel(s.newPasswordFieldLabel, { exact: true }).fill(newPassword);
    await form.getByLabel(s.confirmPasswordFieldLabel, { exact: true }).fill(newPassword);
    await form.locator(s.submitButtonSelector).click();

    // Magento sends the customer to the login form on success; the POST can
    // take >10s on a dev-mode store.
    await this.page.waitForURL(loginUrlPattern(this.data.slugs.account.login), {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      this.page.getByText(this.data.fixtures.account.resetPassword.notificationText),
      'the store confirms the password was updated',
    ).toBeVisible();
  }
}

export class RegisterPage implements IRegisterPage {
  readonly page: Page;
  readonly form: Locator;
  readonly firstNameField: Locator;
  readonly lastNameField: Locator;
  readonly emailField: Locator;
  readonly passwordField: Locator;
  readonly confirmPasswordField: Locator;
  readonly submitButton: Locator;

  constructor(page: Page, private data: HyvaData) {
    this.page = page;
    const s = data.selectors.registerPage;
    // Hyvä's create-account <form> carries two id attributes (`accountcreate`
    // then `form-validate`); browsers keep the first, so `#form-validate`
    // never matches. Scope by class instead.
    this.form = page.locator(s.formSelector);
    this.firstNameField = this.form.getByLabel(s.firstNameFieldLabel, { exact: true });
    this.lastNameField = this.form.getByLabel(s.lastNameFieldLabel, { exact: true });
    this.emailField = this.form.getByLabel(s.emailFieldLabel, { exact: true });
    this.passwordField = this.form.getByLabel(s.passwordFieldLabel, { exact: true });
    this.confirmPasswordField = this.form.getByLabel(s.confirmPasswordFieldLabel, { exact: true });
    this.submitButton = this.form.getByRole('button', { name: s.submitButtonLabel });
  }

  async createNewAccount(credentials: RegisterCredentials): Promise<void> {
    await this.page.goto(this.data.slugs.account.register, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);
    await this.firstNameField.fill(credentials.firstName);
    await this.lastNameField.fill(credentials.lastName);
    await this.emailField.fill(credentials.email);
    await this.passwordField.fill(credentials.password);
    await this.confirmPasswordField.fill(credentials.password);
    await this.submitButton.click();
    // Account creation + the dashboard render can each take >10s on a dev-mode
    // store, so wait out the redirect instead of racing the expect timeout.
    await this.page.waitForURL((url) => !url.pathname.includes('/create'), {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });

    await expect(
      this.page.getByText(this.data.fixtures.account.register.notificationText),
    ).toBeVisible();
    await expect(this.page).toHaveURL(accountUrlPattern(this.data.slugs.account.overview));
    await expect(
      this.page
        .locator(this.data.selectors.accountOverviewPage.accountInformationBlock)
        .first(),
    ).toContainText(credentials.email);
  }

  /**
   * Asserts the store refuses a second account on an email that already has one.
   *
   * Rejection, not absence of success: the message has to be shown and the
   * browser has to stay on the form. That no session was created is proven by
   * the spec, which asks the dashboard afterwards.
   */
  async expectRegistrationIsRejectedForDuplicateEmail(
    credentials: RegisterCredentials,
  ): Promise<void> {
    await this.page.goto(this.data.slugs.account.register, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);
    await this.firstNameField.fill(credentials.firstName);
    await this.lastNameField.fill(credentials.lastName);
    await this.emailField.fill(credentials.email);
    await this.passwordField.fill(credentials.password);
    await this.confirmPasswordField.fill(credentials.password);
    await this.submitButton.click();

    await expect(
      this.page.getByText(this.data.fixtures.account.register.duplicateEmailText),
      'the store explains an account already exists on that email',
    ).toBeVisible({ timeout: 45_000 });
    await expect(this.page, 'the browser stayed on the registration form').toHaveURL(
      new RegExp(`${this.data.slugs.account.register.replace(/\/+$/, '')}/?$`),
    );
  }
}
