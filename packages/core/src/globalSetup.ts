import type { ProjectConfig } from './config/schema';
import { runSeed } from './seed/magento';
import { dumpDatabase } from './db/dump';
import { markDumpTaken } from './db/run-state';
import { downloadAndImportFromS3 } from './db/s3';
import { assertNotDirtyRun, markDirtyRun } from './db/dirty-guard';
import { assertStrategyHooksConfigured } from './db/strategy-hooks';
import { assertSearchEngineReachable } from './health/search-engine';
import { hasPendingConfigSnapshot, restoreConfigSnapshot } from './seed/config-snapshot';
import { usesConfigSnapshot } from './seed/magento';

/**
 * Call from your project's globalSetup.ts:
 *
 *   import { runGlobalSetup } from '@samjuk/e2e-m2-playwright-core'
 *   import { config } from './playwright.config'
 *
 *   export default async function() {
 *     await runGlobalSetup(config)
 *   }
 */
export async function runGlobalSetup(config: ProjectConfig): Promise<void> {
  console.log('[e2e-core] Global setup starting...');

  // Free and instant, so ahead of the network check below.
  assertStrategyHooksConfigured(config);

  // A dead search engine does not stop the storefront serving, it just makes
  // every category and search test fail as a selector timeout. Checked before
  // anything writes, so the run ends with the cause not the symptom.
  await assertSearchEngineReachable(config);

  const strategy = config.db?.strategy ?? 'none';

  if (strategy === 'dump-restore') {
    // Order matters: guard → dump → mark. The dump is taken before the flag
    // is set, so a successful restore removes the flag with the rest of the
    // run's writes.
    await assertNotDirtyRun(config);
    await dumpDatabase(config);
    markDumpTaken();
    await markDirtyRun(config);
  } else if (strategy === 's3-import') {
    await downloadAndImportFromS3(config);
  }

  // A snapshot still on disk means the previous run never reached its teardown
  // — Ctrl-C, a cancelled CI job, a crash — and left the store relaxed. Put it
  // back before taking a fresh snapshot, or this run would record the MODIFIED
  // values as the originals and make the change permanent.
  if (usesConfigSnapshot(config) && hasPendingConfigSnapshot(config)) {
    console.warn(
      '[e2e-core] A previous run did not restore its config changes. Reverting them now.',
    );
    // Refuses rather than carries on. Seeding over a snapshot that could not be
    // read would record the RELAXED values as this store's originals, and
    // teardown would then "restore" captcha and form-key protection to off,
    // permanently and with a success message.
    // Still on disk is the failure signal: an EMPTY snapshot also returns
    // false, and removes itself, which is nothing to worry about.
    await restoreConfigSnapshot(config);
    if (hasPendingConfigSnapshot(config)) {
      throw new Error(
        `[e2e-core] REFUSING TO RUN: a previous run left config changes behind and they ` +
          `could not be reverted. Seeding now would record this store's relaxed settings ` +
          `as its originals and make them permanent.\n` +
          `The snapshot is the only record of the original values - inspect it, apply it by ` +
          `hand if it is readable, and delete it once the store is back to normal.`,
      );
    }
  }

  await runSeed(config);

  console.log('[e2e-core] Global setup complete.');
}
