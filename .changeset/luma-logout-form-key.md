---
"@samjuk/e2e-m2-theme-luma": patch
---

`AccountPage.logout()` waits for the page scripts before signing out. Straight after sign-in, a sign-out clicked before the scripts had booted posted a form key Magento rejected with "Invalid Form Key".
