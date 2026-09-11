import { expect, type Page } from '@playwright/test';
import { deepMerge, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import moduleFixtures from '../data/fixtures.json';
import type { DataLayerEntry, ProductPush } from './types';

type GtmFixtures = typeof moduleFixtures.googleTagManager;

/**
 * Drives MagePal_GoogleTagManager, which has no storefront markup at all — its
 * entire output is JavaScript pushed onto a data layer array. So every
 * assertion here reads `window.<dataLayer>` rather than the DOM, which is also
 * what makes the package theme-agnostic by construction: there is nothing for
 * a theme to style differently.
 *
 * The module's own `gtm.js` loader points at googletagmanager.com, which core
 * blocks in every browser context. That is deliberate and harmless: the pushes
 * are inline, so the data layer is populated whether or not Google's container
 * ever loads — and a test that depended on an external network call would be
 * measuring Google's uptime.
 */
export class GoogleTagManagerPage {
  private readonly f: GtmFixtures;

  constructor(private page: Page, data: MergedData) {
    // Module defaults underneath the store's own `googleTagManager` block, so
    // a store that renamed its data layer or runs a translated page type only
    // restates what it actually moved.
    const override = (data.fixtures as Record<string, unknown>).googleTagManager as
      | Partial<GtmFixtures>
      | undefined;
    this.f = deepMerge<GtmFixtures>(moduleFixtures.googleTagManager, override ?? {});
  }

  /**
   * Reads the data layer once it has settled.
   *
   * The pushes arrive through RequireJS rather than a synchronous inline
   * script, so the array is briefly empty (or holds only GTM's own `gtm.start`
   * entry) after DOMContentLoaded. Polling for the page-type entry is what
   * separates "the module pushed nothing" from "the test looked too early".
   */
  async openAndReadDataLayer(url: string): Promise<DataLayerEntry[]> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    const name = this.f.dataLayerName;

    await expect
      .poll(
        () =>
          this.page.evaluate((dl) => {
            const layer = (window as unknown as Record<string, unknown>)[dl];
            return Array.isArray(layer) ? layer.some((e) => 'pageType' in (e ?? {})) : false;
          }, name),
        { message: `the ${name} array receives a pageType entry on ${url}`, timeout: 30_000 },
      )
      .toBe(true);

    return this.page.evaluate((dl) => {
      const layer = (window as unknown as Record<string, unknown>)[dl];
      return JSON.parse(JSON.stringify(layer)) as DataLayerEntry[];
    }, name);
  }

  private entryWith(entries: DataLayerEntry[], key: string): DataLayerEntry {
    const entry = entries.find((e) => key in (e ?? {}));
    expect(entry, `a data layer entry carrying "${key}"`).toBeDefined();
    return entry as DataLayerEntry;
  }

  private eventNamed(entries: DataLayerEntry[], event: string): DataLayerEntry {
    const entry = entries.find((e) => e?.event === event);
    expect(entry, `a data layer entry for the "${event}" event`).toBeDefined();
    return entry as DataLayerEntry;
  }

  /** Asserts the page-type push, plus the currency the store reports alongside it. */
  async expectPageType(url: string, expected: string): Promise<void> {
    const entries = await this.openAndReadDataLayer(url);
    const pageEntry = this.entryWith(entries, 'pageType');
    expect(pageEntry.pageType, `the page type pushed for ${url}`).toBe(expected);

    const ecommerce = pageEntry.ecommerce as { currencyCode?: string } | undefined;
    expect(ecommerce?.currencyCode, 'the currency code pushed alongside the page type').toMatch(
      /^[A-Z]{3}$/,
    );
  }

  /**
   * Asserts the product push against the values the store's own config
   * declares, not against whatever the page happened to contain — a push of
   * the wrong product, or of a stale price, has to fail this.
   */
  async expectProductPush(url: string, expected: ProductPush): Promise<void> {
    const entries = await this.openAndReadDataLayer(url);
    const product = this.eventNamed(entries, this.f.events.product).product as
      | Record<string, unknown>
      | undefined;
    expect(product, 'the product object on the product push').toBeDefined();

    expect(product?.sku, 'the pushed SKU').toBe(expected.sku);
    expect(product?.name, 'the pushed product name').toBe(expected.name);
    expect(Number(product?.price), 'the pushed price').toBeCloseTo(expected.price, 2);
  }

  async expectCategoryPush(url: string, expected: { name: string; path: string }): Promise<void> {
    const entries = await this.openAndReadDataLayer(url);
    const category = this.eventNamed(entries, this.f.events.category).category as
      | Record<string, unknown>
      | undefined;
    expect(category, 'the category object on the category push').toBeDefined();

    expect(category?.name, 'the pushed category name').toBe(expected.name);
    expect(category?.path, 'the pushed category path').toBe(expected.path);
  }

  /** A guest with nothing in the cart: both halves of the session push. */
  async expectGuestSession(url: string): Promise<void> {
    const entries = await this.openAndReadDataLayer(url);
    const session = this.eventNamed(entries, this.f.events.customerSession);

    const customer = session.customer as { isLoggedIn?: boolean } | undefined;
    const cart = session.cart as { hasItems?: boolean } | undefined;
    expect(customer?.isLoggedIn, 'the session push reports a guest').toBe(false);
    expect(cart?.hasItems, 'the session push reports an empty cart').toBe(false);
  }

  async expectEmptyCartPush(url: string): Promise<void> {
    const entries = await this.openAndReadDataLayer(url);
    const cart = this.eventNamed(entries, this.f.events.cart).cart as
      | { hasItems?: boolean }
      | undefined;
    expect(cart?.hasItems, 'the cart push reports an empty cart').toBe(false);
  }

  get pageTypes(): GtmFixtures['pageTypes'] {
    return this.f.pageTypes;
  }
}
