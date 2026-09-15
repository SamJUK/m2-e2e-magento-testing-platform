import { expect, type Locator, type Page } from '@playwright/test';
import { type MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { ICookieNoticePage } from './types';

/**
 * Magento's own Cookie Restriction Mode notice (Magento_Cookie), not a
 * third-party consent tool. The SaaS ones are blocked at the network layer by
 * the core fixture; this one is served by the store itself and cannot be.
 */
export class CookieNoticePage implements ICookieNoticePage {
  readonly page: Page;
  readonly notice: Locator;
  readonly acceptButton: Locator;

  constructor(page: Page, private data: MergedData) {
    this.page = page;
    const s = data.selectors.cookieRestriction;
    this.page = page;
    this.notice = page.locator(s.noticeSelector);
    this.acceptButton = page.locator(s.acceptButtonSelector);
  }

  async expectNoticeIsAcceptable(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(this.notice, 'the cookie notice renders on a first visit').toBeVisible({
      timeout: 30_000,
    });
    await expect(
      this.notice.getByText(this.data.fixtures.cookieRestriction.noticeText),
      'the notice carries the store\'s own wording',
    ).toBeVisible();

    await this.acceptButton.click();
    await expect(this.notice, 'accepting dismisses the notice').toBeHidden({
      timeout: 30_000,
    });

    // The point of the feature is that the choice sticks. Without the reload
    // this would pass on a notice that merely hid itself client-side and came
    // straight back on the next page.
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await expect(this.notice, 'the acceptance survives a reload').toBeHidden({
      timeout: 30_000,
    });
  }

  async expectNoNoticeIsRendered(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(
      this.notice,
      'no cookie notice is rendered when the store does not run Cookie Restriction Mode',
    ).toHaveCount(0);
  }
}
