import { expect } from '@playwright/test';
import { coreTest, loadData, Mailpit } from '@samjuk/e2e-m2-playwright-core';
import lumaSelectors from './data/selectors.json';

import { ProductPage } from './pages/product.page';
import { CartPage } from './pages/cart.page';
import { CheckoutPage } from './pages/checkout.page';
import { CategoryPage } from './pages/category.page';
import { AccountPage, ForgotPasswordPage, RegisterPage } from './pages/account.page';
import { AddressBookPage } from './pages/address.page';
import { ContactPage } from './pages/contact.page';
import { MinicartPage } from './pages/minicart.page';
import { SearchPage } from './pages/search.page';
import { WishlistPage } from './pages/wishlist.page';
import { ComparePage } from './pages/compare.page';
import { ReviewPage } from './pages/review.page';
import { CookieNoticePage } from './pages/cookie-notice.page';
import { AdminLoginPage } from './pages/admin/login.page';
import { AdminConfigPage } from './pages/admin/config.page';
import { AdminCMSBlockPage } from './pages/admin/cms-block.page';
import { AdminCMSPagePage } from './pages/admin/cms-page.page';
import { AdminCartPriceRulePage } from './pages/admin/cart-price-rule.page';
import { AdminOrderPage } from './pages/admin/order.page';
import { AdminProductPage } from './pages/admin/catalog.page';
import { AdminCustomerPage } from './pages/admin/customer.page';
import { AdminCachePage } from './pages/admin/cache.page';
import { AdminReviewPage } from './pages/admin/review.page';
import { AdminPermissionsPage } from './pages/admin/permissions.page';

export { expect };

export interface LumaFixtures {
  productPage: ProductPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  categoryPage: CategoryPage;
  accountPage: AccountPage;
  registerPage: RegisterPage;
  forgotPasswordPage: ForgotPasswordPage;
  addressBookPage: AddressBookPage;
  contactPage: ContactPage;
  minicartPage: MinicartPage;
  searchPage: SearchPage;
  wishlistPage: WishlistPage;
  comparePage: ComparePage;
  reviewPage: ReviewPage;
  cookieNoticePage: CookieNoticePage;
  adminLoginPage: AdminLoginPage;
  adminConfigPage: AdminConfigPage;
  adminCMSBlockPage: AdminCMSBlockPage;
  adminCMSPagePage: AdminCMSPagePage;
  adminCartPriceRulePage: AdminCartPriceRulePage;
  adminOrderPage: AdminOrderPage;
  adminProductPage: AdminProductPage;
  adminCustomerPage: AdminCustomerPage;
  adminCachePage: AdminCachePage;
  adminReviewPage: AdminReviewPage;
  adminPermissionsPage: AdminPermissionsPage;
}

/**
 * Luma-flavoured test fixture.
 *
 * - Injects Luma selector overrides into `data` before project overrides are applied
 * - Provides all Luma page objects as fixtures
 *
 * Use this as the base for your project's fixtures.ts:
 *
 *   import { lumaTest, expect } from '@samjuk/e2e-m2-theme-luma'
 *   export { lumaTest as test, expect }
 */
export const lumaTest = coreTest.extend<LumaFixtures>({
  // Override core `data` to inject Luma selector layer before project overrides
  data: async ({}, use) => {
    const data = loadData({
      projectRoot: process.cwd(),
      themeOverrides: { selectors: lumaSelectors as any },
    });
    await use(data);
  },

  productPage: async ({ page, data }, use) => {
    await use(new ProductPage(page, data));
  },

  cartPage: async ({ page, data }, use) => {
    await use(new CartPage(page, data));
  },

  checkoutPage: async ({ page, data }, use) => {
    await use(new CheckoutPage(page, data));
  },

  categoryPage: async ({ page, data }, use) => {
    await use(new CategoryPage(page, data));
  },

  accountPage: async ({ page, data }, use) => {
    await use(new AccountPage(page, data));
  },

  registerPage: async ({ page, data }, use) => {
    await use(new RegisterPage(page, data));
  },

  forgotPasswordPage: async ({ page, data }, use) => {
    await use(new ForgotPasswordPage(page, data));
  },

  addressBookPage: async ({ page, data }, use) => {
    await use(new AddressBookPage(page, data));
  },

  contactPage: async ({ page, data }, use) => {
    await use(new ContactPage(page, data));
  },

  minicartPage: async ({ page, data }, use) => {
    await use(new MinicartPage(page, data));
  },

  searchPage: async ({ page, data }, use) => {
    await use(new SearchPage(page, data));
  },

  wishlistPage: async ({ page, data }, use) => {
    await use(new WishlistPage(page, data));
  },

  comparePage: async ({ page, data }, use) => {
    await use(new ComparePage(page, data));
  },

  reviewPage: async ({ page, data }, use) => {
    await use(new ReviewPage(page, data));
  },

  cookieNoticePage: async ({ page, data }, use) => {
    await use(new CookieNoticePage(page, data));
  },

  adminLoginPage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminLoginPage(page, data, adminSlug));
  },

  adminConfigPage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminConfigPage(page, data, adminSlug));
  },

  adminCMSBlockPage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminCMSBlockPage(page, data, adminSlug));
  },

  adminCMSPagePage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminCMSPagePage(page, data, adminSlug));
  },

  adminCartPriceRulePage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminCartPriceRulePage(page, data, adminSlug));
  },

  adminOrderPage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminOrderPage(page, data, adminSlug));
  },

  adminProductPage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminProductPage(page, data, adminSlug));
  },

  adminCustomerPage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminCustomerPage(page, data, adminSlug));
  },

  adminCachePage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminCachePage(page, data, adminSlug));
  },

  adminReviewPage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminReviewPage(page, data, adminSlug));
  },

  adminPermissionsPage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminPermissionsPage(page, data, adminSlug));
  },
});

export type LumaTest = typeof lumaTest;
