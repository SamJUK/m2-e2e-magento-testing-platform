import { expect, type Locator, type Page } from '@playwright/test';
import { sprintf, waitForFormKey, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { IAddressBookPage, CustomerAddress } from './types';

export type { CustomerAddress };

export class AddressBookPage implements IAddressBookPage {
  readonly page: Page;
  readonly form: Locator;
  readonly additionalAddressesTable: Locator;
  readonly defaultBillingBlock: Locator;
  readonly defaultShippingBlock: Locator;

  constructor(page: Page, private data: MergedData) {
    this.page = page;
    const s = data.selectors.addressBookPage;
    this.form = page.locator('#form-validate');
    this.additionalAddressesTable = page.locator(s.additionalAddressesTable);
    this.defaultBillingBlock = page.locator(s.defaultBillingBlock);
    this.defaultShippingBlock = page.locator(s.defaultShippingBlock);
  }

  async open(): Promise<void> {
    // A dev-mode store can take longer than the whole test budget to fire
    // `load` on these pages; the form-key wait below covers the JS we need.
    await this.page.goto(this.data.slugs.account.addressBook, {
      waitUntil: 'domcontentloaded',
    });
  }

  /** Fills the (already open) address form. Only the provided fields are touched. */
  private async fillForm(address: Partial<CustomerAddress>): Promise<void> {
    const s = this.data.selectors.addressBookPage.form;

    if (address.firstName) {
      await this.form.getByLabel(s.firstNameFieldLabel, { exact: true }).fill(address.firstName);
    }
    if (address.lastName) {
      await this.form.getByLabel(s.lastNameFieldLabel, { exact: true }).fill(address.lastName);
    }
    if (address.company) {
      const company = this.form.getByLabel(s.companyFieldLabel, { exact: true });
      if (await company.isVisible()) await company.fill(address.company);
    }
    if (address.telephone) {
      const telephone = this.form.getByLabel(s.telephoneFieldLabel, { exact: true });
      if (await telephone.isVisible()) await telephone.fill(address.telephone);
    }
    if (address.streetAddress) {
      // Stores configured for multiple street lines render several inputs
      // sharing the selector (`street[]`), so target the first line.
      await this.form.locator(s.streetAddressField).first().fill(address.streetAddress);
    }
    if (address.country) {
      // Changing the country swaps the region select for a free-text input (or
      // vice versa) via directoryRegionUpdater, so it has to be set first.
      await this.form.locator(s.countryField).selectOption({ label: address.country });
      // That swap is a two-step DOM update (hide, then disable); reading it
      // mid-flight picks the wrong control, so let it settle.
      await this.page.waitForTimeout(1000);
    }
    if (address.region) {
      const regionSelect = this.form.locator(s.regionSelectField);
      // Countries with required regions get the select, everything else gets
      // the free-text input.
      if ((await regionSelect.isVisible()) && (await regionSelect.isEnabled())) {
        await regionSelect.selectOption({ label: address.region });
      } else {
        await this.form.locator(s.regionInputField).fill(address.region);
      }
    }
    if (address.city) {
      await this.form.getByLabel(s.cityFieldLabel, { exact: true }).fill(address.city);
    }
    if (address.postcode) {
      await this.form.getByLabel(s.postcodeFieldLabel, { exact: true }).fill(address.postcode);
    }
  }

  private async submitForm(): Promise<void> {
    const s = this.data.selectors.addressBookPage.form;
    await this.form.locator(s.submitButton).click();
    // The POST and the address-book re-render can each take >10s on a dev-mode
    // store, so wait out the redirect instead of racing the expect timeout.
    await this.page.waitForURL('**/customer/address/index/**', {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      this.page.getByText(this.data.fixtures.account.addressBook.savedNotificationText),
    ).toBeVisible();
  }

  /**
   * How many addresses the server currently holds for this customer.
   *
   * Counted from the DISTINCT `customer/address/edit/id/<n>` links the address
   * book renders — one per stored address, plus a repeat for whichever is the
   * default billing/shipping. That is the only handle both themes share: Luma
   * lists additional addresses in a `<table>`, Hyvä in a grid of `<div>`s, and
   * neither list includes the default address at all.
   */
  async countAddresses(): Promise<number> {
    await this.open();
    const hrefs = await this.page
      .locator(this.data.selectors.addressBookPage.addressEditLinkSelector)
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('href') ?? ''));
    const ids = new Set(
      hrefs.map((href) => href.match(/\/id\/(\d+)/)?.[1]).filter((id): id is string => !!id),
    );
    return ids.size;
  }

  /**
   * Submits the new-address form with one required field left blank.
   *
   * The rejection is asserted twice over: the theme's validator has to report
   * the field, AND the customer's address count — read back off the server
   * either side of the attempt — has to be unchanged. The success notice is
   * never consulted; its absence would prove nothing.
   */
  async expectAddressIsRejectedForMissingField(
    address: CustomerAddress,
    omitField: keyof CustomerAddress,
    fieldLabel: string,
  ): Promise<void> {
    const s = this.data.selectors.addressBookPage;
    const countBefore = await this.countAddresses();

    await this.page.goto(this.data.slugs.account.addressNew, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);

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

    const incomplete: Partial<CustomerAddress> = { ...address };
    delete incomplete[omitField];
    await this.fillForm(incomplete);
    await this.form.locator(s.form.submitButton).click();

    // Luma validates with mage/validation, which renders the message in a
    // `.mage-error` div beside the offending field.
    await expect(
      this.form
        .locator(this.data.selectors.validation.fieldErrorSelector)
        .filter({ hasText: sprintf(this.data.fixtures.validation.requiredFieldText, fieldLabel) })
        .first(),
      `the missing ${String(omitField)} is reported as a required field`,
    ).toBeVisible({ timeout: 30_000 });
    expect(this.page.url(), 'the address form was not submitted').toContain(
      this.data.slugs.account.addressNew,
    );

    expect(await this.countAddresses(), 'the rejected address was not created').toBe(countBefore);
  }

  async addAddress(
    address: CustomerAddress,
    options: { makeDefault?: boolean } = {},
  ): Promise<void> {
    const s = this.data.selectors.addressBookPage.form;
    await this.page.goto(this.data.slugs.account.addressNew, {
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);
    await this.fillForm(address);

    if (options.makeDefault) {
      // Magento renders these two only when the customer already HAS a
      // default, so they are asserted present rather than probed for: ticking
      // nothing would save an ordinary extra address and the caller's
      // assertion would then fail somewhere less obvious.
      const billing = this.form.locator(s.defaultBillingCheckboxSelector);
      const shipping = this.form.locator(s.defaultShippingCheckboxSelector);
      await expect(
        billing,
        'the form offers a default-billing checkbox (the customer already has a default)',
      ).toHaveCount(1, { timeout: 30_000 });
      await expect(shipping, 'the form offers a default-shipping checkbox').toHaveCount(1);
      await billing.check();
      await shipping.check();
    }

    await this.submitForm();
  }

  /**
   * Asserts both default-address boxes on the address book name this street.
   *
   * Read back off the address book rather than trusted from the save flash:
   * Magento stores default billing and default shipping as two separate
   * attributes, so one of them silently not moving is exactly the failure
   * worth catching.
   */
  async expectDefaultAddresses(streetAddress: string): Promise<void> {
    await this.open();
    await expect(
      this.defaultBillingBlock.first(),
      'the default billing address is the one that was promoted',
    ).toContainText(streetAddress, { timeout: 30_000 });
    await expect(
      this.defaultShippingBlock.first(),
      'the default shipping address is the one that was promoted',
    ).toContainText(streetAddress, { timeout: 30_000 });
  }

  async editDefaultBillingAddress(changes: Partial<CustomerAddress>): Promise<void> {
    await this.open();
    await this.defaultBillingBlock
      .getByRole('link', {
        name: this.data.selectors.addressBookPage.changeBillingAddressLinkLabel,
      })
      .click();
    await this.page.waitForURL('**/customer/address/edit/**', {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await waitForFormKey(this.page);
    // The address edit page is uncacheable and renders the full region JSON,
    // so it routinely takes >10s to appear on a dev-mode store.
    await expect(this.form).toBeVisible({ timeout: 30_000 });
    await this.fillForm(changes);
    await this.submitForm();
  }

  /** Deletes a non-default address, identified by its street address, from the
   *  "Additional Address Entries" table. */
  async deleteAddress(streetAddress: string): Promise<void> {
    const s = this.data.selectors.addressBookPage;
    const f = this.data.fixtures.account.addressBook;

    await this.open();
    await waitForFormKey(this.page);
    const row = this.additionalAddressesTable.locator('tbody tr', { hasText: streetAddress });
    await expect(row).toHaveCount(1);
    // The delete handler is bound by a widget that initialises after the form
    // key lands, so an early click is silently dropped. Retry until the
    // confirmation modal actually opens.
    const deleteLink = row.getByRole('link', { name: s.deleteLinkLabel, exact: true });
    await expect(async () => {
      await deleteLink.click();
      await expect(this.page.getByText(f.confirmationText)).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 45_000 });
    await this.page.getByRole('button', { name: s.confirmButtonLabel, exact: true }).click();
    await this.page.waitForURL('**/customer/address/index/**', {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });

    await expect(this.page.getByText(f.deletedNotificationText)).toBeVisible();
    await expect(
      this.additionalAddressesTable.locator('tbody tr', { hasText: streetAddress }),
    ).toHaveCount(0);
  }
}
