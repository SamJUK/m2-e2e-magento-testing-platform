import { expect, type Locator, type Page } from '@playwright/test';
import { sprintf } from '@samjuk/e2e-m2-playwright-core';
import type { HyvaData } from '../data/types';
import type { ICheckoutPage, CheckoutAddress, CheckoutOrderData } from './types';

export type { CheckoutOrderData, CheckoutAddress } from './types';

/**
 * Hyvä's default theme ships **no checkout implementation** — its
 * `Magento_Checkout/layout/checkout_index_index.xml` replaces the `content`
 * container with a "No Checkout module installed." placeholder. A store must
 * add one of:
 *
 *   - `hyva-themes/magento2-luma-checkout` (Luma Fallback — stock Knockout)
 *   - `hyva-themes/magento2-checkout`      (Hyvä Checkout, paid)
 *   - another third-party checkout
 *
 * This page object targets the **Luma Fallback** checkout, which restores
 * Magento's stock Knockout `checkout.root` component. Its DOM is the same
 * `#checkout` / `#checkoutSteps` / `#shipping` structure Luma renders — the
 * Order Summary and the discount form included — so this mirrors
 * `@samjuk/e2e-m2-theme-luma`'s implementation. Only the guard below is
 * Hyvä-specific.
 *
 * If a store swaps in Hyvä Checkout (Magewire-based, entirely different DOM),
 * this class needs replacing rather than adjusting.
 */
export class CheckoutPage implements ICheckoutPage {
  readonly page: Page;
  readonly summary: Locator;
  readonly summaryItems: Locator;
  readonly summaryItemsToggle: Locator;
  readonly summarySubtotal: Locator;
  readonly summaryDiscountBasisSubtotal: Locator;
  readonly summaryShipping: Locator;
  readonly summaryTax: Locator;
  readonly summaryGrandTotal: Locator;
  readonly summaryDiscount: Locator;
  readonly couponForm: Locator;
  readonly couponFormToggle: Locator;
  readonly couponField: Locator;
  readonly applyCouponButton: Locator;
  readonly cancelCouponButton: Locator;

  constructor(page: Page, private data: HyvaData) {
    this.page = page;
    const summary = data.selectors.checkout.summary;
    this.summary = page.locator(summary.block);
    this.summaryItems = page.locator(summary.itemSelector);
    this.summaryItemsToggle = page.locator(summary.itemsToggle);
    this.summarySubtotal = page.locator(summary.subtotalSelector);
    // Normally the same node as `summarySubtotal`. Separate so a store showing
    // both inc- and exc-VAT prices can point the coupon arithmetic at the basis
    // Magento actually computes the discount on. See the selector's comment.
    this.summaryDiscountBasisSubtotal = page.locator(summary.discountBasisSubtotalSelector);
    this.summaryShipping = page.locator(summary.shippingSelector);
    this.summaryTax = page.locator(summary.taxSelector);
    this.summaryGrandTotal = page.locator(summary.grandTotalSelector);
    this.summaryDiscount = page.locator(summary.discountTotalSelector);

    const coupon = data.selectors.checkout.coupon;
    this.couponForm = page.locator(coupon.formSelector);
    this.couponFormToggle = page.locator(coupon.formToggle);
    this.couponField = page.locator(coupon.fieldSelector);
    // Scoped to the discount form: the payment step also carries the Place
    // Order button and, on many stores, a store-credit form with buttons in
    // range of an unscoped accessible-name match.
    this.applyCouponButton = this.couponForm.getByRole('button', {
      name: coupon.applyButtonLabel,
    });
    this.cancelCouponButton = this.couponForm.getByRole('button', {
      name: coupon.cancelButtonLabel,
    });
  }

  /**
   * Fails fast with an actionable message when the store has no checkout
   * module, instead of timing out against selectors that cannot exist.
   */
  async assertCheckoutModuleInstalled(): Promise<void> {
    const placeholder = this.page.getByText('No Checkout module installed.');
    // Not a silent skip: this read only decides whether to raise a better
    // error message. Nothing is skipped either way — when the placeholder is
    // absent the checkout run continues and asserts as normal.
    if (await placeholder.isVisible().catch(() => false)) {
      throw new Error(
        'No checkout module is installed on this store. Hyvä ships no checkout ' +
        'of its own — install the Luma Fallback Checkout ' +
        '(hyva-themes/magento2-luma-checkout) or Hyvä Checkout ' +
        '(hyva-themes/magento2-checkout) before running checkout specs.',
      );
    }
  }

  /**
   * Drives checkout as far as the payment step: address, shipping rate,
   * payment method and agreements, everything short of submitting.
   *
   * Split out of `placeOrder` so the money on the payment step can be read and
   * asserted — totals, the discount a coupon applies, the method the order
   * will be recorded against — without every such test having to place (and
   * pay for) an order it does not need.
   */
  async proceedToPayment(order: CheckoutOrderData): Promise<void> {
    await this.assertCheckoutModuleInstalled();

    const s = this.data.selectors.checkout;

    // Shipping / billing step. Scoping to #shipping is load-bearing under Hyvä:
    // the theme's persistent header login drawer also labels a field
    // "Email Address", as does the checkout's own Sign In popup.
    const shippingForm = this.page.locator('#shipping');

    // The email field is guest-only. Probing the DOM for it races Knockout's
    // render, so read the server-inlined checkoutConfig instead.
    await this.page.waitForFunction(() => 'checkoutConfig' in window, undefined, {
      timeout: 45_000,
    });
    const config = await this.page.evaluate(
      () =>
        (
          window as unknown as {
            checkoutConfig: {
              isCustomerLoggedIn?: boolean;
              customerData?: { addresses?: Record<string, unknown> };
            };
          }
        ).checkoutConfig,
    );
    const isGuest = !config.isCustomerLoggedIn;
    const savedAddressCount = Object.keys(config.customerData?.addresses ?? {}).length;

    if (isGuest) {
      const emailField = shippingForm.getByLabel(s.billing.emailFieldLabel);
      // checkoutConfig arriving does not mean Knockout has rendered the form.
      await expect(emailField, 'the guest checkout email field is ready').toBeEditable({
        timeout: 120_000,
      });
      await emailField.fill(order.email);
    }

    if (savedAddressCount > 0) {
      await this.selectSavedShippingAddress();
    } else {
      await this.fillNewShippingAddress(order);
    }

    await this.selectShippingMethodAndPay();
  }

  /**
   * Submits the order from the payment step and returns its increment ID.
   * `proceedToPayment` must have run first.
   */
  async submitOrder(): Promise<string> {
    const s = this.data.selectors.checkout;
    const f = this.data.fixtures.checkout;

    // Place order. Order placement + the success-page render can each take
    // >10s on a dev-mode store, so wait out the navigation explicitly
    // instead of racing the expect timeout.
    // The button enables only once the payment method is actually applied to
    // the quote; clicking earlier is a no-op that never navigates. Retry
    // until the success page is reached.
    const placeOrder = this.page.getByRole('button', { name: s.placeOrderButtonLabel });

    // The retry must never re-click Place Order once the order has been
    // submitted. Placement is a POST to .../payment-information; if that
    // succeeds but the success page takes longer than the wait below to
    // arrive — routine on a cold dev-mode store — a second click places a
    // SECOND real order. On a store wired to payment capture, order emails or
    // an ERP feed, that duplicate escapes downstream before any database
    // restore can undo it.
    //
    // Matched on the exact path, not a substring: the payment step earlier in
    // this flow POSTs to .../set-payment-information, whose URL also contains
    // "payment-information". Treating that as placement would stop the click
    // ever happening. get-payment-information shares the path but is a GET.
    let placed = false;
    const watchForPlacement = (request: { method: () => string; url: () => string }) => {
      if (request.method() !== 'POST') return;
      try {
        if (new URL(request.url()).pathname.endsWith('/payment-information')) placed = true;
      } catch {
        // Not a parseable URL; nothing to match against.
      }
    };
    this.page.on('request', watchForPlacement);
    try {
      await expect(async () => {
        if (!placed) {
          await expect(placeOrder).toBeEnabled({ timeout: 15_000 });
          await placeOrder.click();
        }
        await this.page.waitForURL('**/checkout/onepage/success/**', { timeout: 45_000 });
      }).toPass({ timeout: 120_000 });
    } finally {
      this.page.off('request', watchForPlacement);
    }
    await this.page.waitForLoadState('domcontentloaded');

    await expect(
      this.page.getByRole('heading', { name: f.success.headingText }),
    ).toBeVisible();

    // Guests get "Your order # is: <span>", logged-in customers get
    // "Your order number is: <a>" — one regex covers both wordings. Hyvä's
    // success.phtml renders both variants under the same `.checkout-success`.
    const successBlock = this.page.locator(s.success.block);
    await expect(successBlock).toContainText(
      new RegExp(f.success.orderNumberTextRegex),
    );

    const orderNumber = (await successBlock.innerText()).match(/\d{6,}/)?.[0];
    expect(orderNumber, 'success page shows an order increment ID').toBeTruthy();
    return orderNumber as string;
  }

  /**
   * Asserts the shipping step refuses an address missing a required field.
   *
   * Every other field is filled and only the street is cleared, so what gets
   * refused is provably the missing field rather than an empty form. Street is
   * the field chosen because it is required for every country, where postcode
   * and region are not.
   *
   * Rejection is asserted twice over: the theme's own validation message, and
   * checkout NOT advancing. A step that showed an error and carried on anyway
   * would pass on the message alone.
   */
  async expectShippingStepRejectsIncompleteAddress(order: CheckoutOrderData): Promise<void> {
    const s = this.data.selectors.checkout;
    const shippingForm = this.page.locator('#shipping');

    // Same reason as proceedToPayment: the guest email field is rendered by
    // Knockout, so wait for the server-inlined config rather than the DOM.
    await this.page.waitForFunction(() => 'checkoutConfig' in window, undefined, {
      timeout: 45_000,
    });
    const guestEmailField = shippingForm.getByLabel(s.billing.emailFieldLabel);
    await expect(guestEmailField, 'the guest checkout email field is ready').toBeEditable({
      timeout: 120_000,
    });
    await guestEmailField.fill(order.email);
    await this.fillNewShippingAddress(order);
    await shippingForm.locator(s.billing.streetAddressFieldSelector).clear();

    // Knockout's value binding updates on change, not on input, so the cleared
    // field has to lose focus before the model sees it empty. Blurring also
    // starts the rate re-estimate, which is waited out below rather than
    // raced.
    await this.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await this.page.locator('#checkout-loader').waitFor({ state: 'hidden' });

    const fieldError = shippingForm
      .locator(s.fieldErrorSelector)
      .filter({ hasText: this.data.fixtures.checkout.requiredFieldText })
      .first();

    // The loader overlay reappears on every estimate and swallows whatever
    // click lands on it, which is how this first failed: the step neither
    // advanced nor complained. Retry until the validation actually fires.
    // Retrying is safe precisely because the address cannot advance the step,
    // which is what the assertion after the loop proves.
    await expect(async () => {
      await this.page
        .getByRole('button', { name: s.nextStepButtonLabel })
        .click({ force: true });
      await expect(
        fieldError,
        'the empty street address is reported as a required field',
      ).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });

    await expect(
      this.page,
      'checkout is still on the shipping step',
    ).not.toHaveURL(/#payment/);
  }

  /**
   * Places an order for a virtual-only cart and returns its increment ID.
   *
   * This is a different code path, not a shorter one. Nothing to ship means
   * Magento drops the shipping step outright: no address step of its own, no
   * rate list, no shipping row in the summary, and the billing address
   * rendered inside the payment block instead. `placeOrder` never touches any
   * of it.
   *
   * The absence is asserted three independent ways rather than assumed. A
   * checkout that still rendered the step would be the ordinary path running
   * under this test's name, and the test would report success over the branch
   * it exists to cover.
   */
  async placeVirtualOrder(order: CheckoutOrderData): Promise<string> {
    const s = this.data.selectors.checkout;
    const v = s.virtual;

    await this.page.waitForFunction(() => 'checkoutConfig' in window, undefined, {
      timeout: 45_000,
    });
    // Checkout opens straight on payment, with no step to advance through.
    await this.page.waitForURL(/#payment/, { timeout: 60_000 });
    await this.page.locator('#checkout-loader').waitFor({ state: 'hidden', timeout: 60_000 });

    await expect(
      this.page.locator(v.progressStepSelector),
      'checkout offers a single step, not shipping then payment',
    ).toHaveCount(1);
    await expect(
      this.page.locator(v.shippingStepSelector),
      'the shipping step is not rendered',
    ).toBeHidden();
    await expect(
      this.page.locator(v.shippingRatesSelector),
      'no shipping rates are offered for a cart with nothing to ship',
    ).toHaveCount(0);
    await expect(
      this.page.locator(s.summary.shippingSelector),
      'the order summary carries no shipping row',
    ).toHaveCount(0);

    await this.page
      .locator(v.emailFieldsetSelector)
      .getByLabel(s.billing.emailFieldLabel)
      .fill(order.email);

    const billingForm = this.page.locator(v.billingAddressFormSelector);
    await this.fillAddressForm(billingForm, order.billingAddress);
    // Sibling of the form, not a child of it. See the selector's comment.
    await this.page.locator(v.billingAddressUpdateButtonSelector).click();
    await this.page.locator('#checkout-loader').waitFor({ state: 'hidden', timeout: 60_000 });

    await this.selectPaymentMethod();
    await this.acceptCheckoutAgreements();
    return this.submitOrder();
  }

  /** Places the order and returns its increment ID (e.g. "000000123"). */
  async placeOrder(order: CheckoutOrderData): Promise<string> {
    await this.proceedToPayment(order);
    return this.submitOrder();
  }

  /**
   * Waits until the checkout has rendered its own totals.
   *
   * The summary block paints its title and line items well before the
   * `totals-information` round-trip resolves, so every money read has to wait
   * on the order total specifically. Not a skip: if the totals never arrive,
   * this is the failure.
   */
  async waitForTotals(): Promise<void> {
    await expect(
      this.summaryGrandTotal.filter({ visible: true }).first(),
      'the checkout summary renders an order total',
    ).toBeVisible({ timeout: 60_000 });
  }

  /**
   * Expands the summary's line-item list, which checkout renders collapsed.
   *
   * Retried rather than clicked once: the collapsible's handler binds after the
   * summary component initialises, so an early click is silently dropped, and
   * the block is already open on stores that configure it that way — where a
   * second click would close it again.
   */
  async openOrderSummaryItems(): Promise<void> {
    await expect(async () => {
      if (!(await this.summaryItems.first().isVisible())) {
        await this.summaryItemsToggle.first().click();
      }
      await expect(this.summaryItems.first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 45_000 });
  }

  /** The price the checkout summary shows for one product's line. */
  getSummaryItemPrice(productTitle: string): Locator {
    const summary = this.data.selectors.checkout.summary;
    return this.summaryItems
      .filter({ hasText: productTitle })
      .locator(summary.itemPriceSelector);
  }

  /**
   * Reveals the checkout's own discount form.
   *
   * It is a `collapsible` disclosure inside the payment step whose handler
   * binds after the payment component renders, so an early click is dropped;
   * and it is already open once a coupon is applied, where a second click
   * would close it. Retry until the field is genuinely reachable.
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
   * Applies a coupon from the payment step.
   *
   * The Cancel control is rendered by `isApplied()`, which is bound to the
   * coupon code the SERVER put on the quote — so waiting for it synchronises
   * on the round-trip rather than on the click. It is not the proof: the
   * caller asserts the discount row and the money the coupon moved.
   */
  async applyCoupon(code: string): Promise<void> {
    await this.openCouponForm();
    await this.couponField.fill(code);
    await this.applyCouponButton.click();
    await expect(
      this.cancelCouponButton,
      'the checkout accepted the coupon and offers to cancel it',
    ).toBeVisible({ timeout: 45_000 });
  }

  /**
   * The `features.cart.couponForm: false` branch, at checkout. A store that
   * declares it has no coupon form must actually not render one here either.
   */
  async expectCouponFormIsAbsent(): Promise<void> {
    await expect(
      this.couponField,
      'the store declares no coupon form (features.cart.couponForm) and renders none at checkout',
    ).toHaveCount(0);
  }

  /**
   * The rendered title of the payment method the quote currently carries.
   *
   * Read off the checked input rather than assumed, so the order can be
   * compared against what the customer actually selected instead of against a
   * string hard-coded in the test.
   */
  async readSelectedPaymentMethodTitle(): Promise<string> {
    const s = this.data.selectors.checkout.payment;
    const checked = this.page.locator(`${s.methodInputSelector}:checked`);
    await expect(
      checked,
      'exactly one payment method is selected at checkout',
    ).toHaveCount(1, { timeout: 30_000 });

    const id = await checked.getAttribute('id');
    // Magento's own payment template gives every method radio an id and a
    // for-associated <label>. A template that drops the id has no accessible
    // name at all, which is a real accessibility regression — so this fails
    // loudly rather than falling back to guessing at the surrounding markup.
    expect(
      id,
      'the selected payment method radio carries an id its label can point at',
    ).toBeTruthy();

    const label = this.page.locator(sprintf(s.methodTitleSelector, id as string));
    await expect(
      label.first(),
      'the selected payment method renders a title',
    ).toBeAttached({ timeout: 15_000 });
    const title = ((await label.first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
    expect(title, 'the selected payment method has a non-empty title').not.toBe('');
    return title;
  }

  /**
   * A customer with saved addresses gets selectable cards instead of the inline
   * address form. One address is preselected; where there are more, "Ship Here"
   * picks a different one.
   */
  private async selectSavedShippingAddress(): Promise<void> {
    const s = this.data.selectors.checkout.shipping;

    const cards = this.page.locator(s.addressItem);
    // Same render as the guest email field, so the same budget.
    await expect(
      cards.first(),
      'the saved address list is rendered',
    ).toBeVisible({ timeout: 120_000 });

    const shipHere = this.page
      .getByRole('button', { name: s.shipHereButtonLabel })
      .first();
    if (await shipHere.isVisible()) {
      await shipHere.click();
    }
    await expect(
      this.page.locator(s.selectedAddressItem),
      'exactly one saved address is selected to ship to',
    ).toHaveCount(1, { timeout: 30_000 });
  }

  /** Fills one of checkout's address forms. Shipping and billing share a shape. */
  private async fillAddressForm(form: Locator, address: CheckoutAddress): Promise<void> {
    const s = this.data.selectors.checkout.billing;

    await form.getByLabel(s.firstNameFieldLabel).fill(address.firstName);
    await form.getByLabel(s.lastNameFieldLabel).fill(address.lastName);
    await form.getByLabel(s.companyFieldLabel).fill(address.company);
    await form.getByLabel(s.countryFieldLabel).selectOption(address.country);
    await form.getByLabel(s.cityFieldLabel).fill(address.city);
    await form.getByLabel(s.postcodeFieldLabel).fill(address.postcode);
    await form.getByLabel(s.telephoneFieldLabel).fill(address.telephone);
    // The street label is "Street Address: Line 1" here, so match by name.
    await form.locator(s.streetAddressFieldSelector).fill(address.streetAddress);
  }

  private async fillNewShippingAddress(order: CheckoutOrderData): Promise<void> {
    await this.fillAddressForm(this.page.locator('#shipping'), order.billingAddress);
  }

  private async selectShippingMethodAndPay(): Promise<void> {
    const s = this.data.selectors.checkout;

    // NB: no `waitForLoadState('networkidle')` anywhere in this flow. Luma's
    // checkout can rely on it, but Hyvä keeps Alpine and private-content
    // requests running on every page, so the network never goes idle for the
    // required 500ms and the wait simply burns the test timeout. Every step
    // below waits on a concrete DOM signal instead.
    const loader = this.page.locator('#checkout-loader');

    // Select shipping method — rates are fetched by AJAX once the address is
    // complete, so the radio does not exist yet at this point.
    // Magento labels the rate radio with aria-labelledby on some versions,
    // which getByLabel does not resolve, so the accessible name is matched by
    // role as well. Some custom checkout KO templates render the rate list as
    // plain clickable rows with no radio input at all — fall back to clicking
    // the method's label text in that case.
    const shippingMethod = this.page
      .getByLabel(s.shipping.methodFieldLabel)
      .or(this.page.getByRole('radio', { name: s.shipping.methodFieldLabel }))
      .first();
    const shippingMethodRow = this.page
      .getByText(s.shipping.methodFieldLabel, { exact: true })
      .first();
    await shippingMethod
      .or(shippingMethodRow)
      .first()
      .waitFor({ state: 'attached', timeout: 60_000 });
    await loader.waitFor({ state: 'hidden', timeout: 60_000 });
    if ((await shippingMethod.count()) > 0) {
      // The rate rows re-render whenever Knockout refreshes the rate list,
      // which can swallow the click and leave the step silently unselected.
      // Retry until the rate actually sticks, or the next step will refuse
      // to advance.
      await expect(async () => {
        await shippingMethod.click({ force: true });
        await expect(shippingMethod).toBeChecked({ timeout: 5_000 });
      }).toPass({ timeout: 60_000 });
    } else {
      await shippingMethodRow.click();
    }
    await loader.waitFor({ state: 'hidden', timeout: 60_000 });

    // Advance to payment step
    await this.page.getByRole('button', { name: s.nextStepButtonLabel }).click();

    // Clicking Next POSTs shipping-information; the payment method list is only
    // rendered once that round-trip resolves, and the step shows
    // "No Payment Methods" until then. A fixed pause races that request on a
    // loaded dev box, so wait on real signals: the URL fragment flipping to
    // #payment, then the loader clearing. Both are stock checkout behaviour,
    // so neither is optional.
    await this.page.waitForURL(/#payment/, { timeout: 60_000 });
    await loader.waitFor({ state: 'hidden', timeout: 60_000 });

    await this.selectPaymentMethod();
    await loader.waitFor({ state: 'hidden', timeout: 60_000 });

    await this.acceptCheckoutAgreements();
  }

  /**
   * Applies the store's payment method.
   *
   * Whether a store renders a selectable method list is a store capability, not
   * something to probe for: a store that unexpectedly gains a second method
   * leaves the list unselected and Place Order silently refuses to submit, so
   * the suite would hang rather than fail. Declared as
   * `features.checkout.paymentMethodSelection`.
   */
  private async selectPaymentMethod(): Promise<void> {
    const s = this.data.selectors.checkout;

    // Custom payment templates often leave the radio without an accessible
    // label (label not for-associated) — fall back to the checkmo input
    // itself, which is the one gateway-free method the platform standardises
    // on.
    const paymentMethod = this.page
      .getByLabel(s.payment.methodFieldLabel)
      .or(this.page.locator('input[name="payment[method]"][value="checkmo"]'))
      .first();

    if (!this.data.features.checkout.paymentMethodSelection) {
      // Declared opt-out: the store forces a single method. Assert exactly
      // that, so gaining a second (unselected) method fails here instead of
      // hanging on a Place Order button that never enables.
      const methods = this.page.locator('input[name="payment[method]"]');
      await expect(
        methods,
        'features.checkout.paymentMethodSelection is false, so the store offers exactly one payment method',
      ).toHaveCount(1, { timeout: 60_000 });
      await expect(
        methods.first(),
        'the store\'s single payment method is preselected',
      ).toBeChecked({ timeout: 30_000 });
      return;
    }

    await expect(
      paymentMethod,
      'features.checkout.paymentMethodSelection is true, so the configured payment method input is rendered',
    ).toBeAttached({ timeout: 60_000 });

    // Click via the DOM: the radio is visually replaced by a styled label, so
    // Playwright's actionability check on the input itself can never settle.
    // Knockout re-renders the method list as totals refresh, which can swallow
    // a click — retry until the radio actually reads as checked.
    await expect(async () => {
      await paymentMethod.evaluate((el: HTMLInputElement) => el.click());
      await expect(paymentMethod).toBeChecked({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
  }

  /**
   * Ticks the store's checkout agreements (Stores > Configuration > Sales >
   * Checkout > Enable Terms and Conditions).
   *
   * Place Order silently refuses to submit while a required agreement is
   * unchecked, so a store that gains one unnoticed would hang rather than
   * fail. That makes agreements a declared store capability
   * (`features.checkout.agreements`) rather than something to probe for.
   */
  private async acceptCheckoutAgreements(): Promise<void> {
    const agreements = this.page.locator(
      '.checkout-agreements input[type="checkbox"], [data-role="checkout-agreements"] input[type="checkbox"], ' +
      'input[type="checkbox"][id^="agreement"], input[type="checkbox"][name^="agreement"]',
    );

    if (!this.data.features.checkout.agreements) {
      await expect(
        agreements,
        'features.checkout.agreements is false, so the store renders no agreement checkbox',
      ).toHaveCount(0, { timeout: 15_000 });
      return;
    }

    await expect(
      agreements.first(),
      'features.checkout.agreements is true, so the store renders at least one agreement checkbox',
    ).toBeAttached({ timeout: 30_000 });

    const count = await agreements.count();
    for (let i = 0; i < count; i += 1) {
      const box = agreements.nth(i);
      // Themes hide the real input behind a styled label, so a normal click
      // (even forced) can miss it. Set the property and fire the events
      // Knockout's `checked:` binding listens for, then require it to stick.
      await expect(async () => {
        if (!(await box.isChecked())) {
          await box.evaluate((el: HTMLInputElement) => {
            el.checked = true;
            el.dispatchEvent(new Event('click', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
        }
        await expect(box).toBeChecked({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
    }
  }

  /**
   * Takes Magento's "Create an Account" offer on the order success page.
   *
   * The offer only appears for a guest whose email has no account yet. Stops
   * once the registration form is up: filling it in belongs to RegisterPage,
   * which owns the selectors for it on each theme.
   */
  async startAccountCreationFromOrderSuccess(): Promise<void> {
    const s = this.data.selectors.checkout.success;

    const createAccount = this.page
      .locator(s.createAccountLinkSelector)
      .filter({ visible: true })
      .first();
    await expect(
      createAccount,
      'the success page offers the guest an account',
    ).toBeVisible({ timeout: 30_000 });
    // The selector is the assertion: only the success page's own block links to
    // the delegation route, so reaching the form through it is what separates a
    // delegated hand-off from the header's plain registration link.
    await createAccount.click();
    await this.page.waitForURL(/customer\/account\/create/, {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
  }
}
