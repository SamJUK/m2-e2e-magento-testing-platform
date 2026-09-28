# @samjuk/e2e-m2-playwright-core

## 1.0.0

### Major Changes

- b04675e: Refuse to run when the configured DB strategy has no shell hooks for it.
  
  `dump-restore` silently degraded to no-op when a project's shell preset was
  missing `dbDump`/`dbImport`/`dbQuery`, so a client store ran the suite against
  its real data and never restored. Global setup now asserts the hooks the
  strategy needs are present and throws naming the missing ones.
  
  BREAKING CHANGE: a project whose shell preset is missing hooks for its
  configured `db.strategy` now fails at global setup instead of running with no
  database protection. Adding a new strategy also fails to compile until its
  required hooks are declared.

### Minor Changes

- b04675e: Support stores that make extra registration fields required.
  
  `inputs.account.register.additionalFields` maps a field's visible label to the
  value to enter, and the register page object fills each one before submitting.
  Stores with `customer/address/prefix_show` set to `req`, or any required custom
  customer attribute, could not create an account at all before this.
- b04675e: Seed and click on stores that constrain what a product may be.
  
  - `seed.productAttributes` applies `{ attribute_code: value }` to every product
    the seed creates, including the bundle. A store with a required custom
    attribute rejected every fixture before this, so the seed could not run at
    all. A select expects its option id, not the label.
  - `seed.disableTwoFactorModules` (default `true`) disables Magento's and
    MageOS' 2FA modules before seeding. Magento's module has no config switch, so
    an admin login is impossible without it.
  - `clickReachable` clicks whichever of several matches is not covered, trying
    later matches first, for themes that repeat a call to action inside a modal.
  - `grossUp` scales a net amount onto a gross total, split out from
    `displayedPrice`: it is driven by the tax rate alone, because it compares two
    figures the store itself renders on different bases.
  - `selectors.minicart.itemSelector` gives themes whose drawer lines are not
    list items a row handle.

### Patch Changes

- b04675e: Make the checkout flows survive stores that differ from the stock themes.
  
  - Advancing from the shipping step to payment is retried: a Next click that
    lands while the loader is back over the button is swallowed, and the step
    then never advances.
  - The incomplete-address test picks a delivery option before emptying the
    street field, which is the state a customer reaches that button in. Themes
    whose Next handler checks for a rate bail out of it before they ever
    validate the address.
  - Coupon locators take the visible copy of the discount form, for themes that
    render it in both the sidebar and the payment step and so duplicate its ids.
  - `displayedPrice` scales a seeded fixture's configured amount by
    `inputs.tax.rate` when `features.catalog.pricesDisplayIncludeTax` is set, so
    the bundle, custom-option and coupon arithmetic compares like with like on a
    store that displays prices including tax.
  - The cart's line-total check allows the half-penny-per-unit rounding a
    VAT-inclusive store shows when it rounds the displayed unit price but
    computes the row from the unrounded figure.
  - The seed reindexes `cataloginventory_stock` and `inventory` separately: a
    store with MSI disabled has no `inventory` indexer, and one bad name made
    Magento reject the whole list behind a `|| true`.
- b04675e: Harden the suite against stores that differ from the stock themes.
  
  - `waitForFormKey` used a per-document deadline, so a stale key on an older
    document skipped the wait entirely and the cached `absent` result could
    poison later probes.
  - `setCheckbox` and `setSelect` drive controls a theme has hidden behind its
    own styling, instead of spending the test budget waiting for an input that
    will never be actionable.
  - The dirty-run flag now also lives beside the dump on disk, so a kill during
    a run is still detected after the restore that rewrites the flag's table.
  - Shell presets redact passwords from the commands they echo on failure.
  - The admin order form's customer and store-view pickers are driven by the
    page's state rather than by a fixed sequence of clicks.
- fb29ad4: Check the search engine by searching, not by finding its host.
  
  The guard read `catalog/search/<engine>_server_hostname` and opened a socket to
  it, with a special case for ElasticSuite. Amasty Elastic Search keeps its host
  under `amasty_elastic/connection`, so the guard probed `localhost:9200` and
  refused a store whose search was working. Every third-party engine needed
  another special case.
  
  Global setup now calls `/V1/search` for `inputs.search.query` and requires at
  least one hit, retrying for about 12 seconds while a freshly started engine
  recovers. That goes through the storefront's own adapter whatever the engine,
  needs no `shell.exec` hook, and also catches an index that was never built.
  A `/V1/search` blocked by the web server or a module (4xx) skips the check
  with a warning instead of refusing.
- 0926a9d: Stop the seed calling `admin:user:delete`, which is an n98-magerun2 command, not a
  Magento one, so every run printed `Command "admin:user:delete" is not defined`.
  
  `admin:user:create` already updates an existing user's password and reactivates it.
  The seed now follows it with `admin:user:unlock`, so a lockout left by earlier failed
  logins no longer breaks every admin test.
- 6d95f52: Pass `--no-tablespaces` to `warden db dump` in `wardenShell`. Warden's database user has
  no PROCESS privilege, so every dump printed an access-denied error for tablespaces. The
  dump itself was complete; only the error goes. `dockerComposeShell` already passed it.
