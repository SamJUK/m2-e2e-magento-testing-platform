/**
 * The composition point for this package's own specs.
 *
 * Imported relatively, not through a `#test` alias: a published package's
 * specs run from `dist/tests`, and `tsc` cannot resolve Node subpath imports
 * under this repo's module resolution — which is exactly how the theme
 * packages have always done it.
 *
 * Whatever a consuming store's own fixtures.ts composes is NOT what these
 * specs get, so this stub has to supply every fixture they reference.
 */
import { coreTest } from '@samjuk/e2e-m2-playwright-core';
import { expect } from '@playwright/test';
import { withElasticsuite } from './module';

export const test = withElasticsuite(coreTest);
export { expect };
/**
 * Re-exported so the specs can reach them through `#test`.
 *
 * A published module package ships `dist/` and `src/tests/` — not `src/pages/`.
 * So a spec that imports `../pages/...` resolves in this monorepo and fails
 * the moment the package is installed from a registry. `#test` is the only
 * import a spec in this package may use, and this file is what makes that
 * possible.
 */
export { misspell } from '../pages/elasticsuite.page';
