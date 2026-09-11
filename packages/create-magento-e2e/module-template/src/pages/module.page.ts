import { expect, type Locator, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import selectors from '../data/selectors.json';

/**
 * Every assertion lives in the page object, not the spec — a spec that reads
 * as a list of user actions stays readable when the markup moves.
 */
export class __PASCAL__Page {
  private readonly s = selectors.__CAMEL__;

  constructor(private page: Page, private data: MergedData) {}

  get banner(): Locator {
    return this.page.locator(this.s.banner);
  }

  async expectBannerIsVisible(): Promise<void> {
    await expect(this.banner, 'the __PASCAL__ banner renders').toBeVisible();
  }
}
