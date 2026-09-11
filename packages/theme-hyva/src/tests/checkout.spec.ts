import { fakerEN_GB as faker } from '@faker-js/faker';
import { hyvaTest as test, expect } from '../fixtures';
import type { CheckoutAddress, CheckoutOrderData, CustomerAddress } from '../index';
import { cityName } from '@samjuk/e2e-m2-playwright-core';

/** Address book entries use `region` where the checkout form uses `county`. */
function newSavedAddress(firstName: string, lastName: string): CustomerAddress {
  return {
    firstName,
    lastName,
    company: faker.company.name(),
    streetAddress: faker.location.streetAddress(),
    country: 'United Kingdom',
    region: faker.location.county(),
    city: cityName(faker),
    postcode: faker.location.zipCode(),
    telephone: faker.phone.number(),
  };
}

function newAddress(firstName: string, lastName: string): CheckoutAddress {
  return {
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
}

test.describe('Checkout (Guest)', () => {
  // Guest checkout is a four-round-trip Knockout flow (address → shipping rates
  // → shipping-information → order placement). On a dev-mode store each leg can
  // take double-digit seconds, which does not fit the default 60s budget.
  test.slow();

  test.beforeEach(async ({ productPage, page, data }) => {
    await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
    await page.goto(data.slugs.checkout);
  });

  test(
    'guest can complete checkout',
    { tag: ['@checkout', '@smoke'] },
    async ({ checkoutPage }) => {
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

      const order: CheckoutOrderData = {
        email: faker.internet.email({ firstName, lastName }),
        billingAddress: address,
        shippingAddress: address,
      };

      await checkoutPage.placeOrder(order);
    },
  );

  test(
    'checkout rejects an incomplete shipping address',
    { tag: ['@checkout', '@negative'] },
    async ({ checkoutPage }) => {
      // add to cart + the address form on top of the beforeEach does not fit
      // the default budget on a dev-mode store.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const address = newAddress(firstName, lastName);

      await checkoutPage.expectShippingStepRejectsIncompleteAddress({
        email: faker.internet.exampleEmail({ firstName, lastName }).toLowerCase(),
        billingAddress: address,
        shippingAddress: address,
      });
    },
  );

  test(
    'a guest can look up an order via Orders and Returns',
    { tag: ['@checkout', '@orders'] },
    async ({ checkoutPage, accountPage }) => {
      // add to cart + three checkout steps + the lookup POST is six page loads.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();
      const address = newAddress(firstName, lastName);

      const orderNumber = await checkoutPage.placeOrder({
        email,
        billingAddress: address,
        shippingAddress: address,
      });

      // A guest has no order history, so this form is the whole of their
      // access to the order they just paid for.
      await accountPage.lookUpGuestOrder({ orderNumber, email, lastName });
    },
  );
});

test.describe('Checkout (Registered)', () => {
  // Reset storageState so the customer registered here is the only session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    'registered customer can complete checkout and view the order in their history',
    { tag: ['@checkout', '@customer'] },
    async ({ registerPage, productPage, checkoutPage, accountPage, page, data }) => {
      // register + add to cart + checkout + order history is five page loads.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();

      await registerPage.createNewAccount({
        firstName,
        lastName,
        email,
        password: faker.internet.password({ prefix: 'X1@' }),
      });

      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
      await page.goto(data.slugs.checkout);

      const address = newAddress(firstName, lastName);
      const order: CheckoutOrderData = {
        email,
        billingAddress: address,
        shippingAddress: address,
      };

      const orderNumber = await checkoutPage.placeOrder(order);
      await accountPage.viewOrder(orderNumber);
    },
  );

  test(
    'registered customer can complete checkout using a saved address',
    { tag: ['@checkout', '@customer'] },
    async ({ registerPage, addressBookPage, productPage, checkoutPage, accountPage, page, data }) => {
      // register + two address saves + checkout + order history.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();

      await registerPage.createNewAccount({
        firstName,
        lastName,
        email,
        password: faker.internet.password({ prefix: 'X1@' }),
      });

      // Two addresses: the first becomes the default (and is preselected at
      // checkout), the second gives the "Ship Here" control something to do.
      await addressBookPage.addAddress(newSavedAddress(firstName, lastName));
      await addressBookPage.addAddress(newSavedAddress(firstName, lastName));

      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
      await page.goto(data.slugs.checkout);

      const order: CheckoutOrderData = {
        email,
        billingAddress: newAddress(firstName, lastName),
        shippingAddress: newAddress(firstName, lastName),
      };

      const orderNumber = await checkoutPage.placeOrder(order);
      await accountPage.viewOrder(orderNumber);
    },
  );
  test(
    'the payment method selected at checkout is the one recorded on the order',
    { tag: ['@checkout', '@payment', '@customer'] },
    async ({ registerPage, productPage, checkoutPage, accountPage, page, data }) => {
      // register + add to cart + checkout + the order view is five page loads.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();

      await registerPage.createNewAccount({
        firstName,
        lastName,
        email,
        password: faker.internet.password({ prefix: 'X1@' }),
      });

      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
      await page.goto(data.slugs.checkout);

      const address = newAddress(firstName, lastName);
      const order: CheckoutOrderData = {
        email,
        billingAddress: address,
        shippingAddress: address,
      };

      // Read the method off the checked radio rather than hard-coding it, so
      // this compares the store against itself: a checkout that shows one
      // method while the order is placed with another fails here.
      await checkoutPage.proceedToPayment(order);
      const selectedMethod = await checkoutPage.readSelectedPaymentMethodTitle();
      const orderNumber = await checkoutPage.submitOrder();

      await accountPage.expectOrderPaymentMethod(orderNumber, selectedMethod);
    },
  );

  test(
    'a past order can be reordered',
    { tag: ['@checkout', '@customer', '@orders'] },
    async ({ registerPage, productPage, checkoutPage, accountPage, cartPage, page, data }) => {
      // register + add to cart + checkout + the reorder round-trip is six page
      // loads, well past the default budget on a dev-mode store.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();

      await registerPage.createNewAccount({
        firstName,
        lastName,
        email,
        password: faker.internet.password({ prefix: 'X1@' }),
      });

      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
      await page.goto(data.slugs.checkout);

      const address = newAddress(firstName, lastName);
      const orderNumber = await checkoutPage.placeOrder({
        email,
        billingAddress: address,
        shippingAddress: address,
      });

      await accountPage.reorder(orderNumber);

      await expect(
        page.getByRole('heading', { name: data.fixtures.product.simpleProductTitle }),
        'the reordered product is back in the cart',
      ).toBeVisible();
      // A product name in the cart says nothing about pricing. Reorder rebuilds
      // the quote from the order's items, so assert the money it rebuilt.
      await cartPage.expectTotalsAreCoherent(data.fixtures.product.simpleProductTitle);
    },
  );

  test(
    "an order's detail page and its printable copy open from the history",
    { tag: ['@checkout', '@customer', '@orders'] },
    async ({ registerPage, productPage, checkoutPage, accountPage, page, data }) => {
      // register + add to cart + checkout + the order view + the print tab.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();

      await registerPage.createNewAccount({
        firstName,
        lastName,
        email,
        password: faker.internet.password({ prefix: 'X1@' }),
      });

      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
      await page.goto(data.slugs.checkout);

      const address = newAddress(firstName, lastName);
      const orderNumber = await checkoutPage.placeOrder({
        email,
        billingAddress: address,
        shippingAddress: address,
      });

      // printOrder opens the order from the history grid first, so the detail
      // page is covered on the way through.
      await accountPage.printOrder(orderNumber);
    },
  );
});

test.describe('Checkout (Virtual)', () => {
  test(
    'a virtual-only cart skips the shipping step entirely',
    { tag: ['@checkout', '@virtual'] },
    async ({ productPage, checkoutPage, page, data }) => {
      // add to cart + the single checkout step does not fit the default budget
      // on a dev-mode store.
      test.slow();

      const firstName = faker.person.firstName();
      const lastName = faker.person.lastName();
      const address = newAddress(firstName, lastName);

      await productPage.addSimpleProductToCart(data.slugs.products.virtualProduct);
      await page.goto(data.slugs.checkout);

      // placeVirtualOrder carries the assertions that make this test worth
      // having: that the shipping step, its rates and its summary row are all
      // genuinely absent, rather than merely walked past.
      const orderNumber = await checkoutPage.placeVirtualOrder({
        email: faker.internet.exampleEmail({ firstName, lastName }).toLowerCase(),
        billingAddress: address,
        shippingAddress: address,
      });

      expect(orderNumber, 'the virtual order was placed').toMatch(/^\d{6,}$/);
    },
  );
});
