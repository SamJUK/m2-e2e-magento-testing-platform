import type { Page } from '@playwright/test';

/**
 * Reads the PHP session cookie, or null when the browser is not holding one.
 *
 * Magento names it `PHPSESSID` unless the store overrides `session.name`, so
 * the name is a parameter rather than a constant.
 */
export async function getSessionId(page: Page, name = 'PHPSESSID'): Promise<string | null> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === name)?.value ?? null;
}
