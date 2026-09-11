import { expect, type Locator, type Page } from '@playwright/test';
import { waitForFormKey, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { IWishlistPage } from './types';

/**
 * Matches the login form's own URL.
 *
 * Deliberately open-ended after the slug: when Magento bounces a guest off a
 * protected route it appends the origin as extra PATH segments
 * (`/customer/account/login/referer/<base64>/`), not as a query string.
 */
function loginUrlPattern(slug: string): RegExp {
  const escaped = slug.replace(/\/+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(/|$)`);
}

export class WishlistPage implements IWishlistPage {
  readonly page: Page;
  readonly items: Locator;
  readonly addToWishlistControl: Locator;

  constructor(page: Page, private data: MergedData) {
    this.page = page;
    const s = data.selectors;
    this.items = page.locator(s.wishlistPage.itemSelector);
    // `.first()`: related/upsell cards further down a PDP render the same
    // control, and on the comparison page every column carries one.
    this.addToWishlistControl = page.locator(s.productPage.addToWishlistSelector).first();
  }

  /**
   * Re-requests the wishlist so every subsequent read comes from the server,
   * and waits until its controls will actually respond.
   *
   * Neither the remove link nor the tile's Add to Cart has an href: both are
   * `data-post` payloads that only do anything once Magento has applied the
   * `mage.wishlist` widget to the page's form, which is a separate RequireJS
   * round trip from the form-key JS. A click before that is swallowed in
   * silence — no request, no error — and reads as a store that ignored the
   * control. The widget stores its instance under jQuery UI's own
   * `mage-wishlist` data key, so its presence is the exact "this page is live"
   * signal. An empty wish list renders no form at all and has nothing to wait
   * for.
   */
  async open(): Promise<void> {
    await this.page.goto(this.data.slugs.wishlist, { waitUntil: 'domcontentloaded' });
    await waitForFormKey(this.page);
    await this.page.waitForFunction(
      () => {
        const jquery = (window as unknown as { jQuery?: (element: Element) => { data(key: string): unknown } })
          .jQuery;
        if (!jquery) return false;
        const form = Array.from(document.querySelectorAll('[data-mage-init]')).find((element) =>
          (element.getAttribute('data-mage-init') ?? '').includes('"wishlist"'),
        );
        return !form || Boolean(jquery(form).data('mage-wishlist'));
      },
      undefined,
      { timeout: 30_000 },
    );
  }

  /** The wishlist tile for one product, read off the server's own rendering. */
  getItem(productTitle: string): Locator {
    const s = this.data.selectors.wishlistPage;
    return this.items.filter({
      has: this.page.locator(s.itemNameSelector, { hasText: productTitle }),
    });
  }

  /** How many products the wishlist currently holds. */
  async countItems(): Promise<number> {
    await this.open();
    return this.items.count();
  }

  /**
   * Adds the product at `url` to the signed-in customer's wishlist.
   *
   * Waits on the `wishlist/index/add` POST rather than on a navigation: Luma
   * submits a generated form and redirects, Hyvä posts with `fetch` and stays
   * put, and the POST is the one event both make. The confirmation is then
   * asserted, and the caller reads the wishlist itself back off the server —
   * the message alone would still appear if the item never persisted.
   */
  async addFromProductPage(url: string): Promise<void> {
    const f = this.data.fixtures.wishlist;
    // Stores that defer or merge their JS render the control long before its
    // handler is bound: the first click is silently swallowed, no POST is made
    // and nothing happens at all. Retry the whole click → POST → message cycle.
    await expect(async () => {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitForFormKey(this.page);
      // Hyvä defers the button's Alpine component until it intersects.
      await this.addToWishlistControl.scrollIntoViewIfNeeded();

      const posted = this.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('wishlist/index/add'),
        { timeout: 30_000 },
      );
      await this.addToWishlistControl.click();
      await posted;

      await expect(
        this.page.getByText(f.addedNotificationText).first(),
        'the store confirms the product reached the wish list',
      ).toBeVisible({ timeout: 30_000 });
    }).toPass({ timeout: 120_000 });
  }

  /**
   * Asserts a guest cannot use the wishlist at all.
   *
   * Both halves are needed. The PDP control bouncing to the login form proves
   * the add was refused; re-requesting the wishlist itself proves the refusal
   * is the route's, not just that one control's, so a theme that merely hid
   * the button would still fail here.
   */
  async expectGuestIsRedirectedToLogin(url: string): Promise<void> {
    const loginUrl = loginUrlPattern(this.data.slugs.account.login);

    // Retried for the same reason the add is: on a store that defers or merges
    // its JS the first click is swallowed and nothing happens, which would read
    // as "the guest was not redirected" and fail this test for the wrong
    // reason. A store that genuinely lets guests through still fails, because
    // the redirect never arrives however many times it is clicked.
    await expect(async () => {
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      await waitForFormKey(this.page);
      await this.addToWishlistControl.scrollIntoViewIfNeeded();
      await expect(
        this.addToWishlistControl,
        'the PDP offers a wish list control to a guest',
      ).toHaveCount(1);
      await this.addToWishlistControl.click();

      await expect(
        this.page,
        'adding to a wish list as a guest lands on the login form',
      ).toHaveURL(loginUrl, { timeout: 20_000 });
    }).toPass({ timeout: 90_000 });

    await this.page.goto(this.data.slugs.wishlist, { waitUntil: 'domcontentloaded' });
    await expect(
      this.page,
      'the wish list itself is closed to a guest',
    ).toHaveURL(loginUrl, { timeout: 45_000 });
  }

  /**
   * Activates one of a wishlist tile's own controls.
   *
   * Through the element's own `click()` rather than Playwright's, because Luma
   * hides the tile's action panel until the tile is hovered and then draws it
   * as an absolutely-positioned overlay that the page's own sidebar covers —
   * a real pointer click is either refused as invisible or lands on the
   * sidebar. Both themes attach real click handlers (Luma delegates `data-post`
   * from the document, Hyvä binds Alpine's `@click`), so a dispatched click
   * runs exactly the same code the customer's does. Nothing is assumed to have
   * worked: every caller reads the result back off the server.
   */
  private async clickItemControl(control: Locator): Promise<void> {
    await expect(control, 'the wish list tile offers exactly one such control').toHaveCount(1);
    await control.evaluate((element) => (element as HTMLElement).click());
  }

  /**
   * Removes one product, and proves it is gone by re-reading the wishlist.
   *
   * Whether removal asks for confirmation is a declared store capability
   * (`features.wishlist.removeConfirmation`), not something probed for:
   * best-effort accepting would hide both a dialog that stopped appearing and
   * one that appeared where none was expected. Luma routes its remove control
   * through Magento's confirm modal; Hyva posts immediately.
   *
   * The caller asserts the precondition (exactly one item) before calling, so
   * the emptiness this exits on cannot be vacuously true.
   */
  async removeProduct(productTitle: string): Promise<void> {
    const s = this.data.selectors.wishlistPage;
    const requiresConfirmation = this.data.features.wishlist.removeConfirmation;
    // Magento's confirm modal accept button carries `.action-accept` whatever
    // its wording or theme.
    const accept = this.page.locator('aside .action-accept:visible').first();

    await this.open();
    await expect(
      this.getItem(productTitle),
      `"${productTitle}" has exactly one wish list tile`,
    ).toHaveCount(1);

    // Retried whole: on a store that defers or merges its JS the control's
    // handler binds late and the first click does nothing at all, leaving
    // nothing for a one-shot assertion to distinguish from a broken removal.
    await expect(async () => {
      await this.open();
      const item = this.getItem(productTitle);
      if (await item.count()) {
        // Removal is a POST on both themes. The wait is armed before the click,
        // because the `open()` below would otherwise cancel the request in
        // flight and the item would never leave the wish list — the classic way
        // a removal test goes green having removed nothing.
        // `.catch`: this promise must never be left rejecting on its own. If
        // the confirmation branch below throws first, an un-awaited rejection
        // reaches Playwright as an unhandled error and fails the whole test
        // there and then — skipping the retry this loop exists to provide, and
        // reporting the wait rather than what actually went wrong.
        const posted = this.page
          .waitForResponse(
            (response) =>
              response.request().method() === 'POST' &&
              response.url().includes('wishlist/index/remove'),
            { timeout: 20_000 },
          )
          .catch(() => null);
        await this.clickItemControl(item.locator(s.removeSelector));
        if (requiresConfirmation) {
          await accept.click({ timeout: 10_000 });
        } else {
          await expect(
            accept,
            'features.wishlist.removeConfirmation is false, so removal opens no confirmation dialog',
          ).toHaveCount(0, { timeout: 2_000 });
        }
        expect(await posted, 'the removal was posted to the store').not.toBeNull();
        await this.open();
      }
      await expect(
        this.getItem(productTitle),
        `"${productTitle}" is no longer on the wish list`,
      ).toHaveCount(0, { timeout: 10_000 });
    }).toPass({ timeout: 90_000 });
  }

  /**
   * Sends one wishlist item to the cart. The caller then asserts the cart
   * itself — this only drives the control.
   */
  async addProductToCart(productTitle: string): Promise<void> {
    const s = this.data.selectors.wishlistPage;
    await this.open();
    const item = this.getItem(productTitle);
    await expect(item, `"${productTitle}" has exactly one wish list tile`).toHaveCount(1);

    // Retried for the same reason `addFromProductPage` is: the tile's Add to
    // Cart is a `data-post` button whose handler Magento delegates from the
    // document, so a click landing before that handler is bound makes no
    // request at all and there is nothing for a one-shot wait to observe.
    await expect(async () => {
      await this.open();
      const posted = this.page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().includes('wishlist/index/cart'),
        { timeout: 20_000 },
      );
      await this.clickItemControl(this.getItem(productTitle).locator(s.addToCartSelector));
      await posted;
    }).toPass({ timeout: 120_000 });
  }
}
