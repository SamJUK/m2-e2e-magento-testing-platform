import type { Locator } from '@playwright/test';

/**
 * Clicks whichever of several matches the customer can actually reach.
 *
 * A theme that repeats a call to action inside a modal leaves the copy behind
 * it visible but covered, so a plain `.first()` click waits out the test
 * budget. Later matches are tried first, because the overlay is drawn last.
 */
export async function clickReachable(candidates: Locator): Promise<void> {
  const count = await candidates.count();
  for (let i = count - 1; i > 0; i--) {
    try {
      await candidates.nth(i).click({ timeout: 10_000 });
      return;
    } catch {
      // Covered or detached; fall through to the next candidate.
    }
  }

  await candidates.first().click({ timeout: 30_000 });
}
