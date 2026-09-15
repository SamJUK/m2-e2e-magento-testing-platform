import { expect, type Locator, type Page } from '@playwright/test';
import { waitForFormKey, tamperFormKey } from '@samjuk/e2e-m2-playwright-core';
import type { HyvaData } from '../data/types';
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

  constructor(page: Page, private data: HyvaData) {
    this.page = page;
    const s = data.selectors.contactPage;
    // Hyvä renders the contact form as <form id="contact">. Scoping to it keeps
    // the header login drawer (which also has Email/Password fields) out of range.
    this.form = page.locator(s.formSelector);
    this.nameField = this.form.getByLabel(s.nameFieldLabel, { exact: true });
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
   * Unlike its address form, Hyvä's contact form ships no JS validator: it
   * declares `required` / `type="email"` and leaves the check to the browser,
   * which refuses to fire the submit event at all. There is no message element
   * to read, so the assertion is the browser's own verdict on the offending
   * field — falsifiable in exactly the way that matters: drop the constraint
   * from the template and this flips while the form starts submitting.
   */
  private async expectRejectedBecause(
    field: Locator,
    reason: 'valueMissing' | 'typeMismatch',
    description: string,
  ): Promise<void> {
    await this.sendFormButton.click();

    await expect
      .poll(
        () =>
          field.evaluate(
            (element, key) =>
              (element as HTMLInputElement | HTMLTextAreaElement).validity[
                key as 'valueMissing' | 'typeMismatch'
              ],
            reason,
          ),
        { message: description, timeout: 15_000 },
      )
      .toBe(true);
    await expect
      .poll(
        () => this.form.evaluate((form) => (form as HTMLFormElement).checkValidity()),
        { message: 'the browser refuses to submit the contact form', timeout: 15_000 },
      )
      .toBe(false);

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
    await this.expectRejectedBecause(
      this.messageField,
      'valueMissing',
      'the empty message is reported as a missing required value',
    );
  }

  async expectContactFormIsRejectedForMalformedEmail(): Promise<void> {
    await this.fillForm({ email: this.data.inputs.contact.malformedEmail });
    await this.expectRejectedBecause(
      this.emailField,
      'typeMismatch',
      'the malformed address is reported as not an email address',
    );
  }

  /**
   * Submits the contact form carrying a form key the session never issued.
   *
   * `waitForFormKey` runs FIRST on purpose: on a full-page-cached store
   * `mage/common` rewrites every rendered form_key input from the cookie on
   * DOM ready, so tampering before that lands would simply be undone.
   */
  async expectContactFormIsRejectedForInvalidFormKey(): Promise<void> {
    await this.fillForm();
    await waitForFormKey(this.page);
    await tamperFormKey(this.page);
    await this.sendFormButton.click();

    await expect(
      this.page.getByText(this.data.fixtures.security.invalidFormKeyText),
      'the store refuses a POST whose form key it never issued',
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      this.page.getByText(this.data.fixtures.contact.notificationText),
      'nothing was sent',
    ).toHaveCount(0);
  }
}
