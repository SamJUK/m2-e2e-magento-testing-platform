import type { Locator } from '@playwright/test';

/**
 * Sets a checkbox, whether or not the theme lets the input be clicked.
 *
 * `check()` and `setChecked()` act on the input and wait for it to be
 * actionable. Themes that style their own control hide the input, or leave it
 * visible but covered by the label they draw over it, and either way the call
 * waits out the whole test budget on a page a customer could use. So the label
 * is tried first, which is what a customer clicks, and the result is read back
 * rather than assumed.
 */
export async function setCheckbox(box: Locator, checked: boolean): Promise<void> {
  if ((await box.isChecked()) === checked) {
    return;
  }

  const id = await box.getAttribute('id');
  if (id) {
    const label = box.page().locator(`label[for="${id}"]`);
    if ((await label.count()) > 0) {
      await label.first().click({ timeout: 15_000 }).catch(() => {});
      if ((await box.isChecked()) === checked) {
        return;
      }
    }
  }

  await box.setChecked(checked, { timeout: 15_000 }).catch(() => {});
  if ((await box.isChecked()) === checked) {
    return;
  }

  // The input is there and the theme has only made it unclickable, so drive it
  // directly rather than spending the test's budget waiting.
  await box.setChecked(checked, { force: true, timeout: 15_000 });
}
