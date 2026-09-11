import { expect, type Locator, type Page } from '@playwright/test';
import { sprintf } from '@samjuk/e2e-m2-playwright-core';
import type { HyvaData } from '../data/types';
import type { IMinicartPage } from './types';

export class MinicartPage implements IMinicartPage {
  readonly page: Page;
  readonly minicart: Locator;
  readonly trigger: Locator;
  readonly itemCounter: Locator;

  constructor(page: Page, private data: HyvaData) {
    this.page = page;
    const s = data.selectors.minicart;
    // Hyvä's minicart is a real <dialog id="cart-drawer"> toggled by the
    // header cart icon — not Luma's inline dropdown.
    this.minicart = page.locator(s.drawerSelector);
    this.trigger = page.locator(s.triggerSelector);
    this.itemCounter = page.locator(s.itemCounterSelector);
  }

  /**
   * The item count as the header counter badge reports it.
   *
   * Hyvä's badge is `x-text="summaryCount"` inside an `x-show`, so it holds a
   * literal "0" while hidden; blank is treated as zero too for parity with
   * themes that empty the node. The counter being *live* is proven separately
   * by asserting it reads the expected non-zero count before anything is
   * removed.
   */
  async getItemCount(): Promise<number> {
    // Not a silent skip: this is a state read, not a feature probe. The badge
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
   * cannot satisfy the read — and so the drawer's own Subtotal, which sits
   * outside every row, can never be mistaken for a line price.
   */
  getItemPrice(productTitle: string): Locator {
    return this.getProductRow(productTitle).locator(
      this.data.selectors.minicart.itemPriceSelector,
    );
  }

  async ensureMinicartIsOpen(): Promise<void> {
    if (!(await this.minicart.isVisible())) {
      await this.trigger.click();
      await this.minicart.waitFor({ state: 'visible' });
    }
  }

  async getProductInMinicart(productTitle: string): Promise<Locator> {
    await this.ensureMinicartIsOpen();
    // Unlike Luma, the drawer's product name is not a link — it renders as
    // `<p><span x-text="qty"></span> x <strong x-text="product_name"></strong></p>`.
    // The only <a> is the thumbnail, whose accessible name comes from the img
    // alt, so matching the exact text node is the stable handle.
    return this.minicart.getByText(productTitle, { exact: true });
  }

  async removeProduct(productTitle: string): Promise<void> {
    await this.ensureMinicartIsOpen();
    // Without this the retry loop below is vacuous: `toBeHidden` on a locator
    // that never matched anything passes on the first tick, so the test would
    // report success even if the drawer had rendered no items at all.
    await expect(
      this.getProductRow(productTitle),
      'the product has exactly one minicart line before removal',
    ).toHaveCount(1, { timeout: 30_000 });

    // The remove control's accessible name is built from
    // `Remove product "%0" from cart` with the product title substituted in.
    const removeBtn = this.minicart.getByRole('button', {
      name: sprintf(this.data.selectors.minicart.removeItemAriaLabel, productTitle),
      exact: true,
    });

    // Magento's standard confirm modal accept button carries .action-accept
    // regardless of its wording/theme. Hyvä's own drawer deletes directly, so
    // the theme declares `minicart.removeConfirmation: false` — a store that
    // adds a confirmation opts back in via its config/features.json rather
    // than the suite guessing.
    const accept = this.page.locator('aside .action-accept:visible').first();
    const requiresConfirmation = this.data.features.minicart.removeConfirmation;

    // The remove control is `@click="deleteItemFromCart"` — an Alpine handler
    // that only exists once the drawer component has booted, so on
    // deferred-JS stores the first click is a silent no-op. The drawer also
    // re-renders from customer-data after the POST, which can swallow a click
    // mid-flight. Retry the whole click → gone sequence.
    await expect(async () => {
      if (await removeBtn.isVisible()) {
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
      await expect(removeBtn).toBeHidden({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });

    await this.page.waitForLoadState();
  }
}
