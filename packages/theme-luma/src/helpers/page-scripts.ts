/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

import type { Page } from '@playwright/test';
import { waitForFormKey } from '@samjuk/e2e-m2-playwright-core';

type RequireJs = ((id: string) => unknown) & { defined?: (id: string) => boolean };

/**
 * A page left mid-boot can swallow the flash message its own form POST queued:
 * its late `messages` component consumes the `mage-messages` cookie, or
 * customer-data isn't up yet to invalidate the `messages` section.
 */
function flashMessageScriptsBooted(): boolean {
  if (!document.querySelector(`[data-bind*="scope: 'messages'"]`)) return true;

  const requirejs = (window as unknown as { require?: RequireJs }).require;
  if (!requirejs?.defined?.('Magento_Customer/js/customer-data') || !requirejs.defined('uiRegistry')) return false;

  const customerData = requirejs('Magento_Customer/js/customer-data') as {
    getInitCustomerData(): { state(): string };
  };
  const registry = requirejs('uiRegistry') as { get(name: string): unknown };
  return customerData.getInitCustomerData().state() === 'resolved' && Boolean(registry.get('messages'));
}

/** Form key in place and flash-message JS booted, so a submit neither fails nor loses its message. */
export async function waitForPageScripts(page: Page): Promise<void> {
  await waitForFormKey(page);
  await page.waitForFunction(flashMessageScriptsBooted, undefined, { timeout: 30_000 });
}
