# Changesets

Packages are versioned **independently**. A spec change in `theme-luma` bumps
`theme-luma` and nothing else, so a version number means something to whoever
reads it.

They were briefly version-locked, on the reasoning that core and the themes
share one contract and mismatched versions would diverge silently. The real
cause of that risk was the dependency type, not the version numbers: core was a
plain `dependency`, which `pnpm publish` rewrites to an exact pin, so any
divergent bump gave a consumer **two copies of core**, the same dual-instance
failure we already hit with `@playwright/test`. Core is now a
`peerDependency`, so there is exactly one copy and a genuine mismatch is an
install-time warning rather than a runtime mystery.

Cross-theme consistency (identical test titles and tags in `theme-luma` and
`theme-hyva`) is enforced by the parity gate in CI, which is where it belongs.

```bash
pnpm changeset          # describe the change
pnpm version-packages   # apply versions
pnpm release            # build + publish
```


## Why `linked`, and why not `fixed`

The packages version independently: a spec change in `theme-luma` bumps
`theme-luma` and nothing else. That was a deliberate reversal of an earlier
decision to lock them together, which made every version number meaningless.

`linked` keeps that while fixing the one case independence gets wrong. Core is a
peerDependency of every theme and module, so a core major moves their peer range
to a new major too, and changesets versions them as a *patch* while doing it.
A consumer on the old range then upgrades into an unsatisfiable peer. Neither
`onlyUpdatePeerDependentsWhenOutOfRange: true` nor `false` changes this; both
were tested.

With `linked`, a core major carries the whole group to that major automatically,
and a change to one package alone still bumps only that package. `fixed` would
force identical versions always, which is the thing we removed.
