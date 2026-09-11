import { expect, type Locator, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import moduleSelectors from '../data/selectors.json';
import type { CmsPageSpec, RobotsFlag, RobotsFlags } from './types';

const s = moduleSelectors.metaRobotsTag;

/**
 * Drives MageOS_MetaRobotsTag: flag an entity in the admin, then read the
 * robots directive the storefront renders for it.
 *
 * The admin is the module's only interface — there is no CLI and no config
 * path — so this page object logs in and fills the forms itself rather than
 * borrowing a theme's admin page objects. That is what keeps the package
 * usable under Luma, Hyvä and anything else: the Magento backend is the same
 * on all of them, and nothing here touches a storefront selector.
 */
export class MetaRobotsTagPage {
  private readonly adminSlug: string;

  constructor(private page: Page, private data: MergedData) {
    this.adminSlug = process.env.PLAYWRIGHT_ADMIN_SLUG ?? '/admin';
  }

  private adminUrl(path: string): string {
    return `${this.adminSlug.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  async loginToAdmin(): Promise<void> {
    const login = this.data.selectors.admin.login;
    await this.page.goto(this.adminSlug);

    // Already signed in from an earlier action in the same context.
    if (!(await this.page.getByLabel(login.usernameFieldLabel).isVisible().catch(() => false))) {
      await expect(this.page.getByRole('menubar')).toBeVisible();
      return;
    }

    await this.page.getByLabel(login.usernameFieldLabel).fill(process.env.PLAYWRIGHT_ADMIN_USERNAME ?? 'playwright');
    await this.page
      .getByLabel(login.passwordFieldLabel, { exact: true })
      .fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'Password1');
    await this.page.getByRole('button', { name: login.submitButtonLabel }).click();
    await expect(this.page.getByRole('menubar')).toBeVisible();
  }

  /**
   * Asserts the robots directive on a storefront URL.
   *
   * Compared as a set, not a string: the module appends NOARCHIVE and replaces
   * INDEX/FOLLOW in place, and asserting the joined value would make the test
   * a hostage to the order Magento happens to emit.
   *
   * A cache-buster is appended because the flag was just saved in the admin and
   * both Magento's full page cache and any reverse proxy in front of it key on
   * the URL. This test is about what the module renders, not about whether the
   * store's cache invalidation is wired up.
   */
  async expectRobots(url: string, expected: string[]): Promise<void> {
    const separator = url.includes('?') ? '&' : '?';
    const bustedUrl = `${url}${separator}e2e=${Date.now()}`;

    await expect(async () => {
      await this.page.goto(bustedUrl);
      const content = await this.page.locator(s.robotsMetaSelector).getAttribute('content');
      expect(content, `robots meta on ${url}`).not.toBeNull();
      const directives = (content ?? '').split(',').map((d) => d.trim().toUpperCase());
      expect(directives.sort()).toEqual([...expected].map((d) => d.toUpperCase()).sort());
    }).toPass({ timeout: 30_000 });
  }

  /** Fills the module's three fields, whichever widget the form renders them as. */
  private async setFlags(scope: Locator, flags: RobotsFlags): Promise<void> {
    for (const [flag, on] of Object.entries(flags) as [RobotsFlag, boolean][]) {
      const label = s.admin.flagLabels[flag];
      const control = scope.getByLabel(label, { exact: true }).first();
      await control.waitFor({ state: 'attached' });

      // CMS pages and categories render these as toggle checkboxes; products
      // get them as an EAV boolean, which the product form renders as a Yes/No
      // select. Same three attributes, two different widgets.
      const tagName = await control.evaluate((el) => el.tagName.toLowerCase());
      if (tagName === 'select') {
        await control.selectOption({ label: on ? s.admin.yesOptionLabel : s.admin.noOptionLabel });
        continue;
      }

      if ((await control.isChecked()) === on) continue;
      // The checkbox itself is styled to zero opacity behind its label, so
      // Playwright rightly refuses to click it directly.
      // Magento's toggle emits two labels for the same input — a plain one and
      // the styled switch. The styled one is the one that responds to a click.
      const id = await control.getAttribute('id');
      if (id) await this.page.locator(`label[for="${id}"]`).last().click();
      else await control.check({ force: true });
      expect(await control.isChecked(), `${label} toggled`).toBe(on);
    }
  }

  private async expandSeoSection(): Promise<Locator> {
    const heading = this.page.getByText(s.admin.seoSectionTitle, { exact: true }).first();
    await heading.waitFor();
    const section = this.page.locator('.fieldset-wrapper', { has: heading }).first();

    // Idempotent: the section is collapsed on a fresh form but already open if
    // a previous step in the same test expanded it, and clicking a title is a
    // toggle, not an opener.
    const flagLabel = s.admin.flagLabels.no_index;
    if (!(await section.getByLabel(flagLabel, { exact: true }).first().isVisible().catch(() => false))) {
      await heading.click();
    }
    await expect(section.getByLabel(flagLabel, { exact: true }).first()).toBeVisible();
    return section;
  }

  private async save(buttonLabel: string): Promise<void> {
    await this.page.getByRole('button', { name: buttonLabel, exact: true }).first().click();
    await expect(this.page.locator('.message-success, .message.message-success')).toBeVisible({
      timeout: 60_000,
    });
  }

  /**
   * Creates a CMS page with the given flags already set.
   *
   * Returns its storefront path and its admin URL — the admin URL because
   * deleting through the grid means a MySQL fulltext keyword match, which
   * treats a multi-word title as "any of these words" and can return the wrong
   * page. Going straight back to the record is both simpler and exact.
   */
  async createCmsPage(spec: CmsPageSpec): Promise<{ path: string; adminUrl: string }> {
    const form = this.data.selectors.admin.cmspages.form;
    await this.page.goto(this.adminUrl(s.admin.cmsPage.newPageUrl));
    await this.page.getByLabel(form.titleFieldLabel).fill(spec.title);

    // Explicit, not left to the form default: a store whose default flipped
    // would save the page disabled, and the storefront would 404 while the
    // save's own flash message said everything was fine.
    await this.page.getByLabel(form.enabledFieldLabel, { exact: true }).setChecked(true);

    const section = await this.expandSeoSection();
    await section.locator(s.admin.cmsPage.urlKeyFieldSelector).fill(spec.urlKey);
    await this.setFlags(section, spec.flags);

    await Promise.all([
      this.page.waitForURL((url) => !/\/(new|save)\//.test(url.pathname), { timeout: 60_000 }),
      this.save(form.submitButtonLabel),
    ]);

    return { path: `/${spec.urlKey}`, adminUrl: this.page.url() };
  }

  async deleteCmsPage(adminUrl: string): Promise<void> {
    const form = this.data.selectors.admin.cmspages.form;
    await this.page.goto(adminUrl, { waitUntil: 'domcontentloaded' });
    await this.page.getByRole('button', { name: form.deleteButtonLabel, exact: true }).click();
    await this.page.getByRole('button', { name: form.confirmButtonLabel, exact: true }).click();
    await expect(this.page.locator('.message-success')).toBeVisible({ timeout: 60_000 });
  }

  /** Sets the flags on a product, found in the admin grid by SKU. */
  async setProductFlags(sku: string, flags: RobotsFlags): Promise<void> {
    const grid = this.data.selectors.admin.grid;
    await this.page.goto(this.adminUrl(s.admin.productGridUrl));
    const productSearch = this.page.getByPlaceholder(grid.searchFieldPlaceholder).first();
    await productSearch.fill(sku);
    await productSearch.press('Enter');

    const row = this.page.locator(grid.rowSelector).filter({ hasText: sku }).first();
    await row.getByRole('link', { name: this.data.selectors.admin.products.grid.editLinkLabel }).click();
    await expect(this.page.getByLabel(this.data.selectors.admin.products.form.nameFieldLabel)).toBeVisible();

    const section = await this.expandSeoSection();
    await this.setFlags(section, flags);
    await this.save(this.data.selectors.admin.products.form.saveButtonLabel);
  }

  /**
   * Sets the flags on a category, found by name in the admin tree.
   *
   * The tree labels every node `Name (ID: n) (products)`, which is the only
   * place a category id is readable without a database hook — and the id is
   * what makes the edit form addressable without walking the tree open.
   */
  async setCategoryFlags(categoryName: string, flags: RobotsFlags): Promise<void> {
    await this.page.goto(this.adminUrl(s.admin.categoryTreeUrl));

    // Only the root's children are rendered until the tree is opened, and the
    // category a store lists is usually two or three levels down.
    const expandAll = this.page.getByRole('link', { name: s.admin.categoryExpandAllButtonLabel });
    if (await expandAll.isVisible().catch(() => false)) await expandAll.click();

    const node = this.page
      .getByText(new RegExp(`^\\s*${escapeRegExp(categoryName)}\\s*\\(ID:\\s*\\d+\\)`))
      .first();
    await expect(node, `category "${categoryName}" in the admin tree`).toBeVisible({ timeout: 30_000 });

    const id = (await node.innerText()).match(/\(ID:\s*(\d+)\)/)?.[1];
    expect(id, `an id for category "${categoryName}"`).toBeTruthy();

    await this.page.goto(this.adminUrl(`${s.admin.categoryEditUrl}${id}`));
    const section = await this.expandSeoSection();
    await this.setFlags(section, flags);
    await this.save(s.admin.categorySaveButtonLabel);
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
