import { expect, type Page } from '@playwright/test';
import type { MergedData } from '@samjuk/e2e-m2-playwright-core';
import { findGridRow, openGrid } from './grid';

/** Customers > All Customers: grid lookup by email, then the customer page. */
export class AdminCustomerPage {
  readonly page: Page;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
  }

  /** Finds a customer in the grid by email and opens their detail page. */
  async openCustomer(email: string): Promise<void> {
    const s = this.data.selectors.admin.customers;

    await openGrid(this.page, `${this.adminSlug}${this.data.slugs.admin.customers.grid}`);
    const row = await findGridRow(this.page, this.data, email);
    await row.getByRole('link', { name: s.grid.editLinkLabel }).first().click();

    await this.page.waitForURL('**/customer/index/edit/**', {
      timeout: 45_000,
      waitUntil: 'domcontentloaded',
    });
    await expect(this.page.getByRole('menubar')).toBeVisible();

    // The default Customer View tab does not show the email address, so open
    // Account Information — a UI-component form that loads on demand.
    await this.page
      .getByRole('link', { name: s.accountInformationTabLabel, exact: true })
      .click();
    await expect(this.page.locator(s.form.emailField)).toHaveValue(email, {
      timeout: 30_000,
    });
  }
}
