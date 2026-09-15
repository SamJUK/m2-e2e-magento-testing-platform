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

  // Before anything writes to the store: a dead search engine does not stop the
  // storefront serving, it just makes every category and search test fail as a
  // selector timeout. Checked first so the run ends with the cause rather than
  // ten minutes later with the symptom.
  // Free and instant, so ahead of the network check: a misconfigured
  // strategy should not hide behind a search-engine timeout.
  assertStrategyHooksConfigured(config);

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
  if (usesConfigSnapshot(config) && hasPendingConfigSnapshot()) {
    console.warn(
      '[e2e-core] A previous run did not restore its config changes. Reverting them now.',
    );
    await restoreConfigSnapshot(config);
  }

  await runSeed(config);

  console.log('[e2e-core] Global setup complete.');
}
