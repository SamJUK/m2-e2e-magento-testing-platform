---
'@samjuk/e2e-m2-playwright-core': patch
---

Pass `--no-tablespaces` to `warden db dump` in `wardenShell`. Warden's database user has
no PROCESS privilege, so every dump printed an access-denied error for tablespaces. The
dump itself was complete; only the error goes. `dockerComposeShell` already passed it.
