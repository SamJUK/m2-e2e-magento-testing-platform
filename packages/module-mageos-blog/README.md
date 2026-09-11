# @samjuk/e2e-m2-module-mageos-blog

E2E tests for [mage-os-lab/module-blog](https://github.com/mage-os-lab/module-blog)
(`mage-os/module-blog`), a whole storefront section with its own routes, URL
rewrites and markup.

## Store requirements

| Config path | Value |
|---|---|
| `mageos_blog/general/enabled` | `1` |

Defaults to `0`. With it off the routes are never registered and the index test
fails on a 404 rather than passing quietly.

No content is needed: each test creates the post it needs and deletes it again.

## What it covers

| Test | What it proves |
|---|---|
| The index is served and renders the module container | The route is registered and the section renders |
| A published post is listed and renders its own page | Creation, the URL rewrite, and the listing |
| A draft post is neither listed nor reachable | The status is honoured, and this is what makes the listing assertion falsifiable |
| The RSS feed lists a published post | The machine-readable surface, which breaks silently |

## Not covered, and why

Posts are created with a **title and URL key only**. On any store with
`Magento_PageBuilder` enabled (Mage-OS ships it), the post's `content` and
`short_content` fields are Page Builder stages rendered in iframes, and driving
those from an E2E suite is not worth the fragility. Title is the form's only
required field, so the routing, listing, status and feed behaviour is all
reachable without them.

That leaves these for a follow-up: categories, tags, authors, the blog search,
the sidebar widgets, the six CMS widgets, and related posts on a product page.
Each needs its own admin entity created first, and the post form's taxonomy
fields are `ui-select` chip controls.

The module ships both Luma and Hyvä templates, and its markup is its own
(`mageos-blog-*`), so nothing here touches a theme selector.
