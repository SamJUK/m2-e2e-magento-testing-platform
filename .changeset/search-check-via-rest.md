---
'@samjuk/e2e-m2-playwright-core': patch
---

Check the search engine by searching, not by finding its host.

The guard read `catalog/search/<engine>_server_hostname` and opened a socket to
it, with a special case for ElasticSuite. Amasty Elastic Search keeps its host
under `amasty_elastic/connection`, so the guard probed `localhost:9200` and
refused a store whose search was working. Every third-party engine needed
another special case.

Global setup now calls `/V1/search` for `inputs.search.query` and requires at
least one hit, retrying for about 12 seconds while a freshly started engine
recovers. That goes through the storefront's own adapter whatever the engine,
needs no `shell.exec` hook, and also catches an index that was never built.
A `/V1/search` blocked by the web server or a module (4xx) skips the check
with a warning instead of refusing.
