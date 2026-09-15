import { expect, type Locator, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { IAdminLoginPage } from '../types';

export class AdminLoginPage implements IAdminLoginPage {
  readonly page: Page;
  readonly usernameField: Locator;
  readonly passwordField: Locator;
  readonly submitButton: Locator;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
    const s = data.selectors.admin.login;
    this.usernameField = page.getByLabel(s.usernameFieldLabel);
    this.passwordField = page.getByLabel(s.passwordFieldLabel);
    this.submitButton = page.getByRole('button', { name: s.submitButtonLabel });
  }

  async login(): Promise<void> {
    await this.page.goto(this.adminSlug);
    await this.usernameField.fill(process.env.PLAYWRIGHT_ADMIN_USERNAME ?? 'playwright');
    await this.passwordField.fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'Password1');
    await this.submitButton.click();
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.getByRole('menubar')).toBeVisible();
  }

  async fillOutForm(username: string, password: string): Promise<void> {
    await this.usernameField.fill(username);
    await this.passwordField.fill(password);
    await this.submitButton.click();
  }

  /**
   * Signs in as someone other than the configured admin.
   *
   * Drops the current session first: Magento keeps an admin signed in across a
   * fresh visit to the login route, so without this the second sign-in would
   * silently never happen and the test would assert against the FIRST user's
   * permissions.
   */
  async loginAs(username: string, password: string): Promise<void> {
    await this.page.context().clearCookies();
    await this.page.goto(this.adminSlug, { waitUntil: 'domcontentloaded' });
    await this.usernameField.fill(username);
    await this.passwordField.fill(password);
    await this.submitButton.click();
    await this.page.waitForLoadState('domcontentloaded');
    // Not the menubar: a role with no resources renders none. The form going
    // away is what separates "signed in, forbidden" from "sign-in refused",
    // and without it a refused sign-in asserts denial against a guest.
    await expect(
      this.usernameField,
      `the sign-in for ${username} was accepted`,
    ).toBeHidden({ timeout: 30_000 });
  }
}
