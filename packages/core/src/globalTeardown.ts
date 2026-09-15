import type { ProjectConfig } from './config/schema';
import { restoreDatabase } from './db/dump';
import { dumpWasTakenThisRun } from './db/run-state';
import { clearDirtyRun } from './db/dirty-guard';
import { restoreConfigSnapshot } from './seed/config-snapshot';
import { usesConfigSnapshot } from './seed/magento';

/**
 * Call from your project's globalTeardown.ts:
 *
 *   import { runGlobalTeardown } from '@samjuk/e2e-m2-playwright-core'
 *   import { config } from './playwright.config'
 *
 *   export default async function() {
 *     await runGlobalTeardown(config)
 *   }
 */
export async function runGlobalTeardown(config: ProjectConfig): Promise<void> {
  console.log('[e2e-core] Global teardown starting...');

  const strategy = config.db?.strategy ?? 'none';

  if (strategy === 'dump-restore' && !dumpWasTakenThisRun()) {
    // Setup never got as far as dumping — a preflight check refused the store,
    // or the dump itself failed. The file on disk belongs to an earlier run, so
    // importing it would not undo this run's writes; it would undo everything
    // that happened since that run, which is a far worse outcome than leaving
    // the database as it is.
    console.error(
      '[e2e-core] No dump was taken this run, so there is nothing to restore. ' +
        'Leaving the database untouched: the dump on disk belongs to an earlier ' +
        'run and importing it would roll the store back to that point.',
    );
  } else if (strategy === 'dump-restore') {
    let restored: boolean;
    try {
      restored = await restoreDatabase(config);
    } catch (error) {
      // A throw means the import started and stopped part way, so the store is
      // now neither this run's state nor the dump's. Say so and leave both
      // markers standing: the next run must refuse rather than treat a
      // half-restored store as a clean restore point.
      console.error(
        '[e2e-core] The database restore FAILED PART WAY THROUGH. The store is in a ' +
          'mixed state and the dirty-run marker has been left in place, so the next ' +
          'run will refuse to start. Recover by importing the dump by hand.',
      );
      throw error;
    }

    // Only clear the flag when a restore actually happened. restoreDatabase
    // returns false rather than throwing when there is no dbImport hook or the
    // dump has gone missing — clearing on that path would disarm the guard
    // over a database that still holds this run's writes, and the next run
    // would dump THAT as its clean restore point, making the pollution
    // permanent and invisible.
    if (restored) {
      // The restore itself removes the flag (dump predates it); explicit clear
      // covers consumer-supplied restores that aren't full re-imports.
      await clearDirtyRun(config);
      // Cache still holds the seeded run's config; flush so the environment
      // matches the restored database.
      if (config.shell?.exec) {
        await config.shell.exec('php bin/magento cache:flush');
      }
    } else {
      console.error(
        '[e2e-core] The database was NOT restored, so this run\'s seed and test data ' +
          'are still in it. Leaving the dirty-run flag set: the next run will refuse ' +
          'to start rather than overwrite the clean restore point with this state.',
      );
    }
  }

  // No database restore on this strategy, so the seed's config changes are put
  // back individually from the snapshot taken before they were made.
  if (usesConfigSnapshot(config)) {
    await restoreConfigSnapshot(config);
  }

  console.log('[e2e-core] Global teardown complete.');
}
