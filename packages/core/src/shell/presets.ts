import { spawn } from 'child_process';
import type { ProjectShellHooks } from '../config/schema';

/**
 * Shell-hook presets for common Magento development environments.
 *
 * Each preset wires all four hooks (exec, dbDump, dbImport, dbQuery) to the
 * environment's own CLI. Consumers with other setups (docker compose, SSH,
 * bare metal) declare the hooks themselves — see ProjectShellHooks.
 */

/**
 * Argument list for an error message, with anything password-shaped removed.
 *
 * dockerComposeShell passes `-p<password>` to mysql, and a rejected command's
 * message reaches the console, the HTML report and CI logs.
 */
function redactArgs(args: string[]): string {
  return args
    .map((arg) => arg.replace(/^(-p|--password=)(.+)$/, '$1***'))
    .map((arg) => (arg.length > 60 ? `${arg.slice(0, 60)}…` : arg))
    .join(' ');
}

function run(
  command: string,
  args: string[],
  cwd: string,
  opts: { stdinFile?: string; stdoutFile?: string; input?: string; captureStdout?: boolean } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: [
        opts.stdinFile ? 'pipe' : opts.input !== undefined ? 'pipe' : 'inherit',
        opts.stdoutFile || opts.captureStdout ? 'pipe' : 'inherit',
        'inherit',
      ],
    });

    if (opts.stdinFile) {
      const fs = require('fs') as typeof import('fs');
      // Swallow EPIPE: if the child dies early (e.g. the db container is
      // gone) the write side errors — the close handler below already
      // rejects with the child's exit code, which is the useful signal.
      // Without this the unhandled 'error' event crashes the whole runner.
      child.stdin!.on('error', () => {});
      fs.createReadStream(opts.stdinFile).pipe(child.stdin!);
    } else if (opts.input !== undefined) {
      child.stdin!.on('error', () => {});
      child.stdin!.write(opts.input);
      child.stdin!.end();
    }

    let stdout = '';
    // Resolved when the output file is actually on disk, not merely when the
    // child let go of its stdout. The child's 'close' fires as soon as its
    // stdio is destroyed, while the WriteStream still has buffered bytes to
    // flush — so resolving on 'close' alone hands the caller a dump that may
    // be short. That matters here more than anywhere else in the codebase:
    // the caller marks the run dirty and starts writing to the database on
    // the strength of a restore point that might be half-written.
    let flushed: Promise<void> | undefined;
    if (opts.stdoutFile) {
      const fs = require('fs') as typeof import('fs');
      const out = fs.createWriteStream(opts.stdoutFile);
      flushed = new Promise<void>((res, rej) => {
        out.on('finish', () => res());
        out.on('error', rej);
      });
      // Claimed immediately: the stream can fail before the child exits (a
      // disk filling mid-dump), and the handler below is only attached on
      // 'close', so the rejection would land with nothing listening.
      flushed.catch(() => {});
      child.stdout!.pipe(out);
    } else if (opts.captureStdout) {
      child.stdout!.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code} (${redactArgs(args)})`));
        return;
      }
      if (!flushed) {
        resolve(stdout);
        return;
      }
      flushed.then(() => resolve(stdout), reject);
    });
  });
}

/**
 * Hooks for a Warden (warden.dev) environment.
 * @param cwd Absolute path to the Magento project root (where .env lives)
 */
export function wardenShell(cwd: string): ProjectShellHooks {
  return {
    exec: async (cmd) => {
      await run('warden', ['shell', '-c', cmd], cwd);
    },
    dbDump: async (outPath) => {
      await run('warden', ['db', 'dump'], cwd, { stdoutFile: outPath });
    },
    dbImport: async (inPath) => {
      await run('warden', ['db', 'import'], cwd, { stdinFile: inPath });
    },
    dbQuery: (sql) => run('warden', ['db', 'connect', '-e', sql], cwd, { captureStdout: true }),
  };
}

/**
 * Hooks for a DDEV (ddev.com) environment.
 * @param cwd Absolute path to the Magento project root (where .ddev lives)
 */
export function ddevShell(cwd: string): ProjectShellHooks {
  return {
    exec: async (cmd) => {
      await run('ddev', ['exec', cmd], cwd);
    },
    dbDump: async (outPath) => {
      await run('ddev', ['export-db', '--gzip=false', `--file=${outPath}`], cwd);
    },
    dbImport: async (inPath) => {
      await run('ddev', ['import-db', `--file=${inPath}`], cwd);
    },
    dbQuery: (sql) => run('ddev', ['mysql'], cwd, { input: sql, captureStdout: true }),
  };
}

export interface DockerComposeShellOptions {
  /** Directory containing the compose file (where `docker compose` is run). */
  cwd: string;
  /** Service running php-fpm / bin/magento. Default 'php'. */
  phpService?: string;
  /** Service running MySQL. Default 'db'. */
  dbService?: string;
  /** Database name / user / password, as the compose file sets them. */
  database?: string;
  user?: string;
  password?: string;
  /** Working directory inside the php container. Default '/var/www/html'. */
  workdir?: string;
  /**
   * Compose project name (`docker compose --project-name`).
   *
   * Required whenever the stack was brought up under a name that is not the
   * compose directory's name — otherwise compose resolves a DIFFERENT, empty
   * project and every exec fails with a confusing "container not found".
   */
  projectName?: string;
  /** Compose env file (`--env-file`), if the stack uses one. */
  envFile?: string;
}

/**
 * Hooks for a plain `docker compose` stack — the shape our own CI stack uses,
 * and the fallback for any environment that is not Warden or DDEV.
 *
 * Every command runs with `-T` (no TTY): without it `docker compose exec`
 * allocates a pseudo-terminal, which mangles a SQL dump piped through stdout
 * with carriage returns and produces an import that fails in confusing ways.
 */
export function dockerComposeShell(options: DockerComposeShellOptions): ProjectShellHooks {
  const {
    cwd,
    phpService = 'php',
    dbService = 'db',
    database = 'magento',
    user = 'magento',
    password = 'magento',
    workdir = '/var/www/html',
    projectName,
    envFile,
  } = options;

  const composeFlags = [
    ...(projectName ? ['--project-name', projectName] : []),
    ...(envFile ? ['--env-file', envFile] : []),
  ];
  const compose = (args: string[]) => ['compose', ...composeFlags, ...args];
  const mysqlArgs = [`-u${user}`, `-p${password}`, database];

  return {
    exec: async (cmd) => {
      await run(
        'docker',
        compose(['exec', '-T', '-w', workdir, phpService, 'sh', '-c', cmd]),
        cwd,
      );
    },
    dbDump: async (outPath) => {
      await run(
        'docker',
        compose(['exec', '-T', dbService, 'mysqldump', '--no-tablespaces', ...mysqlArgs]),
        cwd,
        { stdoutFile: outPath },
      );
    },
    dbImport: async (inPath) => {
      await run('docker', compose(['exec', '-T', dbService, 'mysql', ...mysqlArgs]), cwd, {
        stdinFile: inPath,
      });
    },
    dbQuery: (sql) =>
      run('docker', compose(['exec', '-T', dbService, 'mysql', ...mysqlArgs]), cwd, {
        input: sql,
        captureStdout: true,
      }),
  };
}
