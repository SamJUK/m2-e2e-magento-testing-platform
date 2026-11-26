---
'@samjuk/e2e-m2-playwright-core': minor
---

Report anything the store adds to `var/log/exception.log` during a run. It is a warning by default; `failOnExceptions: true` or `E2E_FAIL_ON_EXCEPTIONS=1` fails the run instead. Needs the new `shell.capture` hook, which the Warden, DDEV and docker compose presets now set.
