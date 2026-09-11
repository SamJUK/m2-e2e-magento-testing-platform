import { expect, type Locator, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { findGridRow, openGrid } from './grid';

/** Catalog > Products: grid lookup by name, then the product edit form. */
export class AdminProductPage {
  readonly page: Page;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
  }

  /** The Product Name input on the open edit form. */
  private get nameField(): Locator {
    return this.page
      .getByLabel(this.data.selectors.admin.products.form.nameFieldLabel)
      .first();
  }

  /**
   * Finds a product in the grid and opens its edit form. Catalogs with long
   * product names do not always match on name, so the search term is separate
   * from the name the form is expected to show (a SKU works well).
   */
  async openProduct(searchTerm: string, expectedName: string = searchTerm): Promise<void> {
    const s = this.data.selectors.admin.products;

    await openGrid(this.page, `${this.adminSlug}${this.data.slugs.admin.products.grid}`);
    const row = await findGridRow(this.page, this.data, searchTerm);
    // The Edit link's accessible name is its aria-label ("Edit <product>"),
    // so this cannot be an exact match.
    await row.getByRole('link', { name: s.grid.editLinkLabel }).first().click();

    await this.page.waitForURL('**/catalog/product/edit/**', {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(this.page.getByRole('menubar')).toBeVisible();
    // Real catalogs carry non-breaking and doubled spaces in product names, so
    // compare on collapsed whitespace rather than the raw field value.
    const nameField = this.nameField;
    await expect(nameField).toHaveValue(/\S/);
    expect(collapse(await nameField.inputValue())).toBe(collapse(expectedName));
  }

  /** Asserts the product grid's row for `searchTerm` carries `expectedName`. */
  async expectGridRowShowsName(searchTerm: string, expectedName: string): Promise<void> {
    await openGrid(this.page, `${this.adminSlug}${this.data.slugs.admin.products.grid}`);
    // findGridRow requires exactly one match, so the row is known to exist
    // before its contents are asserted on.
    const row = await findGridRow(this.page, this.data, searchTerm);
    await expect(row, 'the product grid row shows the saved name').toContainText(expectedName);
  }

  /**
   * Renames a product from the admin and proves the new name actually reached
   * the store.
   *
   * "You saved the product." is emitted before anything is read back, so on its
   * own it proves only that the controller did not throw. Three independent
   * reads follow it, each hitting a different code path: the re-opened edit
   * form (EAV read), the product grid row (the grid's own indexed read), and
   * the storefront PDP (frontend rendering plus cache invalidation). A save
   * that silently drops the attribute, or one that never invalidates the page
   * cache, fails one of them.
   *
   * The caller is expected to call this a second time to restore the original
   * name, so the test can re-run on a store whose database is never rolled
   * back. If it never gets that far, the seed rewrites the name on the next
   * run.
   */
  async renameProduct(
    searchTerm: string,
    currentName: string,
    newName: string,
    storefrontUrl: string,
  ): Promise<void> {
    const s = this.data.selectors.admin.products;

    // Opening it first is what proves the starting state: without it a rename
    // that silently did nothing would still "pass" the read-back below on a
    // store that already happened to carry the new name.
    await this.openProduct(searchTerm, currentName);

    await this.nameField.fill(newName);
    await this.page
      .getByRole('button', { name: s.form.saveButtonLabel, exact: true })
      .first()
      .click();
    await this.page.waitForLoadState('domcontentloaded');
    await expect(
      this.page.getByText(this.data.fixtures.admin.products.savedNotificationText),
      'the admin reports the product was saved',
    ).toBeVisible({ timeout: 60_000 });

    // Read 1: the grid's own view of the record. It has to happen before the
    // edit form is opened — the row locator does not survive the navigation.
    await this.expectGridRowShowsName(searchTerm, newName);

    // Read 2: the record re-opened from the grid.
    await this.openProduct(searchTerm, newName);

    // Read 3: the storefront.
    await this.expectStorefrontProductName(storefrontUrl, newName);
  }

  /**
   * Asserts the PDP renders `name` as its product title.
   *
   * Wrapped in a retry that re-requests the page: Magento invalidates the full
   * page cache for a product as part of saving it, but on a store where that
   * invalidation lands a moment after the admin redirect the first request can
   * still be served the previously cached page. The retry only tolerates that
   * delay — the new name is still required, so a save that never reached the
   * frontend fails here rather than being waited out.
   */
  async expectStorefrontProductName(url: string, name: string): Promise<void> {
    const title = this.page.locator(this.data.selectors.productPage.titleSelector);

    await expect(async () => {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      // Hyva renders the PDP heading `md:sr-only`, so this asserts on text
      // rather than visibility — the name has to be in the document, it does
      // not have to be on screen.
      await expect(title, `the storefront PDP is titled "${name}"`).toHaveCount(1);
      expect(collapse((await title.textContent()) ?? '')).toBe(collapse(name));
    }).toPass({ timeout: 60_000 });
  }
}

/** Collapses runs of whitespace so a name comparison survives real catalog data. */
function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
