---
'@samjuk/e2e-m2-playwright-core': patch
---

On a store with `shell.dbQuery`, the seed fails naming any admin user it could not create, instead of one worker failing to log in later.

On a `db.strategy: 'none'` store, teardown now deletes the per-worker admins (`<username>-<n>`), which are full Administrators with the test password, along with their role rows. They are read from the store, so ones left by a cancelled run or a run with more workers go too, and they are removed even if restoring the config snapshot fails. Those names are reserved for the platform: the seed already resets any existing account with one of them to the test password.

The seed no longer writes `currency/options/installed`, which is not a Magento config path, and global setup no longer prints `sh: can't open var/log/exception.log` on a store that has not logged an exception yet.
