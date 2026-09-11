import { test, expect } from '../fixtures/default';

/**
 * MageOS_MetaRobotsTag turns three per-entity flags into robots directives:
 * `no_index` replaces INDEX with NOINDEX, `no_follow` replaces FOLLOW with
 * NOFOLLOW, and `no_archive` appends NOARCHIVE (there is no ARCHIVE in the
 * default to replace). Those are two distinct code paths through one model,
 * reached by two separate observers — one for CMS pages, one for catalog
 * entities — so the suite exercises both observers and both paths.
 *
 * Every test that sets a flag also clears it, so the store is left as it was
 * and the suite is safe on a store with no database rollback. Clearing it is
 * also what makes these assertions falsifiable: the same URL is asserted to
 * carry two mutually exclusive directives, before and after the revert, so an
 * assertion that could not read the real page could not pass both.
 */
const DEFAULT_ROBOTS = ['INDEX', 'FOLLOW'];

test.describe('MageOS_MetaRobotsTag', () => {
  test.beforeEach(async ({ metaRobotsTag }) => {
    await metaRobotsTag.loginToAdmin();
  });

  // The anchor for every other test here: without it, an assertion that a page
  // renders NOINDEX proves nothing, because a store whose default already
  // said NOINDEX would pass it with the module switched off.
  test(
    'an unflagged product keeps the store default robots directive',
    { tag: ['@mageos-meta-robots-tag', '@seo', '@smoke'] },
    async ({ metaRobotsTag, data }) => {
      await metaRobotsTag.expectRobots(data.slugs.products.simpleProduct, DEFAULT_ROBOTS);
    },
  );

  test(
    'a CMS page flagged No index renders NOINDEX',
    { tag: ['@mageos-meta-robots-tag', '@seo', '@smoke'] },
    async ({ metaRobotsTag }) => {
      const stamp = Date.now();
      const page = await metaRobotsTag.createCmsPage({
        title: `E2E Robots NoIndex ${stamp}`,
        urlKey: `e2e-robots-noindex-${stamp}`,
        flags: { no_index: true },
      });
      try {
        await metaRobotsTag.expectRobots(page.path, ['NOINDEX', 'FOLLOW']);
      } finally {
        await metaRobotsTag.deleteCmsPage(page.adminUrl);
      }
    },
  );

  // The append path rather than the replace path: NOARCHIVE joins the existing
  // directives instead of taking one of their places.
  test(
    'a CMS page flagged No archive appends NOARCHIVE to the default',
    { tag: ['@mageos-meta-robots-tag', '@seo'] },
    async ({ metaRobotsTag }) => {
      const stamp = Date.now();
      const page = await metaRobotsTag.createCmsPage({
        title: `E2E Robots NoArchive ${stamp}`,
        urlKey: `e2e-robots-noarchive-${stamp}`,
        flags: { no_archive: true },
      });
      try {
        await metaRobotsTag.expectRobots(page.path, ['INDEX', 'FOLLOW', 'NOARCHIVE']);
      } finally {
        await metaRobotsTag.deleteCmsPage(page.adminUrl);
      }
    },
  );

  // Catalog observer, product branch. Uses the throwaway product the seed
  // maintains for admin edits, never the simple product the cart and checkout
  // suites depend on.
  test(
    'a product flagged No follow renders NOFOLLOW on its PDP',
    { tag: ['@mageos-meta-robots-tag', '@seo', '@product'] },
    async ({ metaRobotsTag, data }) => {
      const sku = data.fixtures.product.adminEditable.sku;
      const pdp = data.slugs.products.adminEditableProduct;
      try {
        await metaRobotsTag.setProductFlags(sku, { no_follow: true });
        await metaRobotsTag.expectRobots(pdp, ['INDEX', 'NOFOLLOW']);
      } finally {
        await metaRobotsTag.setProductFlags(sku, { no_follow: false });
      }
      await metaRobotsTag.expectRobots(pdp, DEFAULT_ROBOTS);
    },
  );

  // Catalog observer, category branch.
  test(
    'a category flagged No index renders NOINDEX on its listing',
    { tag: ['@mageos-meta-robots-tag', '@seo', '@category'] },
    async ({ metaRobotsTag, data }) => {
      const trail = data.fixtures.category.listingPage.breadcrumbTrail;
      const categoryName = trail[trail.length - 1];
      expect(categoryName, 'a category name from fixtures.category.listingPage.breadcrumbTrail').toBeTruthy();
      const listing = data.slugs.categories.listingPage;

      try {
        await metaRobotsTag.setCategoryFlags(categoryName, { no_index: true });
        await metaRobotsTag.expectRobots(listing, ['NOINDEX', 'FOLLOW']);
      } finally {
        await metaRobotsTag.setCategoryFlags(categoryName, { no_index: false });
      }
      await metaRobotsTag.expectRobots(listing, DEFAULT_ROBOTS);
    },
  );
});
