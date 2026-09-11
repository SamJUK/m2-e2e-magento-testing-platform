import { expect, type Locator, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';

/**
 * Shared mechanics for Magento's adminhtml UI-component grids (orders,
 * products, customers, ...). They all use the same keyword-search control and
 * the same row markup, so the page objects differ only in slug and row action.
 */

/**
 * The grid renders its search control twice — once in the toolbar and once in
 * the sticky header, both with `id="fulltext"` — so narrow to the visible copy.
 */
export function gridSearchField(page: Page, data: MergedData): Locator {
  return page
    .getByPlaceholder(data.selectors.admin.grid.searchFieldPlaceholder)
    .filter({ visible: true })
    .first();
}

/**
 * Runs the grid's keyword search and resolves with the single matching row.
 * The search re-renders the rows over AJAX, so this waits for the filtered
 * result rather than whatever was on screen when the page loaded.
 */
export async function findGridRow(
  page: Page,
  data: MergedData,
  term: string,
): Promise<Locator> {
  const row = page.locator(data.selectors.admin.grid.rowSelector, { hasText: term });

  // Retry the whole type -> submit -> filtered-rows cycle rather than just
  // waiting on the rows. The grid persists its state (filters, page, sorting)
  // server-side per admin user, so a parallel worker signed in as the same
  // account can replace the keyword mid-flight and leave this grid showing
  // somebody else's result set. The search control is also re-rendered by a UI
  // component that boots after page load, which discards a value typed too
  // early. One re-submit recovers from either.
  await expect(async () => {
    const searchField = gridSearchField(page, data);
    await searchField.fill(term);
    await expect(searchField).toHaveValue(term, { timeout: 5_000 });
    await searchField.press('Enter');
    await expect(row).toHaveCount(1, { timeout: 10_000 });
  }).toPass({ timeout: 60_000 });

  return row;
}

/** How long a grid's filtered result is given to arrive before absence counts. */
const GRID_SETTLE_MS = 3_000;

/**
 * Runs the grid's keyword search and asserts nothing matches.
 *
 * A bare `toHaveCount(0)` would be vacuous here — it passes the instant it is
 * evaluated, including against the *unfiltered* grid that is still on screen
 * while the search request is in flight. Waiting for the grid's own empty-state
 * row first proves the filtered result actually rendered before the absence is
 * asserted. Only safe to call after the row has been shown to exist.
 */
export async function expectNoGridRow(
  page: Page,
  data: MergedData,
  term: string,
): Promise<void> {
  const emptyRow = page.locator(data.selectors.admin.grid.emptyRowSelector);
  const matchingRow = page.locator(data.selectors.admin.grid.rowSelector, { hasText: term });

  // Same re-submit loop as `findGridRow`, for the same reasons.
  await expect(async () => {
    const searchField = gridSearchField(page, data);
    await searchField.fill(term);
    await expect(searchField).toHaveValue(term, { timeout: 5_000 });
    await searchField.press('Enter');

    // The grid paints its empty-state row while the filtered result is still in
    // flight, so a single `toBeVisible` here would happily pass against a grid
    // that is merely *loading* — which would make this whole assertion vacuous,
    // the exact failure it exists to prevent. Require the empty state to still
    // hold once the request has had time to land.
    await expect(emptyRow, `the grid reports no records for "${term}"`).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForTimeout(GRID_SETTLE_MS);
    await expect(
      emptyRow,
      `the grid still reports no records for "${term}" once it has settled`,
    ).toBeVisible({ timeout: 1_000 });
    await expect(matchingRow, `no grid row remains for "${term}"`).toHaveCount(0);
  }).toPass({ timeout: 90_000 });
}

/**
 * Resolves one cell of a grid row by its column's header label.
 *
 * Magento's UI-component grids render bare `<td>`s — no column id, no
 * per-column class — so a cell can only be addressed positionally, and the
 * position depends on which columns the store has enabled: the two demo stores
 * differ by three columns on the very same order grid. Reading the header row
 * of the row's OWN table is what keeps that index honest — the page carries a
 * second, sticky copy of the header, so this deliberately is not a page-level
 * lookup — and a store that drops or renames the column fails loudly here
 * rather than silently asserting against whatever value occupies that slot.
 *
 * Scanning every cell for the wanted value would be the easy alternative and is
 * not good enough: dates and postcodes parse as numbers too, so a money check
 * done that way can be satisfied by a coincidence.
 */
export async function gridCellByColumnLabel(
  row: Locator,
  data: MergedData,
  columnLabel: string,
): Promise<Locator> {
  const headerLabels = (
    await row
      .locator('xpath=ancestor::table[1]')
      .locator(data.selectors.admin.grid.columnHeaderSelector)
      .allTextContents()
  ).map((text) => text.replace(/\s+/g, ' ').trim());

  const index = headerLabels.indexOf(columnLabel);
  expect(
    index,
    `the grid has a "${columnLabel}" column (columns: ${headerLabels.join(' | ')})`,
  ).toBeGreaterThanOrEqual(0);

  return row.locator('td').nth(index);
}

/** Navigates to an admin grid and waits for the backend chrome to render. */
export async function openGrid(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('menubar')).toBeVisible();
}
