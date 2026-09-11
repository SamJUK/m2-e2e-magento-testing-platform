import { test, misspell } from '../fixtures/default';

/**
 * Smile ElasticSuite is the one module in this repo that does not add a
 * storefront section — it replaces two the core suite already tests. So these
 * tests are deliberately the ones the stock engine would fail: products in the
 * autocomplete payload, and a misspelling that still finds the catalogue.
 *
 * Each is paired with a counterweight, because both could otherwise be passed
 * by an engine that simply returned everything: the suggestion has to resolve
 * to the product it named, and a genuinely unmatchable query still has to
 * return nothing.
 *
 * Requires `catalog/search/engine` set to `elasticsuite`, the ElasticSuite
 * client pointed at a reachable cluster, and `catalogsearch_fulltext` reindexed.
 */
test.describe('Smile ElasticSuite search', () => {
  test(
    'the autocomplete offers products, not only search terms',
    { tag: ['@smile-elasticsuite', '@search', '@smoke'] },
    async ({ elasticsuite, data }) => {
      await elasticsuite.expectSuggestionsIncludeProducts(data.inputs.search.query);
    },
  );

  test(
    'a product suggestion resolves to the product page it names',
    { tag: ['@smile-elasticsuite', '@search'] },
    async ({ elasticsuite, data }) => {
      await elasticsuite.expectFirstProductSuggestionResolves(data.inputs.search.query);
    },
  );

  test(
    'the store search term returns products',
    { tag: ['@smile-elasticsuite', '@search', '@smoke'] },
    async ({ elasticsuite, data }) => {
      await elasticsuite.expectQueryReturnsProducts(data.inputs.search.query);
    },
  );

  test(
    'a misspelled query falls back to the closest matches',
    { tag: ['@smile-elasticsuite', '@search', '@spellcheck'] },
    async ({ elasticsuite, data }) => {
      await elasticsuite.expectMisspellingFallsBackToFuzzyMatching(
        misspell(data.inputs.search.query),
      );
    },
  );

  // Without this, "falls back to the closest matches" would also pass on an
  // engine that returned the whole catalogue for every query.
  test(
    'an unmatchable query still returns nothing',
    { tag: ['@smile-elasticsuite', '@search', '@negative'] },
    async ({ elasticsuite, data }) => {
      await elasticsuite.expectUnmatchableQueryReturnsNothing(data.inputs.search.noResultsQuery);
    },
  );
});
