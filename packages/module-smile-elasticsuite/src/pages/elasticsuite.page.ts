import { expect, type Page } from '@playwright/test';
import { deepMerge, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import moduleFixtures from '../data/fixtures.json';
import type { Suggestion } from './types';

type ElasticsuiteFixtures = typeof moduleFixtures.elasticsuite;

/**
 * Drives Smile ElasticSuite, which does not add a storefront section — it
 * *replaces* two the core suite already tests: catalog search and layered
 * navigation.
 *
 * That makes the interesting assertions the ones the stock engine would fail.
 * Native Magento's suggest endpoint returns search terms only; ElasticSuite's
 * returns products too. Native Magento returns nothing for a misspelling;
 * ElasticSuite falls back to fuzzy matching and says so. Both are asserted
 * here, and both are paired with a counterweight so that "always returns
 * everything" cannot pass either.
 */
export class ElasticsuitePage {
  private readonly f: ElasticsuiteFixtures;

  constructor(private page: Page, private data: MergedData) {
    const override = (data.fixtures as Record<string, unknown>).elasticsuite as
      | Partial<ElasticsuiteFixtures>
      | undefined;
    this.f = deepMerge<ElasticsuiteFixtures>(moduleFixtures.elasticsuite, override ?? {});
  }

  private resultsUrl(query: string): string {
    return `${this.data.slugs.search.resultsPagePrefix}/?q=${encodeURIComponent(query)}`;
  }

  async fetchSuggestions(query: string): Promise<Suggestion[]> {
    const response = await this.page.request.get(
      `${this.f.suggestEndpoint}?q=${encodeURIComponent(query)}`,
    );
    expect(response.status(), `the suggest endpoint answers for "${query}"`).toBe(200);
    return (await response.json()) as Suggestion[];
  }

  /**
   * The single clearest signal that ElasticSuite is the engine: stock Magento's
   * autocomplete offers search *terms*, and nothing else. Products in the
   * payload mean the module is installed, configured and indexed.
   */
  async expectSuggestionsIncludeProducts(query: string): Promise<void> {
    const suggestions = await this.fetchSuggestions(query);

    const terms = suggestions.filter((s) => s.type === this.f.termSuggestionType);
    const products = suggestions.filter((s) => s.type === this.f.productSuggestionType);

    expect(terms.length, `term suggestions for "${query}"`).toBeGreaterThan(0);
    expect(products.length, `product suggestions for "${query}"`).toBeGreaterThan(0);
    expect(products[0].title, 'the first product suggestion has a title').toBeTruthy();
    expect(products[0].url, 'the first product suggestion has a URL').toBeTruthy();
  }

  /**
   * Follows a suggestion to the page it promises.
   *
   * A payload can be well-formed and still point at nothing — a stale index
   * suggests products that have been deleted or disabled, and the merchant
   * only finds out from a customer.
   */
  async expectFirstProductSuggestionResolves(query: string): Promise<void> {
    const suggestions = await this.fetchSuggestions(query);
    const product = suggestions.find((s) => s.type === this.f.productSuggestionType);
    expect(product, `a product suggestion for "${query}"`).toBeDefined();

    const response = await this.page.goto(product!.url!, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), 'the suggested product page is served').toBe(200);
    await expect(
      this.page.getByRole('heading', { level: 1 }).first(),
      'the suggested page is the product it named',
    ).toHaveText(product!.title);
  }

  async expectQueryReturnsProducts(query: string): Promise<void> {
    await this.page.goto(this.resultsUrl(query), { waitUntil: 'domcontentloaded' });
    await expect(
      this.page.locator(this.data.selectors.search.resultItemSelector),
      `products for "${query}"`,
    ).not.toHaveCount(0);
  }

  /**
   * A misspelling the stock engine would return nothing for.
   *
   * The notice matters as much as the tiles: results alone could mean the query
   * happened to match, while the notice is ElasticSuite saying in its own words
   * that nothing matched exactly and it fell back.
   */
  async expectMisspellingFallsBackToFuzzyMatching(misspelled: string): Promise<void> {
    await this.page.goto(this.resultsUrl(misspelled), { waitUntil: 'domcontentloaded' });

    await expect(
      this.page.locator(this.data.selectors.search.resultItemSelector),
      `fuzzy matches for the misspelled "${misspelled}"`,
    ).not.toHaveCount(0);
    await expect(
      this.page.locator('.column.main').getByText(this.f.spellcheckNoticeText),
      'the store says it fell back to the closest matches',
    ).toBeVisible();
  }

  /** The counterweight: fuzzy matching must still be able to find nothing. */
  async expectUnmatchableQueryReturnsNothing(query: string): Promise<void> {
    await this.page.goto(this.resultsUrl(query), { waitUntil: 'domcontentloaded' });
    await expect(
      this.page.locator(this.data.selectors.search.resultItemSelector),
      `no products for "${query}"`,
    ).toHaveCount(0);
    await expect(
      this.page.locator(this.data.selectors.search.noResultsMessageSelector),
      'the store reports no results',
    ).toBeVisible();
  }
}

/**
 * Doubles the final letter of the store's own search term.
 *
 * A misspelling has to be one the catalogue nearly matches, and hardcoding one
 * would only ever suit the store it was written for. Doubling the last letter
 * of the term the store already declares is an edit distance of one from a
 * word the catalogue definitely contains, whatever that word is.
 */
export function misspell(query: string): string {
  const trimmed = query.trim();
  return trimmed + trimmed.slice(-1);
}
