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
