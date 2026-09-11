import type { MergedData } from '@samjuk/e2e-m2-playwright-core';

/**
 * Selector keys that only exist in the Hyvä layer.
 *
 * Hyvä's DOM diverges from Luma structurally, not just in wording: several
 * controls that Luma exposes by visible label are, in Hyvä, Alpine-driven
 * elements addressed by id (the mini-search panel, the cart drawer), and
 * several forms must be scoped explicitly because Hyvä renders a persistent
 * header login drawer whose field labels collide with the page's own form.
 *
 * These live here rather than in `@samjuk/e2e-m2-playwright-core` so the
 * core selector contract stays shared across themes. They are merged into
 * `data.selectors` at runtime by the `hyvaTest` `data` fixture and remain
 * overridable from a consuming project's `config/selectors.json`.
 */
export interface HyvaSelectorExtras {
  loginPage: {
    /** Scope for the real login form; excludes the header login drawer */
    formSelector: string;
    passwordFieldLabel: string;
  };
  registerPage: {
    /**
     * Hyvä's create-account <form> carries two id attributes
     * (`accountcreate` then `form-validate`); browsers keep the first, so
     * Luma's `#form-validate` never matches. Scoped by class instead.
     */
    formSelector: string;
  };
  orderHistoryPage: {
    /**
     * Hyvä's view control is an icon-only <a> whose aria-label
     * ("View order 123") beats its title, so the accessible-name match Luma
     * uses cannot work. Addressed by the stable title attribute instead.
     */
    viewOrderLinkSelector: string;
    /**
     * Hyvä's reorder control is a form-submit <button>, not Luma's <a>, and its
     * aria-label carries the order number ("Reorder 144") so an accessible-name
     * match on "Reorder" alone finds nothing. Addressed by its title attribute.
     */
    reorderControlSelector: string;
  };
  forgotPasswordPage: {
    /** Scope for the real reset form; excludes the header login drawer */
    formSelector: string;
  };
  addressBookPage: {
    /** The address edit/new form */
    formSelector: string;
    /**
     * Container for the "additional addresses" list. Hyvä renders a CSS grid of
     * <div>s here, not Luma's `#additional-addresses-table`, so there is no row
     * element to filter on.
     */
    addressListSelector: string;
    /** Icon-only delete control; its accessible name comes from title="Delete" */
    deleteLinkSelector: string;
    /** Same match as `deleteLinkSelector`, expressed as an XPath predicate */
    deleteLinkXPathClass: string;
  };
  accountOverviewPage: {
    /**
     * Header customer-menu toggle that reveals the Sign Out link. Hyvä's is an
     * icon-only button, so it cannot use core's `customerMenuTriggerLabel`.
     *
     * NB: the menu container itself is NOT redeclared here — it is core's
     * `accountOverviewPage.customerMenuSelector`, so a project's
     * `config/selectors.json` overrides it identically on either theme.
     */
    menuTriggerSelector: string;
  };
  search: {
    searchToggleSelector: string;
    searchPanelSelector: string;
    searchInputSelector: string;
  };
  newsletter: {
    /**
     * Scope for the footer subscribe form. Needed because the header login
     * drawer also carries an "Email Address" label.
     *
     * NB: the button label is deliberately NOT redeclared here — it lives in
     * the core contract as `newsletter.subscribeButtonLabel`, so a project's
     * `config/selectors.json` overrides it identically on either theme.
     */
    formSelector: string;
    emailFieldLabel: string;
  };
  minicart: {
    /** <dialog id="cart-drawer"> */
    drawerSelector: string;
    /** Header cart icon that toggles the drawer */
    triggerSelector: string;
    /**
     * Hyvä builds the remove button's accessible name from
     * `Remove product "%0" from cart`. `%s` is substituted with the
     * product title at match time.
     */
    removeItemAriaLabel: string;
  };
  cart: {
    /** Qty input inside a cart line item (it has no id) */
    quantityFieldSelector: string;
    updateButtonSelector: string;
    /**
     * Cart-page remove buttons are labelled `Remove {name}` — note the cart
     * *drawer* uses a different pattern, `Remove product "{name}" from cart`.
     * `%s` is substituted with the product title.
     */
    removeItemAriaLabel: string;
  };
  productPage: {
    /** Add-to-cart form; scopes swatches/qty away from related-product cards */
    formSelector: string;
    quantityFieldSelector: string;
    /** Alpine-rendered flash message container (`#messages`) */
  };
  categoryPage: {
    listingPage: {
      sorterSelector: string;
      /** Each filter group is a native collapsed <details> */
      filterGroupSelector: string;
      filterGroupTitleSelector: string;
      /**
       * Hyvä puts the applied-filter chips in the `<summary>` of a native
       * `<details>` and the clear-all control in its body, so the link is in
       * the DOM while the chips are on screen but is not reachable until the
       * disclosure is opened.
       */
      appliedFiltersDisclosureTitleSelector: string;
    };
  };
  currencySwitcher: {
    triggerSelector: string;
  };
}

/**
 * `MergedData` as seen through the Hyvä theme layer.
 * Structurally a superset of the core shape, so it remains assignable
 * anywhere `MergedData` is expected.
 */
export type HyvaData = Omit<MergedData, 'selectors'> & {
  selectors: MergedData['selectors'] & HyvaSelectorExtras;
};
