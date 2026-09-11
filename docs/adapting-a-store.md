# Adapting the suite to a store

One suite runs against any store, adapted by **configuration rather than by
forking**. Selectors, slugs, labels, inputs and capability flags all merge
core → theme → project, so a store adapts the suite by editing five JSON files
under its own `config/`.

This page covers what to do when a store does not fit.

## Excluding tests on a store

A store that cannot run one of the shared tests declares it with a reason code
rather than a bare `grepInvert`:

```ts
exclusions: [
  { pattern: /@currency/, reason: 'not-applicable', note: 'Single-currency store.' },
  { pattern: /@sort/,     reason: 'platform-gap',   note: 'Ajax listing we cannot settle on yet.' },
],
```

| Reason | Meaning |
|---|---|
| `not-applicable` | The store genuinely lacks the feature. Permanent and legitimate. |
| `platform-gap` | It works for real customers; our page objects cannot drive it. Our debt. |
| `client-bug` | It is actually broken on the store. Worth reporting, not hiding. |

Every run prints the exclusions and their reasons, so platform gaps stay
visible instead of blending in with the legitimate ones.

## Where a new test belongs
| What it tests | Where it lives |
|---|---|
| Core Magento behaviour, any store | Shared theme suites (both themes, identical titles/tags) |
| A store's own quirk (wording, slugs, capability) | That project's `config/*.json`, not a new test |
| A first-party `app/code` module | `app/code/<Vendor>/<Module>/Test/E2E/` |
| A third-party composer module we don't own | npm package `@samjuk/e2e-m2-module-<vendor>-<module>` |
| A module whose vendor ships its own specs | Composer, via the `vendorModules` allowlist |

Third-party modules get an npm package rather than a composer one because
`vendor/` is wiped on every `composer install`, and because we should not ship
specs inside code we don't control.

## What is deliberately not here
Assertions are meant to fail when the feature breaks. See `COVERAGE.md` for
the assertion-quality audit, the per-store exclusion matrix, and the ranked
list of paths not yet covered. Store-specific capability differences are
declared in `config/features.json` rather than skipped silently.

## Database rollback (dump-restore)

Test runs create data (customers, orders, CMS content) and the seed changes store config. To leave the environment exactly as it was, enable the dump-restore strategy:

```ts
import { wardenShell } from '@samjuk/e2e-m2-playwright-core';

db: {
  strategy: 'dump-restore',
  dumpPath: path.join(__dirname, 'var', 'e2e-db-backup.sql'),
},
shell: wardenShell(projectRoot),   // or ddevShell(projectRoot)
```

globalSetup dumps the DB **before** seeding; globalTeardown re-imports it and flushes caches, so seed config and all test data roll back. `wardenShell` / `ddevShell` presets wire all four hooks (`exec`, `dbDump`, `dbImport`, `dbQuery`) to the environment's CLI. Any other setup declares its own hooks on `shell`.

**Dirty-run guard:** after dumping, setup writes an `e2e_dirty_run` row to Magento's `flag` table; a completed restore removes it. If a run is killed before teardown, the next run **refuses to start** rather than overwrite the only clean restore point with a polluted database. The error tells you how to recover: import the existing dump, or clear the flag to accept current state. The guard needs the `dbQuery` hook; without it, it degrades to a warning.

Keep `strategy: 'none'` for throwaway environments. A full dump+import per run costs real time on large databases.

**Stock drains on a store that never rolls back.** Multi-Source Inventory
computes salable quantity as source quantity minus reservations, and a
reservation is only compensated when its order ships or is cancelled. The suite
places orders it never fulfils, so on `strategy: 'none'` those reservations
accumulate until the product it orders stops being orderable and every checkout
test fails with "The requested qty is not available". Measured on a demo store
after 95 runs: source quantity 93, reservations -93, salable 0.

The seed tops up the SKUs in `fixtures.product.orderedSkus` and clears their
reservations, but only where the change is undone for you (`dump-restore` /
`s3-import`) or the store declares itself throwaway with
`seed.disposableStore: true`. Anywhere else it leaves them alone, because
clearing a real store's reservations would release stock committed to real
orders. A store running at `strategy: 'none'` without that flag has to manage
the stock of whatever it lets the suite order.

## Known store-side failures

These are the store's faults, not the suite's, but they present as suite
failures and are worth recognising.

**Every checkout test fails at `checkoutConfig`, and `/checkout/` returns
"There has been an error processing your request".** Look for
`Magento\Csp\Model\SubresourceIntegrityRepository->getData()` and "Unable to
unserialize value" in `var/report/`. Magento_Csp writes its SRI hashes to
`pub/static/<area>/sri-hashes.json` non-atomically, so two requests generating
merged JS at the same time truncate the file, and from then on every page
carrying a merged bundle returns 500. It is deterministic once corrupted, which
is what tells it apart from load flakiness. Delete the file and flush:

```bash
rm pub/static/frontend/sri-hashes.json && bin/magento cache:flush
```

Parallel workers hitting a production-mode store just after the seed's cache
flush is a reliable way to provoke it.
