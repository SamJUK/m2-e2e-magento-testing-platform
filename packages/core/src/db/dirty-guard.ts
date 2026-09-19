import fs from 'fs';

import type { ProjectConfig } from '../config/schema';

/**
 * Dirty-run guard for the dump-restore strategy, tracked in Magento's `flag`
 * table so it lives and dies with the database itself.
 *
 * Requires the dbQuery hook, which global setup enforces for this strategy.
 *
 * Lifecycle: globalSetup takes the dump FIRST, then sets the flag; a
 * successful globalTeardown restore re-imports the pre-flag dump (removing
 * the row) and clears it explicitly as belt-and-braces. If a run is killed
 * before teardown, the flag survives — and the next run refuses to dump,
 * because dumping now would overwrite the only clean restore point with the
 * polluted database.
 */
export const DIRTY_FLAG_CODE = 'e2e_dirty_run';

/**
 * A copy of the marker, kept beside the dump rather than inside the database.
 *
 * The flag row lives in the database the restore rewrites. mysqldump emits
 * tables alphabetically, so a restore that dies part way through - a full disk,
 * a killed container - has already dropped and recreated `flag` WITHOUT the
 * row, while the later tables still hold the run's orders. The next run then
 * passes the guard and dumps a polluted store as its clean restore point.
 */
function sentinelPath(config: ProjectConfig): string {
  return `${config.db?.dumpPath ?? '/tmp/e2e-db-dump.sql'}.dirty`;
}

function flagTable(config: ProjectConfig): string {
  return `${config.db?.tablePrefix ?? ''}flag`;
}

export async function assertNotDirtyRun(config: ProjectConfig): Promise<void> {
  if (!config.shell?.dbQuery) {
    console.warn('[e2e-core] No dbQuery hook configured — dirty-run guard disabled.');
    return;
  }

  const out = await config.shell.dbQuery(
    ``+
    `SELECT flag_code FROM ${flagTable(config)} WHERE flag_code='${DIRTY_FLAG_CODE}'`,
  );
  if (!out.includes(DIRTY_FLAG_CODE) && !fs.existsSync(sentinelPath(config))) return;

  const dumpPath = config.db?.dumpPath ?? '/tmp/e2e-db-dump.sql';
  throw new Error(
    `[e2e-core] REFUSING TO RUN: a previous test run never restored the database ` +
    `(flag '${DIRTY_FLAG_CODE}' is set), so it still contains that run's seed/test data. ` +
    `Dumping now would overwrite the clean restore point.\n` +
    `To recover, either:\n` +
    `  1. Restore the clean dump taken before that run: import ${dumpPath} ` +
    `(e.g. \`warden db import < ${dumpPath}\`), then delete ${sentinelPath(config)}; or\n` +
    `  2. Accept the current database state: delete ${sentinelPath(config)} and clear the flag: ` +
    `DELETE FROM ${flagTable(config)} WHERE flag_code='${DIRTY_FLAG_CODE}'`,
  );
}

export async function markDirtyRun(config: ProjectConfig): Promise<void> {
  if (!config.shell?.dbQuery) return;
  fs.writeFileSync(sentinelPath(config), new Date().toISOString());
  await config.shell.dbQuery(
    `INSERT INTO ${flagTable(config)} (flag_code, state, last_update) VALUES ('${DIRTY_FLAG_CODE}', 1, NOW())`,
  );
}

export async function clearDirtyRun(config: ProjectConfig): Promise<void> {
  if (!config.shell?.dbQuery) return;
  fs.rmSync(sentinelPath(config), { force: true });
  await config.shell.dbQuery(`DELETE FROM ${flagTable(config)} WHERE flag_code='${DIRTY_FLAG_CODE}'`);
}
