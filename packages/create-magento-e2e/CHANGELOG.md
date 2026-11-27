# @samjuk/create-magento-e2e

## 0.1.5

### Patch Changes

- b0a106e: A fresh scaffold installs the 0.4 packages, not 0.3. The release now bumps the template's pins along with the packages.

## 0.1.4

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
- c970c93: New projects install `@samjuk/e2e-m2-theme-luma` `^0.2.1`, the version this repo publishes.

## 0.1.3

### Patch Changes

- 1a6355b: Scaffold against the 0.2 packages instead of 0.1.

## 0.1.2

### Patch Changes

- 0e40c65: Ship a NOTICE file in every package and an OSL-3.0 header in every source file.

## 0.1.1

### Patch Changes

- 05764b8: Ship a `.gitignore` with the scaffolded project, so the generated `.env` cannot be committed.
  
  The scaffolded `.env` holds the store's admin credentials, and the scaffolded README tells you to negate any `/dev/*` rule that would swallow the directory. Between the two, a store following that advice had nothing covering `.env` at all. It only looked safe on stores that happened to ignore the whole of `dev/tests/`.
  
  Ships as `gitignore` and is renamed on the way out, because npm refuses to put a file called `.gitignore` in a tarball. Writing it the obvious way worked from a checkout and would have shipped nothing from the registry, which is the same shape as the module-packaging bug: correct in the repository, wrong once installed. `scripts/check-scaffold-tarball.mjs` now packs the scaffolder, scaffolds out of the tarball and asserts the result, so this cannot regress.
  
  Also renames the generated project from `@example/e2e` to `@acme/e2e`, and fixes the generated `.env` header, which still read "Copy to .env and adjust" inside the `.env` itself.
