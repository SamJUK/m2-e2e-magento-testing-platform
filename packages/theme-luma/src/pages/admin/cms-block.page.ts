import { expect, type Locator, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { expectNoGridRow, findGridRow, openGrid } from './grid';

export interface CMSBlockFormData {
  title: string;
  identifier: string;
  enabled?: boolean;
  /**
   * Term used to find this block in the admin grid. Defaults to the title.
   *
   * Two things make the plain title a poor search term. The grid's keyword box
   * runs a MySQL fulltext match, so a multi-word title means "any of these
   * words" and can pull in unrelated blocks; and on Magento/Mage-OS the block
   * grid's fulltext match does **not** cover the Identifier column, so
   * searching by identifier finds nothing at all. Pass a single unique token
   * that appears in the title.
   */
  gridSearchTerm?: string;
}

export class AdminCMSBlockPage {
  readonly page: Page;
  readonly titleField: Locator;
  readonly identifierField: Locator;
  readonly enabledToggle: Locator;
  readonly submitButton: Locator;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
    const s = data.selectors.admin.cmsblocks.form;
    this.titleField = page.getByLabel(s.titleFieldLabel);
    this.identifierField = page.getByLabel(s.identifierFieldLabel);
    // The switch's <label for> points at a real checkbox, so the accessible
    // name resolves to the input rather than to the styled toggle.
    this.enabledToggle = page.getByLabel(s.enabledFieldLabel, { exact: true });
    this.submitButton = page.getByRole('button', { name: s.submitButtonLabel, exact: true });
  }

  /** Creates a new CMS block and returns the saved page URL */
  async createBlock(formData: CMSBlockFormData): Promise<string> {
    const newSlug = `${this.adminSlug}${this.data.slugs.admin.cmsBlocks.new}`;
    await this.page.goto(newSlug);
    await this.titleField.fill(formData.title);
    await this.identifierField.fill(formData.identifier);
    // Set the status explicitly. Left alone, a store whose default flipped
    // would save every block disabled and the flash message would not notice.
    await this.enabledToggle.setChecked(formData.enabled ?? true);
    await Promise.all([
      this.page.waitForURL((url) => !url.pathname.match(/\/(new|save)\//), { timeout: 30_000 }),
      this.submitButton.click(),
    ]);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.getByRole('menubar')).toBeVisible();
    await expect(
      this.page.getByText(this.data.fixtures.admin.cmsblocks.savedNotificationText),
    ).toBeVisible({ timeout: 10_000 });

    const url = this.page.url();
    await this.expectBlockWasSaved(url, formData);
    return url;
  }

  /**
   * Reads the block back from the server.
   *
   * "You saved the block." is emitted before anything is re-read, so on its own
   * it proves only that the controller did not throw. Re-opening the record and
   * checking the persisted title, identifier and status is what makes this test
   * fail when the save silently drops fields.
   */
  async expectBlockWasSaved(url: string, formData: CMSBlockFormData): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(this.titleField, 'the saved block kept its title').toHaveValue(formData.title, {
      timeout: 30_000,
    });
    await expect(
      this.identifierField,
      'the saved block kept its identifier',
    ).toHaveValue(formData.identifier);
    await expect(this.enabledToggle, 'the saved block is enabled').toBeChecked({
      checked: formData.enabled ?? true,
    });

    // ...and that it is findable in the grid, which is the same read path the
    // deletion assertion uses. The row must also carry the identifier, which
    // is a second, independent read of the field asserted on the form above.
    await openGrid(this.page, `${this.adminSlug}${this.data.slugs.admin.cmsBlocks.grid}`);
    const row = await findGridRow(
      this.page,
      this.data,
      formData.gridSearchTerm ?? formData.title,
    );
    await expect(row, 'the grid row shows the saved identifier').toContainText(
      formData.identifier,
    );
  }

  async deleteBlock(url: string, gridSearchTerm: string): Promise<void> {
    const s = this.data.selectors.admin.cmsblocks.form;
    const f = this.data.fixtures.admin.cmsblocks;
    await this.page.goto(url);
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.getByRole('button', { name: s.deleteButtonLabel, exact: true }).click();
    await expect(this.page.getByText(f.confirmationText)).toBeVisible();
    await this.page.getByRole('button', { name: s.confirmButtonLabel, exact: true }).click();
    await expect(this.page.getByText(f.deletedNotificationText)).toBeVisible();

    // "You deleted the block." is not proof it is gone — read the grid back.
    // Safe to assert absence because `createBlock` proved it was there.
    await openGrid(this.page, `${this.adminSlug}${this.data.slugs.admin.cmsBlocks.grid}`);
    await expectNoGridRow(this.page, this.data, gridSearchTerm);
  }
}
