import { expect } from '@playwright/test';
import { lumaTest } from '@samjuk/e2e-m2-theme-luma';

/**
 * Fixture composition point. This file is the target of the `#test` import
 * alias that app/code and module specs resolve through.
 *
 * Swap `lumaTest` for `hyvaTest` when using the Hyvä theme package.
 */
export const test = lumaTest;
export { expect };
