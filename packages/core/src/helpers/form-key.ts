import type { Page } from '@playwright/test';

/**
 * Waits for Magento's PageCache form-key machinery to settle:
 *
 * 1. The form-key-provider JS must have set the `form_key` cookie — form
 *    POSTs made before it runs race the cookie and fail with
 *    "Invalid Form Key".
 * 2. On full-page-cached pages the server-rendered hidden
 *    `input[name=form_key]` values are STALE (cached from whoever warmed the
 *    cache); `mage/common` rewrites them from the cookie on DOM ready.
 *    Submitting between page load and that rewrite posts the stale key and
 *    also fails with "Invalid Form Key" — seen on Varnish-fronted stores for
 *    footer newsletter forms and any other server-rendered form.
 */
export async function waitForFormKey(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const match = document.cookie.match(/(?:^|;\s*)form_key=([^;]+)/);
    if (!match) return false;
    const cookieKey = decodeURIComponent(match[1]);
    const inputs = document.querySelectorAll<HTMLInputElement>('input[name="form_key"]');
    // No server-rendered inputs: JS-built forms read the cookie directly.
    if (inputs.length === 0) return true;
    return Array.from(inputs).every((input) => input.value === cookieKey);
  });
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
