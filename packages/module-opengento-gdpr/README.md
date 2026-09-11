# @samjuk/e2e-m2-module-opengento-gdpr

E2E tests for [opengento/module-gdpr](https://github.com/opengento/magento2-gdpr):
the customer's right to receive a copy of their personal data and the right to
have it erased.

## Store requirements

| Config path | Value |
|---|---|
| `gdpr/general/enabled` | `1` |
| `gdpr/export/enabled` | `1` |
| `gdpr/erasure/enabled` | `1` |
| `gdpr/general/block_id` | an existing CMS block identifier |
| `gdpr/export/block_id` | an existing CMS block identifier |
| `gdpr/erasure/block_id` | an existing CMS block identifier |
| `gdpr/anonymize/block_id` | an existing CMS block identifier |

**All four block ids are mandatory in practice.** The module resolves each one
through `Magento\Cms\Block\BlockByIdentifier`, which throws on an empty
identifier, so any unset one turns the customer's own Privacy Settings page
into a 500, with no admin warning. Only `gdpr/general/page_id` ships with a
default (`privacy-policy-cookie-restriction-mode`), and that page does not
exist on every install either.

The four may all point at the same block. The tests do not assert its content.

## What it covers

| Behaviour | Why it is the assertion it is |
|---|---|
| A guest is redirected to sign in | There is no personal data page for someone with no account |
| The account nav offers Privacy Settings | Asserted from the dashboard: Magento renders the *current* page's nav item as plain text, so asserting it on the settings page itself would pass on a store where the link was gone |
| Export and erasure are both offered | The two rights the module exists to provide |
| An export request is registered | The archive is built asynchronously, so the pending state (export control gone, pending message in its place) is what proves the request landed without depending on a queue consumer |
| An erasure request can be raised and undone | Erasure is destructive and held pending; the undo is the safety valve. Asserting both ends of the cycle is also what makes each assertion falsifiable |

Each test registers its own customer, so nothing depends on or leaves behind
shared state.

## Not covered

Downloading the export archive, and the erasure actually completing. Both need
`opengento.gdpr.*` queue consumers or cron to have run. A store that runs them
can add those tests in its own suite.
