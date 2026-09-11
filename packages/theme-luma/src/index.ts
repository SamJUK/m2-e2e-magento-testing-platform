// Theme fixtures
export { lumaTest, expect } from './fixtures';
export type { LumaFixtures, LumaTest } from './fixtures';

// Page objects — re-exported for use in project-level custom tests
export { ProductPage } from './pages/product.page';
export { CartPage } from './pages/cart.page';
export { CheckoutPage } from './pages/checkout.page';
export type { CheckoutOrderData, CheckoutAddress } from './pages/checkout.page';
export { CategoryPage, Currency } from './pages/category.page';
export { AccountPage, ForgotPasswordPage, RegisterPage } from './pages/account.page';
export type { RegisterCredentials } from './pages/account.page';
export { AddressBookPage } from './pages/address.page';
export type { CustomerAddress } from './pages/address.page';
export { ContactPage } from './pages/contact.page';
export { MinicartPage } from './pages/minicart.page';
export { SearchPage } from './pages/search.page';
export { WishlistPage } from './pages/wishlist.page';
export { ComparePage } from './pages/compare.page';
export { ReviewPage } from './pages/review.page';
export type { ProductReview } from './pages/review.page';
export { AdminLoginPage } from './pages/admin/login.page';
export { AdminConfigPage } from './pages/admin/config.page';
export { AdminCMSBlockPage } from './pages/admin/cms-block.page';
export type { CMSBlockFormData } from './pages/admin/cms-block.page';
export { AdminCMSPagePage } from './pages/admin/cms-page.page';
export type { CMSPageFormData } from './pages/admin/cms-page.page';
export { AdminCartPriceRulePage } from './pages/admin/cart-price-rule.page';
export type { CartPriceRuleFormData } from './pages/admin/cart-price-rule.page';
export { AdminOrderPage } from './pages/admin/order.page';
export type { AdminOrderInput, CreatedAdminOrder } from './pages/admin/order.page';
export { AdminProductPage } from './pages/admin/catalog.page';
export { AdminCustomerPage } from './pages/admin/customer.page';
export { AdminCachePage } from './pages/admin/cache.page';
export { AdminReviewPage } from './pages/admin/review.page';
export type { PendingReview } from './pages/admin/review.page';

// Re-exported utilities (for use in spec files shipped in src/tests/)
export { MailpitQuery } from '@samjuk/e2e-m2-playwright-core';
export type { MailpitQuerySegment } from '@samjuk/e2e-m2-playwright-core';

// Page interface contracts (useful for module packages)
export type {
  IProductPage,
  ICartPage,
  ICheckoutPage,
  ICategoryPage,
  IAccountPage,
  IRegisterPage,
  IForgotPasswordPage,
  IAddressBookPage,
  IContactPage,
  IMinicartPage,
  ISearchPage,
  IAdminLoginPage,
  IAdminOrderPage,
  IWishlistPage,
  IComparePage,
  IReviewPage,
  IAdminReviewPage,
} from './pages/types';
