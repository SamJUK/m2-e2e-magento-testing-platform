import { expect, type Locator, type Page } from '@playwright/test';
import { sprintf, waitForFormKey, setCheckbox } from '@samjuk/e2e-m2-playwright-core';
import type { HyvaData } from '../data/types';
import type { IAddressBookPage, CustomerAddress } from './types';

export type { CustomerAddress };

/**
 * Hyvä's address book diverges from Luma structurally, not just cosmetically:
 *
 *  - The "additional addresses" list is a **CSS grid of `<div>`s**, not a
 *    `<table>`. There is no row element and no `#additional-addresses-table`,
 *    so a per-address handle has to be derived from the street cell's siblings.
 *  - Delete is a **native `window.confirm()`** (see `initAddresses()` in
 *    `Magento_Customer/templates/address/grid.phtml`), not a Magento modal with
 *    an "OK" button. Playwright auto-dismisses dialogs, so it must be accepted
 *    explicitly or the delete silently never happens.
 *  - The delete control is an icon-only `<a>` with no text; its accessible name
 *    comes from `title="Delete"`.
 *  - The street input is `name="street[]"` / `id="street_1"`, not Luma's
 *    `name="street[0]"`.
 */
export class AddressBookPage implements IAddressBookPage {
  readonly page: Page;
  readonly form: Locator;
  readonly addressList: Locator;
  readonly defaultBillingBlock: Locator;
  readonly defaultShippingBlock: Locator;

  constructor(page: Page, private data: HyvaData) {
    this.page = page;
    const s = data.selectors.addressBookPage;
    this.form = page.locator(s.formSelector);
    this.addressList = page.locator(s.addressListSelector);
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
      await this.form.locator(s.streetAddressField).fill(address.streetAddress);
    }
    if (address.country) {
      // Changing the country re-derives the region control through Alpine
      // (`initCustomerAddressEdit`), so it has to be set before the region.
      await this.form.locator(s.countryField).selectOption({ label: address.country });
      // That swap is a multi-step Alpine update; reading it mid-flight picks
      // the wrong control, so let it settle.
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
    // Matching on "leaving the form" rather than a glob is deliberate: the
    // obvious `**/customer/address/**` also matches the page we are still on
    // (`/customer/address/new/`), so it would resolve instantly and assert the
    // success notice before the POST had even landed. Magento's success URL
    // varies between `/customer/address/` and `/customer/address/index/`, so
    // the negative test covers both.
    await this.page.waitForURL((url) => !/\/customer\/address\/(new|edit)/.test(url.pathname), {
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

    // `hyva.formValidation` stamps `novalidate` on the form as it initialises,
    // handing validation from the browser to its own validator. Waiting for
    // that attribute is what proves Alpine has booted: submitting earlier
    // would trip the browser's native check instead, which renders no message
    // and would leave this test asserting nothing.
    await expect(
      this.form,
      "Hyvä's form validator has taken over from the browser",
    ).toHaveAttribute('novalidate', '', { timeout: 30_000 });

    const incomplete: Partial<CustomerAddress> = { ...address };
    delete incomplete[omitField];
    await this.fillForm(incomplete);
    await this.form.locator(s.form.submitButton).click();

    // Hyvä's validator appends an <li> per failed rule to a `ul.messages`
    // inside the field's wrapper, keyed by the input's name attribute.
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
      await setCheckbox(billing, true);
      await setCheckbox(shipping, true);
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

  /**
   * Resolves the icon-only delete link belonging to a given street address, by
   * walking from that address's street cell to the first following sibling cell
   * that holds a delete control. Anchoring on the street cell via `getByText`
   * (rather than embedding it in an XPath predicate) keeps addresses containing
   * quotes or apostrophes from breaking the expression.
   */
  private deleteLinkFor(streetAddress: string): Locator {
    const s = this.data.selectors.addressBookPage;
    return this.addressList
      .getByText(streetAddress, { exact: true })
      .locator(`xpath=following-sibling::div[.//a[${s.deleteLinkXPathClass}]][1]`)
      .locator(s.deleteLinkSelector)
      .first();
  }

  /** Deletes a non-default address, identified by its street address. */
  async deleteAddress(streetAddress: string): Promise<void> {
    const f = this.data.fixtures.account.addressBook;

    await this.open();
    await waitForFormKey(this.page);

    const streetCell = this.addressList.getByText(streetAddress, { exact: true });
    await expect(streetCell).toHaveCount(1);

    // Hyvä confirms deletion with a native window.confirm(). Playwright
    // dismisses dialogs unless a handler accepts them, which would make the
    // click a silent no-op.
    this.page.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await this.deleteLinkFor(streetAddress).click();

    // `hyva.postForm` POSTs and lands back on the address book — the same URL we
    // are already on — so there is no URL transition to wait for. Wait on the
    // outcome instead, with room for a slow round-trip on a dev-mode store.
    await expect(this.page.getByText(f.deletedNotificationText)).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      this.addressList.getByText(streetAddress, { exact: true }),
    ).toHaveCount(0);
  }
}
