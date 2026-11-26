---
'@samjuk/e2e-m2-theme-luma': patch
'@samjuk/e2e-m2-theme-hyva': patch
---

Fix two flaky tests. Removing a product from the comparison list waits for the page scripts and for the confirmation modal, which opens a moment after the click. Creating an invoice or shipment in the admin waits for the save request rather than its response, so a save slower than 20s is no longer clicked again.
