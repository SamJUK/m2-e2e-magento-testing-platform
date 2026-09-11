# @samjuk/e2e-m2-module-magepal-googletagmanager

E2E tests for [magepal/magento2-googletagmanager](https://github.com/magepal/magento2-google-tag-manager).

The module renders no markup. Its whole output is objects pushed onto a
JavaScript data layer, and every tag and conversion figure downstream reads
those objects. A silently empty push is invisible on the storefront and
expensive in the reports.

## Store requirements

| Config path | Value |
|---|---|
| `googletagmanager/general/active` | `1` |
| `googletagmanager/general/account` | any container id, e.g. `GTM-E2ETEST` |

No real Google account is needed. The container id only has to be present:
core blocks `googletagmanager.com` in every browser context, and the pushes are
inline, so the data layer is populated whether or not Google's container ever
loads.

Without both settings the module renders nothing and every test fails on the
page-type poll, rather than passing on an empty data layer.

## Overrides

A store that renamed its data layer (`googletagmanager/general/datalayer_name`)
or reports different page types says so in its own `config/fixtures.json`:

```json
{ "googleTagManager": { "dataLayerName": "myDataLayer" } }
```

## Not covered core-only

`addToCart` and `purchase` pushes need a theme page object to drive the
storefront that far. Compose this package onto a theme test in the store's own
suite to reach them:

```ts
export const test = withGoogleTagManager(lumaTest);
```
