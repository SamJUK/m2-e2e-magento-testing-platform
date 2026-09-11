import { faker } from '@faker-js/faker';
import { lumaTest as test } from '../fixtures';

test(
  'can login to admin panel',
  { tag: ['@admin', '@smoke'] },
  async ({ adminLoginPage }) => {
    await adminLoginPage.login();
  },
);

test(
  'can visit system configuration page',
  { tag: ['@admin'] },
  async ({ adminLoginPage, adminConfigPage }) => {
    await adminLoginPage.login();
    await adminConfigPage.visit();
  },
);

test(
  'can visit cache management page',
  { tag: ['@admin'] },
  async ({ adminLoginPage, adminCachePage }) => {
    await adminLoginPage.login();
    await adminCachePage.visit();
  },
);

test.describe('Admin grids', () => {
  test(
    'can find a product in the grid and open its edit form',
    { tag: ['@admin'] },
    async ({ adminLoginPage, adminProductPage, data }) => {
      await adminLoginPage.login();
      await adminProductPage.openProduct(
        data.fixtures.admin.products.searchTerm,
        data.fixtures.product.simpleProductTitle,
      );
    },
  );

  test(
    'can find a customer in the grid and open their detail page',
    { tag: ['@admin'] },
    async ({ registerPage, adminLoginPage, adminCustomerPage }) => {
      // register on the storefront + two admin pages.
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

      await adminLoginPage.login();
      await adminCustomerPage.openCustomer(email);
    },
  );
});

test.describe('Admin product edit', () => {
  test(
    'can edit a product and save the change',
    { tag: ['@admin'] },
    async ({ adminLoginPage, adminProductPage, data }) => {
      // Two full admin form round-trips (rename, then restore), each of which
      // re-opens the grid and requests the storefront PDP to read the change
      // back off the server.
      test.slow();

      const original = data.fixtures.product.adminEditable;
      const renamed = `${original.title} ${faker.string.alphanumeric(8)}`;

      await adminLoginPage.login();

      await adminProductPage.renameProduct(
        original.sku,
        original.title,
        renamed,
        data.slugs.products.adminEditableProduct,
      );

      // Put it back, so this can run again on a store whose database is never
      // rolled back (the Hyva demo runs DB_STRATEGY=none) — and prove the
      // restore landed the same way the rename was proved, rather than
      // assuming an unverified write undid a verified one.
      await adminProductPage.renameProduct(
        original.sku,
        renamed,
        original.title,
        data.slugs.products.adminEditableProduct,
      );
    },
  );
});

test.describe('CMS Blocks', () => {
  test(
    'can create a new CMS block',
    { tag: ['@admin'] },
    async ({ adminLoginPage, adminCMSBlockPage }) => {
      // Creating now also re-opens the record and finds its grid row.
      test.slow();

      const token = faker.string.alphanumeric(10).toLowerCase();
      await adminLoginPage.login();
      await adminCMSBlockPage.createBlock({
        title: `${faker.book.title()} ${token}`,
        identifier: `test_${token}`,
        gridSearchTerm: token,
      });
    },
  );

  test(
    'can delete a CMS block',
    { tag: ['@admin'] },
    async ({ adminLoginPage, adminCMSBlockPage }) => {
      // Create + read back + delete + grid absence check.
      test.slow();

      const token = faker.string.alphanumeric(10).toLowerCase();
      await adminLoginPage.login();
      const url = await adminCMSBlockPage.createBlock({
        title: `${faker.book.title()} ${token}`,
        identifier: `test_${token}`,
        gridSearchTerm: token,
      });
      await adminCMSBlockPage.deleteBlock(url, token);
    },
  );
});

test.describe('CMS Pages', () => {
  test(
    'can create a new CMS page',
    { tag: ['@admin'] },
    async ({ adminLoginPage, adminCMSPagePage }) => {
      // Creating now also re-opens the record and finds its grid row.
      test.slow();

      const token = faker.string.alphanumeric(10).toLowerCase();
      await adminLoginPage.login();
      await adminCMSPagePage.createPage({
        title: `${faker.book.title()} ${token}`,
        gridSearchTerm: token,
      });
    },
  );

  test(
    'can delete a CMS page',
    { tag: ['@admin'] },
    async ({ adminLoginPage, adminCMSPagePage }) => {
      // Create + read back + delete + grid absence check.
      test.slow();

      const token = faker.string.alphanumeric(10).toLowerCase();
      await adminLoginPage.login();
      const url = await adminCMSPagePage.createPage({
        title: `${faker.book.title()} ${token}`,
        gridSearchTerm: token,
      });
      await adminCMSPagePage.deletePage(url, token);
    },
  );
});

test.describe('Cart Price Rules', () => {
  test(
    'can create a new cart price rule',
    { tag: ['@admin'] },
    async ({ adminLoginPage, adminCartPriceRulePage }) => {
      // Creating now also re-opens the saved rule and checks it persisted.
      test.slow();

      await adminLoginPage.login();
      await adminCartPriceRulePage.createCoupon({
        name: `10% - ${faker.string.alphanumeric(8)}`,
        couponCode: faker.string.alpha(8),
        couponAmount: 10,
      });
    },
  );

  test(
    'can delete a cart price rule',
    { tag: ['@admin'] },
    async ({ adminLoginPage, adminCartPriceRulePage }) => {
      // Creating now also re-opens the saved rule and checks it persisted.
      test.slow();

      await adminLoginPage.login();
      const url = await adminCartPriceRulePage.createCoupon({
        name: `10% - ${faker.string.alphanumeric(8)}`,
        couponCode: faker.string.alpha(8),
        couponAmount: 10,
      });
      await adminCartPriceRulePage.deleteCoupon(url);
    },
  );
});
