import { type Page, type TestType } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { __PASCAL__Page } from '../pages/module.page';

export interface __PASCAL__Fixtures {
  __CAMEL__: __PASCAL__Page;
}

/**
 * Adds the `__CAMEL__` fixture to any core-compatible test, preserving the
 * base test's own fixtures in the returned type.
 *
 *   import { lumaTest } from '@samjuk/e2e-m2-theme-luma'
 *   import { with__PASCAL__ } from '@__SCOPE__/e2e-m2-module-__PACKAGE__'
 *
 *   export const test = with__PASCAL__(lumaTest)
 *   export { expect } from '@playwright/test'
 *
 * Depend on a theme package only if the page object genuinely needs one of its
 * page objects. Core alone gives you `page` and `data`, which is usually
 * enough, and it keeps the module usable under both themes.
 */
export function with__PASCAL__<T extends {}, W extends {}>(
  baseTest: TestType<T, W>,
): TestType<T & __PASCAL__Fixtures, W> {
  // .extend() without type args, then assert the return type the generic
  // already guarantees — extending through `any` otherwise trips TS2347.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (baseTest as any).extend({
    __CAMEL__: async (
      { page, data }: { page: Page; data: MergedData },
      use: (p: __PASCAL__Page) => Promise<void>,
    ) => {
      await use(new __PASCAL__Page(page, data));
    },
  }) as TestType<T & __PASCAL__Fixtures, W>;
}
