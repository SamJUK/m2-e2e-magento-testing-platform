import { fakerEN_GB as faker } from '@faker-js/faker';
import { hyvaTest as test } from '../fixtures';
import type { AdminOrderInput, CheckoutOrderData } from '../index';
import { cityName } from '@samjuk/e2e-m2-playwright-core';

// Reset storageState so each case starts from a clean, logged-out session.
test.use({ storageState: { cookies: [], origins: [] } });

// Every case places a guest order and then drives two admin pages, which does
// not fit the default budget on a dev-mode store.
test.slow();

function newGuestOrder(): { email: string; order: CheckoutOrderData } {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const email = faker.internet.exampleEmail({ firstName, lastName }).toLowerCase();
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
    email,
    order: { email, billingAddress: address, shippingAddress: address },
  };
}

/**
 * A customer and address for an order built in the admin.
 *
 * The admin's own order-creation flow is what sets up the grid, detail and
 * status cases below, rather than a storefront checkout. It is the thing under
 * test in the first case anyway, it keeps the admin suite from depending on
 * the storefront checkout page object at all, and it is the only setup that
 * still works on a store whose checkout the suite cannot drive — which is
 * exactly the store where admin coverage matters most.
 */
function newAdminOrder(sku: string): AdminOrderInput {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  return {
    email: faker.internet.exampleEmail({ firstName, lastName }).toLowerCase(),
    firstName,
    lastName,
    streetAddress: faker.location.streetAddress(),
    city: cityName(faker),
    postcode: faker.location.zipCode(),
    telephone: faker.phone.number(),
    sku,
  };
}

test.describe('Admin order fulfilment', () => {
  test(
    'admin can invoice an order and email the invoice to the customer',
    { tag: ['@admin', '@email'] },
    async ({ productPage, checkoutPage, adminLoginPage, adminOrderPage, mailpit, page, data }) => {
      const { email, order } = newGuestOrder();

      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
      await page.goto(data.slugs.checkout);
      const orderNumber = await checkoutPage.placeOrder(order);

      await adminLoginPage.login();
      await adminOrderPage.createInvoice(orderNumber);

      await mailpit.waitForMessage(
        [
          { key: 'subject', value: data.fixtures.admin.orders.invoice.mail.subject },
          { key: 'to', value: email },
          { value: orderNumber },
        ],
        { message: `Customer should receive an invoice email for ${orderNumber}` },
      );
    },
  );

  test(
    'admin can ship an order and email the shipment to the customer',
    { tag: ['@admin', '@email'] },
    async ({ productPage, checkoutPage, adminLoginPage, adminOrderPage, mailpit, page, data }) => {
      const { email, order } = newGuestOrder();

      await productPage.addSimpleProductToCart(data.slugs.products.simpleProduct);
      await page.goto(data.slugs.checkout);
      const orderNumber = await checkoutPage.placeOrder(order);

      await adminLoginPage.login();
      await adminOrderPage.createShipment(orderNumber);

      await mailpit.waitForMessage(
        [
          { key: 'subject', value: data.fixtures.admin.orders.shipment.mail.subject },
          { key: 'to', value: email },
          { value: orderNumber },
        ],
        { message: `Customer should receive a shipment email for ${orderNumber}` },
      );
    },
  );
});

test.describe('Admin order workflow', () => {
  test(
    'admin can create an order from the admin panel',
    { tag: ['@admin', '@orders'] },
    async ({ adminLoginPage, adminOrderPage, data }) => {
      // Building an order in the admin is a long sequence of AJAX block
      // reloads, and this file's blanket test.slow() only reaches 180s. Raising
      // the budget rather than trimming steps: every one of them is asserted.
      test.setTimeout(300_000);

      await adminLoginPage.login();

      const created = await adminOrderPage.createOrder(
        newAdminOrder(data.fixtures.product.adminOrderable.sku),
      );

      // createOrder already required an increment ID and a grand total
      // matching the quote. Finding the order in the grid is the independent
      // read: the increment ID has to belong to a real, indexed order, not
      // just to a heading the view page rendered.
      await adminOrderPage.expectOrderInGrid(created.orderNumber, created);
    },
  );

  test(
    'an order appears in the admin order grid with the right customer and total',
    { tag: ['@admin', '@orders'] },
    async ({ adminLoginPage, adminOrderPage, data }) => {
      // Building an order in the admin is a long sequence of AJAX block
      // reloads, and this file's blanket test.slow() only reaches 180s. Raising
      // the budget rather than trimming steps: every one of them is asserted.
      test.setTimeout(300_000);

      await adminLoginPage.login();

      const created = await adminOrderPage.createOrder(
        newAdminOrder(data.fixtures.product.adminOrderable.sku),
      );

      await adminOrderPage.expectOrderInGrid(created.orderNumber, created);
      await adminOrderPage.expectOrderDetails(created.orderNumber, created);
    },
  );

  test(
    'admin can change an order status and add a comment',
    { tag: ['@admin', '@orders'] },
    async ({ adminLoginPage, adminOrderPage, data }) => {
      // Building an order in the admin is a long sequence of AJAX block
      // reloads, and this file's blanket test.slow() only reaches 180s. Raising
      // the budget rather than trimming steps: every one of them is asserted.
      test.setTimeout(300_000);

      const f = data.fixtures.admin.orders.status;

      await adminLoginPage.login();

      const created = await adminOrderPage.createOrder(
        newAdminOrder(data.fixtures.product.adminOrderable.sku),
      );

      await adminOrderPage.openOrder(created.orderNumber);
      await adminOrderPage.expectStatus(f.pendingText);

      await adminOrderPage.holdOrder();
      await adminOrderPage.expectStatus(f.onHoldText);
      // The success notice and the repainted status are both written by the
      // same request; only a fresh read proves the transition was persisted.
      await adminOrderPage.reloadOrder();
      await adminOrderPage.expectStatus(f.onHoldText);

      await adminOrderPage.addComment(`E2E status note ${faker.string.alphanumeric(10)}`);

      // Release it again: the status goes back to what it was, which both
      // proves the reverse transition and leaves the order as it was found.
      await adminOrderPage.releaseOrder();
      await adminOrderPage.reloadOrder();
      await adminOrderPage.expectStatus(f.pendingText);
    },
  );
});
