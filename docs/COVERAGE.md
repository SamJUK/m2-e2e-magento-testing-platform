# Test coverage

What the suite covers today, what is planned, and what is deliberately out of
scope, broken down by area.

`theme-luma` and `theme-hyva` ship **identical test titles and tags**; CI fails
if they drift. Counts below are per theme.

| | Meaning |
|---|---|
| ✅ | Implemented and running in CI |
| ⬜ | Not implemented, wanted |
| ➖ | Deliberately out of scope (reason given) |

Rows marked ✅ carry the exact test title. `scripts/check-coverage-matrix.mjs`
asserts that set matches the specs on disk, and asserts the headline below
against the tables, so neither can quietly go stale.

Read the headline as: unique ✅ test titles, then ⬜ rows. A few tests are
listed under two areas on purpose (the invoice and shipment emails belong to
both Transactional email and Admin > Sales), so ✅ rows outnumber ✅ titles.

**Today: 95 ✅ · 55 ⬜**

---

## Test execution tiers

Running every test on every commit is impractical on a real Magento store. Tiers allow projects and CI pipelines to select the appropriate slice without reading the full test list.

| Tier | Answers | Command | Suggested Use |
|---|---|---|---|
| **Smoke** | Is the store reachable and can essential endpoints respond? | `pnpm test:smoke`<br>`playwright test --grep @smoke` | PR checks, post-deploy checks, fast local loop |
| **Critical** | Can customers browse, add products to cart, and purchase without revenue loss? | `playwright test --grep "@smoke\|@checkout\|@cart"` | PR merge gate, master push CI, staging checks |
| **Admin** | Can store administrators log in and manage orders/products? | `pnpm test:admin`<br>`playwright test --grep @admin` | Master push, nightly runs, pre-release checks |
| **Extended / Full** | Does the entire suite pass across all edge cases, validations, and modules? | `pnpm test`<br>`playwright test` | Pre-release sign-off, scheduled nightly runs |

### Placement rule: Tier by consequence, not by shape

When adding a new test, place it based on **consequence of failure**, not structural similarity:

- **Revenue and availability impact $\to$ Critical / Smoke**: A `@negative` test that prevents revenue loss (for example, an out-of-stock product cannot be added to cart, an invalid coupon is rejected, or checkout halts corrupted payment) belongs in the highest-impact tier.
- **Copy and minor validation $\to$ Extended**: A `@negative` test asserting specific field validation copy or an edge-case form error belongs in Extended.
- Two tests may have identical structure and assertion shape, yet sit three tiers apart based on whether a failure halts revenue or merely displays imperfect copy.

---

## Storefront

### Health & infrastructure

| Test | Tags | Status |
|---|---|---|
| `key storefront pages respond with HTTP 200` | `@health @smoke` | ✅ |
| `a nonexistent URL renders the 404 page` | `@health @smoke @negative` | ✅ |
| robots.txt and sitemap.xml are served | | ⬜ |
| no console errors on the key storefront pages | | ⬜ |
| the store responds under HTTPS with no mixed content | | ⬜ |
| maintenance mode serves 503 | | ➖ Takes the store down; not safe on a shared env |

### Homepage & CMS

| Test | Tags | Status |
|---|---|---|
| `can visit homepage` | `@homepage @smoke` | ✅ |
| a CMS page renders its content on the storefront | | ⬜ |
| a CMS block renders where it is assigned | | ⬜ |
| footer links resolve (no 404s) | | ⬜ |
| a Page Builder page renders its rows and columns | | ⬜ |

### Navigation

| Test | Tags | Status |
|---|---|---|
| `breadcrumbs show the trail on a category page and on a product page` | `@category @breadcrumbs` | ✅ |
| the main menu opens a top-level category | | ⬜ |
| a submenu entry navigates to the child category | | ⬜ |
| the mobile menu opens and navigates at a phone viewport | | ⬜ |

### Category listing

| Test | Tags | Status |
|---|---|---|
| `can change sort order` | `@category @sort` | ✅ |
| `can change sort order direction` | `@category @sort` | ✅ |
| `can sort products by name` | `@category @sort` | ✅ |
| `can apply layered navigation filter` | `@category @filter` | ✅ |
| `can change the number of products shown per page` | `@category @limiter` | ✅ |
| `can page through the product listing` | `@category @pagination` | ✅ |
| `can switch currency` | `@category @currency` | ✅ |
| `clearing all layered filters restores the full listing` | `@category @filter` | ✅ |
| `two layered filters combine` | `@category @filter` | ✅ |
| the grid/list mode toggle changes the listing layout | | ⬜ |
| an empty category renders its empty state | | ⬜ |

### Search

| Test | Tags | Status |
|---|---|---|
| `can search for a product` | `@search @smoke` | ✅ |
| `an unknown search query returns no results` | `@search @negative` | ✅ |
| the search box suggests terms as you type | | ⬜ |
| searching by SKU finds the product | | ⬜ |
| advanced search returns matching products | | ⬜ |

### Product pages

| Test | Tags | Status |
|---|---|---|
| `can add to cart` (simple) | `@product @simple @smoke` | ✅ |
| `can add to cart with options` (configurable) | `@product @configurable @smoke` | ✅ |
| `bundle product renders its options and the price follows the selection` | `@product @bundle` | ✅ |
| `bundle product can be added to the cart with its selections` | `@product @bundle @cart` | ✅ |
| `out of stock product shows its status and cannot be added to cart` | `@product @negative` | ✅ |
| a grouped product adds its child quantities to the cart | | ⬜ |
| a downloadable product adds to the cart and the link is in the account after purchase | | ⬜ |
| the image gallery switches the main image and opens the lightbox | | ⬜ |
| a tier price applies once its quantity threshold is reached | | ⬜ |
| a special price shows alongside the struck-through original | | ⬜ |
| related / up-sell / cross-sell blocks render their products | | ⬜ |
| the product tabs (description, more information, reviews) each open | | ⬜ |
| a configurable option combination that is out of stock is disabled | | ⬜ |

### Product tools

| Test | Tags | Status |
|---|---|---|
| `can compare two products` | `@compare` | ✅ |
| `can add a product to the cart from the comparison page` | `@compare @cart` | ✅ |
| `can remove a product from the comparison list` | `@compare` | ✅ |
| `customer can add a product to their wish list` | `@wishlist @customer` | ✅ |
| `customer can remove a product from their wish list` | `@wishlist @customer` | ✅ |
| `customer can add a wish list item to the cart` | `@wishlist @cart` | ✅ |
| `guest cannot add a product to a wish list` | `@wishlist @negative` | ✅ |
| `a submitted review is held for moderation and reaches the admin` | `@review @admin` | ✅ |
| an approved review shows on the product page with its rating | | ⬜ |
| a wish list can be shared by email | | ⬜ |
| a cart item can be moved to the wish list | | ⬜ |

---

## Cart & checkout

### Cart

| Test | Tags | Status |
|---|---|---|
| `product is visible in cart` | `@cart @smoke` | ✅ |
| `can remove product from cart` | `@cart` | ✅ |
| `can change product quantity` | `@cart` | ✅ |
| `a guest cart survives signing in` | `@cart @customer` | ✅ |
| `the cart survives a page reload and a new tab` | `@cart @smoke` | ✅ |
| `the empty cart renders its empty state` | `@cart` | ✅ |
| estimate shipping and tax in the cart updates the totals | | ⬜ |
| cross-sell products render in the cart | | ⬜ |

### Minicart

| Test | Tags | Status |
|---|---|---|
| `product is visible in minicart` | `@minicart @smoke` | ✅ |
| `can remove product from minicart` | `@minicart` | ✅ |
| `can proceed to cart from minicart` | `@minicart` | ✅ |
| `can proceed to checkout from minicart` | `@minicart` | ✅ |
| changing quantity in the minicart updates the subtotal | | ➖ Luma only. Hyva's cart drawer ships no quantity control at all, only Remove, so the cross-theme contract cannot hold. Needs a `features.minicart.quantityControl` flag first; the cart page's own quantity change is covered |

### Pricing & promotions

| Test | Tags | Status |
|---|---|---|
| `can apply a coupon code in the cart` | `@cart @coupon` | ✅ |
| `can remove a coupon code from the cart` | `@cart @coupon` | ✅ |
| `an invalid coupon code is rejected in the cart` | `@cart @coupon @negative` | ✅ |
| `a coupon applied at checkout discounts the order total` | `@checkout @coupon` | ✅ |
| `the checkout totals add up` | `@checkout @totals` | ✅ |
| `the product price is the same on the product page, in the minicart, in the cart and at checkout` | `@price @cart @checkout` | ✅ |
| a free-shipping cart price rule zeroes the shipping row | | ⬜ |
| a catalog price rule discounts the price on the listing and the PDP | | ⬜ |
| prices render inc/ex tax per the store's display setting | | ⬜ |

### Checkout

| Test | Tags | Status |
|---|---|---|
| `guest can complete checkout` | `@checkout @smoke` | ✅ |
| `registered customer can complete checkout and view the order in their history` | `@checkout @customer` | ✅ |
| `registered customer can complete checkout using a saved address` | `@checkout @customer` | ✅ |
| `the payment method selected at checkout is the one recorded on the order` | `@checkout @payment @customer` | ✅ |
| `checkout rejects an incomplete shipping address` | `@checkout @negative` | ✅ |
| `a virtual-only cart skips the shipping step entirely` | `@checkout @virtual` | ✅ |
| changing the shipping method changes the order total | | ⬜ |
| a different billing address is recorded on the order | | ⬜ |
| an existing account email prompts sign-in at checkout | | ⬜ |
| the order confirmation page shows the increment ID | | ⬜ |
| a second payment method completes an order | | ⬜ |

---

## Customer account

| Test | Tags | Status |
|---|---|---|
| `can register a new customer account` | `@customer @smoke` | ✅ |
| `can login to customer account` | `@customer @smoke` | ✅ |
| `can logout from customer account` | `@customer @smoke` | ✅ |
| `login with invalid credentials is rejected` | `@customer @negative` | ✅ |
| `login without a password is rejected` | `@customer @negative` | ✅ |
| `can request a password reset link` | `@customer @password` | ✅ |
| `order history is empty for a new customer account` | `@customer @orders` | ✅ |
| `can add an address to the address book` | `@customer @address` | ✅ |
| `can edit an address in the address book` | `@customer @address` | ✅ |
| `can delete an address from the address book` | `@customer @address` | ✅ |
| `an address with a missing required field is rejected` | `@customer @address @negative` | ✅ |
| `a signed-in customer can change their password` | `@customer @password` | ✅ |
| `a past order can be reordered` | `@checkout @customer @orders` | ✅ |
| `a guest can look up an order via Orders and Returns` | `@checkout @orders` | ✅ |
| `registering with an email that already exists is rejected` | `@customer @negative` | ✅ |
| `a password reset link actually sets a new password and signs in` | `@customer @password @email` | ✅ |
| `a customer can edit their name and email` | `@customer @profile` | ✅ |
| `the default billing/shipping address can be changed` | `@customer @address` | ✅ |
| `the account dashboard shows the customer's details and default addresses` | `@customer @profile` | ✅ |
| `an order's detail page and its printable copy open from the history` | `@checkout @customer @orders` | ✅ |
| `the newsletter subscription can be toggled from the account` | `@customer @newsletter` | ✅ |

## Newsletter & contact

| Test | Tags | Status |
|---|---|---|
| `can subscribe to newsletter` | `@homepage @newsletter` | ✅ |
| `can send contact form message` | `@contact @smoke` | ✅ |
| `contact form with a missing required field is rejected` | `@contact @negative` | ✅ |
| `contact form with a malformed email address is rejected` | `@contact @negative` | ✅ |
| the newsletter confirmation email arrives | | ⬜ |
| unsubscribing removes the subscription | | ⬜ |

## Transactional email (via Mailpit)

| Test | Tags | Status |
|---|---|---|
| `customer receives a welcome email after registration` | `@customer @email` | ✅ |
| `customer receives a password reset email` | `@customer @email` | ✅ |
| `customer receives an order confirmation email` | `@checkout @email` | ✅ |
| `admin can invoice an order and email the invoice to the customer` | `@admin @email` | ✅ |
| `admin can ship an order and email the shipment to the customer` | `@admin @email` | ✅ |
| a credit memo email is sent on refund | | ⬜ |
| the contact form message reaches the store's inbox | | ⬜ |

---

## Admin

### Access & system

| Test | Tags | Status |
|---|---|---|
| `can login to admin panel` | `@admin @smoke` | ✅ |
| `can visit system configuration page` | `@admin` | ✅ |
| `can visit cache management page` | `@admin` | ✅ |
| flushing the cache from the admin succeeds | | ⬜ |
| an invalid admin login is rejected | | ⬜ |
| the index management grid loads and shows every indexer valid | | ⬜ |

### Catalog

| Test | Tags | Status |
|---|---|---|
| `can find a product in the grid and open its edit form` | `@admin` | ✅ |
| `can edit a product and save the change` | `@admin` | ✅ |
| creating a simple product makes it visible on the storefront | | ⬜ |
| disabling a product removes it from the storefront | | ⬜ |
| a category can be created and shows in the main menu | | ⬜ |

### Customers

| Test | Tags | Status |
|---|---|---|
| `can find a customer in the grid and open their detail page` | `@admin` | ✅ |
| an admin-created customer can sign in on the storefront | | ⬜ |

### Sales

| Test | Tags | Status |
|---|---|---|
| `admin can create an order from the admin panel` | `@admin @orders` | ✅ |
| `an order appears in the admin order grid with the right customer and total` | `@admin @orders` | ✅ |
| `admin can change an order status and add a comment` | `@admin @orders` | ✅ |
| `admin can invoice an order and email the invoice to the customer` | `@admin @email` | ✅ |
| `admin can ship an order and email the shipment to the customer` | `@admin @email` | ✅ |
| an order can be cancelled | | ⬜ |
| a credit memo refunds an invoiced order | | ⬜ |

### Content

| Test | Tags | Status |
|---|---|---|
| `can create a new CMS block` | `@admin` | ✅ |
| `can delete a CMS block` | `@admin` | ✅ |
| `can create a new CMS page` | `@admin` | ✅ |
| `can delete a CMS page` | `@admin` | ✅ |

### Marketing

| Test | Tags | Status |
|---|---|---|
| `can create a new cart price rule` | `@admin` | ✅ |
| `can delete a cart price rule` | `@admin` | ✅ |
| a catalog price rule can be created and applied | | ⬜ |
| a review can be approved from the admin and appears on the storefront | | ⬜ |

---

## Cross-cutting

| Area | Status |
|---|---|
| Multi-currency switch | ✅ (`can switch currency`) |
| Store view / language switch | ⬜ |
| Multi-website scope | ⬜ |
| Accessibility (axe on key pages) | ⬜ |
| SEO meta: canonical, title, meta description, structured data | ⬜ |
| Performance budgets / Lighthouse | ➖ Not an E2E concern; separate tool |
| Visual regression | ➖ Screenshot diffing across client themes is noise, not signal |
| GraphQL / REST API contract tests | ➖ Different layer; belongs in a PHP/API suite |

---

## Modules

Module packages cover behaviour that only exists when a specific Magento module
is installed. They are discovered automatically. See
[Test discovery](./development.md#test-discovery).

| Package | Module | Tests |
|---|---|---|
| `@samjuk/e2e-m2-module-mageos-meta-robots-tag` | [mage-os/module-meta-robots-tag](https://github.com/mage-os/module-meta-robots-tag) | 5 ✅ verified on Mage-OS 3.2.0 |
| `@samjuk/e2e-m2-module-magepal-googletagmanager` | [magepal/magento2-googletagmanager](https://github.com/magepal/magento2-google-tag-manager) | 6 ✅ verified on Mage-OS 3.2.0 |
| `@samjuk/e2e-m2-module-opengento-gdpr` | [opengento/module-gdpr](https://github.com/opengento/magento2-gdpr) | 4 ✅ verified on Mage-OS 3.2.0 |
| `@samjuk/e2e-m2-module-mageos-blog` | [mage-os-lab/module-blog](https://github.com/mage-os-lab/module-blog) | 4 ✅ verified on Mage-OS 3.2.0 |
| `@samjuk/e2e-m2-module-smile-elasticsuite` | [Smile-SA/elasticsuite](https://github.com/Smile-SA/elasticsuite) | 5 ✅ verified on Mage-OS 3.2.0 |

`module-rma` and `module-amasty-shopby` moved to a private repo: both are paid
extensions, absent from any base Luma / Hyvä / Mage-OS install, so nobody
without a licence could run or review them.

[docs/modules.md](./modules.md) has the scaffolder command, the conventions,
and the ranked list of modules worth covering next.

### mageos-meta-robots-tag

| Test | Tags | Status |
|---|---|---|
| `an unflagged product keeps the store default robots directive` | `@seo @smoke` | ✅ |
| `a CMS page flagged No index renders NOINDEX` | `@seo @smoke` | ✅ |
| `a CMS page flagged No archive appends NOARCHIVE to the default` | `@seo` | ✅ |
| `a product flagged No follow renders NOFOLLOW on its PDP` | `@seo @product` | ✅ |
| `a category flagged No index renders NOINDEX on its listing` | `@seo @category` | ✅ |

Covers both observers (CMS and catalog), both code paths (replacing INDEX or
FOLLOW, appending NOARCHIVE) and all three entity types. Each test reverts its
own flag, so it is safe on a store without database rollback. Asserting
two mutually exclusive directives on one URL, before and after the revert, is
what makes the assertion falsifiable.

This also closes the `<meta name="robots">` half of the SEO gap in
[Cross-cutting](#cross-cutting), for stores that run the module.

### magepal-googletagmanager

| Test | Tags | Status |
|---|---|---|
| `the homepage pushes its page type and the store currency` | `@analytics @smoke` | ✅ |
| `a product page pushes the product sku, name and price the store declares` | `@analytics @product @smoke` | ✅ |
| `a category page pushes the category name and its full path` | `@analytics @category` | ✅ |
| `the search results page pushes its page type` | `@analytics @search` | ✅ |
| `the data layer reports a guest as not logged in with an empty cart` | `@analytics @customer` | ✅ |
| `the cart page pushes an empty cart` | `@analytics @cart` | ✅ |
| `addToCart` and `purchase` pushes | | ⬜ need a theme page object; compose onto a theme test |

No DOM assertions at all: the module's entire output is `window.dataLayer`.
Proven falsifiable by switching `googletagmanager/general/active` off and
watching every test fail on the page-type poll.

### opengento-gdpr

| Test | Tags | Status |
|---|---|---|
| `a guest asking for privacy settings is sent to sign in` | `@privacy @negative @smoke` | ✅ |
| `a signed-in customer is offered both a data export and an erasure` | `@privacy @customer @smoke` | ✅ |
| `requesting a personal data export registers it` | `@privacy @customer` | ✅ |
| `an erasure request can be raised and then undone` | `@privacy @customer` | ✅ |
| Downloading the export archive, erasure completing | | ⬜ need queue consumers or cron |

Each test registers its own customer. The erasure test asserts the same page in
two opposite states either side of the undo, which is what makes it falsifiable.

Building this found a real module fault worth knowing about: all four
`*/block_id` settings are mandatory in practice: any unset one turns the
customer's Privacy Settings page into a 500, with no admin warning. See the
package README.

### mageos-blog

| Test | Tags | Status |
|---|---|---|
| `the blog index is served and renders the module container` | `@blog @smoke` | ✅ |
| `a published post is listed on the index and renders its own page` | `@blog @smoke` | ✅ |
| `a draft post is neither listed nor reachable` | `@blog @negative` | ✅ |
| `the RSS feed lists a published post` | `@blog @rss` | ✅ |
| Categories, tags, authors, blog search, sidebar, widgets, related posts | | ⬜ each needs its own admin entity first |
| Post body copy | | ➖ Page Builder stage in an iframe on any store with Magento_PageBuilder |

Posts are created with a title and URL key only. Title is the form's one
required field, which is what keeps the routing, listing, status and feed
behaviour reachable without touching Page Builder.

### smile-elasticsuite

| Test | Tags | Status |
|---|---|---|
| `the autocomplete offers products, not only search terms` | `@search @smoke` | ✅ |
| `a product suggestion resolves to the product page it names` | `@search` | ✅ |
| `the store search term returns products` | `@search @smoke` | ✅ |
| `a misspelled query falls back to the closest matches` | `@search @spellcheck` | ✅ |
| `an unmatchable query still returns nothing` | `@search @negative` | ✅ |
| Virtual categories, thesaurus, optimizers, facet coverage rates | | ⬜ admin features, each needs its own entity first |

The only module here that replaces surfaces the core suite already tests rather
than adding new ones. Every assertion is one the stock engine would fail, and
each is paired with a counterweight so an engine that simply returned
everything could not pass.

---

## Where the gaps came from

Planned rows are drawn from three places:

- **[elgentos/magento2-playwright](https://github.com/elgentos/magento2-playwright)**: accessibility, footer links, main menu.
- **[ProxiBlue/m2-hyva-playwright](https://github.com/ProxiBlue/m2-hyva-playwright)**: mobile menu, CMS storefront rendering, product widgets, cart persistence, customer dashboard.
- **Real client rollouts**: everything in the checkout, pricing and post-purchase sections. See the assertion-quality audit and per-store exclusion matrix in the working notes.

Anything a store genuinely lacks is an **exclusion with a reason code**, not a
gap. See [Excluding tests on a store](./adapting-a-store.md#excluding-tests-on-a-store).
