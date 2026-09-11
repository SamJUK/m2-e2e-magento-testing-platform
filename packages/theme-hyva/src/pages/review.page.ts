import { expect, type Locator, type Page } from '@playwright/test';
import { sprintf, waitForFormKey, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { IReviewPage, ProductReview } from './types';

export type { ProductReview };

export class ReviewPage implements IReviewPage {
  readonly page: Page;
  readonly reviewTab: Locator;
  readonly form: Locator;
  readonly nicknameField: Locator;
  readonly summaryField: Locator;
  readonly reviewField: Locator;
  readonly submitButton: Locator;
  readonly checkedRating: Locator;

  constructor(page: Page, private data: MergedData) {
    this.page = page;
    const s = data.selectors.reviewForm;
    this.reviewTab = page.locator(s.tabLabelSelector);
    // Everything is scoped to the form itself: a PDP also lists the reviews
    // already left on the product, and a store running a reviews-in-listing
    // extension can put a second rating widget on the same page.
    this.form = page.locator(s.formSelector);
    this.nicknameField = this.form.locator(s.nicknameFieldSelector);
    this.summaryField = this.form.locator(s.summaryFieldSelector);
    this.reviewField = this.form.locator(s.reviewFieldSelector);
    this.submitButton = this.form.getByRole('button', { name: s.submitButtonLabel });
    this.checkedRating = this.form.locator(s.ratingCheckedSelector);
  }

  /**
   * Reveals the review form.
   *
   * Luma buries it in a "Reviews" tab that starts closed; Hyvä renders it in
   * the page but defers its Alpine component until the form scrolls into view.
   * Retry until the fields are genuinely reachable — the assertion inside the
   * loop is what has to hold, so neither branch can quietly do nothing.
   */
  private async openReviewForm(): Promise<void> {
    const behindTab = this.data.features.review.formBehindTab;

    if (!behindTab) {
      // Declared tab-less (Hyva): prove there is no disclosure to open, so a
      // theme that grows one fails here instead of silently taking the other
      // path, then let the form's own component initialise on scroll.
      await expect(this.reviewTab, 'no review disclosure tab is rendered').toHaveCount(0);
      await this.summaryField.scrollIntoViewIfNeeded();
      await expect(this.summaryField, 'the review form is reachable').toBeVisible({
        timeout: 15_000,
      });
      return;
    }

    await expect(this.reviewTab, 'the review form sits behind a disclosure tab').toHaveCount(1);
    // Click only while the form is still closed. Luma binds its tabs widget
    // through RequireJS well after load, so an early click does nothing — but
    // once bound the tab TOGGLES, and a retry loop that clicks unconditionally
    // alternates open/closed and can never settle.
    //
    // Nothing inside this loop may block on the still-hidden form. An earlier
    // version scrolled it into view here, and `scrollIntoViewIfNeeded` waits
    // for the element to become visible with no timeout of its own: on a store
    // where the tabs widget binds after the first click, the very first
    // iteration sat there until the whole toPass budget was gone and the loop
    // never got a second attempt. Measured on the Mage-OS demo store: attempt
    // one blocks indefinitely, attempt two opens the tab in 43ms. The scroll
    // belongs after the form is open, which is also the only point it means
    // anything.
    await expect(async () => {
      if (!(await this.summaryField.isVisible())) {
        await this.reviewTab.first().click();
      }
      await expect(this.summaryField).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    await this.summaryField.scrollIntoViewIfNeeded();
  }

  /**
   * Fills in and submits a product review.
   *
   * The star rating is set through the element's own `click()` rather than
   * Playwright's: both themes replace the radio with a star label, and the
   * labels overlap, so a real pointer click on the wanted star is intercepted
   * by its neighbour. The radio is then asserted to be checked, which is what
   * stops the DOM click from being a no-op nobody notices.
   */
  async submitReview(url: string, review: ProductReview): Promise<void> {
    const s = this.data.selectors.reviewForm;
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForFormKey(this.page);
    await this.openReviewForm();

    const rating = this.form.locator(sprintf(s.ratingSelector, String(review.stars)));
    await expect(rating, `the form offers a ${review.stars}-star rating`).toHaveCount(1);
    await rating.evaluate((element) => (element as HTMLInputElement).click());
    await expect(
      this.checkedRating,
      `exactly one rating is selected after choosing ${review.stars} stars`,
    ).toHaveCount(1);

    await this.nicknameField.fill(review.nickname);
    await this.summaryField.fill(review.summary);
    await this.reviewField.fill(review.text);
    await this.submitButton.click();

    // Luma posts the form and redirects; Hyvä sends a createProductReview
    // GraphQL mutation and swaps a message into the form. Both end on the same
    // sentence — and that sentence is an acceptance receipt, not proof: the
    // caller reads the review back out of the admin.
    await expect(
      this.page.getByText(this.data.fixtures.review.submittedNotificationText).first(),
      'the store accepts the review for moderation',
    ).toBeVisible({ timeout: 60_000 });
  }
}
