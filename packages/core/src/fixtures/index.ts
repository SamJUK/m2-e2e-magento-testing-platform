import { test as base } from '@playwright/test';
import { Mailpit } from '../helpers/mailpit';
import { loadData, type MergedData } from '../data';

/**
 * Third-party marketing / analytics / session-replay hosts blocked in every
 * browser context. Real stores load these in production; in E2E runs they
 * only cause flakiness: Klaviyo injects signup popups (role=dialog overlays
 * that intercept every click), session-replay keeps the network busy so
 * networkidle never settles, and none of them are needed by any tested flow.
 * Payment/checkout providers are deliberately NOT on this list.
 *
 * Opt out with E2E_BLOCK_THIRD_PARTY=0; extend with
 * E2E_BLOCK_EXTRA_HOSTS="foo.com,bar.io" (suffix match on hostname).
 */
const THIRD_PARTY_BLOCKED_HOST_SUFFIXES = [
  // Marketing popups / email capture
  'klaviyo.com',
  'mailchimp.com',
  'list-manage.com',
  'omnisend.com',
  'privy.com',
  'justuno.com',
  // Analytics / tag managers / ads
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'facebook.net',
  'facebook.com',
  'hotjar.com',
  'clarity.ms',
  'tiktok.com',
  'pinterest.com',
  'snapchat.com',
  'bing.com',
  'linkedin.com',
  'twitter.com',
  'ads-twitter.com',
  // Session replay / error reporting from the page
  'sentry.io',
  'sentry-cdn.com',
  'logrocket.io',
  'lr-ingest.io',
  'fullstory.com',
  // Live-chat widgets (floating iframes that sit over page content)
  'zopim.com',
  'zdassets.com',
  'zendesk.com',
  'freshchat.com',
  'gorgias.chat',
  'tawk.to',
  'tidio.co',
  'intercom.io',
  'crisp.chat',
  // Cookie-consent SaaS overlays
  'cookieyes.com',
  'cookiebot.com',
  'onetrust.com',
  'cookielaw.org',
  // Review / social widgets
  'trustpilot.com',
  'trustpilotserver.com',
  'yotpo.com',
  'instagram.com',
];

function isBlockedHost(hostname: string): boolean {
  const extra = (process.env.E2E_BLOCK_EXTRA_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return [...THIRD_PARTY_BLOCKED_HOST_SUFFIXES, ...extra].some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

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
  context: async ({ context }, use) => {
    if (process.env.E2E_BLOCK_THIRD_PARTY !== '0') {
      await context.route(
        (url) => isBlockedHost(url.hostname),
        (route) => route.abort(),
      );
    }
    await use(context);
  },

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
