import { expect, type Locator, type Page } from '@playwright/test';
import { readMoney, sprintf } from '@samjuk/e2e-m2-playwright-core';
import type { HyvaData } from '../data/types';
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

  constructor(page: Page, private data: HyvaData) {
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
    // Scoped to the coupon form: the cart page also carries "Apply Discount"
    // nowhere else today, but the shipping estimator and the clear-cart dialog
    // both put submit buttons in range of an unscoped accessible-name match.
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
   * Hyvä wraps it in a `<details>` whose open state is bound to Alpine
   * (`:open="showCouponForm"`, restored from browser storage), so it can start
   * either way and an early click lands before Alpine binds the summary.
   * Retry until the field is genuinely reachable.
   */
  private async openCouponForm(): Promise<void> {
    await expect(async () => {
      if (!(await this.couponField.isVisible())) {
        await this.couponFormToggle.first().click();
      }
      await expect(this.couponField).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
  }

  /**
   * Submits the coupon form and waits for the POST it makes.
   *
   * The form is `@submit.prevent`: `hyva.postCart` sends it with fetch and
   * swaps the response into `#maincontent`, so there is no navigation to
   * await. Waiting on the POST keeps the caller from reading a DOM that is
   * still the pre-submit document; the caller then asserts the flash message,
   * which is what actually proves the swap landed.
   */
  private async submitCouponForm(button: Locator): Promise<void> {
    const posted = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(this.data.slugs.cart),
      { timeout: 45_000 },
    );
    await button.click();
    await posted;
  }

  async applyCoupon(code: string): Promise<void> {
    await this.openCouponForm();
    await this.couponField.fill(code);
    await this.submitCouponForm(this.applyCouponButton);
  }

  async removeCoupon(): Promise<void> {
    await this.openCouponForm();
    await this.submitCouponForm(this.cancelCouponButton);
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
    return this.page.locator(this.data.selectors.cart.cartItemSelector, {
      hasText: productTitle,
    });
  }

  /**
   * The line's unit price.
   *
   * Hyvä has no price *columns*: both amounts sit in one `.price-box`, the unit
   * price then the row total, each labelled only by a `.sr-only` caption. They
   * are addressed from the END of the box, not the start: once the quantity
   * exceeds one, Hyvä prepends a `<span>2 x</span>` and any `:first-child`
   * assumption silently stops matching the price.
   */
  getUnitPrice(productTitle: string): Locator {
    return this.getProductRow(productTitle).locator(this.data.selectors.cart.unitPriceSelector);
  }

  /** The line's row total (unit price x quantity). */
  getLineTotal(productTitle: string): Locator {
    return this.getProductRow(productTitle).locator(this.data.selectors.cart.lineTotalSelector);
  }

  getQuantityField(productTitle: string): Locator {
    return this.getProductRow(productTitle).locator(
      this.data.selectors.cart.quantityFieldSelector,
    );
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
    await expect(
      this.getProductRow(productTitle),
      'the product has exactly one cart line before removal',
    ).toHaveCount(1);

    // Hyvä's cart page has no confirmation modal for a single line item — the
    // remove button posts a generated form and the page navigates. (The
    // "Clear Shopping Cart" action is the only one that opens a dialog.)
    // Scoped to the line, and matched on either control shape: themes render
    // this as a button labelled with the product, or as a plain link with a
    // fixed title and no product name at all.
    const label = sprintf(this.data.selectors.cart.removeItemAriaLabel, productTitle);
    const row = this.getProductRow(productTitle);
    const removeBtn = row
      .getByRole('button', { name: label, exact: true })
      .or(row.getByRole('link', { name: label, exact: true }))
      .or(row.getByTitle(label, { exact: true }))
      .filter({ visible: true })
      .first();
    await removeBtn.click();

    await expect(
      this.getProductRow(productTitle),
      'Product is no longer in cart',
    ).toBeHidden({ timeout: 15_000 });
  }

  async changeProductQuantity(productTitle: string, quantity?: number): Promise<void> {
    const s = this.data.selectors.cart;
    const quantityInput = this.getQuantityField(productTitle);
    const unitPrice = await readMoney(this.getUnitPrice(productTitle), 'cart line unit price');

    const newQty = quantity ?? Number(await quantityInput.inputValue()) + 1;

    await quantityInput.fill(String(newQty));
    // The update form is `@submit.prevent="postCart"`: it POSTs via fetch and
    // swaps `#maincontent` in place, so there is no navigation to await — and
    // re-reading the field this test just typed into would prove nothing
    // either way. Wait on the POST itself, or the `goto` below cancels it and
    // the quantity never reaches the quote.
    const cartUpdated = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes(this.data.slugs.cart),
      { timeout: 30_000 },
    );
    await this.page.locator(s.updateButtonSelector).click();
    await cartUpdated;

    // Re-request the cart so both the quantity and the money below come from
    // the server rather than from the DOM this test just wrote to.
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
