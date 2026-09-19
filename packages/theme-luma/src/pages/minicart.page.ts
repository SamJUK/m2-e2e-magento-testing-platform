import { expect, type Locator, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { IMinicartPage } from './types';

export class MinicartPage implements IMinicartPage {
  readonly page: Page;
  readonly minicart: Locator;
  readonly itemCounter: Locator;

  constructor(page: Page, private data: MergedData) {
    this.page = page;
    this.minicart = page.locator('[id="minicart-content-wrapper"]');
    this.itemCounter = page.locator(data.selectors.minicart.itemCounterSelector);
  }

  /**
   * The item count as the header counter reports it.
   *
   * Luma renders the counter node empty rather than "0" when the cart is empty
   * (the count is inside a knockout `if:` binding), so blank reads as zero. The
   * counter being *live* is proven separately by asserting it reads the
   * expected non-zero count before anything is removed.
   */
  async getItemCount(): Promise<number> {
    // Not a silent skip: this is a state read, not a feature probe. The counter
    // node is detached while customer-data re-renders, and blank/absent both
    // mean "no items" here; every caller asserts on the value returned.
    const text = (await this.itemCounter.first().textContent().catch(() => ''))?.trim() ?? '';
    if (text === '') return 0;
    const count = Number.parseInt(text.replace(/[^\d]/g, ''), 10);
    return Number.isNaN(count) ? 0 : count;
  }

  getProductRow(productTitle: string): Locator {
    return this.minicart.getByRole('listitem').filter({ hasText: productTitle });
  }

  /**
   * The price on one minicart line.
   *
   * Resolved inside that line's own row, so a second product in the cart
   * cannot satisfy the read.
   */
  getItemPrice(productTitle: string): Locator {
    return this.getProductRow(productTitle).locator(
      this.data.selectors.minicart.itemPriceSelector,
    );
  }

  async ensureMinicartIsOpen(): Promise<void> {
    if (!await this.minicart.isVisible()) {
      await this.page.locator('.action.showcart').click();
      await this.minicart.waitFor({ state: 'visible' });
    }
  }

  async getProductInMinicart(productTitle: string): Promise<Locator> {
    await this.ensureMinicartIsOpen();
    return this.minicart.getByRole('strong').getByRole('link', { name: productTitle });
  }

  async removeProduct(productTitle: string): Promise<void> {
    await this.ensureMinicartIsOpen();
    const row = this.getProductRow(productTitle);
    // Without this the retry loop below is vacuous: `toBeHidden` on a locator
    // that never matched anything passes on the first tick, so the test would
    // report success even if the minicart had rendered no items at all.
    await expect(row, 'the product has exactly one minicart line before removal').toHaveCount(1, {
      timeout: 30_000,
    });
    const removeBtn = row.getByTitle(this.data.selectors.cart.productRemoveTitle);
    // Magento's standard confirm modal accept button carries .action-accept
    // regardless of its wording/theme.
    const accept = this.page.locator('aside .action-accept:visible').first();
    // Whether removal opens a confirm dialog is a store capability, not
    // something to probe for: best-effort accepting hides both a dialog that
    // stopped appearing and one that appeared where none was expected.
    const requiresConfirmation = this.data.features.minicart.removeConfirmation;

    // The remove link's JS handler binds late on deferred-JS stores (the
    // first click can be a no-op), and the confirm modal animates in — retry
    // the whole click → confirm → gone sequence until the row disappears.
    await expect(async () => {
      if (await row.isVisible()) {
        await removeBtn.click();
        if (requiresConfirmation) {
          await accept.click({ timeout: 10_000 });
        } else {
          await expect(
            accept,
            'features.minicart.removeConfirmation is false, so removal opens no confirmation dialog',
          ).toHaveCount(0, { timeout: 2_000 });
        }
      }
      // Counted, not hidden: the dropdown re-renders from customer-data after
      // the POST, so the row detaches for a moment whether or not anything was
      // removed, and toBeHidden lets a failed removal pass.
      await expect(row).toHaveCount(0, { timeout: 5_000 });
    }).toPass({ timeout: 45_000 });

    await this.page.waitForLoadState();
  }
}
