/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

import fs from 'fs';
import path from 'path';
import { test as base, type Request } from '@playwright/test';
import { Mailpit } from '../helpers/mailpit';
import { loadData, type MergedData } from '../data';

export type { MergedData };

interface RequestWindow {
  label: string;
  start: number;
  end?: number;
}

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
  /** Requests the test's page sent to the store, for matching exception.log entries. Internal. */
  requestLog: RequestWindow[];
  /** Records when each test ran and what it requested, so teardown can name the cause of each exception. */
  recordTestWindow: void;
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

  requestLog: async ({}, use) => {
    await use([]);
  },

  // Only for tests that open a page, so API-only tests never start a browser.
  context: async ({ context, requestLog, baseURL }, use) => {
    if (process.env.E2E_TEST_WINDOWS) {
      const store = baseURL ? new URL(baseURL).origin : undefined;
      const open = new Map<Request, RequestWindow>();
      const close = (request: Request) => {
        const entry = open.get(request);
        if (entry) entry.end = Date.now();
        open.delete(request);
      };
      context.on('request', (request) => {
        if (!['document', 'xhr', 'fetch'].includes(request.resourceType())) return;
        const url = new URL(request.url());
        // Only requests PHP serves: the store's own, minus files the web server sends itself.
        if ((store && url.origin !== store) || /^\/(static|media)\//.test(url.pathname)) return;
        const entry: RequestWindow = { label: `${request.method()} ${url.pathname}`, start: Date.now() };
        requestLog.push(entry);
        open.set(request, entry);
      });
      context.on('requestfinished', close);
      context.on('requestfailed', close);
    }
    await use(context);
  },

  recordTestWindow: [
    async ({ requestLog }, use, testInfo) => {
      const start = Date.now();
      await use();
      const file = process.env.E2E_TEST_WINDOWS;
      if (!file) return;
      const end = Date.now();
      const title = [`${path.basename(testInfo.file)}:${testInfo.line}`, ...testInfo.titlePath.slice(1)].join(' › ');
      const requests = requestLog.map((r) => ({ ...r, end: r.end ?? end }));
      fs.appendFileSync(file, `${JSON.stringify({ title, retry: testInfo.retry, start, end, requests })}\n`);
    },
    { auto: true },
  ],
});

export type CoreTest = typeof coreTest;
