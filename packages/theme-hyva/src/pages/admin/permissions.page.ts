import { expect, type Locator, type Page } from '@playwright/test';
import type { HyvaData as MergedData } from '../../data/types';

export interface RestrictedAdminUser {
  username: string;
  password: string;
}

/**
 * System > Permissions. Creates a role with NO resources and an admin user
 * holding it, so the suite has someone whose access can be tested.
 *
 * The role is created with Resource Access set to "Custom" and nothing ticked,
 * rather than by picking nodes out of the resource tree. That is deliberate:
 * the tree is a jstree whose node markup is an implementation detail, while the
 * Resource Access control is a plain select. An empty custom role is also the
 * sharpest possible test subject, because every admin route is forbidden to it.
 *
 * Both forms ask for the CURRENT admin's password before they will save;
 * Magento calls it identity verification.
 */
export class AdminPermissionsPage {
  readonly page: Page;

  constructor(page: Page, private data: MergedData, private adminSlug: string) {
    this.page = page;
  }

  private get identityPassword(): string {
    return process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'Password1';
  }

  /** Creates a role with no resources at all and returns its name. */
  async createRoleWithNoResources(name: string): Promise<string> {
    const s = this.data.selectors.admin.permissions;

    await this.page.goto(`${this.adminSlug}${this.data.slugs.admin.permissions.newRole}`, {
      waitUntil: 'domcontentloaded',
    });

    await this.page.getByLabel(s.roleNameFieldLabel, { exact: true }).fill(name);
    await this.page
      .getByLabel(s.identityPasswordFieldLabel, { exact: true })
      .fill(this.identityPassword);

    // The Resource Access select only exists once its tab is rendered.
    await this.page.getByText(s.roleResourcesTabLabel, { exact: true }).first().click();
    const resourceAccess = this.page.getByLabel(s.resourceAccessFieldLabel, { exact: true });
    await expect(resourceAccess, 'the Role Resources tab is open').toBeVisible({
      timeout: 30_000,
    });
    await resourceAccess.selectOption({ label: s.customResourceAccessOption });

    await this.page.getByRole('button', { name: s.saveRoleButtonLabel }).click();
    await this.expectAdminSaved(
      this.data.fixtures.admin.permissions.roleSavedText,
      'the admin reports the role was saved',
    );

    return name;
  }

  /** Creates an admin user holding `roleName`. */
  async createUserWithRole(user: RestrictedAdminUser, roleName: string): Promise<void> {
    const s = this.data.selectors.admin.permissions;

    await this.page.goto(`${this.adminSlug}${this.data.slugs.admin.permissions.newUser}`, {
      waitUntil: 'domcontentloaded',
    });

    await this.page.getByLabel(s.userNameFieldLabel, { exact: true }).fill(user.username);
    await this.page.getByLabel(s.firstNameFieldLabel, { exact: true }).fill('E2E');
    await this.page.getByLabel(s.lastNameFieldLabel, { exact: true }).fill('Restricted');
    await this.page
      .getByLabel(s.emailFieldLabel, { exact: true })
      .fill(`${user.username}@example.com`);
    await this.page.getByLabel(s.passwordFieldLabel, { exact: true }).fill(user.password);
    await this.page
      .getByLabel(s.passwordConfirmationFieldLabel, { exact: true })
      .fill(user.password);
    await this.page
      .getByLabel(s.identityPasswordFieldLabel, { exact: true })
      .fill(this.identityPassword);

    // The role is chosen on its own tab, as a radio in a grid of roles.
    await this.page.getByText(s.userRoleTabLabel, { exact: true }).first().click();
    const roleRow = this.page.locator('tr', { hasText: roleName }).first();
    await expect(roleRow, `the ${roleName} role has a row to choose`).toBeVisible({
      timeout: 30_000,
    });
    const roleRadio = roleRow.locator('input[type="radio"]');
    await roleRadio.check();
    // Magento saves a user with no role at all without complaining, and a
    // roleless user is refused every page exactly as an empty role is.
    await expect(roleRadio, `the ${roleName} role is selected`).toBeChecked({ timeout: 15_000 });

    await this.page.getByRole('button', { name: s.saveUserButtonLabel }).click();
    await this.expectAdminSaved(
      this.data.fixtures.admin.permissions.userSavedText,
      'the admin reports the user was saved',
    );
  }

  /**
   * Asserts the signed-in admin is refused a page their role has no resource
   * for.
   *
   * Read off the page rather than off the HTTP status: Magento answers a
   * forbidden admin route with 200 and a denial body, so a status assertion
   * would pass on exactly the leak this is here to catch.
   */
  async expectAccessIsDenied(slug: string): Promise<void> {
    await this.page.goto(`${this.adminSlug}${slug}`, { waitUntil: 'domcontentloaded' });

    await expect(
      this.page.getByText(this.data.fixtures.admin.permissions.accessDeniedText),
      `the admin refuses ${slug} to a role with no resources`,
    ).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Waits for an admin save to report success, and fails with whatever the
   * admin actually said when it does not.
   *
   * Both of these forms validate on a tab the test is not looking at, so a
   * refused save leaves the page sitting on the form with its complaint out of
   * view. Without this, the failure reads as "the success message never
   * appeared" and says nothing about why - which is a diagnosis session rather
   * than a test result.
   */
  private async expectAdminSaved(successText: string, description: string): Promise<void> {
    const success = this.page.getByText(successText);
    // Scoped to the page's own message block: #system_messages carries standing
    // notices ("One or more indexers are invalid") that outlive any save.
    const problem = this.page.locator(
      '.messages .message-error, .messages .message-warning, .mage-error',
    );

    await expect(async () => {
      if (await success.first().isVisible().catch(() => false)) return;

      const complaints = await problem.allTextContents().catch(() => []);
      const said = complaints.map((t) => t.trim()).filter(Boolean).join(' | ');
      expect(said === '' ? 'no message' : said, `${description} (the admin said: ${said || 'nothing'})`).toBe(
        successText,
      );
    }).toPass({ timeout: 60_000 });
  }
}
