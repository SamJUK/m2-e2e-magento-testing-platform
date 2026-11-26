---
'@samjuk/e2e-m2-playwright-core': minor
---

`DEFAULT_BLOCKED_HOSTS` is exported from the package root. A `use` passed to `createPlaywrightConfig` is merged with the defaults instead of replacing them, so it no longer drops the base URL or the third-party blocking. A leading `*.` in a blocked host is ignored. The README documents the blocking and its limits (Chromium launched by Playwright only).
