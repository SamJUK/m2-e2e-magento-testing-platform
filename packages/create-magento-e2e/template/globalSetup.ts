import { runGlobalSetup } from '@samjuk/e2e-m2-playwright-core';
import { config } from './playwright.config';

export default async function globalSetup(): Promise<void> {
  await runGlobalSetup(config);
}
