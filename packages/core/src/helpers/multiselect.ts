/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

/** Browser-side helper that selects all options in a <select multiple> element.
 *  Use with Playwright's `.evaluate(multiSelectAll)`. */
export function multiSelectAll(select: HTMLSelectElement): void {
  for (const opt of select.options) {
    opt.selected = true;
  }
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
