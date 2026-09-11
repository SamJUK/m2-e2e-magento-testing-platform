import { fakerEN_GB as faker } from '@faker-js/faker';
import { readMoney, cityName } from '@samjuk/e2e-m2-playwright-core';
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
 * One product, one price, four pages.
 *
 * The cart tests already prove the cart's own figures are internally coherent,
 * which is a weaker thing entirely: a price that changes between the product
 * page and the cart is coherent on both. Every figure below is read as a parsed
 * number off a single visible element, so a dual inc/exc-VAT store compares
 * like with like rather than one basis against the other.
 *
 * Quantity is deliberately one: at qty 1 the unit price, the row total and the
 * subtotal are all the same number, so there is no ambiguity about which of
 * them each page happens to be showing.
 */
test(
  'the product price is the same on the product page, in the minicart, in the cart and at checkout',
  { tag: ['@price', '@cart', '@checkout'] },
  async ({ page, productPage, minicartPage, cartPage, checkoutPage, data }) => {
    // a PDP, an add-to-cart, the cart and the full checkout address/shipping
    // flow do not fit the default budget on a dev-mode store.
    test.slow();

    const title = data.fixtures.product.simpleProductTitle;

    await page.goto(data.slugs.products.simpleProduct, { waitUntil: 'domcontentloaded' });
    const productPagePrice = await readMoney(productPage.price, 'product page price');
    expect(productPagePrice, 'the product page shows a price above zero').toBeGreaterThan(0);

    await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);

    await minicartPage.ensureMinicartIsOpen();
    await expect(
      minicartPage.getProductRow(title),
      'the product has exactly one minicart line',
    ).toHaveCount(1, { timeout: 30_000 });
    const minicartPrice = await readMoney(minicartPage.getItemPrice(title), 'minicart line price');

    await cartPage.open();
    await expect(
      cartPage.getProductRow(title),
      'the product has exactly one cart line',
    ).toHaveCount(1);
    const cartPrice = await readMoney(cartPage.getUnitPrice(title), 'cart line unit price');

    await page.goto(data.slugs.checkout);
    await checkoutPage.proceedToPayment(newGuestOrder());
    await checkoutPage.waitForTotals();
    await checkoutPage.openOrderSummaryItems();
    const checkoutPrice = await readMoney(
      checkoutPage.getSummaryItemPrice(title),
      'checkout summary line price',
    );
    const checkoutSubtotal = await readMoney(checkoutPage.summarySubtotal, 'checkout subtotal');

    expect(minicartPrice, 'the minicart price matches the product page').toBeCloseTo(
      productPagePrice,
      2,
    );
    expect(cartPrice, 'the cart price matches the product page').toBeCloseTo(productPagePrice, 2);
    expect(checkoutPrice, 'the checkout price matches the product page').toBeCloseTo(
      productPagePrice,
      2,
    );
    // The order is for this one line at qty 1, so the price the customer is
    // actually charged for it is the subtotal — the figure that would move if
    // the price changed anywhere along the way without the display following.
    expect(
      checkoutSubtotal,
      'the checkout subtotal is that same price',
    ).toBeCloseTo(productPagePrice, 2);
  },
);
