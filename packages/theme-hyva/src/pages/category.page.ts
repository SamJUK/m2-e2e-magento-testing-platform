import { expect, type Locator, type Page } from '@playwright/test';
import { readAllMoney, sprintf } from '@samjuk/e2e-m2-playwright-core';
import type { HyvaData } from '../data/types';
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

  constructor(page: Page, private data: HyvaData) {
    this.page = page;
    const s = data.selectors.categoryPage.listingPage;
    this.productItems = page.locator(s.productItemSelector);
    // Themes draw the toolbar twice (top and bottom) with all but one copy
    // hidden, so both of these narrow to the visible one.
    this.limiterDropdown = page.locator(s.limiterSelector).filter({ visible: true }).first();
    this.pager = page.locator(s.pagerSelector).filter({ visible: true }).first();
    this.breadcrumbItems = page.locator(data.selectors.breadcrumbs.itemSelector);
    // Hyvä renders a toolbar above *and* below the list, but only the top one
    // contains the sorter, so `.toolbar-sorter` is already unambiguous in the
    // stock theme. Filter to visible anyway: layered-nav extensions (Amasty
    // ShopBy et al.) render duplicate toolbars with all but one hidden.
    const toolbar = page.locator('.toolbar-sorter').filter({ visible: true }).first();
    this.sorterDropdown = toolbar.locator(s.sorterSelector);
    this.sorterDirectionToggle = toolbar.locator(s.sortOrderDirectionSelector);
    this.layeredNavigation = page.locator(s.layeredNavigation);
  }

  async changeSortOrder(order?: string): Promise<void> {
    const wanted = order ?? this.data.inputs.category.listingPage.sortOrder;
    // Option text is rewritten/padded by the template, so resolve the option's
    // value from its visible text rather than selecting by label.
    const value = await this.sorterDropdown
      .locator('option')
      .filter({ hasText: wanted })
      .first()
      .getAttribute('value');

    // Sorting navigates (full reload here, pushState on ajax themes). Wait for
    // the URL to change rather than networkidle — analytics and marketing
    // beacons keep real stores' network busy forever.
    const before = this.page.url();
    // The sorter's change handler binds after the markup, so a selection made
    // too early fires into nothing. Retried as one unit.
    await expect(async () => {
      // A previous attempt's navigation may have landed late; selecting again
      // would queue a second one and return with it still in flight.
      if (this.page.url() !== before) return;
      await this.sorterDropdown.selectOption(value ?? wanted.toLowerCase(), { timeout: 15_000 });
      await this.page.waitForURL((url) => url.toString() !== before, {
        waitUntil: 'domcontentloaded',
        timeout: 15_000,
      });
    }).toPass({ timeout: 90_000 });
  }

  async changeSortOrderDirection(): Promise<void> {
    await this.sorterDirectionToggle.click();
    await this.page.waitForLoadState('networkidle');
  }

  async selectFilter(filterName: string, filterValue: string): Promise<void> {
    const s = this.data.selectors.categoryPage.listingPage;
    // Each Hyvä filter group is a native <details> that starts collapsed, so
    // the <summary> must be opened before its options are clickable.
    const filterItem = this.layeredNavigation
      .locator(s.filterGroupSelector)
      .filter({ hasText: filterName })
      .first();

    // The <summary> is a TOGGLE, not an opener: clicking it unconditionally
    // closes a group that something else already opened — a store whose
    // layered navigation is rendered by a third-party engine leaves them open.
    const option = filterItem
      .locator('.filter-options-content')
      .getByText(filterValue, { exact: true })
      .first();
    const before = this.page.url();

    // Reveal, click and navigate as ONE retried unit. The disclosure state is
    // set by script after the markup lands, so a group can close underneath a
    // click already aimed at it, and a `trial: true` probe followed by a real
    // click loses the same race in the gap between the two.
    //
    // The URL guard skips an attempt whose predecessor's click already landed,
    // and the inner wait is long enough that a slow-but-working navigation is
    // not mistaken for a swallowed click.
    await expect(async () => {
      if (this.page.url() !== before) return;
      if (!(await option.isVisible().catch(() => false))) {
        await filterItem.locator(s.filterGroupTitleSelector).click();
      }
      await expect(
        option,
        `the "${filterValue}" option under "${filterName}"`,
      ).toBeVisible({ timeout: 5_000 });
      await option.click({ timeout: 5_000 });
      // Applying a filter navigates (full reload here, pushState on ajax
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
   * Hyvä renders the applied-filter chips in the `<summary>` of a native
   * `<details>` and the clear-all control in its body, so the chips can be on
   * screen while the link itself is unreachable: the disclosure has to be
   * opened first.
   */
  async clearAllFilters(): Promise<void> {
    const s = this.data.selectors.categoryPage.listingPage;
    const clearAll = this.layeredNavigation.locator(s.clearAllFiltersSelector).first();
    const before = this.page.url();

    // No retry loop here, unlike selectFilter. The chips live in a native
    // <details> that needs no script to open, so there is no late-binding
    // widget to close it underneath a click: opening it once is enough. What
    // the first CI run got wrong was the budget, not the sequence, so these
    // are generous rather than retried.
    if (!(await clearAll.isVisible().catch(() => false))) {
      await this.layeredNavigation.locator(s.appliedFiltersDisclosureTitleSelector).first().click();
    }
    await expect(
      clearAll,
      'the layered navigation offers a clear-all control while filters are applied',
    ).toBeVisible({ timeout: 30_000 });

    await clearAll.click({ timeout: 30_000 });
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
    const name = this.page
      .locator(this.data.selectors.categoryPage.listingPage.firstProductName)
      .first();
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
   *
   * Hyvä puts these in a collapsed `<details class="filter-current">`, so the
   * chip is present but not visible — assert on its text, never on visibility.
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
    await this.limiterDropdown.selectOption(limit);
    await this.page.waitForURL((url) => url.toString() !== before, {
      waitUntil: 'domcontentloaded',
    });
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

  async changeCurrency(currency: Currency): Promise<void> {
    // The switcher is an Alpine dropdown: a toggle button plus an x-show nav
    // whose entries are <button role="link">, not anchors.
    await this.page.locator(this.data.selectors.currencySwitcher.triggerSelector).click();
    await this.page.getByRole('link', { name: currency }).click();
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
      .locator(this.data.selectors.categoryPage.listingPage.filterGroupSelector)
      .filter({ hasText: filterName })
      .first();
    const option = filterItem.getByText(filterValue, { exact: true }).first();

    let count: number | null = null;
    await expect(async () => {
      if (!(await option.isVisible().catch(() => false))) {
        await filterItem.locator(this.data.selectors.categoryPage.listingPage.filterGroupTitleSelector).click();
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
