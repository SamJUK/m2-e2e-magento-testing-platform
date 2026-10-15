/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

export type DataLayerEntry = Record<string, unknown>;

export interface ProductPush {
  sku: string;
  name: string;
  price: number;
}
