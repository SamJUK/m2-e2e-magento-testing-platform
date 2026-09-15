import type { ProjectConfig } from '../config/schema';

/** Shell hooks each DB strategy cannot work without. */
type DbStrategy = NonNullable<ProjectConfig['db']>['strategy'];

// Total, not Partial: adding a strategy must not compile until it declares
// what it needs, or it runs unguarded — the very thing this file prevents.
const REQUIRED_HOOKS: Record<DbStrategy, readonly string[]> = {
  none: [],
  'dump-restore': ['dbDump', 'dbImport', 'dbQuery'],
  's3-import': ['dbImport'],
};

/**
 * Refuses to run when the configured DB strategy has no hooks to carry it out.
 *
 * Each step otherwise degrades to a log line, so the strategy silently does
 * nothing. Stores managing their own database declare `strategy: 'none'`.
 */
export function assertStrategyHooksConfigured(config: ProjectConfig): void {
  const strategy = config.db?.strategy ?? 'none';
  // hasOwnProperty, not a bare lookup: a strategy of 'constructor' would
  // otherwise resolve off Object.prototype and die in filter().
  const required = Object.prototype.hasOwnProperty.call(REQUIRED_HOOKS, strategy)
    ? REQUIRED_HOOKS[strategy]
    : undefined;

  // An unrecognised strategy reaches neither branch in globalSetup and would
  // run with no dump, no restore and no dirty flag.
  if (required === undefined) {
    throw new Error(
      `[e2e-core] REFUSING TO RUN: db.strategy '${strategy}' is not a known strategy. ` +
        `Expected one of: ${Object.keys(REQUIRED_HOOKS).join(', ')}.`,
    );
  }
  if (required.length === 0) return;

  const shell = (config.shell ?? {}) as Record<string, unknown>;
  const missing = required.filter((hook) => typeof shell[hook] !== 'function');
  if (missing.length === 0) return;

  throw new Error(
    `[e2e-core] REFUSING TO RUN: db.strategy is '${strategy}' but these shell ` +
      `hooks are not configured: ${missing.join(', ')}.\n` +
      `Without them the strategy would silently do nothing: no dump would be taken, ` +
      `no restore would happen, and the dirty-run guard could neither set nor read its flag.\n` +
      `Either wire the hooks up — \`shell: wardenShell(projectRoot)\` provides all four ` +
      `(exec, dbDump, dbImport, dbQuery) — or set db.strategy to 'none' if this project ` +
      `manages its own database.`,
  );
}
