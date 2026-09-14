# m2-e2e-magento-testing-platform

[![CI Workflow Status](https://github.com/SamJUK/m2-e2e-magento-testing-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/SamJUK/m2-e2e-magento-testing-platform/actions/workflows/ci.yml)
[![Supported Magento Versions](https://img.shields.io/badge/magento-2.4.7%E2%80%932.4.9-orange.svg?logo=magento)](https://github.com/SamJUK/m2-e2e-magento-testing-platform/actions/workflows/e2e.yml)
[![GitHub Release](https://img.shields.io/github/v/release/SamJUK/m2-e2e-magento-testing-platform?label=Latest%20Release&logo=github)](https://github.com/SamJUK/m2-e2e-magento-testing-platform/releases)

> [!NOTE]
> **Early release.**
> Whilst it works well for my workflow, I am open to changes / suggestions.
> If you try it, feel free to [open an issue](https://github.com/SamJUK/m2-e2e-magento-testing-platform/issues):
> what you had to override, what you could not express in config at all, what
> the docs got wrong. Disagreement about the approach counts.

A configurable [Playwright](https://playwright.dev) suite for Magento 2. One suite, run against any store, whatever the theme, language or modules. Adapted by configuration rather than by forking.

Composable: install the core, the package for the theme your store runs, and one package per module worth testing. Nothing else is loaded, and nothing store-specific lives in code.

For a single store you intend to grow a suite alongside, [elgentos/magento2-playwright](https://github.com/elgentos/magento2-playwright) and [ProxiBlue/m2-hyva-playwright](https://github.com/ProxiBlue/m2-hyva-playwright) are less machinery for the same result.

## Why

- **One suite, many stores.** Everything store-specific is data, not code. No fork, no branch per client.
- **Plug in what the store runs.** A theme package, plus a package per module. Install it and its tests appear; leave it out and nothing mentions it.
- **Extend without touching the platform.** Your own tests, your `app/code` modules and your composer packages are picked up alongside the shared suite.
- **A skipped test looks exactly like a passing one.** Exclusions carry a reason code and get printed at run start, so a real gap cannot pass for a store limitation.

## Test discovery

A store never maintains a projects array. Its own tests are always a project;
everything else is discovered:

| Source | Where | Enabled by |
|---|---|---|
| Theme suite | `@samjuk/e2e-m2-theme-*` | `config.theme` |
| Module packages | `@<scope>/e2e-m2-module-*` | any installed dependency declaring `e2eModule.testDir` |
| The store's own tests | `dev/tests/e2e/tests/` | always; not discovered, just the configured `testDir` |
| `app/code` modules | `app/code/{Vendor}/{Module}/Test/E2E/` | the directory existing |
| Composer packages | `vendor/<name>/Test/E2E/` | **opt-in** via `config.vendorModules` |

`vendor/` is never scanned blindly. Auto-executing specs out of arbitrary third-party code is not a feature, so composer packages are named one at a time.

## How it works

**A store's differences are configuration.** Five data layers merge in order: core defaults, theme overrides, then the project's own `config/{selectors,slugs,inputs,fixtures,features}.json`. A store restates only what it actually moved. Keys the merge does not recognise are copied straight through, which is what lets a module package namespace its own block inside those same five files instead of introducing a sixth.

**A test that cannot run is an exclusion with a reason code.** `not-applicable` for a feature the store genuinely lacks, `platform-gap` for one that works for real customers but that the page objects cannot drive, `client-bug` for one that is actually broken. All three are printed when the run starts. Without the distinction our own debt hides among a store's legitimate limitations and never gets paid.

**Assertions read state back.** A success message proves that a controller did not throw, and nothing else. An address is saved and then re-read from the form. A product rename is checked in the form, in the grid *and* on the storefront. An order confirmation is matched by increment ID, not by subject line. Every new assertion is checked by breaking the feature and watching it fail.

**One theme suite, two implementations.** `theme-luma` and `theme-hyva` expose identical test titles and tags, so a store's `config/*.json` behaves the same under either and switching theme does not change what is covered. CI fails if they drift.

**The database goes back.** `dump-restore` dumps before seeding and re-imports after, so seed config and test data both roll back. A flag row is written once the dump exists and removed by a completed restore. A run killed before teardown leaves that flag set, and the next run refuses to start rather than dump a polluted database as its only clean restore point.

## Install

```bash
cd <magento root>
npx @samjuk/create-magento-e2e
```

Writes `dev/tests/e2e`, refuses to overwrite an existing one, and warns if there is no `bin/magento` three levels up. That path is not arbitrary. The config resolves the Magento root three levels up, and `app/code` specs are discovered from there.

Then:

```bash
cd dev/tests/e2e
pnpm install
npx playwright install chromium
pnpm test
```

`playwright install` is not optional. `@playwright/test` is a peer dependency, so the store resolves its own version, usually newer than the one the platform develops against, and that version needs its own browser build. Skip it and every test fails at once with "Executable doesn't exist", which reads like a broken install rather than a missing download.

Expect failures on a store the suite has not seen before. They are the store telling you what to override in `config/*.json`. See [Adapting the suite to a store](./docs/adapting-a-store.md).

To scaffold a **module test package** instead:

```bash
npx @samjuk/create-magento-e2e --module <vendor>-<module> [dir] [--scope acme]
```

See [docs/modules.md](./docs/modules.md).

## Requirements

Node 22+, pnpm 11+, `@playwright/test` 1.50+ as a peer dependency, and a Magento store reachable over HTTP. Mailpit for the email tests, and a shell hook (Warden, DDEV, docker compose, or your own four functions) for seeding and database rollback.

Tested against Magento 2.4.7-p3, 2.4.8 and 2.4.9, and Mage-OS 3.2 and 3.5, on the Luma and Hyvä themes.

## Packages

| Package | Description |
|---|---|
| [`@samjuk/e2e-m2-playwright-core`](./packages/core) | Fixtures, the five-layer data merge, config factory, seeding, database rollback, health checks |
| [`@samjuk/e2e-m2-theme-luma`](./packages/theme-luma) | 95 tests against the Luma theme |
| [`@samjuk/e2e-m2-theme-hyva`](./packages/theme-hyva) | The same 95 against Hyvä. Identical titles and tags, gated in CI |
| [`@samjuk/create-magento-e2e`](./packages/create-magento-e2e) | Scaffolds a store's suite, or a module test package |
| [`@samjuk/e2e-m2-module-mageos-meta-robots-tag`](./packages/module-mageos-meta-robots-tag) | `mage-os/module-meta-robots-tag`: robots directives per page, category and product |
| [`@samjuk/e2e-m2-module-magepal-googletagmanager`](./packages/module-magepal-googletagmanager) | `magepal/magento2-googletagmanager`: data layer pushes |
| [`@samjuk/e2e-m2-module-opengento-gdpr`](./packages/module-opengento-gdpr) | `opengento/module-gdpr`: data export and right to erasure |
| [`@samjuk/e2e-m2-module-mageos-blog`](./packages/module-mageos-blog) | `mage-os/module-blog`: posts, listing, RSS |
| [`@samjuk/e2e-m2-module-smile-elasticsuite`](./packages/module-smile-elasticsuite) | `smile/elasticsuite`: autocomplete, spellcheck, relevance |

Packages for paid extensions live in a separate private repo. Neither RMA nor Amasty Shopby exists on a base install, so nobody without a licence could run their tests or check whether they still pass.

## Architecture

```
Consuming project (dev/tests/e2e/)
  └── playwright.config.ts       ← createPlaywrightConfig(config)
        ├── [project]            ← the store's own tests in tests/
        ├── [theme]              ← from @samjuk/e2e-m2-theme-*
        ├── [npm modules]        ← from @<scope>/e2e-m2-module-*
        ├── [app/code modules]   ← from app/code/{Vendor}/{Module}/Test/E2E/
        └── [vendor modules]     ← opt-in, via config.vendorModules
```

The store's own tests and its `app/code` specs share one composition point through the `#test` import alias. Module packages compose their own, because a published package's specs cannot see the store's.

## Test coverage

**119 tests.** 95 per theme, plus 24 across the five module packages. Every one has been executed against a real Magento install.

Tags run a subset: `--grep @smoke`, `--grep @admin`, `--grep @negative`. Execution tiers (smoke, critical revenue paths, admin, and extended) and the consequence-based placement rule are documented in [docs/COVERAGE.md](./docs/COVERAGE.md#test-execution-tiers).

Rejection is asserted, not merely absence of success. Twelve `@negative` tests cover invalid credentials, missing required fields, malformed email, a duplicate registration email, an incomplete checkout address, invalid coupons, out-of-stock add-to-cart, guest wish list access, empty search results and the 404 page.

[docs/COVERAGE.md](./docs/COVERAGE.md) is the full matrix: every test by area, the 55 gaps, and what is deliberately out of scope. A CI gate asserts it against the specs on disk in both directions, so it cannot claim more than exists or less.

## Documentation

| | |
|---|---|
| [Test coverage](./docs/COVERAGE.md) | Every test by area, execution tiers, placement rules, and gaps |
| [Adapting the suite to a store](./docs/adapting-a-store.md) | Exclusions and reason codes, where a new test belongs, database rollback |
| [Module test packages](./docs/modules.md) | Writing one, the conventions it has to follow, and modules worth covering |
| [Development](./docs/development.md) | Monorepo setup, test discovery, creating packages, releasing |
| [The disposable test environment](./docs/test-environment.md) | How the platform tests itself |

## Repository layout

| Path | What |
|---|---|
| `packages/core` | fixtures, data merge, config factory, seeding, database rollback |
| `packages/theme-luma`, `packages/theme-hyva` | the shared suite, one implementation per theme |
| `packages/module-*` | tests that apply only when a given Magento module is installed |
| `packages/create-magento-e2e` | the scaffolder: store template and module-package template |
| `tests/docker` | disposable Magento stack used to test the platform itself |
| `tests/project` | the consumer project that stack runs |
| `docs/` | coverage matrix, store adaptation, module packages, development |
| `scripts/` | the CI gates |

Only `packages/*` is published. `tests/` is how the platform tests itself and is not a template to copy. Start from the scaffolder.

## Gates

Five checks run on every push, and each one exists because something got past without it:

| Gate | What it stops |
|---|---|
| Cross-theme parity | The two theme suites drifting apart. They are a contract, not two implementations, and it has broken twice, both times silently, because each suite stayed green on its own |
| Scaffolder version pins | A release bumping every package and leaving the template behind. `npx` keeps working, it just installs a superseded major |
| Unread selector keys | A key nothing reads. A store sets it, nothing changes, and the selector it was meant to fix stays hardcoded in a page object |
| Coverage matrix | A document that says more than it knows, in either direction |
| Module packaging | A module package that is undiscoverable once installed. All four gates above passed while every one of them was |

The last is the reason the list is worth keeping. `e2eModule.testDir` named `src/tests`, Playwright does not transpile TypeScript under `node_modules`, and workspace links hid it entirely. A pnpm symlink resolves to a real path outside `node_modules`, where the transform still applies. Nothing was wrong in this repository. Everything was wrong once installed.

## Tests

The platform tests itself against real Magento, never against mocks:

```bash
pnpm build                        # all packages
tests/docker/run.sh up   luma     # boot + install (first run pulls images)
tests/docker/run.sh test luma     # run the suite against it
tests/docker/run.sh down luma     # remove it, volumes included
```

Targets are `luma` (Magento Open Source), `hyva`, and `mageos` as a distro canary, each with its own stack, ports and compose project. They are separate because installing Hyvä switches the store's theme, so a shared database would leave whichever target installed last deciding which markup the other one asserts against.

`e2e.yml` runs the same three targets in CI, on demand only. Each job boots a full Magento stack and takes 20 to 30 minutes, which is too much to attach to a push and too much to bill nightly on a project that changes in bursts.

On a pull request, `/e2e` runs a narrowed slice against the PR head:

```
/e2e                       luma, whole suite
/e2e @checkout             luma, checkout tests only
/e2e hyva @cart @customer  hyva, cart and customer tests
/e2e all @smoke            every target, smoke tests only
```

Bare words are targets, `@`words are Playwright tags. It defaults to `luma` because that is the target needing no credentials. See [docs/test-environment.md](./docs/test-environment.md).

## License

OSL-3.0. Copyright © SamJUK.
