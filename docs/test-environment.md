# The disposable test environment

How the platform tests itself. Not an example to copy into a store. Start
from the scaffolder for that.

`tests/docker/` brings up a throwaway Magento (db, redis, opensearch, mailpit, nginx,
php) and installs into it. The same entrypoint is what CI runs, so a CI-only
failure is not possible.

```bash
tests/docker/run.sh up   luma      # boot + install (first run pulls images)
tests/docker/run.sh test luma      # run the suite against it
tests/docker/run.sh down luma      # remove it, volumes included
```

Targets are `tests/docker/.env.*`: `luma` (Magento Open Source), `hyva`
(the same Magento with Hyvä installed) and `mageos` (Mage-OS, the distro
canary). Each owns its image, its ports, its compose project and the theme
whose suite it runs, so they can all be up at once. Sample data resolves from
a keyless mirror, so no Adobe marketplace credentials are needed for `luma` or
`mageos`.

Notes for anyone extending this:

- The stack runs entirely as `www-data`. Running `bin/magento` as root leaves
  root-owned files under `generated/` that php-fpm cannot write, and the store
  starts 500ing *after* it was working.
- `MAGE_MODE` is pinned to `developer` in the compose environment. The image
  sets `ENV MAGE_MODE=production`, and the environment variable beats
  `app/etc/env.php`, so `deploy:mode:set` alone silently does nothing to what
  php-fpm serves.
- The published images are amd64-only; the php service pins a platform so
  Apple Silicon works under emulation. A no-op on CI runners.
- The database lives in tmpfs. The stack is disposable, so the install and any
  dump/restore stay off disk.
- The built-in (Redis) full page cache is turned **off** by `install.sh`. Since
  2.4.7 the built-in cache keys on the request's HTTP context and never reads
  the `X-Magento-Vary` cookie, and that context is still empty when the lookup
  happens, so it serves one cached page to everyone. Switching currency is
  accepted by the session and then invisible behind a stale HIT. Real stores
  front Magento with Varnish, whose VCL hashes that cookie, so this is the
  built-in cache being unrepresentative rather than the suite being wrong.
- Mailpit is published on **8825** (8826 for `mageos`, 8827 for `hyva`), not 8025. macOS
  resolves `localhost` to ::1 first, so a host-level Mailpit (Homebrew ships
  one on 8025/1025) keeps the port while Docker still reports the container as
  published. Magento then delivers to the right Mailpit and the suite reads an
  empty inbox from the wrong one, and only the five mail-dependent tests fail.
  `run.sh` compares the database path Mailpit reports inside the container with
  the one seen through the published port and refuses to run if they differ.
- `install.sh` warms the storefront, but it cannot warm the **admin**: 2FA is
  still enabled at install time (the suite's own seed disables it), so a curl
  login only reaches the 2FA setup screen. The admin's heaviest forms therefore
  stay cold until the first run touches them, and the very first run after a
  from-scratch install can lose a slow admin save that a re-run passes.
- Hyvä is **not** in the published images (it is commercial). The `hyva`
  target installs it at setup time from a licensed Private Packagist repo, so
  it needs `HYVA_COMPOSER_USER`, `HYVA_COMPOSER_PASS` and `HYVA_COMPOSER_REPO`
  in the environment, and it fails rather than skipping if they are absent. A
  skipped install would leave the Hyvä suite asserting against a Luma
  storefront, which reads as "every Hyvä selector is broken".
- That install also switches `design/theme/theme_id`, which is why `hyva` is a
  separate stack rather than a `THEME=` flag over the `luma` one: sharing a
  database would let whichever target installed last decide which markup the
  other one asserts against.

## Known: the mageos CI target refuses a sign-in with no message

`expectLoginIsRejected` fails on the **mageos** target of `e2e.yml`, and only
there, whenever the sign-in follows a password change or reset. It is
reproducible across all three retry attempts, and the same tests pass on the
luma and hyva targets and against a real Mage-OS store locally.

What the uploaded artifacts show on the failing page:

- the messages container is rendered and **empty**
- the email field is **empty**

Magento redisplays `login[username]` after refusing a credential, so an empty
field means `LoginPost` never processed the POST, and an empty container means
no message was ever queued for it. That is the shape of a form-key rejection
against a full-page-cached login form rather than a slow render, which is why
raising the wait to 90s changed nothing.

`waitForFormKey` covers the usual version of this: it waits for the `form_key`
cookie and for every server-rendered `input[name=form_key]` to match it. Its
early return when a page renders no such input is the next thing to check
here, against the stack rather than against the logs.

## How it runs in CI

`e2e.yml` is manual, and stays manual. Three targets at 20 to 30 minutes each
is too expensive to attach to `pull_request`, and a nightly schedule bills all
three on every night nothing changed, which is the wrong shape for a project
that moves in bursts. A push trigger is left commented in the workflow with a
note: the intent is for a release to be gated on this suite, so it belongs in
the release flow rather than on every commit to master.

Two ways in:

| | |
|---|---|
| `workflow_dispatch` | `targets` (space separated, or `all`) and an optional `grep` |
| `/e2e` on a PR | Owner only. Same two knobs, taken from the comment |

`/e2e [targets] [@tags]`: bare words are targets, `@`words become one
Playwright `--grep` alternation. It defaults to `luma` and the whole suite.
`luma` is the default deliberately, being the one target that needs no
credentials - reaching the hyva target, and so the Hyva licence secrets, takes
naming it.

Valid targets are derived from whichever `tests/docker/.env.<target>` files
exist, so adding a target needs no workflow edit.

Two things about the `/e2e` path are worth knowing. `issue_comment` runs the
workflow from the **base** branch, which is what makes the owner gate
meaningful: a fork cannot rewrite it. The same property means a change to
`e2e.yml` itself cannot be exercised by `/e2e` on the PR that makes it, and
has to be dispatched from master after merge. And because `issue_comment` runs
do not attach to the PR head, the result is mirrored onto the head SHA as a
commit status so it shows up in the PR's checks.
