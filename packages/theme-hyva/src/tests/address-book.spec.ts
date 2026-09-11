import { fakerEN_GB as faker } from '@faker-js/faker';
import { hyvaTest as test, expect } from '../fixtures';
import type { CustomerAddress, RegisterCredentials } from '../index';
import { cityName } from '@samjuk/e2e-m2-playwright-core';

// Reset storageState to ensure tests always start logged-out.
test.use({ storageState: { cookies: [], origins: [] } });

// Every case here is register + one or more full page-load form round-trips,
// which does not fit the default budget on a dev-mode store.
test.slow();

function newCustomer(): RegisterCredentials {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  return {
    firstName,
    lastName,
    email: faker.internet.exampleEmail({ firstName, lastName }).toLowerCase(),
    password: faker.internet.password({ prefix: 'X1@' }),
  };
}

function newAddress(customer: RegisterCredentials): CustomerAddress {
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    company: faker.company.name(),
    streetAddress: faker.location.streetAddress(),
    country: 'United Kingdom',
    region: faker.location.county(),
    city: cityName(faker),
    postcode: faker.location.zipCode(),
    telephone: faker.phone.number(),
  };
}

test.describe('Customer address book', () => {
  test(
    'can add an address to the address book',
    { tag: ['@customer', '@address'] },
    async ({ registerPage, addressBookPage }) => {
      const customer = newCustomer();
      const address = newAddress(customer);

      await registerPage.createNewAccount(customer);
      await addressBookPage.addAddress(address);

      const defaultBilling = addressBookPage.defaultBillingBlock;
      await expect(defaultBilling).toContainText(address.streetAddress);
      await expect(defaultBilling).toContainText(address.city);
    },
  );

  test(
    'can edit an address in the address book',
    { tag: ['@customer', '@address'] },
    async ({ registerPage, addressBookPage }) => {
      const customer = newCustomer();
      const address = newAddress(customer);
      const newCity = cityName(faker);

      await registerPage.createNewAccount(customer);
      await addressBookPage.addAddress(address);
      await addressBookPage.editDefaultBillingAddress({ city: newCity });

      const defaultBilling = addressBookPage.defaultBillingBlock;
      await expect(defaultBilling).toContainText(newCity);
      await expect(defaultBilling).not.toContainText(address.city);
    },
  );

  test(
    'an address with a missing required field is rejected',
    { tag: ['@customer', '@address', '@negative'] },
    async ({ registerPage, addressBookPage, data }) => {
      const customer = newCustomer();
      const address = newAddress(customer);

      await registerPage.createNewAccount(customer);
      // Save one valid address first. Without it the before/after count would
      // be 0 → 0, which a countAddresses() that silently matched nothing would
      // also satisfy.
      await addressBookPage.addAddress(address);
      expect(
        await addressBookPage.countAddresses(),
        'the customer has one saved address to count against',
      ).toBe(1);

      await addressBookPage.expectAddressIsRejectedForMissingField(
        newAddress(customer),
        'city',
        data.selectors.addressBookPage.form.cityFieldLabel,
      );
    },
  );

  test(
    'can delete an address from the address book',
    { tag: ['@customer', '@address'] },
    async ({ registerPage, addressBookPage }) => {
      const customer = newCustomer();
      // The first address of a fresh customer becomes the default billing and
      // shipping address, which cannot be deleted — a second one is needed.
      const defaultAddress = newAddress(customer);
      const extraAddress = newAddress(customer);

      await registerPage.createNewAccount(customer);
      await addressBookPage.addAddress(defaultAddress);
      await addressBookPage.addAddress(extraAddress);

      await addressBookPage.deleteAddress(extraAddress.streetAddress);
    },
  );

  test(
    'the default billing/shipping address can be changed',
    { tag: ['@customer', '@address'] },
    async ({ registerPage, addressBookPage }) => {
      const customer = newCustomer();
      // The first address a customer stores becomes their default outright, so
      // a second is what gives the defaults somewhere to move to. Ticking both
      // boxes on the way in is the only route Magento offers, and those boxes
      // exist precisely because a default is already set.
      const original = newAddress(customer);
      const promoted = newAddress(customer);

      await registerPage.createNewAccount(customer);
      await addressBookPage.addAddress(original);
      await addressBookPage.addAddress(promoted, { makeDefault: true });

      await addressBookPage.expectDefaultAddresses(promoted.streetAddress);
      await expect(
        addressBookPage.defaultBillingBlock.first(),
        'the address that was the default no longer is',
      ).not.toContainText(original.streetAddress);
    },
  );

  test(
    "the account dashboard shows the customer's details and default addresses",
    { tag: ['@customer', '@profile'] },
    async ({ registerPage, addressBookPage, accountPage }) => {
      const customer = newCustomer();
      const address = newAddress(customer);

      await registerPage.createNewAccount(customer);
      await addressBookPage.addAddress(address);

      // Every value asserted here was entered on a page other than the one
      // being read, so this proves storage rather than echo.
      await accountPage.expectDashboardShows({
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        streetAddress: address.streetAddress,
      });
    },
  );
});
