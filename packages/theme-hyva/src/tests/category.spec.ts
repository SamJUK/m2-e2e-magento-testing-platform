import { hyvaTest as test, expect } from '../fixtures';
import { Currency } from '../index';

test.describe('Category Page', () => {
  test.beforeEach(async ({ page, data }) => {
    await page.goto(data.slugs.categories.listingPage);
    await page.waitForLoadState('networkidle');
  });

  test(
    'can change sort order direction',
    { tag: ['@category', '@sort'] },
    async ({ categoryPage, page, data }) => {
      const before = await categoryPage.getFirstProductName();
      await categoryPage.changeSortOrderDirection();
      expect(await categoryPage.getFirstProductName()).not.toEqual(before);
      // A changed tile alone is satisfied by any re-render. Assert the store
      // actually recorded the descending direction, and that it still has a
      // listing to sort.
      await expect(page, 'the listing switched to descending order').toHaveURL(
        new RegExp(data.inputs.category.listingPage.descendingUrlPattern),
      );
      expect(
        (await categoryPage.getProductPrices(2)).length,
        'the listing still renders priced products',
      ).toBeGreaterThan(1);
    },
  );

  test(
    'can change sort order',
    { tag: ['@category', '@sort'] },
    async ({ categoryPage, data }) => {
      const before = await categoryPage.getFirstProductName();
      await categoryPage.changeSortOrder();
      // Poll: ajax themes re-render the product grid after the URL change
      // (skeleton placeholders first), so a single read races the render.
      await expect
        .poll(() => categoryPage.getFirstProductName(), { timeout: 20_000 })
        .not.toEqual(before);

      // `inputs.category.listingPage.sortOrder` is the price sort option, so
      // the listing must now be ordered by parsed price. "The first tile
      // changed" would also pass on a sort that did nothing but reshuffle.
      const prices = await categoryPage.getProductPrices(2);
      expect(prices.length, 'the listing renders more than one priced product').toBeGreaterThan(1);
      // Direction is data-driven: themes that merge it into the sort options
      // (e.g. "price__desc") declare it via inputs.
      const descending = data.inputs.category.listingPage.sortOrderDirection === 'desc';
      expect(prices, `prices are in ${descending ? 'descending' : 'ascending'} order after sorting by price`).toEqual(
        [...prices].sort((a, b) => (descending ? b - a : a - b)),
      );
    },
  );

  test(
    'can apply layered navigation filter',
    { tag: ['@category', '@filter'] },
    async ({ categoryPage, data }) => {
      const before = await categoryPage.getFirstProductName();
      const { filterName, filterValue } = data.fixtures.category.listingPage.layeredNavigation;
      await categoryPage.selectFilter(filterName, filterValue);
      await expect
        .poll(() => categoryPage.getFirstProductName(), { timeout: 20_000 })
        .not.toEqual(before);
      // The filter must show as applied. Without this the test passes on any
      // listing re-render, including one where the filter was silently dropped.
      await categoryPage.expectFilterIsApplied(filterName, filterValue);
    },
  );

  test(
    'can switch currency',
    { tag: ['@category', '@currency'] },
    async ({ categoryPage, data }) => {
      const before = await categoryPage.getFirstProductPrice();
      await categoryPage.changeCurrency(Currency.EUR);
      const after = await categoryPage.getFirstProductPrice();
      expect(after).not.toEqual(before);
      // A changed string is not proof of a currency switch — assert the new
      // currency's own symbol is what is now rendered.
      expect(after, 'prices render in the switched-to currency').toContain(
        data.fixtures.category.listingPage.currencySymbolAfterSwitch,
      );
    },
  );

  test(
    'can sort products by name',
    { tag: ['@category', '@sort'] },
    async ({ categoryPage, data }) => {
      const before = await categoryPage.getFirstProductName();
      await categoryPage.changeSortOrder(data.inputs.category.listingPage.sortOrderByName);
      // Poll: ajax themes re-render the grid after the URL change.
      await expect
        .poll(() => categoryPage.getFirstProductName(), { timeout: 20_000 })
        .not.toEqual(before);

      // Mirrors the price sort: compare the parsed array against its own sorted
      // copy, so "the first tile changed" cannot pass for a sort that only
      // reshuffled. Compared case-insensitively because MySQL's own collation
      // is, while JavaScript's default string order is not.
      const names = await categoryPage.getProductNames(2);
      expect(names.length, 'the listing renders more than one product').toBeGreaterThan(1);
      const alphabetically = [...names].sort((a, b) =>
        a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
      );
      expect(names, 'product names are in ascending alphabetical order').toEqual(alphabetically);
    },
  );

  test(
    'breadcrumbs show the trail on a category page and on a product page',
    { tag: ['@category', '@breadcrumbs'] },
    async ({ categoryPage, page, data }) => {
      expect(
        await categoryPage.getBreadcrumbTrail(),
        'the category page renders its full breadcrumb trail',
      ).toEqual(data.fixtures.category.listingPage.breadcrumbTrail);

      await page.goto(data.slugs.products.simpleProduct, { waitUntil: 'domcontentloaded' });
      expect(
        await categoryPage.getBreadcrumbTrail(),
        'the product page renders its own breadcrumb trail',
      ).toEqual(data.fixtures.product.breadcrumbTrail);
    },
  );

  test(
    'two layered filters combine',
    { tag: ['@category', '@filter'] },
    async ({ categoryPage, data }) => {
      // Three listing round-trips on a dev-mode store.
      test.slow();

      const f = data.fixtures.category.listingPage;
      const first = f.layeredNavigation;
      const second = f.secondLayeredNavigation;

      const unfiltered = await categoryPage.getProductNames();

      await categoryPage.selectFilter(first.filterName, first.filterValue);
      const afterFirst = await categoryPage.getProductNames();
      expect(
        afterFirst.length,
        `"${first.filterValue}" narrows the listing`,
      ).toBeLessThan(unfiltered.length);

      await categoryPage.selectFilter(second.filterName, second.filterValue);
      const afterSecond = await categoryPage.getProductNames();

      // Both chips, so a second filter that silently replaced the first fails.
      await categoryPage.expectFilterIsApplied(first.filterName, first.filterValue);
      await categoryPage.expectFilterIsApplied(second.filterName, second.filterValue);

      // An intersection, asserted as one: strictly fewer than the first filter
      // alone, still not empty, and every survivor was already in that set.
      expect(
        afterSecond.length,
        'the second filter narrows the listing further',
      ).toBeLessThan(afterFirst.length);
      expect(
        afterSecond.length,
        'the two filters together still match something',
      ).toBeGreaterThan(0);
      expect(
        afterSecond.every((name) => afterFirst.includes(name)),
        'every remaining product also matched the first filter',
      ).toBe(true);
    },
  );

  test(
    'clearing all layered filters restores the full listing',
    { tag: ['@category', '@filter'] },
    async ({ categoryPage, data }) => {
      // Three listing round-trips on a dev-mode store.
      test.slow();

      const f = data.fixtures.category.listingPage;
      const unfiltered = await categoryPage.getProductNames();

      await categoryPage.selectFilter(f.layeredNavigation.filterName, f.layeredNavigation.filterValue);
      await categoryPage.selectFilter(
        f.secondLayeredNavigation.filterName,
        f.secondLayeredNavigation.filterValue,
      );
      const filtered = await categoryPage.getProductNames();
      // Precondition, not decoration: clearing nothing would also "restore"
      // a listing that was never narrowed.
      expect(filtered.length, 'the listing was actually narrowed first').toBeLessThan(
        unfiltered.length,
      );

      await categoryPage.clearAllFilters();

      await categoryPage.expectNoFiltersAreApplied();
      expect(
        await categoryPage.getProductNames(),
        'the full listing is back, in the same order',
      ).toEqual(unfiltered);
    },
  );
});

test.describe('Category Listing Controls', () => {
  // A category with more products than the limiter option under test, so the
  // tile count can actually reach it and the pager has a second page.
  test.beforeEach(async ({ page, data }) => {
    await page.goto(data.slugs.categories.pagedListingPage, { waitUntil: 'domcontentloaded' });
  });

  test(
    'can change the number of products shown per page',
    { tag: ['@category', '@limiter'] },
    async ({ categoryPage, data }) => {
      const limit = data.inputs.category.listingPage.resultsPerPage;

      const before = (await categoryPage.getProductNames(2)).length;
      expect(
        before,
        `the listing does not already show ${limit} products, so a change is observable`,
      ).not.toBe(Number(limit));

      await categoryPage.changeResultsPerPage(limit);

      // The tile count itself, not the URL: a store whose limiter records the
      // choice and then ignores it would pass a URL assertion.
      await expect(
        categoryPage.productItems,
        `the listing shows exactly ${limit} products per page`,
      ).toHaveCount(Number(limit), { timeout: 30_000 });
    },
  );

  test(
    'can page through the product listing',
    { tag: ['@category', '@pagination'] },
    async ({ categoryPage }) => {
      const firstPage = await categoryPage.getProductNames(2);
      expect(firstPage.length, 'page one renders products').toBeGreaterThan(1);

      await categoryPage.goToPage(2);
      const secondPage = await categoryPage.getProductNames(2);

      // Asserted by product name, not by URL: a pager that changes `?p=` and
      // serves page one again is exactly the bug this is here to catch.
      expect(secondPage.length, 'page two renders products').toBeGreaterThan(1);
      expect(
        secondPage.filter((name) => firstPage.includes(name)),
        'page two shares no product with page one',
      ).toEqual([]);
    },
  );
});

test.describe('Category listing integrity', () => {
  test(
    "a layered navigation filter's count matches the number of results",
    { tag: ['@category', '@filter'] },
    async ({ categoryPage, page, data }) => {
      // Reading the facet, applying it and reading the toolbar back is two
      // listing round-trips on a dev-mode store.
      test.slow();

      await page.goto(data.slugs.categories.listingPage);
      const { filterName, filterValue } = data.fixtures.category.listingPage.layeredNavigation;

      const advertised = await categoryPage.getFilterOptionCount(filterName, filterValue);
      expect(advertised, 'the facet advertises a non-zero count').toBeGreaterThan(0);

      await categoryPage.selectFilter(filterName, filterValue);
      await categoryPage.expectFilterIsApplied(filterName, filterValue);

      // Compared against the toolbar total rather than the tiles on screen, so
      // this measures the result SET and not whichever page of it is rendered.
      // A facet promising 12 and returning 9 is a stale catalog index, and
      // nothing else in the suite would notice.
      expect(
        await categoryPage.getResultCount(),
        `"${filterValue}" returns the ${advertised} results it advertised`,
      ).toBe(advertised);
    },
  );

  test(
    'the chosen sort order survives paging',
    { tag: ['@category', '@sort', '@pagination'] },
    async ({ categoryPage, page, data }) => {
      // Sort, page, then read the listing back.
      test.slow();

      await page.goto(data.slugs.categories.pagedListingPage, {
        waitUntil: 'domcontentloaded',
      });

      const sortOrder = data.inputs.category.listingPage.sortOrderByName;
      await categoryPage.changeSortOrder(sortOrder);
      const firstPage = await categoryPage.getProductNames(2);

      await categoryPage.goToPage(2);

      // Two independent reads. The control still SAYS the sort is applied, and
      // the listing still IS sorted. A pager that drops product_list_order
      // silently reverts to position order, which looks like a plausible
      // listing rather than like a bug.
      expect(
        await categoryPage.getSelectedSortOrder(),
        'the sorter still shows the chosen order on page two',
      ).toBe(sortOrder);

      const secondPage = await categoryPage.getProductNames(2);
      const alphabetically = [...secondPage].sort((a, b) =>
        a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0,
      );
      expect(secondPage, 'page two is still in alphabetical order').toEqual(alphabetically);

      // And it is genuinely the next page of the same sorted set, not page one
      // served again under a different URL.
      expect(
        secondPage.filter((name) => firstPage.includes(name)),
        'page two shares no product with page one',
      ).toEqual([]);
    },
  );

  test(
    "an anchor category includes its child categories' products",
    { tag: ['@category', '@anchor'] },
    async ({ categoryPage, page, data }) => {
      // Two full listings, one of them re-rendered at the largest page size.
      test.slow();

      await page.goto(data.slugs.categories.childOfParentListingPage, {
        waitUntil: 'domcontentloaded',
      });
      const childProducts = await categoryPage.getProductNames(1);
      expect(childProducts.length, 'the child category lists products').toBeGreaterThan(0);

      await page.goto(data.slugs.categories.parentListingPage, {
        waitUntil: 'domcontentloaded',
      });
      // The whole parent listing at once: with the default page size a child's
      // products can legitimately sit on page two, and this would fail for a
      // reason that has nothing to do with anchoring.
      await categoryPage.changeResultsPerPage(
        data.inputs.category.listingPage.maxResultsPerPage,
      );
      const parentProducts = await categoryPage.getProductNames(1);

      // Anchor is off, or the index is stale, and a whole branch of the
      // catalogue silently stops being browsable from the top.
      expect(
        childProducts.filter((name) => parentProducts.includes(name)).length,
        "the parent listing carries the child category's products",
      ).toBeGreaterThan(0);
    },
  );
});
