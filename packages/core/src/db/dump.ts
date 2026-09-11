import fs from 'fs';
import path from 'path';
import type { ProjectConfig } from '../config/schema';

/**
 * Dumps the Magento database using the project's shell hooks.
 * No-ops gracefully if dbDump hook is not configured.
 */
export async function dumpDatabase(config: ProjectConfig): Promise<void> {
  if (!config.shell?.dbDump) {
    console.log('[e2e-core] No dbDump hook configured, skipping database dump.');
    return;
  }

  const dumpPath = config.db?.dumpPath ?? '/tmp/e2e-db-dump.sql';
  const dumpDir = path.dirname(dumpPath);
  if (!fs.existsSync(dumpDir)) {
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  // Opt-in escape hatch for iterating on large client databases: when
  // E2E_REUSE_DB_DUMP=1 and a dump already exists, skip re-dumping. Every
  // completed run restores the DB to exactly the dumped state, so re-dumping
  // between iterations produces an identical file at the cost of the heaviest
  // IO burst in the whole run (multi-GB on real stores). The dirty-run guard
  // has already asserted the previous run restored cleanly before this point.
  if (process.env.E2E_REUSE_DB_DUMP === '1' && fs.existsSync(dumpPath)) {
    console.log(
      `[e2e-core] E2E_REUSE_DB_DUMP=1 and ${dumpPath} exists — reusing existing dump (skipping re-dump).`,
    );
    return;
  }

  console.log(`[e2e-core] Dumping database to ${dumpPath}...`);
  await config.shell.dbDump(dumpPath);
  assertDumpLooksComplete(dumpPath);
  console.log('[e2e-core] Database dump complete.');
}

/**
 * Cheap truncation check on a freshly written dump.
 *
 * The caller is about to mark the run dirty and let the suite write to the
 * database, so this file is the only way back. A dump that is empty or cut
 * short does not announce itself — the restore at the end simply leaves the
 * store in a state nobody chose.
 *
 * mysqldump closes with a "-- Dump completed" line, so its absence in a file
 * that carries a mysqldump header means the output stopped early. Hooks whose
 * tool writes some other format (a direct `--file=` export, a custom dumper)
 * have no such header, and are only checked for being non-empty.
 */
function assertDumpLooksComplete(dumpPath: string): void {
  const { size } = fs.statSync(dumpPath);
  if (size === 0) {
    throw new Error(
      `[e2e-core] The database dump at ${dumpPath} is empty. Refusing to continue: ` +
        `the suite is about to write to the database and this file is the only way back.`,
    );
  }

  const head = readChunk(dumpPath, 0, Math.min(size, 512));
  if (!/^--\s+(MySQL|MariaDB)\s+dump/im.test(head)) return;

  const tail = readChunk(dumpPath, Math.max(0, size - 512), Math.min(size, 512));
  if (!/Dump completed/i.test(tail)) {
    throw new Error(
      `[e2e-core] The database dump at ${dumpPath} is missing mysqldump's ` +
        `"Dump completed" footer, so it was truncated (${size} bytes written). ` +
        `Refusing to continue: restoring from it at the end of the run would ` +
        `leave the database in a state nobody chose.`,
    );
  }
}

function readChunk(filePath: string, position: number, length: number): string {
  if (length <= 0) return '';
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const read = fs.readSync(fd, buffer, 0, length, position);
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Restores the Magento database from a previous dump.
 *
 * Returns whether a restore actually happened. The caller needs to know:
 * clearing the dirty-run flag after a restore that silently did nothing would
 * disarm the guard over a database that still holds the run's writes, and the
 * next run would then dump THAT as its clean restore point.
 */
export async function restoreDatabase(config: ProjectConfig): Promise<boolean> {
  const dumpPath = config.db?.dumpPath ?? '/tmp/e2e-db-dump.sql';

  if (!config.shell?.dbImport) {
    console.log('[e2e-core] No dbImport hook configured, skipping database restore.');
    return false;
  }

  if (!fs.existsSync(dumpPath)) {
    console.warn(`[e2e-core] Dump file not found at ${dumpPath}, skipping restore.`);
    return false;
  }

  console.log(`[e2e-core] Restoring database from ${dumpPath}...`);
  await config.shell.dbImport(dumpPath);
  console.log('[e2e-core] Database restore complete.');
  return true;
}
