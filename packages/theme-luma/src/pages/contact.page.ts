import { expect, type Locator, type Page } from '@playwright/test';
import { type MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { IContactPage } from './types';

export class ContactPage implements IContactPage {
  readonly page: Page;
  readonly form: Locator;
  readonly nameField: Locator;
  readonly emailField: Locator;
  readonly telephoneField: Locator;
  readonly messageField: Locator;
  readonly sendFormButton: Locator;
  /** Used to uniquely identify each submission when querying Mailpit */
  readonly contactUID: string;

  constructor(page: Page, private data: MergedData) {
    this.page = page;
    const s = data.selectors.contactPage;
    // Everything is scoped to the contact form — footer widgets (e.g. the
    // newsletter form) can carry identically named fields and buttons.
    this.form = page.locator(s.formSelector);
    this.nameField = this.form.getByLabel(s.nameFieldLabel);
    this.emailField = this.form.getByLabel(s.emailFieldLabel, { exact: true });
    this.telephoneField = this.form.getByLabel(s.telephoneFieldLabel);
    this.messageField = this.form.getByLabel(s.messageFieldLabel);
    this.sendFormButton = this.form.getByRole('button', { name: s.submitButtonLabel });
    this.contactUID = Math.random().toString(36).substring(2, 15);
  }

  /** Fills the form, using `overrides` in place of the configured inputs. */
  private async fillForm(overrides: { email?: string; message?: string } = {}): Promise<void> {
    const i = this.data.inputs.contact;
    await this.page.goto(this.data.slugs.contact);
    await this.nameField.fill(i.name);
    await this.emailField.fill(overrides.email ?? i.email);
    if (await this.telephoneField.isVisible()) {
      await this.telephoneField.fill(i.telephone);
    }
    await this.messageField.fill(overrides.message ?? `${i.message}\n${this.contactUID}`);
  }

  async sendContactForm(): Promise<void> {
    await this.fillForm();
    await this.sendFormButton.click();

    await expect(
      this.page.getByText(this.data.fixtures.contact.notificationText),
    ).toBeVisible();
    await expect(this.nameField, 'name field cleared after submission').toBeEmpty();
    await expect(this.emailField, 'email field cleared after submission').toBeEmpty();
    await expect(this.messageField, 'message field cleared after submission').toBeEmpty();
  }

  /**
   * Asserts a rejected submission.
   *
   * Luma validates with mage/validation, so the rejection is a `.mage-error`
   * carrying Magento's own message. The success notice is checked too, but
   * only as a corroborating detail — on its own, its absence would be
   * satisfied by a page that simply failed to load.
   */
  private async expectRejectedWith(expectedMessage: string): Promise<void> {
    // Magento's mage/validation widget is loaded by RequireJS and binds well
    // after the form is rendered. jQuery Validate stamps `novalidate` on the
    // form as it initialises, handing validation from the browser to itself;
    // waiting for that is what makes this deterministic. Submitting earlier
    // trips the browser's own native check instead, which renders no
    // `.mage-error` at all — the exact race that made this flake under load.
    await expect(
      this.form,
      "Magento's form validator has taken over from the browser",
    ).toHaveAttribute('novalidate', 'novalidate', { timeout: 30_000 });

    await this.sendFormButton.click();

    await expect(
      this.form
        .locator(this.data.selectors.validation.fieldErrorSelector)
        .filter({ hasText: expectedMessage })
        .first(),
      `the form reports: ${expectedMessage}`,
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      this.page.getByText(this.data.fixtures.contact.notificationText),
      'the message was not accepted',
    ).toHaveCount(0);
    await expect(
      this.nameField,
      'the form was never submitted, so it still holds what was typed into it',
    ).toHaveValue(this.data.inputs.contact.name);
  }

  async expectContactFormIsRejectedForMissingField(): Promise<void> {
    await this.fillForm({ message: '' });
    await this.expectRejectedWith(this.data.fixtures.validation.requiredFieldText);
  }

  async expectContactFormIsRejectedForMalformedEmail(): Promise<void> {
    await this.fillForm({ email: this.data.inputs.contact.malformedEmail });
    await this.expectRejectedWith(this.data.fixtures.contact.invalidEmailText);
  }
}
