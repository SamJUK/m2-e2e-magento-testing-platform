import { expect, type Page } from '@playwright/test';
import { deepMerge, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import moduleSelectors from '../data/selectors.json';
import moduleSlugs from '../data/slugs.json';
import type { BlogPostSpec, CreatedBlogPost } from './types';

type BlogSelectors = typeof moduleSelectors.blog;
type BlogSlugs = typeof moduleSlugs.blog;

/**
 * Drives MageOS_Blog: creates posts in the admin, then reads the storefront
 * section they appear in.
 *
 * The module ships its own `mageos-blog-*` markup and its own URL rewrites, so
 * none of this touches a theme selector — which is what makes the package
 * usable on the Luma and Hyvä templates the module ships alike.
 */
export class BlogPage {
  private readonly s: BlogSelectors;
  private readonly slugs: BlogSlugs;
  private readonly adminSlug: string;

  constructor(private page: Page, private data: MergedData) {
    const bucket = <T>(source: unknown): Partial<T> =>
      ((source as Record<string, unknown> | undefined)?.blog as Partial<T>) ?? {};
    this.s = deepMerge<BlogSelectors>(moduleSelectors.blog, bucket<BlogSelectors>(data.selectors));
    this.slugs = deepMerge<BlogSlugs>(moduleSlugs.blog, bucket<BlogSlugs>(data.slugs));
    this.adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/admin';
  }

  private adminUrl(path: string): string {
    return `${this.adminSlug.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  async loginToAdmin(): Promise<void> {
    const login = this.data.selectors.admin.login;
    await this.page.goto(this.adminSlug);

    if (!(await this.page.getByLabel(login.usernameFieldLabel).isVisible().catch(() => false))) {
      await expect(this.page.getByRole('menubar')).toBeVisible();
      return;
    }
    await this.page
      .getByLabel(login.usernameFieldLabel)
      .fill(process.env.PLAYWRIGHT_ADMIN_USERNAME ?? 'playwright');
    await this.page
      .getByLabel(login.passwordFieldLabel, { exact: true })
      .fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'Password1');
    await this.page.getByRole('button', { name: login.submitButtonLabel }).click();
    await expect(this.page.getByRole('menubar')).toBeVisible();
  }

  /**
   * Creates a post with a title, URL key and status, and nothing else.
   *
   * Title is the form's only required field, which is fortunate: on any store
   * with Magento_PageBuilder enabled — Mage-OS ships it — the post's `content`
   * and `short_content` fields are Page Builder stages rendered in iframes,
   * and no E2E suite should be trying to drive those. So the body copy is out
   * of scope and the routing, listing, status and feed behaviour is not.
   */
  async createPost(spec: BlogPostSpec): Promise<CreatedBlogPost> {
    const a = this.s.admin;
    await this.page.goto(this.adminUrl(this.slugs.admin.newPost));

    await this.page.getByLabel(a.titleFieldLabel, { exact: true }).first().fill(spec.title);
    await this.page.locator(a.urlKeyFieldSelector).fill(spec.urlKey);
    await this.page
      .locator(a.statusFieldSelector)
      .selectOption({ label: spec.published === false ? a.draftStatusLabel : a.publishedStatusLabel });

    await this.page.getByRole('button', { name: a.saveButtonLabel, exact: true }).first().click();
    await expect(
      this.page.locator(a.successMessageSelector),
      'the post was saved',
    ).toBeVisible({ timeout: 60_000 });

    return { spec, path: `${this.slugs.postPrefix}${spec.urlKey}` };
  }

  /**
   * Deletes through the grid's own row action.
   *
   * Saving a post redirects to the grid rather than back to the record — the
   * controller only returns to the form when `back=1` — so there is no edit
   * URL to keep and no Delete button waiting where the save left us.
   *
   * The row is found by its URL key rather than through a keyword search: this
   * grid ships without the fulltext filter, so there is no search box to type
   * into.
   */
  async deletePost(post: CreatedBlogPost): Promise<void> {
    const a = this.s.admin;
    const grid = this.data.selectors.admin.grid;

    await this.page.goto(this.adminUrl(this.slugs.admin.postGrid));
    const row = this.page.locator(grid.rowSelector).filter({ hasText: post.spec.urlKey }).first();
    await expect(row, `a grid row for "${post.spec.urlKey}"`).toBeVisible({ timeout: 60_000 });

    await row.locator(a.gridRowActionsCellSelector).getByText(a.gridActionsToggleLabel).first().click();
    await row.getByText(a.gridDeleteActionLabel, { exact: true }).first().click();
    await this.page.getByRole('button', { name: a.confirmButtonLabel, exact: true }).first().click();
    await expect(this.page.locator(a.successMessageSelector)).toBeVisible({ timeout: 60_000 });
  }

  /**
   * A cache-buster, because the post was created moments ago and both
   * Magento's full page cache and any reverse proxy key on the URL. These tests
   * are about what the module renders, not about the store's cache
   * invalidation.
   */
  private bust(url: string): string {
    return `${url}${url.includes('?') ? '&' : '?'}e2e=${Date.now()}`;
  }

  async expectPostIsListed(title: string): Promise<void> {
    await expect(async () => {
      await this.page.goto(this.bust(this.slugs.index), { waitUntil: 'domcontentloaded' });
      await expect(
        this.page.locator(this.s.cardSelector).filter({ hasText: title }),
        `a card for "${title}" on the blog index`,
      ).toHaveCount(1);
    }).toPass({ timeout: 60_000 });
  }

  async expectPostIsNotListed(title: string): Promise<void> {
    await this.page.goto(this.bust(this.slugs.index), { waitUntil: 'domcontentloaded' });
    await expect(
      this.page.locator(this.s.cardSelector).filter({ hasText: title }),
      `no card for "${title}" on the blog index`,
    ).toHaveCount(0);
  }

  async expectPostRenders(post: CreatedBlogPost): Promise<void> {
    await expect(async () => {
      await this.page.goto(this.bust(post.path), { waitUntil: 'domcontentloaded' });
      await expect(
        this.page.locator(this.s.postTitleSelector),
        'the post renders its title',
      ).toHaveText(post.spec.title);
      await expect(
        this.page.locator(this.s.postContentSelector),
        'the post renders its content block',
      ).toBeAttached();
    }).toPass({ timeout: 60_000 });
  }

  /** A draft has no public URL: the rewrite either never existed or 404s. */
  async expectPostIsNotReachable(post: CreatedBlogPost): Promise<void> {
    const response = await this.page.goto(this.bust(post.path), { waitUntil: 'domcontentloaded' });
    const status = response?.status() ?? 0;
    expect(status, `an unpublished post's URL is not served (got ${status})`).toBeGreaterThanOrEqual(400);
  }

  /** The feed is the module's machine-readable surface, and it is easy to break silently. */
  async expectRssListsPost(title: string): Promise<void> {
    await expect(async () => {
      const response = await this.page.request.get(this.bust(this.slugs.rss));
      expect(response.status(), 'the blog RSS feed responds').toBe(200);
      expect(await response.text(), `the feed lists "${title}"`).toContain(title);
    }).toPass({ timeout: 60_000 });
  }

  async expectIndexIsReachable(): Promise<void> {
    const response = await this.page.goto(this.bust(this.slugs.index), {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status(), 'the blog index responds').toBe(200);
    await expect(
      this.page.locator(this.s.containerSelector),
      'the blog index renders the module container',
    ).toBeVisible();
  }
}
