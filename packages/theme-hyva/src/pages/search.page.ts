import { expect, type Locator, type Page } from '@playwright/test';
import { sprintf } from '@samjuk/e2e-m2-playwright-core';
import type { HyvaData } from '../data/types';
import type { ISearchPage } from './types';

export class SearchPage implements ISearchPage {
  readonly page: Page;
  readonly searchToggle: Locator;
  readonly searchPanel: Locator;
  readonly searchInput: Locator;

  constructor(page: Page, private data: HyvaData) {
    this.page = page;
    const s = data.selectors.search;
    // In Hyvä the mini-search panel is Alpine `x-show="searchOpen"` + `x-cloak`
    // at every breakpoint, so it must be toggled open before typing.
    this.searchToggle = page.locator(s.searchToggleSelector);
    this.searchPanel = page.locator(s.searchPanelSelector);
    this.searchInput = page.locator(s.searchInputSelector);
  }

  async search(query: string): Promise<void> {
    await this.page.goto(this.data.slugs.search.startingPage);

    if (!(await this.searchPanel.isVisible())) {
      await this.searchToggle.click();
      await this.searchPanel.waitFor({ state: 'visible' });
    }

    await this.searchInput.fill(query);

    // The form is `@submit.prevent="search"` — a JS-driven submit (as are
    // replacements like Klevu). Its handler binds asynchronously, so with
    // deferred-JS optimizers the first Enter can land before the handler
    // exists and do nothing. Re-press until it navigates, falling back to the
    // form's own submit button on alternate attempts.
    // NOT networkidle: real stores keep analytics/chat sockets busy
    // indefinitely, so it never fires — wait on the results URL instead.
    const submitButton = this.searchPanel
      .getByRole('button', { name: this.data.selectors.search.searchButtonLabel })
      .first();
    const resultsUrl = new RegExp(this.data.slugs.search.resultsPagePrefix);
    let attempt = 0;
    await expect(async () => {
      attempt += 1;
      if (attempt % 2 === 1) {
        await this.searchInput.press('Enter');
      } else {
        await submitButton.click({ timeout: 5_000 });
      }
      await expect(this.page).toHaveURL(resultsUrl, { timeout: 5_000 });
    }).toPass({ timeout: 40_000 });

    await expect(
      this.page.getByRole('heading', {
        name: sprintf(this.data.fixtures.search.resultsPageTitle, query),
      }),
    ).toBeVisible();

    await this.expectResultsFor(query);
  }

  /**
   * The results heading merely echoes the query — a zero-results page renders
   * exactly the same one. Assert on the results themselves instead: at least
   * one product tile, and a product known to match this query.
   */
  async expectResultsFor(query: string): Promise<void> {
    const s = this.data.selectors.search;
    const results = this.page.locator(s.resultItemSelector);
    await expect(
      results.first(),
      `search for "${query}" returned at least one product`,
    ).toBeVisible({ timeout: 30_000 });

    const expected = this.data.fixtures.search.expectedProductTitle;
    await expect(
      results.filter({
        has: this.page.locator(s.resultItemNameSelector, { hasText: expected }),
      }),
      `search results for "${query}" include "${expected}"`,
    ).toHaveCount(1, { timeout: 30_000 });
  }

  /**
   * Asserts an unknown query is reported as returning nothing.
   *
   * Two halves, and both are needed. The message alone would pass on a page
   * that also listed products; the empty tile count alone would pass against a
   * selector that matches nothing anywhere, which is precisely the fake-green
   * this replaces — `expectResultsFor` proves the same tile locator matches a
   * real listing, so a count of zero here means the listing is genuinely empty.
   */
  async expectNoResultsFor(query: string): Promise<void> {
    const s = this.data.selectors.search;
    await this.page.goto(
      `${this.data.slugs.search.resultsPagePrefix}/?q=${encodeURIComponent(query)}`,
      { waitUntil: 'domcontentloaded' },
    );

    await expect(
      this.page.getByRole('heading', {
        name: sprintf(this.data.fixtures.search.resultsPageTitle, query),
      }),
      'the store served its own results page for the unknown query',
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      this.page.locator(s.noResultsMessageSelector),
      `the store reports that "${query}" matched nothing`,
    ).toContainText(this.data.fixtures.search.noResultsText, { timeout: 30_000 });

    await expect(
      this.page.locator(s.resultItemSelector),
      'no product is listed for a query nothing matches',
    ).toHaveCount(0);
  }
}
