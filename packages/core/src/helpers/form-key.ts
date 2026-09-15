import type { Page } from '@playwright/test';

/**
 * Waits for Magento's form-key machinery to settle.
 *
 * Two shapes, because the cookie is not always there to wait for.
 *
 * WITH full page cache on, `Magento_PageCache/js/form-key-provider.js` mints a
 * `form_key` cookie and `mage/common` rewrites every server-rendered
 * `input[name=form_key]` from it on DOM ready. Both steps matter:
 *
 * 1. A POST made before the provider runs races the cookie and fails with
 *    "Invalid Form Key".
 * 2. On a cached page the rendered inputs are STALE - cached from whoever
 *    warmed the cache - so submitting between page load and the rewrite posts
 *    the stale key and fails the same way. Seen on Varnish-fronted stores for
 *    footer newsletter forms and any other server-rendered form.
 *
 * WITH full page cache OFF, Magento never injects the provider at all, so the
 * cookie is never set. There is nothing to wait for and nothing to rewrite:
 * the page was rendered for this session, so its inputs already carry the
 * right key, and `Framework\Data\Form\FormKey\Validator` compares the POSTed
 * value against the session rather than against any cookie.
 *
 * Waiting unconditionally for the cookie hangs forever on such a store - and
 * `full_page: 0` is an ordinary developer configuration, not a broken one. It
 * cost a whole suite run against a Mage-OS stack: every test that touched a
 * form timed out in `waitForFunction` while the pages themselves rendered
 * perfectly.
 */
export async function waitForFormKey(page: Page): Promise<void> {
  // How long to keep waiting for a cookie before concluding there will never
  // be one. Only reached on stores with full page cache off; anywhere the
  // provider runs at all, the cookie lands far inside this.
  const noCookieGraceMs = 10_000;
  const giveUpOnCookieAt = Date.now() + noCookieGraceMs;

  await page.waitForFunction(
    (deadline) => {
      const inputs = document.querySelectorAll<HTMLInputElement>('input[name="form_key"]');
      const match = document.cookie.match(/(?:^|;\s*)form_key=([^;]+)/);

      if (!match) {
        // No cookie yet. Two very different situations, and the rendered
        // inputs cannot tell them apart: a server-rendered form carries a real
        // key on first paint whether or not a provider is coming.
        //
        // So keep waiting until the grace period is spent. That matters for
        // more than correctness — on a store where the provider DOES run, this
        // wait is also, incidentally, what gives Magento's admin AJAX handlers
        // time to bind. Returning as soon as the inputs looked populated made
        // admin order creation click a button whose handler did not exist yet,
        // which fails as a click that is accepted and does nothing.
        if (Date.now() < deadline) return false;
        return inputs.length > 0 && Array.from(inputs).every((input) => input.value !== '');
      }

      const cookieKey = decodeURIComponent(match[1]);
      // No server-rendered inputs: JS-built forms read the cookie directly.
      if (inputs.length === 0) return true;
      return Array.from(inputs).every((input) => input.value === cookieKey);
    },
    giveUpOnCookieAt,
  );
}

/**
 * Drops the browser's `form_key` cookie, so the next `waitForFormKey` has to
 * observe a freshly minted one rather than whatever was there before.
 *
 * Needed after any flow that logs the customer out SERVER-side. Magento's
 * `customer_logout` event runs `Magento\PageCache\Observer\FlushFormKey`,
 * which deletes the cookie AND nulls the session's own copy — and both a
 * password change (`Account\EditPost`) and a password reset
 * (`Account\ResetPasswordPost`) call `session->logout()` on success. The
 * browser can be left holding a cookie the server has already forgotten,
 * which `waitForFormKey` cannot detect: it compares the cookie against the
 * page's inputs, not against the session.
 *
 * A POST made with that key is refused before the controller runs, and
 * Magento redirects back to the form with NO message queued — which reads as
 * "the store silently ignored the submission" rather than as a CSRF failure.
 */
export async function resetFormKey(page: Page): Promise<void> {
  await page.context().clearCookies({ name: 'form_key' });
}

/**
 * Overwrites the page's rendered `form_key` inputs with a value the session
 * has never issued, so the next submission posts a key the server cannot
 * match.
 *
 * Deliberately leaves the `form_key` COOKIE alone. Magento's
 * `Framework\Data\Form\FormKey\Validator` compares the POSTed value against
 * the one held in the session, and the cookie is only how the browser-side
 * JS learns what to render. Clearing the cookie as well would make the JS
 * mint a fresh key and quietly repair the form on the next DOM-ready pass,
 * which is `resetFormKey`'s job and the opposite of what this is for.
 */
export async function tamperFormKey(page: Page): Promise<void> {
  await page.evaluate(() => {
    document
      .querySelectorAll<HTMLInputElement>('input[name="form_key"]')
      .forEach((input) => {
        input.value = 'not-a-valid-form-key';
      });
  });
}
