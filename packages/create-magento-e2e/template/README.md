# Consumer template

Scaffold for adding the E2E suite to a Magento store. Copy this directory to
`<magento root>/dev/tests/e2e`:

```bash
cp -R templates/consumer <magento root>/dev/tests/e2e
cd <magento root>/dev/tests/e2e
cp .env.example .env      # then edit
pnpm install
pnpm test
```

## What to change

| File | What |
|---|---|
| `.env` | base URL, admin slug/credentials, Mailpit URL, DB strategy |
| `playwright.config.ts` | theme (`luma`/`hyva`), table prefix, shell preset, seed options |
| `config/*.json` | everything store-specific, see below |
| `fixtures.ts` | swap `lumaTest` → `hyvaTest` for Hyvä |

## Adapting to a store

Nearly all adaptation belongs in `config/*.json`, not in test code:

- **`selectors.json`**: wording and DOM differences ("Add to Basket" rather
  than "Add to Cart", "Post Code" rather than "Zip").
- **`fixtures.json`**: expected copy, notification text, email subjects,
  the store name.
- **`slugs.json`**: real product and category URLs on this store.
- **`inputs.json`**: values the tests type in.
- **`features.json`**: which *core* Magento features the store has. This is a
  declaration, not a switch: setting a feature `false` makes the suite assert
  it is genuinely absent, so a store that later gains it fails loudly instead
  of quietly going untested.

Functionality added by a **module** does not belong in `features.json`. Ship
its tests with the module instead (`app/code/<Vendor>/<Module>/Test/E2E/`, an
npm module package, or the composer `vendorModules` allowlist).

## Before you start

- The `.gitignore` in the store repo must not swallow this directory. Stores
  commonly ignore `/dev/*`; add a negation, and verify with `git add -n`
  rather than `git check-ignore` (which reports confusingly for negated paths).
- Set `DB_STRATEGY=dump-restore` on any store whose data matters. The suite
  places orders and changes config; without a rollback that residue builds up.
- Check `app/etc/config.php` and `env.php` for values locked at the file level.
  `bin/magento config:set` **fails silently** against a locked value, so a
  seed step can appear to succeed and change nothing.

## First run

Expect failures on a store the suite has never seen. They are the store
telling you what to override. Read `test-results/*/error-context.md`: it
contains an accessibility snapshot of the page, which is usually enough to
find the real label or selector without opening a browser.
