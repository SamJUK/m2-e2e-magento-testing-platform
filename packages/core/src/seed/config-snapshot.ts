import fs from 'fs';
import path from 'path';
import type { ProjectConfig } from '../config/schema';

/**
 * Records what `core_config_data` held before the seed changed it, and puts it
 * back afterwards.
 *
 * The seed has to relax a store to automate a browser against it — CAPTCHA off,
 * admin CSRF form key off, password-reset throttling off — and it also switches
 * on transactional emails and a payment method the suite depends on. Under
 * `db.strategy: 'dump-restore'` the database restore undoes all of that. Under
 * `'none'` nothing did, so the store simply stayed that way.
 *
 * Reads and writes go through `shell.dbQuery` rather than `bin/magento
 * config:set`, for two reasons: `shell.exec` returns void, so a value cannot be
 * read back through it; and only SQL can express "this row did not exist
 * before" — Magento ships no `config:unset`, so a CLI-based revert would leave
 * an explicit row where the store previously inherited a default.
 *
 * Scope is always default/0, which is the scope the seed writes at. A store
 * with a website- or store-scope override keeps it untouched, and that override
 * continues to win exactly as it did before.
 */

/**
 * Where the snapshot lives between the seed and the teardown.
 *
 * Derived from `db.dumpPath` where the project sets one, so it sits beside the
 * dump and follows the project rather than the directory the run was launched
 * from. On process.cwd() alone, running from the Magento root instead of the
 * e2e directory hid the pending snapshot and the next run recorded the relaxed
 * values as the originals; retargeting one e2e directory at another store
 * applied the first store's config to the second.
 */
function snapshotPath(config?: ProjectConfig): string {
  const dumpPath = config?.db?.dumpPath;
  const base = dumpPath ? path.dirname(dumpPath) : path.join(process.cwd(), 'var');
  return path.join(base, 'e2e-config-snapshot.json');
}

interface ConfigSnapshot {
  takenAt: string;
  /** path → previous value, or null where no default-scope row existed. */
  values: Record<string, string | null>;
}

function table(config: ProjectConfig): string {
  return `${config.db?.tablePrefix ?? ''}core_config_data`;
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Parses the mysql CLI's tab-separated output.
 *
 * A literal `NULL` is how the client renders a SQL NULL, and is not the same as
 * the empty string — `recaptcha_frontend/type_recaptcha/public_key` is set to
 * an empty string by the seed, so the two have to stay distinguishable.
 */
function parseRows(stdout: string): Record<string, string | null> {
  const rows: Record<string, string | null> = {};
  const lines = stdout.split('\n').filter((line) => line.trim().length > 0);
  for (const line of lines.slice(1)) {
    const [configPath, ...rest] = line.split('\t');
    if (!configPath) continue;
    const value = rest.join('\t');
    rows[configPath] = value === 'NULL' ? null : value;
  }
  return rows;
}

/**
 * Reads the current default-scope values for `paths` and writes them to disk.
 *
 * Persisted rather than held in memory because the process that has to put them
 * back may never reach its teardown: a Ctrl-C, a cancelled CI job or a crash
 * ends the run with the store still modified. The file is what lets the next
 * run notice and repair that — see `restoreConfigSnapshot`.
 */
export async function takeConfigSnapshot(
  config: ProjectConfig,
  paths: string[],
): Promise<void> {
  if (!config.shell?.dbQuery || paths.length === 0) return;

  const inList = paths.map(quote).join(', ');
  const stdout = await config.shell.dbQuery(
    `SELECT path, value FROM ${table(config)} ` +
      `WHERE scope='default' AND scope_id=0 AND path IN (${inList})`,
  );

  const existing = parseRows(stdout);
  const values: Record<string, string | null> = {};
  for (const configPath of paths) {
    // Absent from the result set means no default-scope row at all, which the
    // revert has to reproduce by DELETEing rather than by writing a value.
    values[configPath] = configPath in existing ? existing[configPath] : null;
  }

  const file = snapshotPath(config);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ takenAt: new Date().toISOString(), values } satisfies ConfigSnapshot, null, 2),
  );
  console.log(`[e2e-core] Recorded ${paths.length} config values to ${file}`);
}

/**
 * Puts the recorded values back and removes the snapshot.
 *
 * Returns false when there was nothing to restore. Safe to call twice: the file
 * is deleted only once the writes have succeeded, so an interrupted restore is
 * retried by the next run rather than being forgotten.
 */
export async function restoreConfigSnapshot(config: ProjectConfig): Promise<boolean> {
  const file = snapshotPath(config);
  if (!fs.existsSync(file) || !config.shell?.dbQuery) return false;

  let snapshot: ConfigSnapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(file, 'utf-8')) as ConfigSnapshot;
  } catch {
    console.error(
      `[e2e-core] ${file} is not readable JSON. Leaving it in place: it is the ` +
        `only record of what this store's config looked like before the seed.`,
    );
    return false;
  }

  const entries = Object.entries(snapshot.values ?? {});
  if (entries.length === 0) {
    fs.rmSync(file, { force: true });
    return false;
  }

  console.log(`[e2e-core] Restoring ${entries.length} config values (taken ${snapshot.takenAt})`);
  for (const [configPath, value] of entries) {
    if (value === null) {
      await config.shell.dbQuery(
        `DELETE FROM ${table(config)} ` +
          `WHERE scope='default' AND scope_id=0 AND path=${quote(configPath)}`,
      );
    } else {
      // INSERT ... ON DUPLICATE KEY UPDATE rather than UPDATE: the seed may
      // have created the row itself, in which case there is nothing to update.
      await config.shell.dbQuery(
        `INSERT INTO ${table(config)} (scope, scope_id, path, value) ` +
          `VALUES ('default', 0, ${quote(configPath)}, ${quote(value)}) ` +
          `ON DUPLICATE KEY UPDATE value=${quote(value)}`,
      );
    }
  }

  // Only now: a failure above throws, leaving the file for the next run.
  fs.rmSync(file, { force: true });

  if (config.shell?.exec) {
    await config.shell.exec('php bin/magento cache:flush');
  }
  return true;
}

/** Whether a previous run left config unreverted. */
export function hasPendingConfigSnapshot(config?: ProjectConfig): boolean {
  return fs.existsSync(snapshotPath(config));
}
