import { expect } from '@playwright/test';
import { coreTest, loadData } from '@samjuk/e2e-m2-playwright-core';
import hyvaSelectors from './data/selectors.json';
import hyvaFixtures from './data/fixtures.json';
import hyvaFeatures from './data/features.json';
import type { HyvaData } from './data/types';

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
import { AdminLoginPage } from './pages/admin/login.page';
import { AdminOrderPage } from './pages/admin/order.page';
import { AdminProductPage } from './pages/admin/catalog.page';
import { AdminCustomerPage } from './pages/admin/customer.page';
import { AdminCachePage } from './pages/admin/cache.page';
import { AdminReviewPage } from './pages/admin/review.page';
import { AdminConfigPage } from './pages/admin/config.page';
import { AdminCMSBlockPage } from './pages/admin/cms-block.page';
import { AdminCMSPagePage } from './pages/admin/cms-page.page';
import { AdminCartPriceRulePage } from './pages/admin/cart-price-rule.page';

export { expect };

export interface HyvaFixtures {
  /**
   * Core merged data widened with the Hyvä-only selector keys, so specs and
   * page objects get typed access to them without changing the core contract.
   */
  data: HyvaData;
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
  adminLoginPage: AdminLoginPage;
  adminOrderPage: AdminOrderPage;
  adminProductPage: AdminProductPage;
  adminCustomerPage: AdminCustomerPage;
  adminCachePage: AdminCachePage;
  adminConfigPage: AdminConfigPage;
  adminCMSBlockPage: AdminCMSBlockPage;
  adminCMSPagePage: AdminCMSPagePage;
  adminCartPriceRulePage: AdminCartPriceRulePage;
  adminReviewPage: AdminReviewPage;
}

/**
 * Hyvä-flavoured test fixture.
 *
 * - Injects Hyvä selector overrides into `data` before project overrides are applied
 * - Provides all Hyvä page objects as fixtures
 *
 * Use this as the base for your project's fixtures.ts:
 *
 *   import { hyvaTest, expect } from '@samjuk/e2e-m2-theme-hyva'
 *   export { hyvaTest as test, expect }
 */
export const hyvaTest = coreTest.extend<HyvaFixtures>({
  // Override core `data` to inject the Hyvä layer before project overrides.
  // `fixtures` carries the handful of strings where Hyvä's own templates word
  // things differently from Luma (e.g. its logout confirmation).
  data: async ({}, use) => {
    const data = loadData({
      projectRoot: process.cwd(),
      themeOverrides: {
        selectors: hyvaSelectors as any,
        fixtures: hyvaFixtures as any,
        features: hyvaFeatures as any,
      },
    });
    await use(data as HyvaData);
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

  adminLoginPage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminLoginPage(page, data, adminSlug));
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

  adminReviewPage: async ({ page, data }, use) => {
    const adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/backend';
    await use(new AdminReviewPage(page, data, adminSlug));
  },
});

export type HyvaTest = typeof hyvaTest;
