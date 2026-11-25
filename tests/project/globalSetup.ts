import type { FullConfig } from '@playwright/test';
import { runGlobalSetup } from '@samjuk/e2e-m2-playwright-core';
import { config } from './playwright.config';

export default async function globalSetup(full: FullConfig): Promise<void> {
  await runGlobalSetup(config, full.workers);
}
