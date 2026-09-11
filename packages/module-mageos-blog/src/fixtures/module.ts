import { type Page, type TestType } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { BlogPage } from '../pages/blog.page';

export interface BlogFixtures {
  blog: BlogPage;
}

/**
 * Adds the `blog` fixture to any core-compatible test.
 *
 *   import { lumaTest } from '@samjuk/e2e-m2-theme-luma'
 *   import { withBlog } from '@samjuk/e2e-m2-module-mageos-blog'
 *
 *   export const test = withBlog(lumaTest)
 */
export function withBlog<T extends {}, W extends {}>(
  baseTest: TestType<T, W>,
): TestType<T & BlogFixtures, W> {
  // .extend() without type args, then assert the return type the generic
  // already guarantees — extending through `any` otherwise trips TS2347.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (baseTest as any).extend({
    blog: async (
      { page, data }: { page: Page; data: MergedData },
      use: (p: BlogPage) => Promise<void>,
    ) => {
      await use(new BlogPage(page, data));
    },
  }) as TestType<T & BlogFixtures, W>;
}
