import { type Page, type TestType } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { GdprPage } from '../pages/gdpr.page';

export interface GdprFixtures {
  gdpr: GdprPage;
}

/**
 * Adds the `gdpr` fixture to any core-compatible test.
 *
 *   import { lumaTest } from '@samjuk/e2e-m2-theme-luma'
 *   import { withGdpr } from '@samjuk/e2e-m2-module-opengento-gdpr'
 *
 *   export const test = withGdpr(lumaTest)
 */
export function withGdpr<T extends {}, W extends {}>(
  baseTest: TestType<T, W>,
): TestType<T & GdprFixtures, W> {
  // .extend() without type args, then assert the return type the generic
  // already guarantees — extending through `any` otherwise trips TS2347.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (baseTest as any).extend({
    gdpr: async (
      { page, data }: { page: Page; data: MergedData },
      use: (p: GdprPage) => Promise<void>,
    ) => {
      await use(new GdprPage(page, data));
    },
  }) as TestType<T & GdprFixtures, W>;
}
