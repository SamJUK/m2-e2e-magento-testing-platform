import { lumaTest as test } from '../fixtures';

test(
  'can search for a product',
  { tag: ['@search', '@smoke'] },
  async ({ searchPage, data }) => {
    await searchPage.search(data.inputs.search.query);
  },
);

test(
  'an unknown search query returns no results',
  { tag: ['@search', '@negative'] },
  async ({ searchPage, data }) => {
    // The positive search first, deliberately. It proves the product-tile
    // locator matches a real listing on this store, without which the
    // "no tiles" half of the assertion below would be vacuously true — which
    // is exactly the fake-green this test was written to close.
    await searchPage.search(data.inputs.search.query);
    await searchPage.expectNoResultsFor(data.inputs.search.noResultsQuery);
  },
);
