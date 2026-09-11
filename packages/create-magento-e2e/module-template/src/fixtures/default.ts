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
import { with__PASCAL__ } from './module';

export const test = with__PASCAL__(coreTest);
export { expect };
