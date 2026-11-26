/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

/**
 * Third-party marketing / analytics / session-replay hosts blocked in every
 * browser context. Real stores load these in production; in E2E runs they
 * only cause flakiness: Klaviyo injects signup popups (role=dialog overlays
 * that intercept every click), session-replay keeps the network busy so
 * networkidle never settles, and none of them are needed by any tested flow.
 * Payment/checkout providers are deliberately NOT on this list.
 *
 * Blocked in DNS rather than with context.route(): a route turns off the
 * browser cache, so every page refetched every script (about 230 on Luma).
 *
 * Opt out with E2E_BLOCK_THIRD_PARTY=0; extend with
 * E2E_BLOCK_EXTRA_HOSTS="foo.com,bar.io" (the host and its subdomains).
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

/** Chromium flag that fails DNS for each blocked host and its subdomains, or undefined when opted out. */
export function blockedHostsLaunchArg(): string | undefined {
  if (process.env.E2E_BLOCK_THIRD_PARTY === '0') return undefined;
  const extra = (process.env.E2E_BLOCK_EXTRA_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const rules = [...THIRD_PARTY_BLOCKED_HOST_SUFFIXES, ...extra].flatMap((host) => [
    `MAP ${host} ~NOTFOUND`,
    `MAP *.${host} ~NOTFOUND`,
  ]);
  return `--host-resolver-rules=${rules.join(', ')}`;
}
