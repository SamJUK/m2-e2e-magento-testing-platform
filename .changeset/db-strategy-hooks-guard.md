---
'@samjuk/e2e-m2-playwright-core': major
---

Refuse to run when the configured DB strategy has no shell hooks for it.

`dump-restore` silently degraded to no-op when a project's shell preset was
missing `dbDump`/`dbImport`/`dbQuery`, so a client store ran the suite against
its real data and never restored. Global setup now asserts the hooks the
strategy needs are present and throws naming the missing ones.

BREAKING CHANGE: a project whose shell preset is missing hooks for its
configured `db.strategy` now fails at global setup instead of running with no
database protection. Adding a new strategy also fails to compile until its
required hooks are declared.
