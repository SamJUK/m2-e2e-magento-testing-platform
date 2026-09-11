import { faker } from '@faker-js/faker';
import { waitForFormKey } from '@samjuk/e2e-m2-playwright-core';
import { hyvaTest as test, expect } from '../fixtures';
import { MailpitQuery } from '../index';

test.describe('Homepage', () => {
  test(
    'can visit homepage',
    { tag: ['@homepage', '@smoke'] },
    async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('footer')).toBeVisible();
    },
  );

  test(
    'can subscribe to newsletter',
    { tag: ['@homepage', '@newsletter'] },
    async ({ page, data, mailpit }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      // FPC-cached pages render a stale form_key input; submitting before it is
      // rewritten from the cookie fails with "Invalid Form Key".
      await waitForFormKey(page);

      const email = faker.internet.email();
      // Hyvä's newsletter block lives in the footer: an sr-only label plus a
      // Subscribe button, both scoped to form.subscribe so the header login
      // drawer's "Email Address" label can't win the match.
      const newsletterForm = page.locator(data.selectors.newsletter.formSelector);
      await newsletterForm
        .getByLabel(data.selectors.newsletter.emailFieldLabel, { exact: true })
        .fill(email);
      await newsletterForm
        .getByRole('button', { name: data.selectors.newsletter.subscribeButtonLabel })
        .click();
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByText(data.fixtures.newsletter.notificationText),
      ).toBeVisible();

      await expect.poll(
        async () => {
          const query = new MailpitQuery()
            .add({ key: 'subject', value: data.fixtures.newsletter.mail.subject })
            .add({ key: 'to', value: email });
          const result = await mailpit.searchInbox(query);
          return result.messages_count > 0;
        },
        { message: 'Customer should receive newsletter confirmation email', timeout: 30_000 },
      ).toBeTruthy();
    },
  );
});
