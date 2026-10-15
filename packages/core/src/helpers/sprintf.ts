/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

/** Simple printf-style %s substitution */
export function sprintf(format: string, ...args: unknown[]): string {
  let i = 0;
  return format.replace(/%s/g, () => String(args[i++] ?? ''));
}
