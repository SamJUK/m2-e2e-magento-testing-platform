import { faker } from '@faker-js/faker';
import { hyvaTest as test } from '../fixtures';

test.describe('Product Reviews', () => {
  test(
    'a submitted review is held for moderation and reaches the admin',
    { tag: ['@review', '@admin'] },
    async ({ reviewPage, adminLoginPage, adminReviewPage, data }) => {
      // A PDP load, the review POST, an admin sign-in and a grid filter is five
      // round-trips, which does not fit the default budget on a dev-mode store.
      test.slow();

      const i = data.inputs.review;
      // A per-run summary. The admin grid is filtered on it, so a shared string
      // would match every previous run's review too and the assertion that
      // exactly one exists would be about the wrong thing.
      const summary = `${i.summaryPrefix} ${faker.string.alphanumeric(10)}`;

      await reviewPage.submitReview(data.slugs.products.simpleProduct, {
        nickname: i.nickname,
        summary,
        text: i.text,
        stars: i.ratingStars,
      });

      // Magento holds every new review for moderation, so nothing on the
      // storefront can confirm one was created: the notice `submitReview`
      // asserted is emitted before anything is re-read and would still appear
      // if the review had been dropped. The admin grid is the read-back, and it
      // is deliberately NOT approved first - approving it would mean the test
      // asserted its own edit rather than the store's behaviour, and would
      // publish test content on the storefront of whatever store it ran on.
      await adminLoginPage.login();
      await adminReviewPage.expectReviewIsAwaitingModeration({
        summary,
        nickname: i.nickname,
        productTitle: data.fixtures.product.simpleProductTitle,
      });
    },
  );
});
