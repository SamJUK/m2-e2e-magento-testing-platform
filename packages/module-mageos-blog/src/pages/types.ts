/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

export interface BlogPostSpec {
  title: string;
  urlKey: string;
  /** Defaults to published. A draft is what the negative test needs. */
  published?: boolean;
}

export interface CreatedBlogPost {
  spec: BlogPostSpec;
  /** Storefront path, e.g. /blog/my-post. */
  path: string;
}
