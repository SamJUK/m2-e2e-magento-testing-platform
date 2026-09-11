import { expect } from '@playwright/test';
import { lumaTest } from '@samjuk/e2e-m2-theme-luma';
import { hyvaTest } from '@samjuk/e2e-m2-theme-hyva';

/**
 * Fixture composition point for the docker stack. The theme is chosen by
 * E2E_THEME so one project can drive both CI jobs.
 */
export const test = process.env.E2E_THEME === 'hyva' ? hyvaTest : lumaTest;
export { expect };
