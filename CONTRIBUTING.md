# Contributing

Issues, corrections and disagreement are all wanted, and a first contribution
is as welcome as a tenth. The bar here is not seniority. It is that a human
understands the change and can answer questions about it.

## Claim the issue first

Comment on the issue before you start. Docs issues in particular read as easy
and get picked up three times over, and two of those people then waste an
evening.

If nobody answers within a few days, take it anyway and say so in the thread.

Small pull requests are fine. A typo fix needs no ceremony. Anything that
changes behaviour, adds a package, or invents a concept the project does not
already have, gets discussed in an issue first.

## AI is fine. Unattended agents are not.

The proof of concept behind this was written by hand, years ago. Turning it
into something worth publishing was done with an LLM in the loop, and I use one
daily. Use whatever tooling you like.

What is not accepted is a contribution with no human driving it:

- **You have read your own diff.** Every line, including the ones you did not
  type. If you cannot say why a line is there, it does not go in.
- **You have run it.** Not "the model says the script passes". You ran
  `pnpm -r build`, you ran the check script, you saw the output.
- **Claims in the description are true of this repository.** A generated
  description will cheerfully cite a `pnpm` script that only exists in the
  scaffolder template, or document a tier the project has never had. That is
  the single most common way an AI-assisted pull request fails review here.
- **You reply to review comments yourself.** A round trip through an agent is
  fine. Silence, or a reply that does not engage with what was asked, is not.

Drive-by pull requests from accounts that mass-solve issues across unrelated
repositories get closed without review. No judgement on the person behind the
account, there is just no way to run a review conversation with a queue.

## What a good change looks like

- Scoped to the issue. If you find a second problem, open a second issue.
- Matches the surrounding code and prose. Read a neighbouring file first.
- Documents what exists, not what would be reasonable. If the change needs a
  command or a tag that is not there yet, the change is the command, not the
  paragraph describing it.
- Both themes stay in step. `theme-luma` and `theme-hyva` are a contract, and
  CI fails on drift in test titles or tags.

## Mechanics

```bash
pnpm install
pnpm -r build
node scripts/check-coverage-matrix.mjs   # and the other scripts/check-*.mjs
pnpm changeset                           # any change that ships in a package
```

Commit messages are [Conventional Commits](https://www.conventionalcommits.org):
`docs: document the tiers`, `fix(core): ...`.

Docs-only changes need no changeset.

[docs/development.md](./docs/development.md) covers the monorepo, test
discovery, creating packages and the release process.

## Licence

Contributions are licensed under [OSL-3.0](./LICENSE.txt), the same as the rest
of the repository.
