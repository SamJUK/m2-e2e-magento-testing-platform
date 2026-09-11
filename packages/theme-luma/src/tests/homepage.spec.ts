import { faker } from '@faker-js/faker';
import { waitForFormKey } from '@samjuk/e2e-m2-playwright-core';
import { lumaTest as test, expect } from '../fixtures';
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
      // FPC-cached pages render a stale form_key input; submitting before
      // mage/common rewrites it from the cookie fails with "Invalid Form Key".
      await waitForFormKey(page);

      const email = faker.internet.email();
      await page.getByLabel(data.selectors.newsletter.emailFieldLabel).fill(email);
      await page
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
