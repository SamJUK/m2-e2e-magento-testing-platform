# Development

Working on the platform itself, rather than on a store's suite.

## Monorepo setup

**Prerequisites:** [Node.js](https://nodejs.org) 22+, [pnpm](https://pnpm.io) 11+

```bash
# Install all workspace dependencies
pnpm install

# Build all packages
pnpm -r build

# Build a single package in watch mode
cd packages/core
pnpm build:watch
```

## Test discovery

`createPlaywrightConfig` builds the Playwright projects array itself. The
store's own `testDir` is always a project; the four below are discovered, so
nothing has to be registered by hand:

### 1. Theme (`@samjuk/e2e-m2-theme-*`)
The active theme package is specified via `config.theme`. If the installed package contains an `e2eTheme.testDir` field, its test directory is added as a Playwright project. Tests import directly from the package's own compiled `dist/` using relative paths.

### 2. NPM module packages (`@<scope>/e2e-m2-module-*`)
Any `e2e-m2-module-*` dependency, under any scope, that declares `"e2eModule": { "testDir": "..." }` in its `package.json` is automatically discovered and added as a project.

`testDir` must name **compiled** output (`dist/tests`), not source. Playwright does not transpile TypeScript under `node_modules`, so a package shipping `src/tests/*.ts` works through a workspace link and fails from a registry. The link resolves to a real path outside `node_modules`, where the transform still applies. `scripts/check-module-packaging.mjs` enforces this.

The specs import their fixtures relatively (`../fixtures/default`), which is the same thing the theme packages do; `tsc` cannot resolve Node subpath imports under this repo's module resolution.

### 3. Local `app/code` modules
Any Magento module under `app/code/{Vendor}/{Module}/Test/E2E/` is automatically discovered as a named project (`{Vendor}_{Module}`). No configuration is required: if the directory exists, the tests run. Specs use `import { test, expect } from '#test'`, which resolves through `"imports"` in the Magento project root `package.json`.

### 4. Composer (`vendor/`) modules, opt-in

Composer-installed Magento modules can ship E2E specs too, but `vendor/` is never scanned blindly (that would auto-execute specs from arbitrary third-party packages). List the packages you trust in `config.vendorModules`:

```ts
vendorModules: ['samjuk/m2-module-example-banner']
```

Each entry resolves `vendor/<name>/Test/E2E/` (overridable via `extra.e2e.testDir` in the package's composer.json) and registers as a Playwright project named after the composer package. Specs use `#test` exactly like `app/code` modules, resolved through the Magento root `package.json` `imports` field.

## Creating a new theme package

1. Create `packages/theme-{name}/` following the structure of `packages/theme-luma`.
2. Add `"e2eTheme": { "testDir": "dist/tests" }` to the new package's `package.json`.
3. Export `{name}Test` (extended from `coreTest`) from `src/fixtures.ts`.
4. Place built-in specs in `src/tests/`. They import from `'../fixtures'` (relative source path, compiled to `dist/tests/` by `tsc`).

## Creating a new module package

```bash
npx @samjuk/create-magento-e2e --module <vendor>-<module> [dir] [--scope acme]
```

Emits a buildable package: page object, fixture extender, a composition
stub, selectors and an example spec. See [docs/modules.md](./modules.md) for the
conventions it encodes and for modules worth covering.

## Releasing

Core, the themes and the module packages are **linked**: they take the same
version number, so a core major propagates to every package that peer-depends
on it instead of leaving stale `^` ranges behind. That was chosen empirically:
`onlyUpdatePeerDependentsWhenOutOfRange` does not do it in either setting.

A patch to one package still bumps only that package; linking decides what a
*major* drags with it.

Core is a **peer dependency** of the themes and modules, not a plain one. As a
plain dependency it resolves to an exact pin, so any divergent bump would give
a consumer two copies of core, the same dual-instance failure that
`@playwright/test` causes when it is duplicated. As a peer there is exactly
one, and a real mismatch is an install-time warning instead of a runtime
mystery. Cross-theme consistency is enforced by the parity gate in CI.

```bash
pnpm changeset          # describe the change
pnpm version-packages   # apply versions
pnpm release            # build + publish
```

In CI this is `release.yml`. It publishes to npm through **trusted publishing
(OIDC)**: GitHub Actions proves its identity to npm directly and npm mints a
short-lived token for that one run, so no publishing credential is stored
anywhere. The two steps whose reasons are not obvious carry them inline, being
the `npm install -g npm@^11` (Node 22 ships npm 10, which has no OIDC) and the
use of `changeset publish` rather than `pnpm publish` (pnpm's own publish has
no OIDC support yet).

## Releases and changelogs

Three surfaces could record a release. Only two are used.

| | |
|---|---|
| npm | the record of what shipped |
| `packages/*/CHANGELOG.md` | the detail. Written by changesets, never by hand |
| GitHub releases | rare, hand-cut milestones only |

**Per-package GitHub releases are deliberately not enabled.** Core, the themes
and the modules are linked, so one core change publishes eight packages and
would produce eight near-identical releases at once. The releases page stops
answering "what is new in this project" the first time that happens, and the
detail it would carry is already in each package's changelog.

So a GitHub release means a milestone worth telling people about, and gets cut
by hand. Most published versions have no tag and no release, and that is the
intended state rather than a gap: `v0.1.1` of the scaffolder exists on npm and
in its own changelog, which is the whole record it needs.

There is no repository-level changelog. There was, and it drifted out of date
within a single release, because a repository-level version is a fiction here:
`create-magento-e2e` is not in the linked group, so the project is already two
versions at once.

## If `pnpm install` refuses the packages

pnpm 11 declines anything published in the last week
(`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`), which makes every install in the days
after a release fail. The scaffolder ships a `pnpm-workspace.yaml` carrying the
exemption; a project that was set up by hand needs it added:

```yaml
minimumReleaseAgeExclude:
  - '@samjuk/e2e-m2-*'
```

It has to live in `pnpm-workspace.yaml`: pnpm reads the setting only from
there and silently ignores the `.npmrc` spelling.

Named explicitly rather than as `@samjuk/*`, so the exemption cannot quietly
extend to a future package under that scope. The scaffolder itself needs no
entry: it runs through `npx`, which is npm, and npm has no release-age guard.

## Consuming a local checkout

Point a store at the workspace with `link:` paths and skip the registry
entirely, but pin `@playwright/test` to the platform's own copy:

```json
{
  "devDependencies": {
    "@playwright/test": "link:../../../../m2-e2e-magento-testing-platform/packages/core/node_modules/@playwright/test"
  }
}
```

Without the pin the store resolves its own, two Playwright instances end up
loaded, and `test()` throws "Playwright Test did not expect test() to be
called here", which reads like a broken spec rather than a duplicated
dependency.
