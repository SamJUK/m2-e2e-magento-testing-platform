import { grossUp, readMoney, sprintf } from '@samjuk/e2e-m2-playwright-core';
import { lumaTest as test, expect } from '../fixtures';
import { MinicartPage } from '../pages/minicart.page';

test.describe('Cart (Guest)', () => {
  test.beforeEach(async ({ productPage, page, data }) => {
    await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
    await page.goto(data.slugs.cart);
  });

  test(
    'product is visible in cart',
    { tag: ['@cart', '@smoke'] },
    async ({ page, cartPage, data }) => {
      await expect(
        page.getByRole('strong').getByRole('link', { name: data.fixtures.product.simpleProductTitle }),
        'Product is visible in cart',
      ).toBeVisible();
      // A visible product name says nothing about pricing. Assert the money.
      await cartPage.expectTotalsAreCoherent(data.fixtures.product.simpleProductTitle);
    },
  );

  test(
    'can remove product from cart',
    { tag: ['@cart'] },
    async ({ cartPage, data }) => {
      await cartPage.removeProduct(data.fixtures.product.simpleProductTitle);
    },
  );

  test(
    'can change product quantity',
    { tag: ['@cart'] },
    async ({ cartPage, data }) => {
      await cartPage.changeProductQuantity(data.fixtures.product.simpleProductTitle, 2);
    },
  );

  test(
    'the cart survives a page reload and a new tab',
    { tag: ['@cart', '@smoke'] },
    async ({ page, minicartPage, data }) => {
      // add to cart, a reload and a second tab load on top of the beforeEach
      // do not fit the default budget on a dev-mode store.
      test.slow();

      const title = data.fixtures.product.simpleProductTitle;

      await expect
        .poll(() => minicartPage.getItemCount(), {
          timeout: 30_000,
          message: 'minicart counter reports the added item before the reload',
        })
        .toBe(1);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(
        page.getByRole('strong').getByRole('link', { name: title }),
        'the cart page still lists the product after a reload',
      ).toBeVisible();
      await expect
        .poll(() => minicartPage.getItemCount(), {
          timeout: 30_000,
          message: 'minicart counter still reports the item after the reload',
        })
        .toBe(1);

      // A second tab shares the cookie jar and localStorage, and localStorage
      // is where Magento caches the customer-data sections the minicart
      // renders from. A cart that survives a reload can still come back empty
      // in a tab that trusts a stale section cache instead of asking the
      // server, so the counter is proven in a tab that never saw the add.
      const tab = await page.context().newPage();
      try {
        await tab.goto(data.slugs.cart, { waitUntil: 'domcontentloaded' });
        await expect(
          tab.getByRole('strong').getByRole('link', { name: title }),
          'the cart page in a new tab lists the product',
        ).toBeVisible();
        await expect
          .poll(() => new MinicartPage(tab, data).getItemCount(), {
            timeout: 30_000,
            message: 'minicart counter reports the item in a new tab',
          })
          .toBe(1);
      } finally {
        await tab.close();
      }
    },
  );

  test(
    'can apply a coupon code in the cart',
    { tag: ['@cart', '@coupon'] },
    async ({ page, cartPage, data }) => {
      // Applying the coupon is a full cart round-trip on top of the
      // beforeEach's add-to-cart, which does not fit the default budget on a
      // dev-mode store.
      test.slow();
      const coupon = data.fixtures.cart.coupon;
      if (!data.features.cart.couponForm) {
        await cartPage.expectCouponFormIsAbsent();
        return;
      }

      const subtotalBefore = await readMoney(
        cartPage.discountBasisSubtotal,
        'cart subtotal before the coupon',
      );
      const grandTotalBefore = await readMoney(
        cartPage.grandTotal,
        'cart grand total before the coupon',
      );

      await cartPage.applyCoupon(coupon.code);
      await expect(
        page.getByText(sprintf(coupon.appliedNotificationText, coupon.code)),
        'the store confirms the coupon was used',
      ).toBeVisible({ timeout: 45_000 });

      // Re-request the cart so every figure below is the server's, not the
      // one the coupon POST happened to paint on its way past.
      await cartPage.open();
      await expect(
        cartPage.discountTotal,
        'the cart shows exactly one discount line',
      ).toHaveCount(1);

      const discount = await readMoney(cartPage.discountTotal, 'cart discount line');
      const grandTotalAfter = await readMoney(
        cartPage.grandTotal,
        'cart grand total after the coupon',
      );

      expect(discount, 'the discount line is a deduction, not a charge').toBeLessThan(0);
      expect(
        Math.abs(discount),
        `the discount is ${coupon.percent}% of the subtotal`,
      ).toBeCloseTo((subtotalBefore * coupon.percent) / 100, 2);
      // The discount line is ex-tax on a store that displays inc-tax totals,
      // so the total falls by the discount plus its tax.
      expect(
        grandTotalBefore - grandTotalAfter,
        'the grand total dropped by exactly the discount',
      ).toBeCloseTo(grossUp(Math.abs(discount), data), 2);
    },
  );

  test(
    'can remove a coupon code from the cart',
    { tag: ['@cart', '@coupon'] },
    async ({ page, cartPage, data }) => {
      // Apply plus remove is two more full cart round-trips on top of the
      // beforeEach's add-to-cart.
      test.slow();
      const coupon = data.fixtures.cart.coupon;
      if (!data.features.cart.couponForm) {
        await cartPage.expectCouponFormIsAbsent();
        return;
      }

      const grandTotalBefore = await readMoney(
        cartPage.grandTotal,
        'cart grand total before the coupon',
      );

      await cartPage.applyCoupon(coupon.code);
      await cartPage.open();
      // Precondition, and what stops the toHaveCount(0) below being vacuous:
      // the same locator has to match a real row before its absence means
      // anything.
      await expect(
        cartPage.discountTotal,
        'the coupon discounted the cart before it was removed',
      ).toHaveCount(1);

      await cartPage.removeCoupon();
      await expect(
        page.getByText(coupon.removedNotificationText),
        'the store confirms the coupon was cancelled',
      ).toBeVisible({ timeout: 45_000 });

      await cartPage.open();
      await expect(cartPage.discountTotal, 'the discount line is gone').toHaveCount(0);
      expect(
        await readMoney(cartPage.grandTotal, 'cart grand total after removing the coupon'),
        'the grand total returned to its pre-coupon value',
      ).toBeCloseTo(grandTotalBefore, 2);
    },
  );

  test(
    'an invalid coupon code is rejected in the cart',
    { tag: ['@cart', '@coupon', '@negative'] },
    async ({ page, cartPage, data }) => {
      test.slow();
      const coupon = data.fixtures.cart.coupon;
      if (!data.features.cart.couponForm) {
        await cartPage.expectCouponFormIsAbsent();
        return;
      }

      const grandTotalBefore = await readMoney(
        cartPage.grandTotal,
        'cart grand total before the coupon attempt',
      );

      await cartPage.applyCoupon(coupon.invalidCode);
      await expect(
        page.getByText(sprintf(coupon.invalidNotificationText, coupon.invalidCode)),
        'the store refuses the unknown code',
      ).toBeVisible({ timeout: 45_000 });

      await cartPage.open();
      // Not vacuous: 'can apply a coupon code in the cart' proves this same
      // locator matches one row whenever a discount really is applied.
      await expect(cartPage.discountTotal, 'nothing was discounted').toHaveCount(0);
      expect(
        await readMoney(cartPage.grandTotal, 'cart grand total after the coupon attempt'),
        'the grand total is unchanged',
      ).toBeCloseTo(grandTotalBefore, 2);
    },
  );
});

test(
  'the empty cart renders its empty state',
  { tag: ['@cart'] },
  async ({ page, cartPage, minicartPage, data }) => {
    const s = data.selectors.cart;

    // A session that has never had a cart, rather than one emptied by a test:
    // the empty state a customer actually meets on a cold visit.
    await page.goto(data.slugs.cart, { waitUntil: 'domcontentloaded' });

    await expect(
      page.locator(s.emptyMessageSelector),
      'the cart page renders its empty block',
    ).toHaveCount(1, { timeout: 30_000 });
    // The block AND the message. A theme that renders the wrapper and nothing
    // inside it would satisfy the count on its own.
    await expect(
      page.locator(s.emptyMessageSelector),
      'the empty cart says so',
    ).toContainText(data.fixtures.cart.emptyText);

    await expect
      .poll(() => minicartPage.getItemCount(), {
        timeout: 30_000,
        message: 'the minicart counter agrees the cart is empty',
      })
      .toBe(0);
  },
);

test(
  'adding the same product twice merges into one cart line',
  { tag: ['@cart'] },
  async ({ productPage, cartPage, page, data }) => {
    // Two PDP round-trips plus a cart read.
    test.slow();

    const title = data.fixtures.product.simpleProductTitle;

    await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
    await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);

    await cartPage.open();

    // One line, quantity two. A cart that grows a second line for the same
    // simple product breaks every quantity rule the store has - minimum
    // quantities, tier prices and free-shipping thresholds all count lines
    // rather than units once this regresses, and the customer sees a cart that
    // looks merely untidy.
    await expect(
      page.locator(data.selectors.cart.cartItemSelector),
      'the cart holds a single line',
    ).toHaveCount(1);
    expect(
      Number(await cartPage.getQuantityField(title).inputValue()),
      'the line carries both units',
    ).toBe(2);

    // And the money followed the merge rather than staying at one unit.
    await cartPage.expectTotalsAreCoherent(title);
  },
);

test.describe('Cart totals across several lines', () => {
  test(
    'a cart of several products and quantities still adds up',
    { tag: ['@cart', '@totals'] },
    async ({ productPage, cartPage, page, data }) => {
      // Three PDP round-trips and a cart read.
      test.slow();

      const first = data.fixtures.product.simpleProductTitle;
      const second = data.fixtures.product.secondaryProductTitle;

      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct, 3);
      await productPage.addSimpleProductToCart(data.slugs.products.secondaryProduct, 2);

      await cartPage.open();

      // Each line on its own first, so a failure names the line rather than
      // just the total.
      await cartPage.expectTotalsAreCoherent(first);
      await cartPage.expectTotalsAreCoherent(second);

      // Then the sum. Rounding is per line in Magento, so a store that rounds
      // the subtotal instead drifts by a penny or two once quantities climb -
      // invisible on a single line, and exactly what a multi-line cart is for.
      const firstTotal = await readMoney(cartPage.getLineTotal(first), 'first line total');
      const secondTotal = await readMoney(cartPage.getLineTotal(second), 'second line total');
      const subtotal = await readMoney(cartPage.subtotal, 'cart subtotal');

      expect(
        subtotal,
        'the subtotal is the sum of the line totals, to the penny',
      ).toBeCloseTo(firstTotal + secondTotal, 2);
    },
  );
});
