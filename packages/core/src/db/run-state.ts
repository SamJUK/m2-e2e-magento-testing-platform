/**
 * Whether this run took its own database dump.
 *
 * globalTeardown used to restore whatever dump file happened to be on disk. If
 * globalSetup failed before dumping — a preflight check refusing to run, say —
 * teardown would import the *previous* run's dump and silently roll the store
 * back to whatever it held then. That is how an ElasticSuite installation lost
 * its configuration: the search-engine guard rejected the store, no dump was
 * taken, and teardown restored a database from hours earlier.
 *
 * globalSetup and globalTeardown share a process in Playwright's runner. If
 * they ever do not, this reads false and teardown skips the restore, which is
 * the safe direction to fail in: a dirty database is recoverable, an
 * overwritten one is not.
 */
let dumpTaken = false;

export function markDumpTaken(): void {
  dumpTaken = true;
}

export function dumpWasTakenThisRun(): boolean {
  return dumpTaken;
}
