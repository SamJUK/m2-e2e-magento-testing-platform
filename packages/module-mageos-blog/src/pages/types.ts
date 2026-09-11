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
