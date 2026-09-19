import { fakerEN_GB as faker } from '@faker-js/faker';
import { grossUp, readMoney, cityName } from '@samjuk/e2e-m2-playwright-core';
import { hyvaTest as test, expect } from '../fixtures';
import type { CheckoutOrderData } from '../index';

function newGuestOrder(): CheckoutOrderData {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const address = {
    firstName,
    lastName,
    company: faker.company.name(),
    streetAddress: faker.location.streetAddress(),
    country: 'United Kingdom',
    county: faker.location.county(),
    city: cityName(faker),
    postcode: faker.location.zipCode(),
    telephone: faker.phone.number(),
  };

  return {
    email: faker.internet.exampleEmail({ firstName, lastName }).toLowerCase(),
    billingAddress: address,
    shippingAddress: address,
  };
}

/**
 * The money on the checkout's own Order Summary.
 *
 * Both tests stop at the payment step rather than placing an order: everything
 * asserted here is on the quote, and an order per assertion would consume real
 * stock on a store whose database is not rolled back.
 */
test.describe('Checkout totals (Guest)', () => {
  test.beforeEach(async ({ productPage, page, data }) => {
    await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
    await page.goto(data.slugs.checkout);
  });

  test(
    'the checkout totals add up',
    { tag: ['@checkout', '@totals'] },
    async ({ checkoutPage, data }) => {
      // add to cart plus the address and shipping-rate round-trips do not fit
      // the default budget on a dev-mode store.
      test.slow();

      await checkoutPage.proceedToPayment(newGuestOrder());
      await checkoutPage.waitForTotals();

      const subtotal = await readMoney(checkoutPage.summarySubtotal, 'checkout subtotal');
      const shipping = await readMoney(checkoutPage.summaryShipping, 'checkout shipping');
      const grandTotal = await readMoney(checkoutPage.summaryGrandTotal, 'checkout order total');

      expect(subtotal, 'the checkout subtotal is a positive amount').toBeGreaterThan(0);
      expect(shipping, 'the selected shipping rate is priced').toBeGreaterThanOrEqual(0);

      // Whether a tax row exists, and whether its amount is already inside the
      // subtotal and shipping above, is declared rather than sniffed — a store
      // that silently stops charging tax has to fail here, not quietly balance
      // without it. Every branch asserts something.
      const taxRow = data.features.checkout.taxRow;
      let additiveTax = 0;

      if (taxRow === 'absent') {
        await expect(
          checkoutPage.summaryTax,
          'features.checkout.taxRow is "absent", so the summary renders no tax row',
        ).toHaveCount(0);
      } else {
        const tax = await readMoney(checkoutPage.summaryTax, 'checkout tax');
        expect(tax, 'the checkout tax line is a charge, not a deduction').toBeGreaterThanOrEqual(0);
        // "included" means the amount is already inside the subtotal and
        // shipping read above, so adding it again would double-count it.
        if (taxRow === 'additive') additiveTax = tax;
      }

      expect(
        subtotal + shipping + additiveTax,
        'subtotal + shipping + tax equals the order total',
      ).toBeCloseTo(grandTotal, 2);
    },
  );

  test(
    'a coupon applied at checkout discounts the order total',
    { tag: ['@checkout', '@coupon'] },
    async ({ checkoutPage, data }) => {
      // add to cart, the checkout steps and a coupon round-trip on top.
      test.slow();

      const coupon = data.fixtures.cart.coupon;

      await checkoutPage.proceedToPayment(newGuestOrder());
      await checkoutPage.waitForTotals();

      if (!data.features.cart.couponForm) {
        await checkoutPage.expectCouponFormIsAbsent();
        return;
      }

      const subtotalBefore = await readMoney(
        checkoutPage.summaryDiscountBasisSubtotal,
        'checkout subtotal before the coupon',
      );
      const grandTotalBefore = await readMoney(
        checkoutPage.summaryGrandTotal,
        'checkout order total before the coupon',
      );
      // Not vacuous: the same locator is required to match exactly one row
      // once the coupon is on, a few lines below.
      await expect(
        checkoutPage.summaryDiscount,
        'nothing is discounted before the coupon goes on',
      ).toHaveCount(0);

      // The checkout's discount form is a different form driven by a different
      // Knockout component from the cart's, which is why applying a coupon here
      // is worth asserting separately from applying one in the cart.
      await checkoutPage.applyCoupon(coupon.code);

      await expect(
        checkoutPage.summaryDiscount,
        'the checkout summary shows exactly one discount line',
      ).toHaveCount(1, { timeout: 60_000 });

      const discount = await readMoney(checkoutPage.summaryDiscount, 'checkout discount line');
      const grandTotalAfter = await readMoney(
        checkoutPage.summaryGrandTotal,
        'checkout order total after the coupon',
      );

      expect(discount, 'the discount line is a deduction, not a charge').toBeLessThan(0);
      expect(
        Math.abs(discount),
        `the discount is ${coupon.percent}% of the subtotal`,
      ).toBeCloseTo((subtotalBefore * coupon.percent) / 100, 2);
      // As in the cart: an ex-tax discount against inc-tax totals.
      expect(
        grandTotalBefore - grandTotalAfter,
        'the order total dropped by exactly the discount',
      ).toBeCloseTo(grossUp(Math.abs(discount), data), 2);
    },
  );
});
