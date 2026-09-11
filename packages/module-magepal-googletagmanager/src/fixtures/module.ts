import { type Page, type TestType } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { GoogleTagManagerPage } from '../pages/google-tag-manager.page';

export interface GoogleTagManagerFixtures {
  googleTagManager: GoogleTagManagerPage;
}

/**
 * Adds the `googleTagManager` fixture to any core-compatible test.
 *
 *   import { lumaTest } from '@samjuk/e2e-m2-theme-luma'
 *   import { withGoogleTagManager } from '@samjuk/e2e-m2-module-magepal-googletagmanager'
 *
 *   export const test = withGoogleTagManager(lumaTest)
 *
 * Composing onto a theme test is worth doing in a store's own suite: the pushes
 * this package cannot reach core-only — add-to-cart and purchase — need a theme
 * page object to drive the storefront that far.
 */
export function withGoogleTagManager<T extends {}, W extends {}>(
  baseTest: TestType<T, W>,
): TestType<T & GoogleTagManagerFixtures, W> {
  // .extend() without type args, then assert the return type the generic
  // already guarantees — extending through `any` otherwise trips TS2347.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (baseTest as any).extend({
    googleTagManager: async (
      { page, data }: { page: Page; data: MergedData },
      use: (p: GoogleTagManagerPage) => Promise<void>,
    ) => {
      await use(new GoogleTagManagerPage(page, data));
    },
  }) as TestType<T & GoogleTagManagerFixtures, W>;
}
