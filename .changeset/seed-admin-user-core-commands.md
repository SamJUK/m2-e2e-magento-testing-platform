---
'@samjuk/e2e-m2-playwright-core': patch
---

Stop the seed calling `admin:user:delete`, which is an n98-magerun2 command, not a
Magento one, so every run printed `Command "admin:user:delete" is not defined`.

`admin:user:create` already updates an existing user's password and reactivates it.
The seed now follows it with `admin:user:unlock`, so a lockout left by earlier failed
logins no longer breaks every admin test.
