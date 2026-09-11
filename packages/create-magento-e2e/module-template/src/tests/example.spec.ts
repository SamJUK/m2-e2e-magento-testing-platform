import { test, expect } from '../fixtures/default';

test.describe('__PASCAL__', () => {
  test(
    'the banner renders on the homepage',
    { tag: ['@__PACKAGE__', '@smoke'] },
    async ({ page, __CAMEL__ }) => {
      await page.goto('/');
      await __CAMEL__.expectBannerIsVisible();
    },
  );
});
