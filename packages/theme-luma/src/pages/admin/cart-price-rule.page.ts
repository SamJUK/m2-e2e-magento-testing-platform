import { expect, type Locator, type Page } from '@playwright/test';
import { multiSelectAll, type MergedData } from '@samjuk/e2e-m2-playwright-core';

export interface CartPriceRuleFormData {
  name: string;
  couponCode: string;
  couponAmount: number;
  enabled?: boolean;
  description?: string;
  usesPerCustomer?: number;
  from?: string;
  to?: string;
  priority?: number;
}

export class AdminCartPriceRulePage {
  readonly page: Page;
  readonly nameField: Locator;
  readonly descriptionField: Locator;
  readonly usesPerCustomerField: Locator;
  readonly fromField: Locator;
  readonly toField: Locator;
  readonly priorityField: Locator;
  readonly websitesField: Locator;
  readonly customerGroupsField: Locator;
  readonly couponTypeField: Locator;
  readonly couponCodeField: Locator;
  readonly discountAmountField: Locator;
  readonly enabledToggle: Locator;
  readonly submitButton: Locator;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
    const s = data.selectors.admin.cartPriceRules.form;
    this.nameField = page.getByLabel(s.nameFieldLabel);
    // The switch's <label for> points at a real checkbox, so the accessible
    // name resolves to the input rather than to the styled toggle.
    this.enabledToggle = page.getByLabel(s.enabledFieldLabel, { exact: true });
    this.descriptionField = page.getByLabel(s.descriptionFieldLabel);
    this.usesPerCustomerField = page.getByLabel(s.usesPerCustomerFieldLabel);
    this.fromField = page.getByLabel(s.fromFieldLabel, { exact: true });
    this.toField = page.getByLabel(s.toFieldLabel, { exact: true });
    this.priorityField = page.getByLabel(s.priorityFieldLabel, { exact: true });
    this.websitesField = page.getByLabel(s.websitesFieldLabel);
    this.customerGroupsField = page.getByLabel(s.customerGroupsFieldLabel, { exact: true });
    this.couponTypeField = page.locator(s.couponTypeField);
    this.couponCodeField = page.getByLabel(s.couponCodeFieldLabel);
    this.discountAmountField = page.getByLabel(s.discountAmountFieldLabel);
    this.submitButton = page.getByRole('button', { name: s.submitButtonLabel, exact: true });
  }

  /** Creates a new cart price rule and returns the saved page URL */
  async createCoupon(formData: CartPriceRuleFormData): Promise<string> {
    const newSlug = `${this.adminSlug}${this.data.slugs.admin.cartPriceRules.new}`;
    await this.page.goto(newSlug);
    await this.page.waitForLoadState('domcontentloaded');

    await this.nameField.fill(formData.name);
    // Set the status explicitly. A rule saved inactive discounts nothing, and
    // "You saved the rule." is emitted either way.
    await this.enabledToggle.setChecked(formData.enabled ?? true);
    await this.descriptionField.fill(formData.description ?? '');
    await this.usesPerCustomerField.fill(String(formData.usesPerCustomer ?? ''));
    await this.fromField.fill(formData.from ?? '');
    await this.toField.fill(formData.to ?? '');
    await this.priorityField.fill(String(formData.priority ?? ''));
    await this.websitesField.evaluate(multiSelectAll);
    await this.customerGroupsField.evaluate(multiSelectAll);
    await this.couponTypeField.selectOption({
      label: this.data.fixtures.admin.cartPriceRules.couponTypes.specific,
    });
    await this.couponCodeField.fill(formData.couponCode);

    await this.page.getByText('Actions', { exact: true }).click();
    await this.discountAmountField.fill(String(formData.couponAmount), { force: true });
    await Promise.all([
      this.page.waitForURL((url) => !url.pathname.match(/\/(new|save)\//), { timeout: 30_000 }),
      this.submitButton.click(),
    ]);

    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.getByRole('menubar')).toBeVisible();
    await expect(
      this.page.getByText(this.data.fixtures.admin.cartPriceRules.savedNotificationText),
    ).toBeVisible();

    const url = this.page.url();
    await this.expectCouponWasSaved(url, formData);
    return url;
  }

  /**
   * Reads the rule back from the server.
   *
   * "You saved the rule." is emitted before anything is re-read, so on its own
   * it proves only that the controller did not throw. Re-opening the record and
   * checking the persisted name, coupon code and — crucially — its active flag
   * is what makes this test fail when the save silently drops fields.
   *
   * Read back from the edit form rather than the grid: the cart price rule grid
   * is a legacy widget grid with per-column filters and no keyword search, so
   * there is no shared grid read path to reuse here.
   */
  async expectCouponWasSaved(url: string, formData: CartPriceRuleFormData): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(this.nameField, 'the saved rule kept its name').toHaveValue(formData.name, {
      timeout: 30_000,
    });
    await expect(this.couponCodeField, 'the saved rule kept its coupon code').toHaveValue(
      formData.couponCode,
    );
    await expect(this.enabledToggle, 'the saved rule is active').toBeChecked({
      checked: formData.enabled ?? true,
    });
  }

  async deleteCoupon(url: string): Promise<void> {
    const s = this.data.selectors.admin.cartPriceRules.form;
    const f = this.data.fixtures.admin.cartPriceRules;
    await this.page.goto(url);
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.getByRole('button', { name: s.deleteButtonLabel, exact: true }).click();
    await expect(this.page.getByText(f.confirmationText)).toBeVisible();
    await this.page.getByRole('button', { name: s.confirmButtonLabel, exact: true }).click();
    await expect(this.page.getByText(f.deletedNotificationText)).toBeVisible();

    // "You deleted the rule." is not proof it is gone. Ask for the record
    // again: a rule that still existed would render its edit form, whereas a
    // deleted one bounces to the grid with "This rule no longer exists.".
    // Safe to assert absence because `createCoupon` proved it was there.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(
      this.page.getByText(f.missingNotificationText),
      'the deleted rule can no longer be opened',
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      this.page,
      'reopening the deleted rule bounced back to the grid',
    ).toHaveURL(new RegExp(`${this.data.slugs.admin.cartPriceRules.grid}$`));
  }
}
