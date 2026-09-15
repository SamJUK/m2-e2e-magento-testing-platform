import { expect, type Locator, type Page } from '@playwright/test';
import { readMoney, waitForFormKey , sprintf } from '@samjuk/e2e-m2-playwright-core';
import type { HyvaData } from '../data/types';
import type { IProductPage, StockStatus } from './types';

export class ProductPage implements IProductPage {
  readonly page: Page;
  readonly productForm: Locator;
  readonly addToCartButton: Locator;
  readonly price: Locator;
  readonly quantityField: Locator;
  readonly bundleOptionLabels: Locator;
  readonly bundleCustomizeButton: Locator;
  readonly bundleSummaryPrice: Locator;

  constructor(page: Page, private data: HyvaData) {
    this.page = page;
    const s = data.selectors.productPage;
    const bundle = s.bundle;
    // The PDP's own final price, scoped away from the related/upsell tiles
    // further down the page. Hyvä's Alpine price component drops the
    // `data-price-type` attribute Luma's markup carries, which is why the
    // theme layer overrides `priceSelector`.
    this.price = page.locator(s.priceSelector);
    this.bundleOptionLabels = page.locator(bundle.optionLabelSelector);
    this.bundleCustomizeButton = page.getByRole('button', {
      name: bundle.customizeButtonLabel,
      exact: true,
    });
    // The live price. `.first()`: Luma repeats the configured-price box at the
    // top and the bottom of the customisation panel.
    this.bundleSummaryPrice = page.locator(bundle.summaryPriceSelector).first();
    // Related/upsell product cards further down the PDP render their own
    // swatches and qty inputs with the same attributes as the main product's
    // (e.g. three `data-option-label="Purple"` on one page). Scoping to the
    // add-to-cart form is what keeps those out of range.
    this.productForm = page.locator(s.formSelector);
    // The add-to-cart button lives *outside* the form (wired up via
    // form="product_addtocart_form"), so it cannot be scoped to it the way
    // Luma's is. It carries `aria-label="<label>"` while product-list cards
    // use `"<label> <product name>"`, so an exact accessible-name match
    // already excludes related/upsell tiles.
    // The label can differ per product type on themes that override the
    // simple and configurable add-to-cart templates separately (e.g. "Add to
    // Basket" on simples, "Add to Cart" on configurables), so the override
    // accepts either a single label or a list of accepted labels.
    // The id is kept as a last-resort fallback so a store whose button label
    // is not configured at all still resolves.
    const labels = ([] as string[]).concat(s.addToCartButtonLabel as string | string[]);
    this.addToCartButton = labels
      .map((name) => page.getByRole('button', { name, exact: true }))
      .reduce((acc, locator) => acc.or(locator))
      .or(page.locator('#product-addtocart-button'))
      .filter({ visible: true })
      .first();
    // The qty input's id is `qty[<productId>]`, which is not a valid CSS id
    // selector, and like the button it is wired to the form via
    // form="product_addtocart_form" rather than being nested in it. It does
    // carry a real (sr-only) <label>, so the configured label is the primary
    // handle — same override point as Luma — with the name attribute as a
    // fallback for themes that drop the label.
    this.quantityField = page
      .getByLabel(s.quantityFieldLabel, { exact: true })
      .or(page.locator(s.quantityFieldSelector))
      .filter({ visible: true })
      .first();
  }

  /**
   * Adds the product to the cart, and waits for the store to accept it.
   *
   * Stores that defer/merge JS (Amasty Page Speed Optimizer, Magepack, any
   * `defer`-based optimizer) render the button long before its handler is
   * bound, so the first click can be swallowed with no request made at all.
   * See the body for how that is told apart from a slow one.
   */
  private async clickAddToCart(): Promise<void> {
    // Completion is the store ACCEPTING the add, read off the response.
    //
    // The retry exists because a button rendered before its handler is bound
    // swallows the click silently: no request is made, so nothing will ever
    // arrive. `requested` separates that case from a slow one — it must not
    // re-click an add that did reach the server, because that adds the product
    // a second time and the line quantity silently doubles.
    //
    // The on-screen confirmation used to be the signal and is not dependable
    // enough to be one: Luma paints it from a customer-data `messages` refresh,
    // and under parallel load the container renders empty while the cart is
    // updated correctly — so waiting on it failed adds that had plainly worked.
    // No test asserted it; the specs assert the cart itself.
    let requested = false;
    let added = false;
    const isAdd = (request: { method: () => string; url: () => string }) =>
      request.method() === 'POST' && request.url().includes('checkout/cart/add');
    const watchRequest = (request: { method: () => string; url: () => string }) => {
      if (isAdd(request)) requested = true;
    };
    const watchResponse = (response: {
      status: () => number;
      request: () => { method: () => string; url: () => string };
    }) => {
      if (isAdd(response.request()) && response.status() < 400) added = true;
    };
    // Whether the customer-data sections have been re-read since the add.
    //
    // The server having accepted the add is not the same as the page showing
    // it: the minicart's contents, and every other block fed by customer-data,
    // only catch up once /customer/section/load has been re-read. Waiting for
    // the old on-screen confirmation used to cover this by accident, since the
    // same refresh painted it — removing that wait left the minicart specs
    // racing an empty panel while the counter already read "1 items".
    //
    // Deliberately a barrier, not an assertion: if a theme updates its blocks
    // without customer-data this falls through rather than failing, and the
    // specs' own assertions — which is where the real checks live — still have
    // to hold.
    let sectionsReloaded = false;
    const watchSections = (response: { request: () => { url: () => string } }) => {
      if (added && response.request().url().includes('customer/section/load')) {
        sectionsReloaded = true;
      }
    };
    this.page.on('request', watchRequest);
    this.page.on('response', watchResponse);
    this.page.on('response', watchSections);
    try {
      await expect(async () => {
        if (!requested) await this.addToCartButton.click();
        expect(added, 'the store accepted the add to cart').toBe(true);
      }).toPass({ timeout: 90_000 });

      await expect
        .poll(() => sectionsReloaded, { timeout: 30_000 })
        .toBe(true)
        .catch(() => {
          // See above: a theme that does not use customer-data never fires it.
        });
    } finally {
      this.page.off('request', watchRequest);
      this.page.off('response', watchResponse);
      this.page.off('response', watchSections);
    }
  }
  async addSimpleProductToCart(url: string, quantity?: number): Promise<void> {
    await this.page.goto(url);
    await waitForFormKey(this.page);

    if (quantity) {
      await this.quantityField.fill(String(quantity));
    }

    await this.clickAddToCart();
  }

  /**
   * Asserts what the PDP says about availability, and that add-to-cart is
   * offered only when the product is in stock.
   *
   * Both halves matter. Asserting only the absence of the button would pass
   * against a broken selector that matches nothing anywhere, which is why the
   * spec calls this for an in-stock product first: the same locator has to
   * resolve to exactly one control there before its absence here means
   * anything.
   */
  async expectStockStatus(url: string, status: StockStatus): Promise<void> {
    const s = this.data.selectors.productPage;
    const f = this.data.fixtures.product;
    const inStock = status === 'in';

    await this.page.goto(url, { waitUntil: 'domcontentloaded' });

    await expect(
      this.page.locator(inStock ? s.inStockStatusSelector : s.outOfStockStatusSelector),
      `the PDP reports the product as ${inStock ? 'in' : 'out of'} stock`,
    ).toHaveText(inStock ? f.inStockStatusText : f.outOfStock.statusText, { timeout: 30_000 });

    await expect(
      this.addToCartButton,
      inStock
        ? 'an in-stock product offers exactly one add-to-cart control'
        : 'an out-of-stock product offers no add-to-cart control',
    ).toHaveCount(inStock ? 1 : 0);
  }

  async addConfigurableProductToCart(
    url: string,
    options: string[][],
    quantity?: number,
  ): Promise<void> {
    await this.page.goto(url);
    await waitForFormKey(this.page);

    if (quantity) {
      await this.quantityField.fill(String(quantity));
    }

    for (const [attrName, optionValue] of options) {
      await this.selectOption(attrName, optionValue);
    }

    await this.clickAddToCart();
  }

  /**
   * Hyvä renders a configurable attribute either as a swatch group
   * (`<label class="swatch-option">` wrapping a visually-hidden radio) or as a
   * plain `<select id="attribute{id}">`, depending on the attribute's admin
   * config. Both carry `data-option-label` with the plain store label, which is
   * the only value not rewritten by Alpine (option text can gain a price
   * suffix such as "M +$5.00").
   */
  private async selectOption(attrName: string, optionValue: string): Promise<void> {
    const swatch = this.productForm.locator(
      `label.swatch-option:has(input[data-option-label="${optionValue}"])`,
    );

    if ((await swatch.count()) > 0) {
      await swatch.first().click();
      return;
    }

    const select = this.productForm.getByLabel(attrName, { exact: true });
    const value = await select
      .locator(`option[data-option-label="${optionValue}"]`)
      .first()
      .getAttribute('value');
    await select.selectOption(value ?? optionValue);
  }

  /**
   * Opens a bundle PDP with its options exposed.
   *
   * Luma hides the whole option fieldset behind a "Customize and Add to Cart"
   * disclosure; Hyvä renders it inline. Retry until the options are actually
   * reachable, opening the disclosure when there is one — not a skip, because
   * the assertion inside the loop has to hold on either theme.
   */
  async openBundleOptions(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForFormKey(this.page);

    await expect(async () => {
      if (!(await this.bundleOptionLabels.first().isVisible())) {
        await this.bundleCustomizeButton.click();
      }
      await expect(this.bundleOptionLabels.first()).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
  }

  /**
   * Asserts a bundle offers exactly one selection with this name, and chooses
   * it.
   *
   * Selections are addressed by the product name in their `<label>`, never by
   * the `bundle-option-<optionId>-<selectionId>` id, which the database assigns
   * and which therefore differs between stores. The label's `for` gives the
   * input, and the input is asserted checked afterwards so a click that landed
   * on nothing cannot pass unnoticed.
   */
  async selectBundleOption(selectionTitle: string): Promise<void> {
    const label = this.bundleOptionLabels.filter({ hasText: selectionTitle });
    await expect(
      label,
      `the bundle offers exactly one "${selectionTitle}" selection`,
    ).toHaveCount(1);

    const inputId = await label.getAttribute('for');
    expect(inputId, `the "${selectionTitle}" label names its own input`).toBeTruthy();

    await label.click();
    await expect(
      this.page.locator(`[id="${inputId}"]`),
      `"${selectionTitle}" is the selected bundle option`,
    ).toBeChecked({ timeout: 15_000 });
  }

  /**
   * Asserts the bundle's live price is exactly `expected`.
   *
   * Polled rather than read once: both themes recalculate the figure in the
   * browser after the selection changes, so a single read races the update.
   * The value is compared as a parsed number, so it is the arithmetic that is
   * asserted and not one store's price formatting.
   */
  async expectBundlePrice(expected: number, description: string): Promise<void> {
    await expect(async () => {
      const price = await readMoney(this.bundleSummaryPrice, 'bundle price');
      expect(price, description).toBeCloseTo(expected, 2);
    }).toPass({ timeout: 30_000 });
  }

  /** Adds the configured bundle to the cart and waits for the confirmation. */
  async addBundleToCart(): Promise<void> {
    await this.clickAddToCart();
  }

  /**
   * Adds a product that carries custom options, answering them by title.
   *
   * Matched with a start-anchored regex rather than a plain substring, because
   * themes decorate the option's accessible name: Hyva renders "Engraving *"
   * for a required option and "Gift Message + $5.00" for a priced one. A bare
   * `getByLabel('Gift Message')` substring-matches more than one field on that
   * markup, and `.first()` then silently fills the WRONG option - which reads
   * as the surcharge never applying rather than as a locator fault.
   */
  async addProductWithOptionsToCart(
    url: string,
    options: Record<string, string>,
  ): Promise<void> {
    await this.page.goto(url);
    await waitForFormKey(this.page);

    for (const [title, value] of Object.entries(options)) {
      await this.page.getByLabel(optionLabelPattern(title)).first().fill(value);
    }

    await this.clickAddToCart();
  }

  /**
   * Asserts a REQUIRED custom option blocks the basket until it is answered.
   *
   * Hyva puts `required` on the input and leaves the check to the browser, so
   * there is no message in the DOM to find - the refusal is a native bubble.
   * Asserted through the field's own validity state and the form's, the same
   * way this theme's contact form is, rather than by looking for copy that
   * this theme never renders.
   *
   * Deliberately does not reuse `clickAddToCart`: that waits for the store to
   * accept a POST, and the whole point here is that no POST is made.
   */
  async expectRequiredOptionBlocksAddToCart(
    url: string,
    requiredOptionTitle: string,
  ): Promise<void> {
    await this.page.goto(url);
    await waitForFormKey(this.page);

    let requested = false;
    const watch = (request: { method: () => string; url: () => string }) => {
      if (request.method() === 'POST' && request.url().includes('checkout/cart/add')) {
        requested = true;
      }
    };
    this.page.on('request', watch);

    try {
      const field = this.page
        .getByLabel(optionLabelPattern(requiredOptionTitle))
        .first();
      await this.addToCartButton.click();

      await expect
        .poll(
          () =>
            field.evaluate(
              (element) => (element as HTMLInputElement | HTMLTextAreaElement).validity.valueMissing,
            ),
          {
            message: 'the store asks for the required option before it will take the order',
            timeout: 15_000,
          },
        )
        .toBe(true);
      await expect
        .poll(
          () =>
            this.page
              .locator(this.data.selectors.productPage.formSelector)
              .evaluate((form) => (form as HTMLFormElement).checkValidity()),
          { message: 'the browser refuses to submit the add-to-cart form', timeout: 15_000 },
        )
        .toBe(false);
    } finally {
      this.page.off('request', watch);
    }

    expect(requested, 'nothing was added to the cart').toBe(false);
  }

}

/**
 * Matches a custom option field by the start of its label, so a theme that
 * appends a required marker or a price to the name still resolves, and one
 * option's title cannot match another's decorated name.
 */
function optionLabelPattern(title: string): RegExp {
  return new RegExp('^\\s*' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
}
