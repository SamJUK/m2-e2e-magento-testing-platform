import type { Locator } from '@playwright/test';

/**
 * Chooses an option, whether or not the theme leaves the select clickable.
 *
 * Themes that draw their own dropdown hide the native `<select>` and present a
 * styled list, so `selectOption` waits for an element that will never be
 * visible and spends the test's whole budget doing it. The value still has to
 * reach the real control, so it is set directly once the polite attempt has
 * been given its chance.
 */
export async function setSelect(
  select: Locator,
  value: Parameters<Locator['selectOption']>[0],
): Promise<void> {
  try {
    await select.selectOption(value, { timeout: 15_000 });
    return;
  } catch {
    await select.selectOption(value, { force: true, timeout: 15_000 });
  }
}
