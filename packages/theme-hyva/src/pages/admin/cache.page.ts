import { expect, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';

/**
 * System > Cache Management. Read-only: the page is a common casualty of ACL
 * and module misconfiguration, but flushing from a test would slow every other
 * test sharing the store.
 */
export class AdminCachePage {
  readonly page: Page;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
  }

  async visit(): Promise<void> {
    await this.page.goto(`${this.adminSlug}${this.data.slugs.admin.cache}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(this.page.getByRole('menubar')).toBeVisible();

    await expect(
      // "Additional Cache Management" is also a heading on this page.
      this.page.getByRole('heading', {
        name: this.data.fixtures.admin.cache.headingText,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('button', {
        name: this.data.selectors.admin.cache.flushButtonLabel,
      }),
    ).toBeVisible();
  }
}
