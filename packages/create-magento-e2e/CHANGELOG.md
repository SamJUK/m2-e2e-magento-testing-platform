# @samjuk/create-magento-e2e

## 0.1.1

### Patch Changes

- 05764b8: Ship a `.gitignore` with the scaffolded project, so the generated `.env` cannot be committed.
  
  The scaffolded `.env` holds the store's admin credentials, and the scaffolded README tells you to negate any `/dev/*` rule that would swallow the directory. Between the two, a store following that advice had nothing covering `.env` at all. It only looked safe on stores that happened to ignore the whole of `dev/tests/`.
  
  Ships as `gitignore` and is renamed on the way out, because npm refuses to put a file called `.gitignore` in a tarball. Writing it the obvious way worked from a checkout and would have shipped nothing from the registry, which is the same shape as the module-packaging bug: correct in the repository, wrong once installed. `scripts/check-scaffold-tarball.mjs` now packs the scaffolder, scaffolds out of the tarball and asserts the result, so this cannot regress.
  
  Also renames the generated project from `@example/e2e` to `@acme/e2e`, and fixes the generated `.env` header, which still read "Copy to .env and adjust" inside the `.env` itself.
