---
"@samjuk/e2e-m2-playwright-core": minor
"@samjuk/e2e-m2-theme-hyva": patch
"@samjuk/e2e-m2-theme-luma": patch
"@samjuk/e2e-m2-module-magepal-googletagmanager": patch
"@samjuk/create-magento-e2e": patch
---

Make the suite safe and quicker to run with several workers against one store.

- Each worker can sign in as its own admin user (`<username>-<n>`), so sessions
  and saved admin grid filters stop leaking between workers. Opt in by passing
  `FullConfig.workers` to `runGlobalSetup(config, workers)`; the new project
  template does. Without it, every worker shares one admin as before.
- The admin URL key test gets its own seeded product (`fixtures.product.adminUrlKey`,
  `slugs.products.adminUrlKeyProduct`) instead of the one the rename test renames.
  A store with an empty or custom product URL suffix needs to set that slug, and
  one with `seed.createFixtureEntities: false` needs a product for it.
- The GTM data layer test reads the seeded virtual product, and the meta robots
  product test flags that one instead of the product the rename test edits.
- The seed writes its config values in one `shell.dbQuery` call, one upsert per
  value, then cleans the config cache. A custom `dbQuery` that takes only one
  statement per call makes it fall back to `config:set`, as does no hook.
  `currency/options/allow` still goes through `config:set`, so a store whose
  display currency is not in the list is left alone. Admin users are created
  side by side.
- The seed turns off admin usage tracking (`admin/usage/enabled`). Its remote
  script shows a tour popup to every new admin user, which blocks admin clicks.
