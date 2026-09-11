import { hyvaTest as test, expect } from '../fixtures';

/**
 * The cheapest possible regression net: every page below is one an upgrade or
 * a bad deploy can take down outright, and a 500 or a stray redirect here
 * explains a dozen downstream failures at once.
 *
 * These assert the HTTP status, not that something rendered — a Magento
 * exception page is perfectly capable of showing a footer.
 */
test.describe('Storefront health', () => {
  test(
    'key storefront pages respond with HTTP 200',
    { tag: ['@health', '@smoke'] },
    async ({ page, data }) => {
      const pages: [string, string][] = [
        ['homepage', '/'],
        ['category listing', data.slugs.categories.listingPage],
        ['product detail', data.slugs.products.simpleProduct],
        ['cart', data.slugs.cart],
      ];

      for (const [name, url] of pages) {
        await test.step(`${name} (${url})`, async () => {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
          expect(response, `${name} returned a response`).not.toBeNull();
          expect(response?.status(), `${name} responded with HTTP 200`).toBe(200);
        });
      }
    },
  );

  test(
    'a nonexistent URL renders the 404 page',
    { tag: ['@health', '@smoke', '@negative'] },
    async ({ page, data }) => {
      const response = await page.goto(data.slugs.notFound, { waitUntil: 'domcontentloaded' });

      // Both halves matter: a store that renders its 404 page under a 200 is
      // still broken (search engines index it), and one that returns 404 with
      // a blank body has lost the CMS page.
      expect(response?.status(), 'the store reports HTTP 404').toBe(404);
      await expect(
        page.getByRole('heading', { name: data.fixtures.notFound.headingText }),
        'the 404 CMS page is rendered',
      ).toBeVisible();
    },
  );
});
