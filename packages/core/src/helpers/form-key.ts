import type { BrowserContext, Page } from '@playwright/test';

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
 * Waiting unconditionally for the cookie hangs forever on such a store, and
 * `full_page: 0` is an ordinary developer configuration. It cost a whole suite
 * run against a Mage-OS stack.
 */
/**
 * Whether this store mints a form-key cookie, remembered per browser context.
 *
 * Without this the no-cookie grace is paid on EVERY call, and a store with the
 * full page cache off never mints one: ~60 call sites across the page objects,
 * two back to back in a single sign-in helper. Both stock demo stores run with
 * full_page off, so the tax was being paid for real.
 */
type FormKeyProvider = 'provider' | 'absent';
const providerByContext = new WeakMap<BrowserContext, FormKeyProvider>();

export async function waitForFormKey(page: Page): Promise<void> {
  const context = page.context();

  if (providerByContext.get(context) === 'absent') {
    await page.waitForFunction(
      () => {
        const inputs = document.querySelectorAll<HTMLInputElement>('input[name="form_key"]');
        return inputs.length === 0 || Array.from(inputs).every((input) => input.value !== '');
      },
      undefined,
      { timeout: 15_000 },
    );
    return;
  }

  const graceMs = 10_000;

  // The deadline is computed inside the page, not passed in: a Node timestamp
  // compared against a page clock skews under a remote browser.
  const outcome = await page.waitForFunction(
    (grace) => {
      const scope = window as unknown as { __e2eFormKeyDeadline?: number };
      if (scope.__e2eFormKeyDeadline === undefined) {
        scope.__e2eFormKeyDeadline = Date.now() + grace;
      }

      const inputs = document.querySelectorAll<HTMLInputElement>('input[name="form_key"]');
      const match = document.cookie.match(/(?:^|;\s*)form_key=([^;]+)/);

      if (match) {
        const cookieKey = decodeURIComponent(match[1]);
        // JS-built forms read the cookie directly, so no inputs is fine.
        if (inputs.length === 0) return 'provider';
        return Array.from(inputs).every((input) => input.value === cookieKey) ? 'provider' : false;
      }

      if (Date.now() < scope.__e2eFormKeyDeadline) return false;
      // No provider on this store: the page was rendered for this session, so
      // its own inputs are the right key. No inputs at all is also settled -
      // demanding some is what used to hang a JS-only page for the full wait.
      if (inputs.length === 0) return 'absent';
      return Array.from(inputs).every((input) => input.value !== '') ? 'absent' : false;
    },
    graceMs,
    { timeout: graceMs + 20_000 },
  );

  providerByContext.set(context, (await outcome.jsonValue()) as FormKeyProvider);
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
