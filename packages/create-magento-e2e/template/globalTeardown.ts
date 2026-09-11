import { runGlobalTeardown } from '@samjuk/e2e-m2-playwright-core';
import { config } from './playwright.config';

export default async function globalTeardown(): Promise<void> {
  await runGlobalTeardown(config);
}
