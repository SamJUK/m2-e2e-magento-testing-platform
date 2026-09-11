import path from 'path';
import {
  createPlaywrightConfig,
  defineProjectConfig,
  dockerComposeShell,
} from '@samjuk/e2e-m2-playwright-core';

// The stack's compose directory — where `docker compose` must be run from.
const stackDir = path.resolve(__dirname, '..', 'docker');

const port = process.env.NGINX_PORT ?? '8080';

// No default. run.sh always sets this from the target's .env file, and a
// default would let a missing one run the Luma suite against the Hyva store
// (or the reverse) — which reads as every selector in the theme being broken
// rather than as the harness pointing at the wrong storefront.
function requireTheme(): string {
  const theme = process.env.E2E_THEME;
  if (!theme) {
    throw new Error(
      'E2E_THEME is not set. Drive this project through tests/docker/run.sh, ' +
        'which sets it from the target\'s .env file.',
    );
  }
  return theme;
}

export const config = defineProjectConfig({
  baseUrl: process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`,
  mailpitUrl: process.env.MAILPIT_URL ?? `http://localhost:${process.env.MAILPIT_HTTP_PORT ?? '8025'}`,
  theme: requireTheme(),
  admin: {
    slug: '/admin',
    username: process.env.PLAYWRIGHT_ADMIN_USERNAME ?? 'playwright',
    password: process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'Password1',
  },
  seed: {
    // The stack is created by run.sh and destroyed with its volumes, so the
    // seed's permanent, security-relaxing config changes have nothing to
    // damage and nothing needs to restore them.
    disposableStore: true,
  },
  db: {
    // The stack's database lives in tmpfs and the whole stack is disposable,
    // so a rollback buys nothing here — the next run starts from a fresh
    // install. Real stores are the opposite and must use dump-restore.
    strategy: 'none',
  },
  // The project name and env file must match what docker/run.sh brought the
  // stack up with: `docker compose` otherwise resolves the compose directory's
  // own name as the project and finds no containers at all.
  shell: dockerComposeShell({
    cwd: stackDir,
    projectName: process.env.COMPOSE_PROJECT ?? 'e2e-luma',
    envFile: process.env.COMPOSE_ENV_FILE ?? '.env.luma',
  }),
});

export default createPlaywrightConfig(config, {
  testDir: './tests',
  globalSetup: require.resolve('./globalSetup'),
  globalTeardown: require.resolve('./globalTeardown'),
  // This stack runs Magento in developer mode, and on Apple Silicon the images
  // run under amd64 emulation, so pages are slower than a tuned dev
  // environment even once warm. Budgets are generous deliberately: a timeout
  // here should mean something is broken, not that the box is slow.
  timeout: 120_000,
  expect: { timeout: 20_000 },
});
