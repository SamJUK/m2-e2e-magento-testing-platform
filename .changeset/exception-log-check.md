---
'@samjuk/e2e-m2-playwright-core': minor
---

Report anything the store adds to `var/log/exception.log` during a run, with the request in flight and the test that sent it. It is a warning by default; `failOnExceptions: true` or `E2E_FAIL_ON_EXCEPTIONS=1` fails the run instead. `shell.exec` may now return the command's stdout (the Warden, DDEV and docker compose presets do), and takes `{ quiet: true }` to not echo it.
