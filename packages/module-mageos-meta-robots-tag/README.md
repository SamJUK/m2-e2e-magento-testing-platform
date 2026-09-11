# @samjuk/e2e-m2-module-mageos-meta-robots-tag

E2E tests for [mage-os/module-meta-robots-tag](https://github.com/mage-os/module-meta-robots-tag),
which adds `no_index`, `no_follow` and `no_archive` flags to products,
categories and CMS pages and turns them into `<meta name="robots">` directives.

Bundled with the Mage-OS distribution; installable on any Magento 2 store.

## Store requirements

Only that `MageOS_MetaRobotsTag` is enabled. The tests set and clear the flags
themselves through the admin, so nothing has to be prepared.

`design/search_engine_robots/default_robots` is read as the baseline: the
suite asserts against whatever the store's default is rather than assuming
`INDEX,FOLLOW`.

## What it covers

Both observers (CMS pages and catalog entities), both directive paths
(replacing `INDEX`/`FOLLOW`, appending `NOARCHIVE`) and all three entity types.

Every test reverts the flag it set, so the package is safe on a store with no
database rollback. Asserting two mutually exclusive directives on one URL,
either side of the revert, is what makes the assertion falsifiable.
