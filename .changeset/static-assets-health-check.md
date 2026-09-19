---
'@samjuk/e2e-m2-theme-luma': minor
'@samjuk/e2e-m2-theme-hyva': minor
---

Add a health test asserting the storefront's static assets are deployed.

A store whose static content was never deployed serves its HTML fine and 404s
every script, so nothing interactive works and the failures surface as a dozen
unrelated broken flows. The test fails on any 4xx/5xx JS or CSS response and
requires the theme's JS stack to have finished loading.
