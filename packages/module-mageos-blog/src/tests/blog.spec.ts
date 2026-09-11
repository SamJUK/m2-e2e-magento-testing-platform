import { test } from '../fixtures/default';
// A separate `import type` rather than an inline `type` modifier: the inline
// form is erased by tsc but tripped the test runner's own transpiler.
import type { CreatedBlogPost } from '../fixtures/default';

/**
 * MageOS_Blog adds a whole storefront section — its own routes, its own URL
 * rewrites and its own markup. There is no sample content, so each test
 * creates the post it needs through the admin and deletes it afterwards,
 * which keeps the package safe on a store with no database rollback.
 *
 * Posts are created with a title and URL key only. The body copy is a Page
 * Builder stage on any store that has Magento_PageBuilder enabled, and driving
 * that is out of scope — so what is asserted here is the routing, the listing,
 * the status handling and the feed.
 *
 * Requires `mageos_blog/general/enabled` to be on; with it off the routes are
 * not registered and the index test fails on a 404 rather than passing quietly.
 */
test.describe('MageOS_Blog', () => {
  test.beforeEach(async ({ blog }) => {
    await blog.loginToAdmin();
  });

  test(
    'the blog index is served and renders the module container',
    { tag: ['@mageos-blog', '@blog', '@smoke'] },
    async ({ blog }) => {
      await blog.expectIndexIsReachable();
    },
  );

  test(
    'a published post is listed on the index and renders its own page',
    { tag: ['@mageos-blog', '@blog', '@smoke'] },
    async ({ blog }) => {
      const stamp = Date.now();
      const post = await blog.createPost({
        title: `E2E Blog Post ${stamp}`,
        urlKey: `e2e-blog-post-${stamp}`,
      });
      try {
        await blog.expectPostIsListed(post.spec.title);
        await blog.expectPostRenders(post);
      } finally {
        await blog.deletePost(post);
      }
    },
  );

  // The counterpart that makes the listing assertion falsifiable: a store
  // whose index listed everything regardless of status would pass the test
  // above and fail this one.
  test(
    'a draft post is neither listed nor reachable',
    { tag: ['@mageos-blog', '@blog', '@negative'] },
    async ({ blog }) => {
      const stamp = Date.now();
      let post: CreatedBlogPost | undefined;
      try {
        post = await blog.createPost({
          title: `E2E Blog Draft ${stamp}`,
          urlKey: `e2e-blog-draft-${stamp}`,
          published: false,
        });
        await blog.expectPostIsNotListed(post.spec.title);
        await blog.expectPostIsNotReachable(post);
      } finally {
        if (post) await blog.deletePost(post);
      }
    },
  );

  test(
    'the RSS feed lists a published post',
    { tag: ['@mageos-blog', '@blog', '@rss'] },
    async ({ blog }) => {
      const stamp = Date.now();
      const post = await blog.createPost({
        title: `E2E Blog Feed ${stamp}`,
        urlKey: `e2e-blog-feed-${stamp}`,
      });
      try {
        await blog.expectRssListsPost(post.spec.title);
      } finally {
        await blog.deletePost(post);
      }
    },
  );
});
