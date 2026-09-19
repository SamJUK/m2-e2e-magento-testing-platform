import { expect, type Locator, type Page } from '@playwright/test';
import { readMoney, waitForFormKey, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { ICartPage } from './types';

export class CartPage implements ICartPage {
  readonly page: Page;
  readonly subtotal: Locator;
  readonly discountBasisSubtotal: Locator;
  readonly grandTotal: Locator;
  readonly discountTotal: Locator;
  readonly couponForm: Locator;
  readonly couponFormToggle: Locator;
  readonly couponField: Locator;
  readonly applyCouponButton: Locator;
  readonly cancelCouponButton: Locator;

  constructor(page: Page, private data: MergedData) {
    this.page = page;
    const s = data.selectors.cart;
    this.subtotal = page.locator(s.subtotalSelector);
    // Normally the same node as `subtotal`. It is separate so a store showing
    // both inc- and exc-VAT prices can point the coupon arithmetic at the
    // basis Magento actually computes the discount on, which need not be the
    // basis its line totals are displayed in. See the selector's comment.
    this.discountBasisSubtotal = page.locator(s.discountBasisSubtotalSelector);
    this.grandTotal = page.locator(s.grandTotalSelector);
    this.discountTotal = page.locator(s.discountTotalSelector);
    this.couponForm = page.locator(s.couponFormSelector);
    this.couponFormToggle = page.locator(s.couponFormToggle);
    this.couponField = page.locator(s.couponFieldSelector);
    // Scoped to the coupon form: the cart page's shipping estimator and its
    // clear-cart dialog both put submit buttons in range of an unscoped
    // accessible-name match.
    this.applyCouponButton = this.couponForm.getByRole('button', {
      name: s.applyCouponButtonLabel,
    });
    this.cancelCouponButton = this.couponForm.getByRole('button', {
      name: s.cancelCouponButtonLabel,
    });
  }

  /** Re-requests the cart so every subsequent read comes from the server. */
  async open(): Promise<void> {
    await this.page.goto(this.data.slugs.cart, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Reveals the coupon form.
   *
   * Magento collapses it behind a `collapsible` widget whose handler is bound
   * after the page settles, so an early click is silently dropped; and the
   * block is already expanded when a coupon is applied, where a second click
   * would close it again. Retry until the field is genuinely reachable.
   */
  private async openCouponForm(): Promise<void> {
    await expect(async () => {
      if (!(await this.couponField.isVisible())) {
        await this.couponFormToggle.first().click();
      }
      await expect(this.couponField).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
  }

  async applyCoupon(code: string): Promise<void> {
    await this.openCouponForm();
    await this.couponField.fill(code);
    // Luma's Apply control is a plain <button type="button"> driven by the
    // discountCode widget, which submits the coupon form: a POST plus a
    // redirect back to the cart. That navigation has to be awaited, or the
    // assertions below race a page that is still the pre-submit document.
    const cartReloaded = this.page.waitForEvent('load', { timeout: 45_000 });
    await this.applyCouponButton.click();
    await cartReloaded;
  }

  async removeCoupon(): Promise<void> {
    await this.openCouponForm();
    const cartReloaded = this.page.waitForEvent('load', { timeout: 45_000 });
    await this.cancelCouponButton.click();
    await cartReloaded;
  }

  /**
   * The `features.cart.couponForm: false` branch. A store that declares it has
   * no coupon form must actually not render one — if it regains one, this
   * fails rather than leaving the coupon behaviour quietly untested.
   */
  async expectCouponFormIsAbsent(): Promise<void> {
    await this.open();
    await expect(
      this.couponField,
      'the store declares no coupon form (features.cart.couponForm) and renders none',
    ).toHaveCount(0);
  }

  getProductRow(productTitle: string): Locator {
    return this.page.locator(this.data.selectors.cart.cartItemSelector, { hasText: productTitle });
  }

  /** The line's unit price cell. */
  getUnitPrice(productTitle: string): Locator {
    return this.getProductRow(productTitle).locator(this.data.selectors.cart.unitPriceSelector);
  }

  /** The line's row total cell (unit price x quantity). */
  getLineTotal(productTitle: string): Locator {
    return this.getProductRow(productTitle).locator(this.data.selectors.cart.lineTotalSelector);
  }

  getQuantityField(productTitle: string): Locator {
    return this.getProductRow(productTitle).getByTitle(this.data.selectors.cart.productQuantityLabel);
  }

  /**
   * Asserts the money on the cart page adds up.
   *
   * Every amount is read as a parsed number off a single element, never as a
   * string and never off a locator that could match both the inc- and exc-VAT
   * copy of the same figure (see `readMoney`). A store that silently stops
   * calculating row totals — or renders them as an empty node — fails here.
   */
  async expectTotalsAreCoherent(productTitle: string): Promise<void> {
    const quantity = Number(await this.getQuantityField(productTitle).inputValue());
    const unitPrice = await readMoney(this.getUnitPrice(productTitle), 'cart line unit price');
    const lineTotal = await readMoney(this.getLineTotal(productTitle), 'cart line total');
    const subtotal = await readMoney(this.subtotal, 'cart subtotal');
    const grandTotal = await readMoney(this.grandTotal, 'cart grand total');

    expect(quantity, 'cart line quantity is at least one').toBeGreaterThanOrEqual(1);
    expect(unitPrice, 'cart line unit price is greater than zero').toBeGreaterThan(0);
    // A VAT-inclusive store rounds the unit price it displays but computes the
    // row from the unrounded ex-tax figure, so the two can differ by up to half
    // a penny per unit.
    expect(
      Math.abs(lineTotal - unitPrice * quantity),
      `cart line total is the unit price x ${quantity}`,
    ).toBeLessThanOrEqual(0.005 * (quantity + 1));

    const lineCount = await this.page.locator(this.data.selectors.cart.cartItemSelector).count();
    if (lineCount === 1) {
      expect(subtotal, 'cart subtotal equals the only line total').toBeCloseTo(lineTotal, 2);
    } else {
      expect(subtotal, 'cart subtotal covers this line total').toBeGreaterThanOrEqual(
        lineTotal - 0.005,
      );
    }
    // Deliberately not tied to the subtotal: shipping estimates push the grand
    // total up and cart rules push it down, so only its presence and sign are
    // universally true. The strong arithmetic lives in the two checks above.
    expect(grandTotal, 'cart grand total is a positive amount').toBeGreaterThan(0);
  }

  async removeProduct(productTitle: string): Promise<void> {
    const row = this.getProductRow(productTitle);
    await expect(row, 'the product has exactly one cart line before removal').toHaveCount(1);
    const removeBtn = row.getByTitle(this.data.selectors.cart.productRemoveTitle);
    const confirmationPopup = this.page.locator(
      `aside:has-text("${this.data.selectors.cart.confirmationPopupText}")`,
    );

    // Luma's remove control is a `data-post` link with no href, handled by a
    // click Magento delegates from the document. Clicked before that handler
    // is bound it makes no request at all and the line simply stays — which
    // looks exactly like a store that refused the removal. Retry on the POST
    // rather than on the line disappearing, so only a click that did nothing
    // is repeated and a slow delete is never sent twice.
    await waitForFormKey(this.page);
    await expect(async () => {
      if ((await this.getProductRow(productTitle).count()) === 0) return;

      const posted = this.page
        .waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url().includes('checkout/cart/delete'),
          { timeout: 15_000 },
        )
        .catch(() => null);
      await removeBtn.click();
      if (await confirmationPopup.isVisible()) {
        await confirmationPopup
          .getByRole('button', { name: this.data.selectors.cart.confirmationPopupAccept })
          .click();
      }
      expect(await posted, 'the removal was posted to the store').not.toBeNull();
    }).toPass({ timeout: 90_000 });

    await expect(this.getProductRow(productTitle), 'Product is no longer in cart').toBeHidden({ timeout: 15_000 });
    await expect(removeBtn, 'Remove item button is no longer visible').toBeHidden();
  }

  async changeProductQuantity(productTitle: string, quantity?: number): Promise<void> {
    const quantityInput = this.getQuantityField(productTitle);
    const unitPrice = await readMoney(this.getUnitPrice(productTitle), 'cart line unit price');

    const newQty = quantity ?? Number(await quantityInput.inputValue()) + 1;

    await quantityInput.fill(String(newQty));
    // Luma's Update control submits the cart form: a full POST plus redirect.
    // That navigation has to be allowed to finish — a `goto` issued while it is
    // in flight cancels it (ERR_ABORTED) and the quantity never reaches the
    // quote. `waitForLoadState()` alone does not cover it: the click first
    // fires an ajax `updateItemQty` and the form POST follows a beat later, so
    // the page still counts as loaded at that moment. Wait for the document
    // the redirect brings back instead.
    const cartReloaded = this.page.waitForEvent('load', { timeout: 30_000 });
    // Luma sets title="Update Shopping Cart"; other themes render a plain
    // "Update" button with no title, so match the accessible name instead.
    await this.page
      .getByRole('button', { name: this.data.selectors.cart.productUpdateButtonTitle })
      .first()
      .click();
    await cartReloaded;

    // Reading back the field this test just typed into proves nothing: it would
    // still hold the new value if the update never reached the quote. Re-request
    // the cart so both the quantity and the money below come from the server.
    await this.page.goto(this.data.slugs.cart, { waitUntil: 'domcontentloaded' });

    await expect(
      this.getQuantityField(productTitle),
      'quantity persisted server-side',
    ).toHaveValue(String(newQty), { timeout: 15_000 });

    const lineTotal = await readMoney(this.getLineTotal(productTitle), 'cart line total');
    expect(lineTotal, `cart line total tracked the quantity change to ${newQty}`).toBeCloseTo(
      unitPrice * newQty,
      2,
    );
    await this.expectTotalsAreCoherent(productTitle);
  }
}
