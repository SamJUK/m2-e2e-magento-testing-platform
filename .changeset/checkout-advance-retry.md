---
'@samjuk/e2e-m2-playwright-core': patch
'@samjuk/e2e-m2-theme-luma': patch
'@samjuk/e2e-m2-theme-hyva': patch
---

Make the checkout flows survive stores that differ from the stock themes.

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
