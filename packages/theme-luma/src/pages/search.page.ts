import { expect, type Page } from '@playwright/test';
import { sprintf, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { ISearchPage } from './types';

export class SearchPage implements ISearchPage {
  readonly page: Page;

  constructor(page: Page, private data: MergedData) {
    this.page = page;
  }

  async search(query: string): Promise<void> {
    await this.page.goto(this.data.slugs.search.startingPage);
    // Luma's mini search form renders role=combobox (autocomplete wiring);
    // themes that strip the autocomplete attributes leave a plain
    // type=search input, which has role=searchbox instead.
    // Themes commonly render a desktop AND a mobile search form; the hidden
    // one still accepts fill() but its Enter handler does nothing, so filter
    // to what is actually on screen.
    const searchInput = this.page
      .getByRole('combobox')
      .or(this.page.getByRole('searchbox'))
      .filter({ visible: true })
      .first();
    if (!await searchInput.isVisible()) {
      await this.page
        .getByRole('button', { name: this.data.selectors.search.searchButtonLabel })
        .click();
    }
    await searchInput.fill(query);
    // JS-driven search widgets (Klevu et al.) bind their Enter handler
    // asynchronously — with deferred-JS optimizers the first Enter can land
    // before the handler exists and do nothing. Re-press until it navigates,
    // falling back to the widget's submit button on alternate attempts.
    const resultsUrl = new RegExp(this.data.slugs.search.resultsPagePrefix);
    let attempt = 0;
    await expect(async () => {
      attempt += 1;
      if (attempt % 2 === 1) {
        await searchInput.press('Enter');
      } else {
        await this.page
          .getByRole('button', { name: this.data.selectors.search.searchButtonLabel })
          .first()
          .click({ timeout: 5_000 });
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
