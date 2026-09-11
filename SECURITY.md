# Security

## Reporting

Use [private vulnerability reporting](https://github.com/SamJUK/m2-e2e-magento-testing-platform/security/advisories/new)
on this repository. Do not open a public issue for a vulnerability.

Expect a first response within a week. This is maintained by one person
alongside client work, so a fix may take longer than that; you will be told
either way rather than left waiting.

## Supported versions

0.x, latest minor only. There is no backport branch. Until 1.0 a fix ships in
the next release rather than as a patch to an older one.

## What this software actually does

Worth reading before deciding whether something is a vulnerability here. The
suite is a test harness that drives a real Magento store, so some of what
looks alarming is the job:

- **It holds admin credentials.** A consuming project keeps them in
  `dev/tests/e2e/.env`, which the scaffolder gitignores. They are as sensitive
  as the store they open.
- **It weakens the stores it seeds.** The seed turns off admin and customer
  CAPTCHA, the admin CSRF form key and password-reset throttling, and allows
  concurrent admin sessions, because none of those can be driven by a browser
  otherwise. It refuses to do any of it unless the change can be undone: either
  `db.strategy` restores the database, or a `shell.dbQuery` hook snapshots the
  values, or the store declares itself throwaway with `seed.disposableStore`.
  Run it against production and that protection is the only thing between you
  and a permanently weakened store.
- **It executes test code it finds.** Theme and module packages are npm
  dependencies and run as such. Composer packages are different: `vendor/` is
  never scanned, and each package is named one at a time in
  `config.vendorModules`, precisely so that installing a dependency cannot
  start running its specs.
- **The scaffolder writes to your repository.** `npx @samjuk/create-magento-e2e`
  creates `dev/tests/e2e` and refuses to overwrite an existing one.

A report that the suite can damage a store it was pointed at, with credentials
it was given, is working as intended. A report that it does so where one of the
guards above should have stopped it is a bug, and worth sending.

## Credentials in CI

The E2E workflow needs Hyvä composer credentials for one of its three targets.
Nothing in this repository is triggered by `pull_request`, and the `/e2e`
command is restricted to the repository owner, so those secrets are never
exposed to a fork. If you fork this repo, that target will not run for you,
which is the intended outcome.
