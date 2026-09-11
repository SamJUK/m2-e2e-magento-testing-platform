import { expect, type Locator, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { expectNoGridRow, findGridRow, openGrid } from './grid';

export interface CMSPageFormData {
  title: string;
  enabled?: boolean;
  /**
   * Term used to find this page in the admin grid. The grid's keyword box runs
   * a MySQL fulltext match, which treats a multi-word title as "any of these
   * words" and can therefore return unrelated pages — so pass a single unique
   * token from the title rather than relying on the whole title.
   */
  gridSearchTerm?: string;
}

export class AdminCMSPagePage {
  readonly page: Page;
  readonly titleField: Locator;
  readonly enabledToggle: Locator;
  readonly submitButton: Locator;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
    const s = data.selectors.admin.cmspages.form;
    this.titleField = page.getByLabel(s.titleFieldLabel);
    // The switch's <label for> points at a real checkbox, so the accessible
    // name resolves to the input rather than to the styled toggle.
    this.enabledToggle = page.getByLabel(s.enabledFieldLabel, { exact: true });
    this.submitButton = page.getByRole('button', { name: s.submitButtonLabel, exact: true });
  }

  /** Creates a new CMS page and returns the saved page URL */
  async createPage(formData: CMSPageFormData): Promise<string> {
    const newSlug = `${this.adminSlug}${this.data.slugs.admin.cmsPages.new}`;
    await this.page.goto(newSlug);
    await this.titleField.fill(formData.title);
    // Set the status explicitly. Left alone, a store whose default flipped
    // would save every page disabled and the flash message would not notice.
    await this.enabledToggle.setChecked(formData.enabled ?? true);
    await Promise.all([
      this.page.waitForURL((url) => !url.pathname.match(/\/(new|save)\//), { timeout: 30_000 }),
      this.submitButton.click(),
    ]);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.getByRole('menubar')).toBeVisible();
    await expect(
      this.page.getByText(this.data.fixtures.admin.cmspages.savedNotificationText),
    ).toBeVisible({ timeout: 10_000 });

    const url = this.page.url();
    await this.expectPageWasSaved(url, formData);
    return url;
  }

  /**
   * Reads the page back from the server.
   *
   * "You saved the page." is emitted before anything is re-read, so on its own
   * it proves only that the controller did not throw. Re-opening the record and
   * checking the persisted title and status is what makes this test fail when
   * the save silently drops fields.
   */
  async expectPageWasSaved(url: string, formData: CMSPageFormData): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await expect(this.titleField, 'the saved page kept its title').toHaveValue(formData.title, {
      timeout: 30_000,
    });
    await expect(this.enabledToggle, 'the saved page is enabled').toBeChecked({
      checked: formData.enabled ?? true,
    });

    // ...and that it is findable in the grid, which is the same read path the
    // deletion assertion uses.
    await openGrid(this.page, `${this.adminSlug}${this.data.slugs.admin.cmsPages.grid}`);
    await findGridRow(this.page, this.data, formData.gridSearchTerm ?? formData.title);
  }

  async deletePage(url: string, gridSearchTerm: string): Promise<void> {
    const s = this.data.selectors.admin.cmspages.form;
    const f = this.data.fixtures.admin.cmspages;
    await this.page.goto(url);
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.getByRole('button', { name: s.deleteButtonLabel, exact: true }).click();
    await expect(this.page.getByText(f.confirmationText)).toBeVisible();
    await this.page.getByRole('button', { name: s.confirmButtonLabel, exact: true }).click();
    await expect(this.page.getByText(f.deletedNotificationText)).toBeVisible();

    // "The page has been deleted." is not proof it is gone — read the grid
    // back. Safe to assert absence because `createPage` proved it was there.
    await openGrid(this.page, `${this.adminSlug}${this.data.slugs.admin.cmsPages.grid}`);
    await expectNoGridRow(this.page, this.data, gridSearchTerm);
  }
}
