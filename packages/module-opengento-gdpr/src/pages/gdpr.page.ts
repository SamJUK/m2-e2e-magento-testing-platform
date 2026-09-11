import { expect, type Locator, type Page } from '@playwright/test';
import { deepMerge, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import moduleSelectors from '../data/selectors.json';
import moduleFixtures from '../data/fixtures.json';
import moduleSlugs from '../data/slugs.json';
import type { GdprCustomer } from './types';

type GdprSelectors = typeof moduleSelectors.gdpr;
type GdprFixtures = typeof moduleFixtures.gdpr;
type GdprSlugs = typeof moduleSlugs.gdpr;

/**
 * Drives Opengento_Gdpr's customer-facing surface: the Privacy Settings page,
 * the personal-data export request and the right-to-be-forgotten request.
 *
 * Every control the module renders carries a stable id (`#export`, `#delete`,
 * `#undo_deletion`), which is what lets this package address them without
 * knowing anything about the theme around them.
 *
 * The suite registers its own customer per test. It cannot borrow a theme's
 * account page objects without taking a theme dependency, and the registration
 * form's field *names* are Magento's own — identical under Luma and Hyvä — so
 * addressing them by name costs nothing and couples to nothing.
 */
export class GdprPage {
  private readonly s: GdprSelectors;
  private readonly f: GdprFixtures;
  private readonly slugs: GdprSlugs;

  constructor(private page: Page, data: MergedData) {
    const bucket = <T>(source: unknown): Partial<T> =>
      ((source as Record<string, unknown> | undefined)?.gdpr as Partial<T>) ?? {};
    this.s = deepMerge<GdprSelectors>(moduleSelectors.gdpr, bucket<GdprSelectors>(data.selectors));
    this.f = deepMerge<GdprFixtures>(moduleFixtures.gdpr, bucket<GdprFixtures>(data.fixtures));
    this.slugs = deepMerge<GdprSlugs>(moduleSlugs.gdpr, bucket<GdprSlugs>(data.slugs));
  }

  private get privacyBlock(): Locator {
    return this.page.locator(this.s.privacyBlockSelector);
  }

  /** Registers a fresh customer and leaves the browser signed in as them. */
  async registerCustomer(): Promise<GdprCustomer> {
    const r = this.s.registerForm;
    const customer: GdprCustomer = {
      email: `e2e-gdpr-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`,
      password: 'Password1!',
    };

    await this.page.goto(this.slugs.register, { waitUntil: 'domcontentloaded' });

    // Scoped to the form that owns the password confirmation: the footer
    // newsletter signup also has an input named `email`, and an unscoped
    // locator matches both.
    const form = this.page
      .locator('form')
      .filter({ has: this.page.locator(r.passwordConfirmFieldSelector) })
      .first();

    await form.locator(r.firstNameFieldSelector).fill('E2E');
    await form.locator(r.lastNameFieldSelector).fill('Privacy');
    await form.locator(r.emailFieldSelector).fill(customer.email);
    await form.locator(r.passwordFieldSelector).fill(customer.password);
    await form.locator(r.passwordConfirmFieldSelector).fill(customer.password);
    await form.locator(r.submitButtonSelector).first().click();
    await this.page.waitForLoadState('domcontentloaded');

    await expect(this.page, 'registration signed the customer in').not.toHaveURL(
      new RegExp(this.slugs.register.replace(/\//g, '\\/')),
    );
    return customer;
  }

  async openPrivacySettings(): Promise<void> {
    await this.page.goto(this.slugs.privacySettings, { waitUntil: 'domcontentloaded' });
    await expect(
      this.page.getByRole('heading', { name: this.f.privacySettingsHeading }),
      'the privacy settings page rendered',
    ).toBeVisible();
  }

  /**
   * A guest has no personal data page to see, so the module must send them to
   * sign in rather than render an empty one.
   */
  async expectGuestIsSentToSignIn(): Promise<void> {
    await this.page.goto(this.slugs.privacySettings, { waitUntil: 'domcontentloaded' });
    await expect(this.page, 'a guest is redirected to the login page').toHaveURL(
      new RegExp(this.slugs.loginPathFragment.replace(/\//g, '\\/')),
    );
  }

  async expectOffersExportAndErasure(): Promise<void> {
    await this.openPrivacySettings();
    await expect(
      this.privacyBlock.locator(this.s.exportLinkSelector),
      'the page offers a personal data export',
    ).toBeVisible();
    await expect(
      this.privacyBlock.locator(this.s.eraseLinkSelector),
      'the page offers an erasure request',
    ).toBeVisible();
  }

  /**
   * Checked from the dashboard, not from the settings page itself: Magento
   * renders the current page's navigation item as plain text rather than a
   * link, so asserting it where the customer would actually click it is the
   * only version of this that means anything.
   */
  async expectAccountNavOffersPrivacySettings(): Promise<void> {
    await this.page.goto(this.slugs.accountDashboard, { waitUntil: 'domcontentloaded' });
    await expect(
      this.page.getByRole('link', { name: this.s.accountNavLinkLabel }).first(),
      'the account navigation links to privacy settings',
    ).toBeAttached();
  }

  /**
   * Requests an export and asserts the request was registered.
   *
   * The archive is built asynchronously, so the download link only appears once
   * a consumer has run. Asserting the request state — the export control gone,
   * the pending message in its place — is what makes this test independent of
   * whether the store's queue is being processed.
   */
  async requestExportAndExpectItRegistered(): Promise<void> {
    await this.openPrivacySettings();
    await this.privacyBlock.locator(this.s.exportLinkSelector).click();
    await this.page.waitForLoadState('domcontentloaded');

    await expect(
      this.page.locator(this.s.messageSelector).filter({ hasText: this.f.pendingExportText }),
      'the store reports the export as pending',
    ).toBeVisible();
    await expect(
      this.privacyBlock.locator(this.s.exportLinkSelector),
      'the export control is gone once the export is requested',
    ).toHaveCount(0);
  }

  /** Raises an erasure request, through the module's own confirmation modal. */
  async requestErasure(password: string): Promise<void> {
    await this.openPrivacySettings();
    await this.privacyBlock.locator(this.s.eraseLinkSelector).click();
    await this.page.locator(this.s.erasePasswordFieldSelector).fill(password);
    await this.page.locator(this.s.eraseSubmitButtonSelector).click();

    // Magento's confirm modal, opened by the template's own click handler. The
    // form is never submitted until it is accepted.
    const confirm = this.page.locator(this.s.confirmModalButtonSelector).first();
    await expect(confirm, 'the erasure confirmation modal opened').toBeVisible({ timeout: 30_000 });
    await confirm.click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectErasureIsPending(): Promise<void> {
    await this.openPrivacySettings();
    await expect(
      this.page.locator(this.s.messageSelector).filter({ hasText: this.f.pendingErasureText }),
      'the store warns the account is due to be erased',
    ).toBeVisible();
    await expect(
      this.privacyBlock.locator(this.s.undoEraseButtonSelector),
      'the pending erasure can be undone',
    ).toBeVisible();
    await expect(
      this.privacyBlock.locator(this.s.eraseLinkSelector),
      'a second erasure cannot be requested while one is pending',
    ).toHaveCount(0);
  }

  async undoErasure(): Promise<void> {
    await this.openPrivacySettings();
    await this.privacyBlock.locator(this.s.undoEraseButtonSelector).click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async expectNoErasurePending(): Promise<void> {
    await this.openPrivacySettings();
    await expect(
      this.privacyBlock.locator(this.s.undoEraseButtonSelector),
      'no erasure is pending any more',
    ).toHaveCount(0);
    await expect(
      this.privacyBlock.locator(this.s.eraseLinkSelector),
      'the erasure request is available again',
    ).toBeVisible();
  }
}
