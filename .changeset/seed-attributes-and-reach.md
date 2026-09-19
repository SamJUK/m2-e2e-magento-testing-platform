---
'@samjuk/e2e-m2-playwright-core': minor
'@samjuk/e2e-m2-theme-luma': patch
'@samjuk/e2e-m2-theme-hyva': patch
---

Seed and click on stores that constrain what a product may be.

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
