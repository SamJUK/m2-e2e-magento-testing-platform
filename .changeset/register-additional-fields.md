---
'@samjuk/e2e-m2-playwright-core': minor
'@samjuk/e2e-m2-theme-luma': minor
'@samjuk/e2e-m2-theme-hyva': minor
---

Support stores that make extra registration fields required.

`inputs.account.register.additionalFields` maps a field's visible label to the
value to enter, and the register page object fills each one before submitting.
Stores with `customer/address/prefix_show` set to `req`, or any required custom
customer attribute, could not create an account at all before this.
