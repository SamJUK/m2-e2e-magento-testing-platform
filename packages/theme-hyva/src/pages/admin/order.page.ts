import { expect, type Page } from '@playwright/test';
import { readMoney, type MergedData } from '@samjuk/e2e-m2-playwright-core';
import type { IAdminOrderPage } from '../types';
import { findGridRow, gridCellByColumnLabel, openGrid } from './grid';

/** Everything the admin's Create New Order form needs to produce an order. */
export interface AdminOrderInput {
  email: string;
  firstName: string;
  lastName: string;
  streetAddress: string;
  city: string;
  postcode: string;
  telephone: string;
  /** SKU of the product to put on the order. */
  sku: string;
  quantity?: number;
}

/** What an order built in the admin turned out to be, read off the saved order. */
export interface CreatedAdminOrder {
  orderNumber: string;
  customerName: string;
  email: string;
  grandTotal: number;
}

/**
 * Sales > Orders: grid lookup by increment ID, the two fulfilment actions that
 * trigger customer emails (invoice and shipment), creating an order from the
 * admin, and the status transitions available on the order view.
 */
export class AdminOrderPage implements IAdminOrderPage {
  readonly page: Page;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
  }

  /** Finds an order in the grid by increment ID and opens its view page. */
  async openOrder(orderNumber: string): Promise<void> {
    const s = this.data.selectors.admin.orders.grid;

    await openGrid(this.page, `${this.adminSlug}${this.data.slugs.admin.orders.grid}`);
    const row = await findGridRow(this.page, this.data, orderNumber);
    await row.getByRole('link', { name: s.viewLinkLabel, exact: true }).click();

    await this.page.waitForURL('**/sales/order/view/**', {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(this.page.getByRole('menubar')).toBeVisible();
  }

  /**
   * Runs one of the order view's "create document" flows: click the toolbar
   * button, tick the customer-email copy, submit, assert the success notice.
   */
  private async createDocument(
    orderNumber: string,
    toolbarButtonLabel: string,
    form: { emailCopyCheckboxLabel: string; submitButtonLabel: string },
    createdNotificationText: string,
  ): Promise<void> {
    await this.openOrder(orderNumber);

    // Admin toolbar buttons carry no href: their click is wired up by
    // Magento_Ui/js/form/button-adapter once RequireJS gets to the page's
    // x-magento-init block. A click landing before that is swallowed
    // completely — the button even takes focus — so both clicks below are
    // retried until they demonstrably did something, rather than waited on
    // once and blamed on the form.
    const emailCopy = this.page.getByLabel(form.emailCopyCheckboxLabel);
    await expect(async () => {
      if (!(await emailCopy.isVisible())) {
        await this.page.getByRole('button', { name: toolbarButtonLabel, exact: true }).click();
      }
      await expect(
        emailCopy,
        `the "${toolbarButtonLabel}" form opened`,
      ).toBeVisible({ timeout: 20_000 });
    }).toPass({ timeout: 90_000 });

    // Magento only sends the customer email when this box is ticked.
    await emailCopy.check();

    // The retry is on the POST, not on the redirect: only a click that made no
    // request at all is repeated, so a slow save can never be submitted twice
    // and produce two documents.
    await expect(async () => {
      const posted = this.page
        .waitForResponse(
          (response) => response.request().method() === 'POST' && response.url().includes('/save'),
          { timeout: 20_000 },
        )
        .catch(() => null);
      await this.page.getByRole('button', { name: form.submitButtonLabel, exact: true }).click();
      expect(await posted, 'the admin submitted the form').not.toBeNull();
    }).toPass({ timeout: 90_000 });

    await this.page.waitForURL('**/sales/order/view/**', {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(this.page.getByText(createdNotificationText)).toBeVisible();
  }

  async createInvoice(orderNumber: string): Promise<void> {
    const s = this.data.selectors.admin.orders;
    await this.createDocument(
      orderNumber,
      s.view.invoiceButtonLabel,
      s.invoice,
      this.data.fixtures.admin.orders.invoice.createdNotificationText,
    );
  }

  async createShipment(orderNumber: string): Promise<void> {
    const s = this.data.selectors.admin.orders;
    await this.createDocument(
      orderNumber,
      s.view.shipButtonLabel,
      s.shipment,
      this.data.fixtures.admin.orders.shipment.createdNotificationText,
    );
  }

  /* ------------------------------------------------------- order creation */

  /**
   * Waits out the loading mask the order form paints over itself.
   *
   * Create New Order is a prototype.js page that rebuilds whole sections over
   * AJAX after nearly every interaction — adding a product, changing the
   * country, choosing a rate — and the replacement markup arrives with its own
   * inline handlers. The short sleep before the mask check is load-bearing:
   * the mask is raised a beat *after* the click, so checking for it
   * immediately would find the page already "idle" and race the reload.
   */

  private async settle(): Promise<void> {
    const mask = this.page.locator(this.data.selectors.admin.orders.create.loadingMaskSelector);

    // Wait for the mask to appear first: "hidden" is true before the request
    // starts as well as after it ends. The catch allows a no-reload click.
    await mask.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {});
    await expect(mask).toBeHidden({ timeout: 60_000 });
    await this.page.waitForTimeout(500);
  }

  /**
   * Builds an order through Sales > Orders > Create New Order and resolves with
   * what the saved order actually says.
   *
   * Worth its cost as an upgrade-regression test: this one flow drives the old
   * widget grids, the AJAX block reloader, the address form's country/region
   * swap, shipping rate collection and payment method rendering — a large
   * share of the admin machinery a core upgrade touches, none of which the
   * storefront exercises.
   *
   * The order is placed for a brand-new customer rather than an existing one,
   * so the test never depends on which customers a store happens to hold, and
   * the name and email it asserts on afterwards are ones it chose itself.
   */
  async createOrder(order: AdminOrderInput): Promise<CreatedAdminOrder> {
    const s = this.data.selectors.admin.orders.create;
    const f = this.data.fixtures.admin.orders.create;
    const page = this.page;

    await page.goto(`${this.adminSlug}${this.data.slugs.admin.orders.new}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('menubar')).toBeVisible();

    // --- customer
    //
    // Every click on this page is retried until its effect is visible, not
    // just performed. The order form re-renders whole sections over AJAX and
    // attaches the replacement markup's handlers afterwards, so a click
    // delivered into the gap is accepted by the element and does nothing at
    // all — no error, no request, no change. Observed on a stock store for
    // both of the controls below and for the shipping-rates link.
    // Multi-store installs interpose a store picker here. Driven by the page's
    // current state, or re-clicking would oscillate between the two.
    const accountSection = page.locator(s.accountSectionSelector);
    const storeViews = page.locator(s.storeViewRadioSelector);

    await expect(async () => {
      if (await accountSection.isVisible()) {
        return;
      }

      if ((await storeViews.count()) > 0 && (await storeViews.first().isVisible())) {
        await storeViews.first().click({ timeout: 15_000 });
      } else {
        await page
          .getByRole('button', { name: s.newCustomerButtonLabel, exact: true })
          .click({ timeout: 15_000 });
      }
      await this.settle();

      await expect(
        accountSection,
        'choosing a customer opens the order form',
      ).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 120_000 });

    // --- product
    //
    // "Add Products" TOGGLES the picker rather than opening it, so the retry
    // above must not click blindly: a click delivered while the picker is
    // already open closes it again, and the loop can settle with the grid
    // shut. The matching row is still in the DOM when it is — the container
    // is display:none — so a check() against it never resolves and eats the
    // whole test timeout instead of failing with something readable.
    const skuFilter = page.locator(s.productSkuFilterSelector);
    const openProductPicker = async (): Promise<void> => {
      await expect(async () => {
        if (!(await skuFilter.isVisible())) {
          await page.locator(s.addProductsButtonSelector).click();
          await this.settle();
        }
        await expect(
          skuFilter,
          'Add Products opens the product picker',
        ).toBeVisible({ timeout: 15_000 });
      }).toPass({ timeout: 90_000 });
    };
    await openProductPicker();

    const productRow = page.locator(s.productRowSelector, { hasText: order.sku });
    // Filtering reloads the grid over ajax, which replaces the row and can
    // leave the picker collapsed. Re-open, re-filter and take the row in one
    // retried block so a reload mid-interaction is retried rather than fatal.
    await expect(async () => {
      await openProductPicker();
      await skuFilter.fill(order.sku);
      await skuFilter.press('Enter');
      await this.settle();
      await expect(
        productRow,
        `the order form's product grid finds exactly one row for SKU ${order.sku}`,
      ).toHaveCount(1, { timeout: 30_000 });
      // Click the row, not the checkbox: the row's own onclick toggles it, so
      // check() lands twice and leaves it clear.
      const productCheckbox = productRow.locator(s.productCheckboxSelector);
      if (!(await productCheckbox.isChecked())) {
        await productRow.click({ timeout: 15_000 });
      }
      await expect(
        productCheckbox,
        `the product grid row for ${order.sku} is selected`,
      ).toBeChecked({ timeout: 15_000 });
    }).toPass({ timeout: 120_000 });

    await productRow.locator(s.productQuantitySelector).fill(String(order.quantity ?? 1));
    await page.getByRole('button', { name: s.addSelectedButtonLabel, exact: true }).click();
    await this.settle();

    // The grid selection is serialised into the quote by JS; a swallowed click
    // leaves an empty order that only fails much later, at Submit.
    await expect(
      page.locator(s.itemsSelector),
      `the ordered-items block lists SKU ${order.sku}`,
    ).toContainText(order.sku, { timeout: 30_000 });

    // --- account and address
    await page.locator(s.emailFieldSelector).fill(order.email);
    await page.locator(s.billing.firstNameSelector).fill(order.firstName);
    await page.locator(s.billing.lastNameSelector).fill(order.lastName);
    await page.locator(s.billing.streetSelector).fill(order.streetAddress);
    await page.locator(s.billing.citySelector).fill(order.city);
    await page.locator(s.billing.postcodeSelector).fill(order.postcode);
    await page.locator(s.billing.telephoneSelector).fill(order.telephone);
    // Changing the country reloads the address block to swap the region field,
    // so it goes last: anything typed after it would survive, anything typed
    // before it is re-rendered from the values already posted.
    await page
      .locator(s.billing.countrySelector)
      .selectOption({ label: this.data.inputs.admin.orders.create.country });
    await this.settle();

    // --- shipping
    const rates = page.locator(s.shippingMethodRadioSelector);
    // Retry the whole click → rates-arrived cycle. The block that carries this
    // link is itself re-rendered by the country change above, and its inline
    // handler is attached after the markup lands, so the first click can be
    // delivered to an element that is not wired up yet and does nothing at all
    // (observed on every run against a stock store).
    await expect(async () => {
      // Only press the link again if the rates are still not there. Loading
      // them REPLACES the link with the rate list, so a first click that
      // merely landed slowly would leave the retry with nothing to click and
      // fail for the wrong reason. The assertion below is unconditional
      // either way — this decides whether to click, never whether to check.
      if ((await rates.count()) === 0) {
        await page.locator(s.shippingRatesLinkSelector).first().click();
        await this.settle();
      }
      await expect(
        rates.first(),
        'the store offers at least one shipping rate for this address',
      ).toBeAttached({ timeout: 15_000 });
    }).toPass({ timeout: 120_000 });

    const rateValue = await rates.first().getAttribute('value');
    await rates.first().check({ force: true });
    await this.settle();
    // Re-resolved by value, not by position: choosing a rate reloads the block,
    // and asserting on `.first()` again would not notice a selection that
    // landed on a different rate than the one that was clicked.
    await expect(
      page.locator(`${s.shippingMethodRadioSelector}[value="${rateValue}"]`),
      `the chosen shipping rate (${rateValue}) is selected`,
    ).toBeChecked();

    // --- payment
    const payment = page.locator(
      `${s.paymentMethodRadioSelector}[value="${f.paymentMethodCode}"]`,
    );
    await expect(
      payment,
      `the admin offers the ${f.paymentMethodCode} payment method`,
    ).toHaveCount(1);
    // The radio is visually replaced by a styled label, so it is checked
    // through the DOM; the assertion after it is what proves the selection
    // actually took.
    await payment.check({ force: true });
    await this.settle();
    await expect(
      page.locator(`${s.paymentMethodRadioSelector}[value="${f.paymentMethodCode}"]`),
      `the ${f.paymentMethodCode} payment method is selected`,
    ).toBeChecked();

    // The total the admin is about to commit to. Comparing it against the
    // total on the saved order is what proves the order was created from this
    // quote and not silently re-priced.
    const quotedTotal = await readMoney(
      page.locator(s.grandTotalSelector),
      'the order form grand total',
    );
    expect(quotedTotal, 'the order form quotes a non-zero grand total').toBeGreaterThan(0);

    // --- submit
    await page
      .getByRole('button', { name: s.submitButtonLabel, exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForURL('**/sales/order/view/**', {
      timeout: 120_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByText(f.createdNotificationText),
      'the admin reports the order was created',
    ).toBeVisible({ timeout: 30_000 });

    const orderNumber = await this.readOrderNumber();
    expect(
      orderNumber,
      `the saved order has an increment ID (read ${JSON.stringify(orderNumber)})`,
    ).toMatch(new RegExp(f.orderNumberPattern));

    const customerName = `${order.firstName} ${order.lastName}`;
    const grandTotal = await readMoney(
      page.locator(this.data.selectors.admin.orders.view.grandTotalSelector),
      'the saved order grand total',
    );
    expect(
      grandTotal,
      'the saved order carries the grand total the form quoted',
    ).toBeCloseTo(quotedTotal, 2);

    return { orderNumber, customerName, email: order.email, grandTotal };
  }

  /** The increment ID the order view is showing, with Magento's leading `#` stripped. */
  private async readOrderNumber(): Promise<string> {
    const heading = this.page.locator(
      this.data.selectors.admin.orders.view.orderNumberHeadingSelector,
    );
    await expect(heading, 'the order view is titled with an order number').toBeVisible({
      timeout: 30_000,
    });
    return ((await heading.textContent()) ?? '').trim().replace(/^#/, '').trim();
  }

  /* -------------------------------------------------------- order read-back */

  /**
   * Asserts the order grid lists this order against the right customer and
   * total, reading each from its own named column.
   */
  async expectOrderInGrid(
    orderNumber: string,
    expected: { customerName: string; grandTotal: number },
  ): Promise<void> {
    const s = this.data.selectors.admin.orders.grid;

    await openGrid(this.page, `${this.adminSlug}${this.data.slugs.admin.orders.grid}`);
    // findGridRow requires exactly one match, so this is also the assertion
    // that the order reached the grid at all.
    const row = await findGridRow(this.page, this.data, orderNumber);

    await expect(
      await gridCellByColumnLabel(row, this.data, s.customerColumnLabel),
      `the grid's ${s.customerColumnLabel} column names the order customer`,
    ).toHaveText(expected.customerName);

    const gridTotal = await readMoney(
      await gridCellByColumnLabel(row, this.data, s.grandTotalColumnLabel),
      `the grid's ${s.grandTotalColumnLabel} column`,
    );
    expect(gridTotal, 'the grid shows the order total').toBeCloseTo(expected.grandTotal, 2);
  }

  /**
   * Opens the order and asserts its detail page agrees with what was ordered:
   * the customer it was placed for, their email, and the grand total.
   */
  async expectOrderDetails(
    orderNumber: string,
    expected: { customerName: string; email: string; grandTotal: number },
  ): Promise<void> {
    const s = this.data.selectors.admin.orders.view;

    await this.openOrder(orderNumber);
    expect(
      await this.readOrderNumber(),
      'the opened order is the one that was asked for',
    ).toBe(orderNumber);

    await expect(
      this.page.locator(s.customerNameSelector),
      'the order detail page names the customer',
    ).toContainText(expected.customerName);
    await expect(
      this.page.locator(s.emailSelector),
      'the order detail page shows the customer email',
    ).toContainText(expected.email);

    const grandTotal = await readMoney(
      this.page.locator(s.grandTotalSelector),
      'the order detail grand total',
    );
    expect(grandTotal, 'the order detail page shows the order total').toBeCloseTo(
      expected.grandTotal,
      2,
    );
  }

  /* ------------------------------------------------------ status and notes */

  /** Asserts the open order view reports `statusText` as the order's status. */
  async expectStatus(statusText: string): Promise<void> {
    await expect(
      this.page.locator(this.data.selectors.admin.orders.view.statusSelector),
      `the order status is "${statusText}"`,
    ).toHaveText(statusText, { timeout: 30_000 });
  }

  /** Re-requests the order view, so the next read comes from the server. */
  async reloadOrder(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await expect(this.page.getByRole('menubar')).toBeVisible();
  }

  /**
   * Puts the open order on hold.
   *
   * Hold is the status transition core Magento actually offers a freshly
   * placed order: the comment form's status dropdown only lists the statuses
   * assigned to the order's current *state*, and the `new` state ships with
   * exactly one (Pending), so no change can be expressed there. Hold is also
   * reversible, which is what lets a test leave the order as it found it.
   */
  async holdOrder(): Promise<void> {
    const s = this.data.selectors.admin.orders.view;
    const f = this.data.fixtures.admin.orders.status;

    await this.clickOrderAction(s.holdButtonLabel, f.heldNotificationText);
  }

  /** Releases the open order from hold, restoring the status it held before. */
  async releaseOrder(): Promise<void> {
    const s = this.data.selectors.admin.orders.view;
    const f = this.data.fixtures.admin.orders.status;

    await this.clickOrderAction(s.unholdButtonLabel, f.releasedNotificationText);
  }

  /**
   * Presses one of the order view's toolbar actions and requires its effect.
   *
   * The toolbar is rendered twice — the sticky copy is a second, hidden set of
   * the same buttons — so the visible one has to be picked explicitly.
   *
   * The action is asserted by its success notice, not by a navigation. An
   * earlier version waited on `**\/sales/order/view/**`, which is the URL the
   * click is made FROM, so the wait was satisfied instantly and a swallowed
   * click looked identical to a successful one. The admin order view repaints
   * its toolbar over ajax and binds handlers afterwards, so an early click is
   * genuinely dropped.
   *
   * The re-click is gated on the notice still being absent AND the button
   * still being present: these actions are inverses (Hold/Unhold), so blindly
   * clicking again after one succeeded would undo it.
   */
  private async clickOrderAction(buttonLabel: string, expectedNotification: string): Promise<void> {
    const button = this.page
      .getByRole('button', { name: buttonLabel, exact: true })
      .filter({ visible: true });
    const notice = this.page.getByText(expectedNotification);

    await expect(async () => {
      if (!(await notice.isVisible()) && (await button.count())) {
        await button.first().click();
        await this.page.waitForLoadState('domcontentloaded');
      }
      await expect(
        notice,
        `the admin reports "${expectedNotification}"`,
      ).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000 });

    await expect(this.page.getByRole('menubar')).toBeVisible();
  }

  /**
   * Adds a comment to the order's history and asserts it was stored.
   *
   * The comment is submitted over AJAX, which repaints the note list in place.
   * That repaint is not evidence of anything, so the order view is re-requested
   * and the comment required to still be there — a comment the controller
   * accepted but never persisted (Magento does record an empty history entry
   * for one) fails on the reload rather than on the optimistic redraw.
   */
  async addComment(comment: string): Promise<void> {
    const s = this.data.selectors.admin.orders.view;

    await this.page.locator(s.commentFieldSelector).fill(comment);
    await this.page.locator(s.commentSubmitButtonSelector).first().click();

    const note = this.page
      .locator(s.commentListSelector)
      .locator(s.commentItemSelector)
      .filter({ hasText: comment });
    await expect(note, 'the comment is listed on the order').toHaveCount(1, {
      timeout: 30_000,
    });

    await this.reloadOrder();
    await expect(note, 'the comment survived a reload of the order').toHaveCount(1, {
      timeout: 30_000,
    });
  }
}
