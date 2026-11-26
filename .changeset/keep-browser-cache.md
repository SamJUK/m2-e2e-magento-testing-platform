---
"@samjuk/e2e-m2-playwright-core": patch
---

Block third-party hosts with Chromium's `--host-resolver-rules` instead of `context.route()`, which turned off the browser cache so every page refetched every script. Luma suites run about twice as fast. `E2E_BLOCK_THIRD_PARTY=0` and `E2E_BLOCK_EXTRA_HOSTS` work as before.
