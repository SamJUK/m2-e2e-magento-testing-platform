---
'@samjuk/e2e-m2-playwright-core': patch
'@samjuk/e2e-m2-theme-luma': patch
'@samjuk/e2e-m2-theme-hyva': patch
---

Harden the suite against stores that differ from the stock themes.

- `waitForFormKey` used a per-document deadline, so a stale key on an older
  document skipped the wait entirely and the cached `absent` result could
  poison later probes.
- `setCheckbox` and `setSelect` drive controls a theme has hidden behind its
  own styling, instead of spending the test budget waiting for an input that
  will never be actionable.
- The dirty-run flag now also lives beside the dump on disk, so a kill during
  a run is still detected after the restore that rewrites the flag's table.
- Shell presets redact passwords from the commands they echo on failure.
- The admin order form's customer and store-view pickers are driven by the
  page's state rather than by a fixed sequence of clicks.
