import { expect, type Locator, type Page } from '@playwright/test';
import {
  readAllMoney,
  sprintf,
  waitForFormKey,
  type MergedData,
} from '@samjuk/e2e-m2-playwright-core';
import type { ICategoryPage } from './types';

export enum Currency {
  EUR = 'EUR - Euro',
  USD = 'USD - US Dollar',
}

export class CategoryPage implements ICategoryPage {
  readonly page: Page;
  readonly sorterDropdown: Locator;
  readonly sorterDirectionToggle: Locator;
  readonly layeredNavigation: Locator;
  readonly productItems: Locator;
  readonly limiterDropdown: Locator;
  readonly pager: Locator;
  readonly breadcrumbItems: Locator;

  constructor(page: Page, private data: MergedData) {
    this.page = page;
    const s = data.selectors.categoryPage.listingPage;
    this.productItems = page.locator(s.productItemSelector);
    // Themes draw the toolbar twice (top and bottom) with all but one copy
    // hidden, so both of these narrow to the visible one.
    this.limiterDropdown = page.locator(s.limiterSelector).filter({ visible: true }).first();
    this.pager = page.locator(s.pagerSelector).filter({ visible: true }).first();
    this.breadcrumbItems = page.locator(data.selectors.breadcrumbs.itemSelector);
    // Use Amasty ShopBy toolbar if available, fallback to first toolbar-sorter.
    // Filter to visible: themes commonly render duplicate toolbars (top/bottom
    // or desktop/mobile) with all but one hidden.
    let toolbar = page
      .locator('[id="amasty-shopby-product-list"] .toolbar-sorter')
      .filter({ visible: true })
      .first();
    // If Amasty toolbar not found, use regular toolbar
    toolbar = toolbar.or(page.locator('.toolbar-sorter').filter({ visible: true }).first());
    this.sorterDropdown = toolbar.getByLabel(s.sorter);
    this.sorterDirectionToggle = toolbar.locator(s.sortOrderDirectionSelector);
    this.layeredNavigation = page.locator(s.layeredNavigation);
  }

  async changeSortOrder(order?: string): Promise<void> {
    // Sorting navigates (full reload on Luma, pushState on ajax themes).
    // Wait for the URL to change rather than networkidle — analytics
    // and marketing beacons keep real stores' network busy forever.
    const before = this.page.url();
    // The sorter's change handler binds after the markup, so a selection made
    // too early fires into nothing. Retried as one unit.
    await expect(async () => {
      await this.sorterDropdown.selectOption(
        order ?? this.data.inputs.category.listingPage.sortOrder,
      );
      await this.sorterDropdown.evaluate((el: HTMLSelectElement) => {
        el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      });
      await this.page.waitForURL((url) => url.toString() !== before, {
        waitUntil: 'domcontentloaded',
        timeout: 15_000,
      });
    }).toPass({ timeout: 90_000 });
  }

  async changeSortOrderDirection(): Promise<void> {
    await this.sorterDirectionToggle.click({ force: true });
    await this.page.waitForLoadState('networkidle');
  }

  async selectFilter(filterName: string, filterValue: string): Promise<void> {
    const filterItem = this.layeredNavigation
      .locator('.filter-options-item')
      .filter({ hasText: filterName })
      .first(); // Get first match to avoid strict mode violation if there are duplicates
    // The title is a TOGGLE, not an opener. Clicking it unconditionally opens
    // a group the theme left collapsed and closes one it left open — and a
    // store whose layered navigation is rendered by a third-party engine
    // (Smile ElasticSuite, for one) leaves them open. Open only when the value
    // is not already reachable.
    const option = filterItem.getByText(filterValue).first();
    const before = this.page.url();

    // Reveal, click and navigate as ONE retried unit.
    //
    // Luma's collapsible widget is bound by RequireJS well after the markup
    // lands and sets each group's initial state as it binds, so a group that
    // reads as open in raw HTML can collapse underneath a click already aimed
    // at it. Three separate steps cannot survive that, and neither can a
    // `trial: true` probe followed by a real click: the group closes in the
    // gap between them. Both shapes were tried and both failed here.
    //
    // Two things make retrying safe. The URL guard skips an attempt whose
    // predecessor's click has already landed, and the inner wait is long
    // enough that a slow-but-working navigation is never mistaken for a
    // swallowed click — which is what re-clicked a filter link on a loaded CI
    // runner and applied a second filter instead of retrying the first.
    await expect(async () => {
      if (this.page.url() !== before) return;
      if (!(await option.isVisible().catch(() => false))) {
        await filterItem.locator('.filter-options-title').click({ force: true });
      }
      await expect(
        option,
        `the "${filterValue}" option under "${filterName}"`,
      ).toBeVisible({ timeout: 5_000 });
      await option.click({ timeout: 5_000 });
      // Applying a filter navigates (full reload on Luma, pushState on ajax
      // themes) — wait on the URL, not networkidle (see changeSortOrder).
      await this.page.waitForURL((url) => url.toString() !== before, {
        timeout: 30_000,
        waitUntil: 'domcontentloaded',
      });
    }).toPass({ timeout: 90_000 });
  }

  /**
   * Clears every applied layered-navigation filter.
   *
   * Hyva renders the clear-all control inside a `<details>` that Alpine opens
   * once filters are applied, so the link can be in the DOM a moment before it
   * is reachable. Waiting on visibility covers both themes without either
   * having to know about the other's markup.
   */
  async clearAllFilters(): Promise<void> {
    const s = this.data.selectors.categoryPage.listingPage;
    const clearAll = this.layeredNavigation.locator(s.clearAllFiltersSelector).first();
    await expect(
      clearAll,
      'the layered navigation offers a clear-all control while filters are applied',
    ).toBeVisible({ timeout: 30_000 });

    const before = this.page.url();
    await clearAll.click();
    await this.page.waitForURL((url) => url.toString() !== before, {
      timeout: 90_000,
      waitUntil: 'domcontentloaded',
    });
  }

  /** Asserts no layered-navigation filter is applied at all. */
  async expectNoFiltersAreApplied(): Promise<void> {
    await expect(
      this.layeredNavigation.locator(this.data.selectors.categoryPage.listingPage.appliedFilterItem),
      'no filter chips remain',
    ).toHaveCount(0, { timeout: 30_000 });
  }

  async getFirstProductName(): Promise<string | null> {
    const name = this.page.locator(
      this.data.selectors.categoryPage.listingPage.firstProductName,
    );
    // Lazy-rendering themes paint skeleton placeholders (repeated ·/-/… or
    // whitespace) into the product tile before the real content arrives.
    // Reading one as "the name" makes before/after comparisons meaningless.
    // A real product name always contains a letter or digit; skeletons are
    // punctuation/whitespace only.
    // Not a silent skip: the catch feeds the poll, it does not end it. A
    // detached node during a client-side re-render reads as "not ready yet",
    // and the poll still has to satisfy the assertion below before returning.
    await expect
      .poll(async () => (await name.textContent().catch(() => null)) ?? '', {
        timeout: 30_000,
      })
      .toMatch(/[\p{L}\p{N}]/u);
    return name.textContent();
  }

  async getFirstProductPrice(): Promise<string | null> {
    // Scoped through the data-driven listing selector rather than a bare
    // `.product-item`: the minicart also renders `.product-item` nodes with
    // prices in them, so an unscoped read can return a cart line, not a tile.
    return this.page
      .locator(this.data.selectors.categoryPage.listingPage.productPrice)
      .first()
      .textContent();
  }

  /**
   * Every listed product's price, in listing order, as parsed numbers.
   *
   * Polls until at least `minCount` prices parse. Stores whose listing is
   * re-rendered client-side (Amasty/Klevu and similar) paint skeleton
   * placeholders into the tiles first, so an immediate read returns an empty
   * array — which would otherwise surface as a bare "expected > 1, got 0".
   */
  async getProductPrices(minCount = 1): Promise<number[]> {
    const locator = this.page.locator(this.data.selectors.categoryPage.listingPage.productPrice);
    let prices: number[] = [];
    await expect(async () => {
      prices = await readAllMoney(locator);
      expect(prices.length, 'listing prices have rendered').toBeGreaterThanOrEqual(minCount);
    }).toPass({ timeout: 30_000 });
    return prices;
  }

  /**
   * The layered-navigation chips describing the filters currently applied.
   * Absent entirely on an unfiltered listing, which is what makes it a real
   * assertion target: a re-render that dropped the filter renders none.
   */
  getAppliedFilter(filterName: string): Locator {
    const s = this.data.selectors.categoryPage.listingPage;
    return this.layeredNavigation
      .locator(s.appliedFilterItem)
      .filter({ has: this.page.locator(s.appliedFilterLabel, { hasText: filterName }) });
  }

  async expectFilterIsApplied(filterName: string, filterValue: string): Promise<void> {
    const s = this.data.selectors.categoryPage.listingPage;
    const chip = this.getAppliedFilter(filterName);
    await expect(chip, `"${filterName}" shows as an applied filter`).toHaveCount(1, {
      timeout: 20_000,
    });
    await expect(
      chip.locator(s.appliedFilterValue),
      `the applied "${filterName}" filter is "${filterValue}"`,
    ).toHaveText(filterValue, { timeout: 20_000 });
  }

  /**
   * Every listed product's name, in listing order.
   *
   * Polls until at least `minCount` names have rendered, for the same reason
   * `getProductPrices` does: a client-side re-render paints empty tiles first,
   * and an immediate read returns blanks. Blank entries are dropped — Luma
   * emits an extra, empty `product-item-link` for its sidebar templates.
   */
  async getProductNames(minCount = 1): Promise<string[]> {
    const s = this.data.selectors.categoryPage.listingPage;
    const locator = this.productItems.locator(s.productItemNameSelector);
    let names: string[] = [];
    await expect(async () => {
      names = (await locator.allInnerTexts())
        .map((name) => name.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      expect(names.length, 'listing product names have rendered').toBeGreaterThanOrEqual(
        minCount,
      );
    }).toPass({ timeout: 30_000 });
    return names;
  }

  /**
   * Chooses a results-per-page option and waits for the listing that comes back.
   *
   * The wait is on the store recording the choice in the URL, not on a tile
   * count: waiting for the count would make the caller's assertion about that
   * count circular.
   */
  async changeResultsPerPage(limit: string): Promise<void> {
    await expect(
      this.limiterDropdown,
      `the listing offers a "${limit} per page" option`,
    ).toHaveCount(1);

    const before = this.page.url();

    // Retried, and only after Magento's own JS has run.
    //
    // The limiter is a plain `<select>`; the navigation is done by the
    // Magento_Catalog toolbar widget's `change` handler. Setting the value
    // before that handler is bound fires a `change` nothing is listening for,
    // and the option stays selected while the page never moves - which reads
    // as "the store ignored the limiter" rather than "the page was still
    // booting". Waiting for the form key first proves Magento's JS has
    // executed at all; re-selecting covers the window between that and the
    // toolbar's own binding.
    await waitForFormKey(this.page);
    await expect(async () => {
      await this.limiterDropdown.selectOption(limit);
      await this.page.waitForURL((url) => url.toString() !== before, {
        waitUntil: 'domcontentloaded',
        timeout: 15_000,
      });
    }).toPass({ timeout: 90_000 });
  }

  /**
   * Follows the pager to `pageNumber` by clicking its own link.
   *
   * Deliberately a click rather than a `goto` of `?p=n`: the point of the test
   * is that the pager the customer sees works, and a store whose pager renders
   * dead links would still pass a direct navigation.
   */
  async goToPage(pageNumber: number): Promise<void> {
    const s = this.data.selectors.categoryPage.listingPage;
    // The "next" arrow points at the same URL as the numbered link, so both
    // match — either is the control under test.
    const link = this.pager.locator(sprintf(s.pageLinkSelector, String(pageNumber))).first();
    await expect(link, `the pager offers a link to page ${pageNumber}`).toHaveCount(1);

    const before = this.page.url();
    await link.click();
    await this.page.waitForURL((url) => url.toString() !== before, {
      waitUntil: 'domcontentloaded',
    });
  }

  /**
   * The breadcrumb trail of whatever page is currently open, outermost first.
   *
   * Lives here rather than on a page object of its own because both stock
   * themes render one shared breadcrumb block, on category and product pages
   * alike. Hyvä prefixes every entry after the first with a `/` separator span,
   * which is stripped so the two themes yield the same trail.
   */
  async getBreadcrumbTrail(): Promise<string[]> {
    await expect(this.breadcrumbItems.first(), 'the page renders breadcrumbs').toBeVisible({
      timeout: 30_000,
    });
    return (await this.breadcrumbItems.allInnerTexts()).map((item) =>
      item.replace(/\s+/g, ' ').trim().replace(/^\/\s*/, '').trim(),
    );
  }

  /**
   * Switches the store's display currency through the header switcher.
   *
   * Luma's currency options are `data-post` links (`href="#"`), so the switch
   * is a POST that Magento's own delegated handler builds. Clicked before that
   * handler is bound the link is inert and the page simply does not move, so
   * the click is retried until the POST is actually made - and awaited, rather
   * than trusting `networkidle`, which settles happily on a click that did
   * nothing at all.
   */
  async changeCurrency(currency: Currency): Promise<void> {
    await waitForFormKey(this.page);
    await expect(async () => {
      await this.page.locator('[id="switcher-currency-trigger"]').click();
      const posted = this.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('directory/currency/switch'),
        { timeout: 15_000 },
      );
      await this.page.getByRole('link', { name: currency }).first().click();
      await posted;
    }).toPass({ timeout: 90_000 });
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * The listing's total result count, read off the toolbar.
   *
   * Magento words it "12 Items" on a single page and "Items 1-9 of 12" once it
   * paginates, so the last integer is the total in both shapes. Counting tiles
   * instead would silently measure a page rather than a result set.
   */
  async getResultCount(): Promise<number> {
    const amount = this.page
      .locator(this.data.selectors.categoryPage.listingPage.toolbarAmountSelector)
      .filter({ visible: true })
      .first();

    let total: number | null = null;
    await expect(async () => {
      const text = (await amount.textContent()) ?? '';
      const numbers = text.match(/\d+/g);
      expect(numbers, `the toolbar reports a result count (read "${text.trim()}")`).not.toBeNull();
      total = Number(numbers![numbers!.length - 1]);
    }).toPass({ timeout: 30_000 });

    return total!;
  }

  /** The sorter's current selection, as its visible option text. */
  async getSelectedSortOrder(): Promise<string> {
    const selected = this.sorterDropdown.locator('option[selected], option:checked').first();
    return ((await selected.textContent()) ?? '').trim();
  }

  /**
   * The result count Magento prints beside a layered-navigation option.
   *
   * Read before the filter is applied, so it can be compared against what the
   * filter actually returns. A facet that advertises a count it cannot deliver
   * is the classic symptom of a stale catalog index, and it is invisible until
   * someone clicks it.
   */
  async getFilterOptionCount(filterName: string, filterValue: string): Promise<number> {
    const filterItem = this.layeredNavigation
      .locator('.filter-options-item')
      .filter({ hasText: filterName })
      .first();
    const option = filterItem.getByText(filterValue).first();

    let count: number | null = null;
    await expect(async () => {
      if (!(await option.isVisible().catch(() => false))) {
        await filterItem.locator('.filter-options-title').click({ force: true });
      }
      await expect(option).toBeVisible({ timeout: 5_000 });
      // The count lives on the option's ROW, not on the label itself.
      const row = filterItem.locator('li').filter({ hasText: filterValue }).first();
      const text = (await row.textContent()) ?? '';
      const numbers = text.match(/\d+/g);
      expect(
        numbers,
        `the "${filterValue}" option advertises a count (read "${text.trim()}")`,
      ).not.toBeNull();
      count = Number(numbers![numbers!.length - 1]);
    }).toPass({ timeout: 60_000 });

    return count!;
  }
}
