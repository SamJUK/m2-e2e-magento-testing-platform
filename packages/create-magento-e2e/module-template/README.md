# @__SCOPE__/e2e-m2-module-__PACKAGE__

E2E tests for the __PASCAL__ Magento 2 module.

## Structure

| Path | What it is |
|---|---|
| `src/pages/module.page.ts` | Page object. **Every assertion goes here**, not in the spec. |
| `src/fixtures/module.ts` | `with__PASCAL__(baseTest)`, composes onto a theme test or onto `coreTest`. |
| `src/fixtures/default.ts` | Composition point the specs import relatively. |
| `src/data/selectors.json` | Shipped defaults. Stores override them, they don't edit them. |
| `src/tests/` | Specs. Compiled to `dist/tests`, which is what `e2eModule.testDir` names. Playwright does not transpile TypeScript under `node_modules`. |

## Develop

```sh
pnpm install
pnpm build
```

Then in a store that has this module installed:

```sh
pnpm add -D @__SCOPE__/e2e-m2-module-__PACKAGE__
pnpm test --grep @__PACKAGE__
```

No config change is needed: any `e2e-m2-module-*` dependency declaring
`e2eModule.testDir` is discovered and registered as a Playwright project.

## Store overrides

Store-varying values (labels, slugs, capability flags) belong in the store's
own `config/*.json`, namespaced under `__CAMEL__`, not hardcoded here:

```json
// <store>/config/selectors.json
{ "__CAMEL__": { "bannerHeading": ".custom-heading" } }
```

Read them with core's `deepMerge`, module defaults **underneath** the store's,
so a store only restates what it actually moved.

## Publishing

A scoped package publishes restricted unless told otherwise, so state the
access explicitly:

```json
"publishConfig": { "access": "public" }
```

Add a `registry` alongside it to publish somewhere other than npmjs.
