import type { ProjectConfig } from '../config/schema';

/** Shell hooks each DB strategy cannot work without. */
const REQUIRED_HOOKS = {
  'dump-restore': ['dbDump', 'dbImport', 'dbQuery'],
  's3-import': ['dbImport'],
} as const satisfies Partial<Record<NonNullable<ProjectConfig['db']>['strategy'], readonly string[]>>;

/**
 * Refuses to run when the configured DB strategy has no hooks to carry it out.
 *
 * Each step otherwise degrades to a log line, so the strategy silently does
 * nothing. Stores managing their own database declare `strategy: 'none'`.
 */
export function assertStrategyHooksConfigured(config: ProjectConfig): void {
  const strategy = config.db?.strategy ?? 'none';
  const required: readonly string[] = REQUIRED_HOOKS[strategy as keyof typeof REQUIRED_HOOKS] ?? [];
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
