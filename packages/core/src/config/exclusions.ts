/**
 * Why a store excludes one of the shared tests.
 *
 * `grepInvert` on its own flattens three very different situations into one
 * switch, so nobody can tell at a glance whether an exclusion is permanent and
 * legitimate, a gap in this platform, or a bug on the store. The middle
 * category is debt, and it accumulates invisibly unless it is named.
 */
export type ExclusionReason =
  /** The store genuinely lacks the feature (single currency, no configurables). Permanent and legitimate. */
  | 'not-applicable'
  /** The feature works for real customers, but our page objects cannot drive it. Our debt; should shrink. */
  | 'platform-gap'
  /** The feature is actually broken on the store. Worth reporting to whoever owns it, not hiding. */
  | 'client-bug';

export interface TestExclusion {
  /** Matches test titles or tags, exactly as `grepInvert` would. */
  pattern: RegExp;
  reason: ExclusionReason;
  /** Why, in a sentence. Shown in the run-start summary. */
  note: string;
}

const ORDER: ExclusionReason[] = ['platform-gap', 'client-bug', 'not-applicable'];

/** Combines the exclusion patterns (and any explicit `grepInvert`) into one RegExp. */
export function buildGrepInvert(
  exclusions: TestExclusion[] = [],
  explicit?: RegExp,
): RegExp | undefined {
  const sources = exclusions.map((e) => e.pattern.source);
  if (explicit) sources.push(explicit.source);
  if (!sources.length) return undefined;
  return new RegExp(sources.join('|'));
}

/**
 * Prints one line per run naming what is excluded and why, so platform gaps
 * stay visible instead of blending into legitimate exclusions.
 *
 * Only prints in the main process — Playwright re-evaluates the config in
 * every worker, which would otherwise repeat this once per worker.
 */
export function reportExclusions(exclusions: TestExclusion[] = []): void {
  if (!exclusions.length || process.env.TEST_WORKER_INDEX !== undefined) return;

  const counts = ORDER.map((reason) => ({
    reason,
    n: exclusions.filter((e) => e.reason === reason).length,
  })).filter((c) => c.n > 0);

  const summary = counts.map((c) => `${c.n} ${c.reason}`).join(', ');
  console.log(`[e2e-core] ${exclusions.length} exclusion(s): ${summary}`);

  for (const reason of ORDER) {
    for (const e of exclusions.filter((x) => x.reason === reason)) {
      console.log(`[e2e-core]   - ${reason.padEnd(15)} ${e.pattern.source} — ${e.note}`);
    }
  }

  const gaps = exclusions.filter((e) => e.reason === 'platform-gap').length;
  if (gaps) {
    console.log(
      `[e2e-core]   ${gaps} of these are platform gaps: the store supports the feature, the suite cannot drive it yet.`,
    );
  }
}
