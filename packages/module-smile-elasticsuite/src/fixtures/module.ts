import { type Page, type TestType } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { ElasticsuitePage } from '../pages/elasticsuite.page';

export interface ElasticsuiteFixtures {
  elasticsuite: ElasticsuitePage;
}

/**
 * Adds the `elasticsuite` fixture to any core-compatible test.
 *
 *   import { lumaTest } from '@samjuk/e2e-m2-theme-luma'
 *   import { withElasticsuite } from '@samjuk/e2e-m2-module-smile-elasticsuite'
 *
 *   export const test = withElasticsuite(lumaTest)
 */
export function withElasticsuite<T extends {}, W extends {}>(
  baseTest: TestType<T, W>,
): TestType<T & ElasticsuiteFixtures, W> {
  // .extend() without type args, then assert the return type the generic
  // already guarantees — extending through `any` otherwise trips TS2347.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (baseTest as any).extend({
    elasticsuite: async (
      { page, data }: { page: Page; data: MergedData },
      use: (p: ElasticsuitePage) => Promise<void>,
    ) => {
      await use(new ElasticsuitePage(page, data));
    },
  }) as TestType<T & ElasticsuiteFixtures, W>;
}
