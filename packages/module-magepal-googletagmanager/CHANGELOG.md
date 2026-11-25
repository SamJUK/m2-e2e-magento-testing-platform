# @samjuk/e2e-m2-module-magepal-googletagmanager

## 0.3.0

### Patch Changes

- 257c725: Make the suite safe and quicker to run with several workers against one store.
  
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
- Updated dependencies [257c725]
  - @samjuk/e2e-m2-playwright-core@0.3.0

## 0.2.0

### Patch Changes

- 0e40c65: Ship a NOTICE file in every package and an OSL-3.0 header in every source file.
- Updated dependencies [b04675e]
- Updated dependencies [f1a63fa]
- Updated dependencies [b04675e]
- Updated dependencies [b04675e]
- Updated dependencies [0e40c65]
- Updated dependencies [b04675e]
- Updated dependencies [fb29ad4]
- Updated dependencies [0926a9d]
- Updated dependencies [b04675e]
- Updated dependencies [6d95f52]
  - @samjuk/e2e-m2-playwright-core@0.2.0
