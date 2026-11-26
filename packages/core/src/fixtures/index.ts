/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

import { test as base } from '@playwright/test';
import { Mailpit } from '../helpers/mailpit';
import { loadData, type MergedData } from '../data';

export type { MergedData };

export interface CoreFixtures {
  /**
   * Pre-initialised Mailpit client. Only available when mailpitUrl is set.
   * Usage: const messages = await mailpit.searchInbox(query)
   */
  mailpit: Mailpit;
  /**
   * Merged data (fixtures, inputs, selectors, slugs) with project overrides applied.
   * Themes extend this fixture to inject their selector overrides before project overrides.
   */
  data: MergedData;
}

/**
 * Base test fixture extended by all theme packages.
 * Provides mailpit and data fixtures.
 *
 * Do not use this directly in specs — import from your theme package instead.
 */
export const coreTest = base.extend<CoreFixtures>({
  mailpit: async ({}, use) => {
    const mailpitUrl = process.env.MAILPIT_URL;
    if (!mailpitUrl) {
      throw new Error(
        'MAILPIT_URL environment variable is required for email testing. ' +
        'Set it in your .env file.',
      );
    }
    await use(new Mailpit(mailpitUrl));
  },

  // Overridden by theme packages to inject theme selector overrides.
  // Falls back to core-only data (no theme overrides) so core tests still work.
  data: async ({}, use) => {
    await use(loadData({ projectRoot: process.cwd() }));
  },
});

export type CoreTest = typeof coreTest;
