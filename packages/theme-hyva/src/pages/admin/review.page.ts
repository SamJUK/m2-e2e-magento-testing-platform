import { expect, type Locator, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { openGrid } from './grid';
import type { IAdminReviewPage, PendingReview } from '../types';

export type { PendingReview };

/**
 * Marketing > Reviews.
 *
 * Not a UI-component grid: this screen is one of the last legacy adminhtml
 * grids, with a per-column filter row and its own Search button, so none of the
 * `grid.ts` keyword helpers apply to it.
 */
export class AdminReviewPage implements IAdminReviewPage {
  readonly page: Page;
  readonly summaryFilter: Locator;
  readonly searchButton: Locator;
  readonly rows: Locator;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
    const s = data.selectors.admin.reviews.grid;
    this.summaryFilter = page.locator(s.summaryFilterSelector);
    this.searchButton = page.locator(s.searchButtonSelector).filter({ visible: true }).first();
    this.rows = page.locator(s.rowSelector);
  }

  /**
   * Asserts the storefront's review actually reached the server, and is being
   * held for moderation.
   *
   * This is the whole point of the review test. Magento does not publish a new
   * review, so nothing on the storefront can confirm one was created — the
   * success notice is emitted by the controller before anything is re-read, and
   * would still appear if the review were dropped. Filtering the admin grid on
   * the summary the test itself wrote, and requiring exactly one row that also
   * carries the moderation status, the nickname and the reviewed product, is
   * the only read-back available.
   */
  async expectReviewIsAwaitingModeration(review: PendingReview): Promise<void> {
    const f = this.data.fixtures.review;

    await openGrid(this.page, `${this.adminSlug}${this.data.slugs.admin.reviews.grid}`);

    // The legacy grid persists its filter server-side per admin user, so a
    // parallel worker signed in as the same account can replace the term
    // mid-flight; and the filter row is rendered by a script that runs after
    // load, which discards a value typed too early. Retry the whole
    // filter → search → row cycle, exactly as the UI-component helper does.
    const row = this.rows.filter({ hasText: review.summary });
    await expect(async () => {
      await this.summaryFilter.fill(review.summary);
      await expect(this.summaryFilter).toHaveValue(review.summary, { timeout: 5_000 });
      await this.searchButton.click();
      await expect(row, `the admin holds exactly one review titled "${review.summary}"`)
        .toHaveCount(1, { timeout: 15_000 });
    }).toPass({ timeout: 90_000 });

    await expect(row, 'the review is awaiting moderation').toContainText(
      f.moderationStatusText,
    );
    await expect(row, 'the review kept the nickname it was submitted with').toContainText(
      review.nickname,
    );
    await expect(row, 'the review is attached to the product it was left on').toContainText(
      review.productTitle,
    );
  }
}
