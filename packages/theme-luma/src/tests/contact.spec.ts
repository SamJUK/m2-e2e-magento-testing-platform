/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

import { lumaTest as test } from '../fixtures';

test(
  'can send contact form message',
  { tag: ['@contact', '@smoke'] },
  async ({ contactPage }) => {
    await contactPage.sendContactForm();
  },
);

test(
  'contact form with a missing required field is rejected',
  { tag: ['@contact', '@negative'] },
  async ({ contactPage }) => {
    await contactPage.expectContactFormIsRejectedForMissingField();
  },
);

test(
  'contact form with a malformed email address is rejected',
  { tag: ['@contact', '@negative'] },
  async ({ contactPage }) => {
    await contactPage.expectContactFormIsRejectedForMalformedEmail();
  },
);
