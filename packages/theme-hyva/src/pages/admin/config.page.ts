import { expect, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';

export class AdminConfigPage {
  readonly page: Page;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
  }

  async visit(): Promise<void> {
    await this.page.goto(`${this.adminSlug}${this.data.slugs.admin.config}`);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.page.getByRole('heading', { name: 'Configuration' })).toBeVisible();
  }
}
