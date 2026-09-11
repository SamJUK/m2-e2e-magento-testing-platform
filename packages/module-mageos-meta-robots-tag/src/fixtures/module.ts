import { type Page, type TestType } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { MetaRobotsTagPage } from '../pages/meta-robots-tag.page';

export interface MetaRobotsTagFixtures {
  metaRobotsTag: MetaRobotsTagPage;
}

/**
 * Adds the `metaRobotsTag` fixture to any core-compatible test.
 *
 *   import { lumaTest } from '@samjuk/e2e-m2-theme-luma'
 *   import { withMetaRobotsTag } from '@samjuk/e2e-m2-module-mageos-meta-robots-tag'
 *
 *   export const test = withMetaRobotsTag(lumaTest)
 *
 * Core-only: the module has no storefront markup of its own, just a meta tag,
 * so there is no theme page object to borrow and no theme dependency to take.
 */
export function withMetaRobotsTag<T extends {}, W extends {}>(
  baseTest: TestType<T, W>,
): TestType<T & MetaRobotsTagFixtures, W> {
  // .extend() without type args, then assert the return type the generic
  // already guarantees — extending through `any` otherwise trips TS2347.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (baseTest as any).extend({
    metaRobotsTag: async (
      { page, data }: { page: Page; data: MergedData },
      use: (p: MetaRobotsTagPage) => Promise<void>,
    ) => {
      await use(new MetaRobotsTagPage(page, data));
    },
  }) as TestType<T & MetaRobotsTagFixtures, W>;
}
