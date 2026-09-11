import { expect, type Dialog, type Locator, type Page } from '@playwright/test';
import { waitForFormKey, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { IComparePage } from './types';

export class ComparePage implements IComparePage {
  readonly page: Page;
  readonly table: Locator;
  readonly productNames: Locator;
  readonly removeControls: Locator;
  readonly addToCompareControl: Locator;

  constructor(page: Page, private data: MergedData) {
    this.page = page;
    const s = data.selectors;
    this.table = page.locator(s.comparePage.tableSelector);
    this.productNames = this.table.locator(s.comparePage.productNameSelector);
    this.removeControls = this.table.getByTitle(s.comparePage.removeProductTitle);
    // `.first()`: related/upsell cards further down a PDP render the same
    // control with the same attributes.
    this.addToCompareControl = page.locator(s.productPage.addToCompareSelector).first();
  }

  /** Re-requests the comparison list so every read comes from the server. */
  async open(): Promise<void> {
    await this.page.goto(this.data.slugs.compare, { waitUntil: 'domcontentloaded' });
  }

  /** The comparison column belonging to one product. */
  getProductColumn(productTitle: string): Locator {
    const s = this.data.selectors.comparePage;
    return this.table.locator('td').filter({
      has: this.page.locator(s.productNameSelector, { hasText: productTitle }),
    });
  }

  /** Every compared product's name, in column order. */
  async getProductNames(): Promise<string[]> {
    return (await this.productNames.allInnerTexts()).map((name) =>
      name.replace(/\s+/g, ' ').trim(),
    );
  }

  /**
   * Adds the product at `url` to the comparison list.
   *
   * Luma's control posts a generated form and comes back with a flash message;
   * Hyvä's posts with `fetch` and — on success — renders nothing whatsoever.
   * There is therefore no confirmation both themes share, so the comparison
   * list itself is the confirmation: it is re-requested from the server and the
   * product has to be on it. Retried as a whole because a store that defers or
   * merges its JS renders the control before its handler exists, and swallows
   * the first click without a trace.
   */
  async addFromProductPage(url: string, productTitle: string): Promise<void> {
    await expect(async () => {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitForFormKey(this.page);
      // Hyvä defers the button's Alpine component until it intersects.
      await this.addToCompareControl.scrollIntoViewIfNeeded();

      const posted = this.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('product_compare/add'),
        { timeout: 30_000 },
      );
      await this.addToCompareControl.click();
      await posted;

      await this.open();
      await expect(
        this.getProductColumn(productTitle),
        `"${productTitle}" is on the comparison list`,
      ).toHaveCount(1, { timeout: 15_000 });
    }).toPass({ timeout: 120_000 });
  }

  /**
   * Sends one compared product to the cart. The caller then asserts the cart
   * itself — this only drives the control.
   */
  async addProductToCart(productTitle: string): Promise<void> {
    const s = this.data.selectors.comparePage;
    await this.open();
    const column = this.getProductColumn(productTitle);
    await expect(column, `"${productTitle}" has exactly one comparison column`).toHaveCount(1);

    // Wait on the add-to-cart POST, not on a load state. The control submits a
    // real form: at the moment it is clicked the current document is already
    // loaded, so `waitForLoadState` returns immediately and the caller's `goto`
    // to the cart cancels the request in flight — leaving an empty cart and a
    // failure that looks like the comparison page's fault.
    const posted = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url().includes('checkout/cart/add'),
      { timeout: 45_000 },
    );
    await column.locator(s.addToCartFormSelector).getByRole('button').first().click();
    await posted;
  }

  /**
   * Removes one compared product and proves it is gone.
   *
   * Luma renders the remove controls in a header row of their own while Hyvä
   * puts one inside each product cell, so there is no containment relationship
   * to key on. In both, the controls appear in the same order as the products,
   * which makes the product's own position the thing that identifies its
   * control — and the position is read from the list, not assumed.
   */
  async removeProduct(productTitle: string): Promise<void> {
    const s = this.data.selectors.comparePage;
    await this.open();

    const names = await this.getProductNames();
    const index = names.indexOf(productTitle);
    expect(
      index,
      `"${productTitle}" is on the comparison list before removal (list: ${names.join(', ')})`,
    ).toBeGreaterThanOrEqual(0);

    // Magento asks for confirmation. Luma renders its own modal with an OK
    // button; Hyvä calls window.confirm(), which Playwright dismisses unless a
    // handler accepts it. Install the handler for the native case and click the
    // modal's button when that is the one that appeared.
    const acceptDialog = (dialog: Dialog) => {
      void dialog.accept();
    };
    this.page.on('dialog', acceptDialog);
    try {
      const confirmButton = this.page.getByRole('button', {
        name: s.confirmButtonLabel,
        exact: true,
      });
      // Retried whole, because a confirmation dismissed by a mistimed click
      // leaves the product in place and there would otherwise be nothing to
      // re-click. The product's presence was asserted above, so the emptiness
      // this exits on is never vacuously true.
      await expect(async () => {
        await this.open();
        const current = await this.getProductNames();
        const position = current.indexOf(productTitle);
        if (position >= 0) {
          await this.removeControls.nth(position).click();
          if (await confirmButton.isVisible()) await confirmButton.click();
          await this.open();
        }
        await expect(
          this.getProductColumn(productTitle),
          `"${productTitle}" is no longer on the comparison list`,
        ).toHaveCount(0, { timeout: 10_000 });
      }).toPass({ timeout: 90_000 });
    } finally {
      this.page.off('dialog', acceptDialog);
    }
  }
}
