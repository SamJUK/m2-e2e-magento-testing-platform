# Module test packages

A module package holds tests for behaviour that only exists when a specific
Magento module is installed. It ships its own page objects, selectors and
specs, and is discovered automatically. See
[Test discovery](./development.md#test-discovery).

Naming: `@<scope>/e2e-m2-module-<vendor>-<module>`.

## Scaffold one

```bash
npx @samjuk/create-magento-e2e --module <vendor>-<module> [dir] [--scope acme]
```

Emits a buildable package: page object, fixture extender, a composition
stub for the specs, a selectors file and one example spec. It installs and compiles against the
published core with no edits. Change the selectors and write the specs.

Rules the template already encodes:

| Rule | Why |
|---|---|
| Assertions live in the page object, never the spec | Markup moves; the spec shouldn't have to |
| Depend on `coreTest`, not a theme, unless you truly need a theme page object | A theme dependency halves the module's usable surface |
| `src/fixtures/default.ts` must supply **every** fixture the specs use | The specs compose against this file, not against the consuming store's fixtures.ts |
| Store-varying values are namespaced overrides in the store's `config/*.json` | One override mechanism, no new loader, nothing hardcoded |

Module defaults merge **underneath** the store's, so a store restates only what
it actually moved. `deepMerge` from core does this.

## Paid modules live elsewhere

`module-rma` and `module-amasty-shopby` were split out to
[`m2-e2e-modules-private`](https://github.com/SamJUK/m2-e2e-modules-private).
Neither module exists on a base Luma / Hyvä / Mage-OS install, so nobody
without a licence can run their tests, or check whether they still pass. Both
keep their names and versions; consumers see no change.

The public monorepo keeps only what a reader can install and run.

## Candidates worth covering

All open source, all installable in the docker test environment without a third-party
account. That last constraint is the one that matters: a module package that has
never been executed against its module is the same liability as an image tag
that was never published.

| Module | Package | Testable surface |
|---|---|---|
| [Smile-SA/elasticsuite](https://github.com/Smile-SA/elasticsuite) ★800, OSL-3.0 | `module-smile-elasticsuite` | Replaces catalog search **and** layered navigation: autocomplete, relevance, faceting, virtual categories |
| [mage-os-lab/module-blog](https://github.com/mage-os-lab/module-blog) ★23, OSL-3.0 | `module-mageos-blog` | Whole new storefront section: post list, post detail, category, tag, author, RSS, sitemap, six widgets. Ships Luma **and** Hyvä templates |
| [mage-os/module-meta-robots-tag](https://github.com/mage-os/module-meta-robots-tag) ★12, MIT | `module-mageos-meta-robots-tag` | `<meta name="robots">` per page, category and product |
| [opengento/magento2-gdpr](https://github.com/opengento/magento2-gdpr) ★146, MIT | `module-opengento-gdpr` | Cookie consent bar, account data export, erasure request |
| [magepal/magento2-google-tag-manager](https://github.com/magepal/magento2-google-tag-manager) ★264 | `module-magepal-googletagmanager` | `dataLayer` pushes on view / add-to-cart / purchase via network and JS assertions, no UI |

### Order to take them

**1. Smile ElasticSuite.** The only one that *replaces* surfaces the core suite
already tests, so it answers the question a client actually asks: what happens
when a store swaps out search? Needs nothing but the OpenSearch we already run.

**2. mage-os/module-meta-robots-tag.** Twenty minutes of work and it doubles as
the reference module package: one selector-free assertion on a meta tag, no
fixtures, no seeding. It also closes the SEO-meta gap in
[COVERAGE.md](./COVERAGE.md), so it is coverage rather than only a demo.

**3. mage-os-lab/module-blog.** Biggest surface of the five and the best
demonstration of a module that adds routes rather than changing existing ones.
Its Luma and Hyvä templates make it the one honest test of whether a module
package can stay theme-agnostic.

Then GDPR and GTM, in either order. GTM is the useful oddity, a module with no
UI at all, asserted entirely through `dataLayer` pushes and network requests.

### Deliberately not on the list

Payment modules (Adyen, Mollie, Braintree). The money path is the least-verified
part of the suite and they would be the highest-value coverage, but every one
needs a test merchant account, and a module package nobody can run is worse than
no package. Revisit when an account exists.

[mage-os-lab/module-newsletter-coupon](https://github.com/mage-os-lab/module-newsletter-coupon)
★10, MIT is the strongest runner-up: subscribe, read the coupon out of Mailpit,
apply it in the cart. It chains three surfaces the core suite already drives,
which makes it a good second Mage-OS package once the blog one exists.
