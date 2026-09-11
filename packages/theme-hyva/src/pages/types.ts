import type { Locator, Page } from '@playwright/test';

/**
 * Shared structural interfaces that all theme implementations must satisfy.
 * Module packages reference these interfaces to remain theme-agnostic.
 */

export interface IProductPage {
  /** The PDP's own final price, for the product currently open. */
  readonly price: Locator;
  addSimpleProductToCart(url: string, quantity?: number): Promise<void>;
  addConfigurableProductToCart(
    url: string,
    options: string[][],
    quantity?: number,
  ): Promise<void>;
  /**
   * Asserts the PDP at `url` reports the given availability, and that
   * add-to-cart is offered only when the product is in stock.
   */
  expectStockStatus(url: string, status: StockStatus): Promise<void>;
  /** Opens a bundle PDP with its option fieldset exposed. */
  openBundleOptions(url: string): Promise<void>;
  /** Chooses the bundle selection whose label carries `selectionTitle`. */
  selectBundleOption(selectionTitle: string): Promise<void>;
  /** Asserts the bundle's live price is exactly `expected`. */
  expectBundlePrice(expected: number, description: string): Promise<void>;
  /** Adds the configured bundle to the cart. */
  addBundleToCart(): Promise<void>;
}

/** Availability a PDP is expected to report. */
export type StockStatus = 'in' | 'out';

export interface ICartPage {
  /** One product's cart line. */
  getProductRow(productTitle: string): Locator;
  /** That line's quantity input. */
  getQuantityField(productTitle: string): Locator;
  /** That line's unit price. */
  getUnitPrice(productTitle: string): Locator;
  /** That line's row total (unit price x quantity). */
  getLineTotal(productTitle: string): Locator;
  removeProduct(productTitle: string): Promise<void>;
  changeProductQuantity(productTitle: string, quantity?: number): Promise<void>;
  /** Asserts the line total, cart subtotal and grand total add up. */
  expectTotalsAreCoherent(productTitle: string): Promise<void>;
  /** Re-requests the cart so subsequent reads come from the server. */
  open(): Promise<void>;
  /** Opens the discount disclosure, enters `code` and submits it. */
  applyCoupon(code: string): Promise<void>;
  /** Submits the applied coupon's cancel control. */
  removeCoupon(): Promise<void>;
  /** Asserts the store renders no coupon form at all (features.cart.couponForm: false). */
  expectCouponFormIsAbsent(): Promise<void>;
}

export interface ICheckoutPage {
  /** The Order Summary's subtotal, shipping, tax, discount and order total. */
  readonly summarySubtotal: Locator;
  readonly summaryDiscountBasisSubtotal: Locator;
  readonly summaryShipping: Locator;
  readonly summaryTax: Locator;
  readonly summaryGrandTotal: Locator;
  readonly summaryDiscount: Locator;
  /** Resolves with the placed order's increment ID. */
  placeOrder(data: CheckoutOrderData): Promise<string>;
  /**
   * Drives checkout as far as the payment step — address, shipping rate,
   * payment method, agreements — without submitting the order.
   */
  proceedToPayment(data: CheckoutOrderData): Promise<void>;
  /** Submits the order from the payment step; resolves with its increment ID. */
  submitOrder(): Promise<string>;
  /** Waits for the checkout's own totals to be rendered. */
  waitForTotals(): Promise<void>;
  /** Expands the Order Summary's line-item list. */
  openOrderSummaryItems(): Promise<void>;
  /** The price the Order Summary shows for one product's line. */
  getSummaryItemPrice(productTitle: string): Locator;
  /** Enters `code` in the checkout's own discount form and applies it. */
  applyCoupon(code: string): Promise<void>;
  /** Asserts the checkout renders no coupon form (features.cart.couponForm: false). */
  expectCouponFormIsAbsent(): Promise<void>;
  /** The rendered title of the payment method the quote currently carries. */
  readSelectedPaymentMethodTitle(): Promise<string>;
  /**
   * Asserts the shipping step refuses an address with a required field left
   * empty: the validation message is shown and checkout does not advance.
   */
  expectShippingStepRejectsIncompleteAddress(data: CheckoutOrderData): Promise<void>;
}

export interface ICategoryPage {
  /** Sorts the listing. Defaults to `inputs.category.listingPage.sortOrder`. */
  changeSortOrder(order?: string): Promise<void>;
  changeSortOrderDirection(): Promise<void>;
  selectFilter(filterName: string, filterValue: string): Promise<void>;
  getFirstProductName(): Promise<string | null>;
  getFirstProductPrice(): Promise<string | null>;
  /** Every listed product's price, in listing order, as parsed numbers. */
  getProductPrices(minCount?: number): Promise<number[]>;
  /** Every listed product's name, in listing order. */
  getProductNames(minCount?: number): Promise<string[]>;
  /** Chooses a results-per-page option, by its option value. */
  changeResultsPerPage(limit: string): Promise<void>;
  /** Follows the pager's own link to `pageNumber`. */
  goToPage(pageNumber: number): Promise<void>;
  /** The breadcrumb trail of the page currently open, outermost first. */
  getBreadcrumbTrail(): Promise<string[]>;
  /** Asserts the layered-navigation chip for an applied filter is present. */
  expectFilterIsApplied(filterName: string, filterValue: string): Promise<void>;
  /** Clears every applied layered-navigation filter. */
  clearAllFilters(): Promise<void>;
  /** Asserts no layered-navigation filter is applied at all. */
  expectNoFiltersAreApplied(): Promise<void>;
}

export interface IWishlistPage {
  /** Re-requests the wishlist so subsequent reads come from the server. */
  open(): Promise<void>;
  /** Adds the product at `url` to the signed-in customer's wishlist. */
  addFromProductPage(url: string): Promise<void>;
  /** Asserts a guest is refused both the control and the wishlist route. */
  expectGuestIsRedirectedToLogin(url: string): Promise<void>;
  /** How many products the wishlist currently holds, read off the server. */
  countItems(): Promise<number>;
  /** Removes one product and asserts it is gone. */
  removeProduct(productTitle: string): Promise<void>;
  /** Sends one wishlist item to the cart; the caller asserts the cart. */
  addProductToCart(productTitle: string): Promise<void>;
}

export interface IComparePage {
  /** Re-requests the comparison list so subsequent reads come from the server. */
  open(): Promise<void>;
  /** Adds the product at `url` to the comparison list and confirms it landed. */
  addFromProductPage(url: string, productTitle: string): Promise<void>;
  /** Every compared product's name, in column order. */
  getProductNames(): Promise<string[]>;
  /** Sends one compared product to the cart; the caller asserts the cart. */
  addProductToCart(productTitle: string): Promise<void>;
  /** Removes one compared product and asserts it is gone. */
  removeProduct(productTitle: string): Promise<void>;
}

export interface IReviewPage {
  /** Fills in and submits the review form on the PDP at `url`. */
  submitReview(url: string, review: ProductReview): Promise<void>;
}

export interface IAdminReviewPage {
  /** Asserts the review reached the server and is being held for moderation. */
  expectReviewIsAwaitingModeration(review: PendingReview): Promise<void>;
}

/** A review as the storefront form takes it. */
export interface ProductReview {
  nickname: string;
  summary: string;
  text: string;
  /** Which star to click, 1-5. */
  stars: number;
}

/** What the admin review grid is expected to hold afterwards. */
export interface PendingReview {
  summary: string;
  nickname: string;
  productTitle: string;
}

export interface IAccountPage {
  login(credentials: { email: string; password: string }): Promise<void>;
  logout(): Promise<void>;
  viewOrderHistory(): Promise<void>;
  viewOrder(orderNumber: string): Promise<void>;
  /**
   * Asserts the store refuses `credentials`: the sign-in error is shown, the
   * browser is still on the login form, and the session is still a guest.
   */
  expectLoginIsRejected(credentials: { email: string; password: string }): Promise<void>;
  /**
   * Asserts submitting the login form without a password is refused by the
   * theme's own validation, and that the session is still a guest.
   */
  expectLoginIsRejectedForMissingPassword(email: string): Promise<void>;
  /** Asserts the customer dashboard still bounces this session to the login page. */
  expectNotAuthenticated(): Promise<void>;
  /**
   * Opens the order and asserts it was recorded against `expectedTitle` — the
   * payment method the customer actually selected at checkout.
   */
  expectOrderPaymentMethod(orderNumber: string, expectedTitle: string): Promise<void>;
  /**
   * Changes the signed-in customer's password and asserts the store accepted
   * it. That the old password stops working is the caller's assertion.
   */
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  /** Reorders a past order from the history grid, landing on the cart page. */
  reorder(orderNumber: string): Promise<void>;
  /**
   * Changes the customer's name and email. Leaves the session signed out,
   * which is what Magento does on an email change.
   */
  editAccountDetails(
    details: { firstName: string; lastName: string; email: string },
    currentPassword: string,
  ): Promise<void>;
  /** Asserts the dashboard reports the customer the server actually holds. */
  expectDashboardShows(details: {
    firstName: string;
    lastName: string;
    email: string;
    streetAddress?: string;
  }): Promise<void>;
  /** Opens an order's printable copy (a new tab) and asserts it is that order. */
  printOrder(orderNumber: string): Promise<void>;
  /** Sets the newsletter subscription from the account and reads it back. */
  setNewsletterSubscription(subscribed: boolean): Promise<void>;
  /**
   * Finds an order through Orders and Returns and asserts the guest order view
   * opened on it.
   */
  lookUpGuestOrder(order: {
    orderNumber: string;
    email: string;
    lastName: string;
  }): Promise<void>;
}

export interface IRegisterPage {
  createNewAccount(credentials: RegisterCredentials): Promise<void>;
  /**
   * Asserts the store refuses a second account on an email that already has
   * one: the message is shown and the browser stays on the form.
   */
  expectRegistrationIsRejectedForDuplicateEmail(
    credentials: RegisterCredentials,
  ): Promise<void>;
}

export interface IForgotPasswordPage {
  requestPasswordReset(email: string): Promise<void>;
  /**
   * Follows a reset link taken from the email and sets `newPassword`, then
   * asserts the store confirmed the change.
   */
  setNewPassword(resetUrl: string, newPassword: string): Promise<void>;
}

export interface IAddressBookPage {
  open(): Promise<void>;
  addAddress(address: CustomerAddress, options?: { makeDefault?: boolean }): Promise<void>;
  /** Asserts both default-address boxes on the address book name this street. */
  expectDefaultAddresses(streetAddress: string): Promise<void>;
  editDefaultBillingAddress(changes: Partial<CustomerAddress>): Promise<void>;
  deleteAddress(streetAddress: string): Promise<void>;
  /** How many addresses the server currently holds for this customer. */
  countAddresses(): Promise<number>;
  /**
   * Submits the new-address form with `omitField` left blank and asserts the
   * store refuses it: the field is reported invalid and the customer's address
   * count is unchanged.
   */
  expectAddressIsRejectedForMissingField(
    address: CustomerAddress,
    omitField: keyof CustomerAddress,
    fieldLabel: string,
  ): Promise<void>;
}

export interface IContactPage {
  sendContactForm(): Promise<void>;
  /**
   * Submits the contact form with the message left blank and asserts the
   * store refuses it without sending anything.
   */
  expectContactFormIsRejectedForMissingField(): Promise<void>;
  /**
   * Submits the contact form with a malformed email address and asserts the
   * store refuses it without sending anything.
   */
  expectContactFormIsRejectedForMalformedEmail(): Promise<void>;
}

export interface IMinicartPage {
  ensureMinicartIsOpen(): Promise<void>;
  /** One product's minicart line. */
  getProductRow(productTitle: string): Locator;
  /** The price shown on one product's minicart line. */
  getItemPrice(productTitle: string): Locator;
  removeProduct(productTitle: string): Promise<void>;
  /** The item count the header counter reports; 0 when the cart is empty. */
  getItemCount(): Promise<number>;
}

export interface ISearchPage {
  search(query: string): Promise<void>;
  /** Asserts the results page lists products, including a known match. */
  expectResultsFor(query: string): Promise<void>;
  /**
   * Searches for a term nothing matches and asserts the store says so: the
   * no-results message is shown and no product tile is listed.
   */
  expectNoResultsFor(query: string): Promise<void>;
}

export interface IAdminLoginPage {
  login(): Promise<void>;
}

export interface IAdminOrderPage {
  openOrder(orderNumber: string): Promise<void>;
  createInvoice(orderNumber: string): Promise<void>;
  createShipment(orderNumber: string): Promise<void>;
}

// Shared data types
export interface CheckoutAddress {
  firstName: string;
  lastName: string;
  company: string;
  streetAddress: string;
  country: string;
  county: string;
  city: string;
  postcode: string;
  telephone: string;
}

export interface CheckoutOrderData {
  email: string;
  billingAddress: CheckoutAddress;
  shippingAddress: CheckoutAddress;
}

export interface RegisterCredentials {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/** Address book entry (customer/address/new). Region is free text or a select
 *  option label depending on whether the chosen country has required regions. */
export interface CustomerAddress {
  firstName: string;
  lastName: string;
  company?: string;
  streetAddress: string;
  country: string;
  region?: string;
  city: string;
  postcode: string;
  telephone: string;
}
