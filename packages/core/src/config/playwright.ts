import fs from 'fs';
import path from 'path';
import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';
import type { ProjectConfig } from './schema';
import { buildGrepInvert, reportExclusions, type TestExclusion } from './exclusions';

interface AutoDiscoveredModule {
  name: string;
  testDir: string;
}

/**
 * Any scope, not just @samjuk: a module package is anyone's to write, and the
 * scaffolder emits them under the author's own scope by default. Scoping the
 * match to one vendor made every third-party package silently undiscovered —
 * it installs, it builds, and its tests never run.
 */
const MODULE_PACKAGE = /^@[^/]+\/e2e-m2-module-/;

/**
 * Scans node_modules for installed @<scope>/e2e-m2-module-* packages.
 * Any package with an "e2eModule": { "testDir": "..." } field in its package.json
 * is returned as a discovered module.
 */
function discoverModules(
  projectRoot: string,
  excludeModules: string[] = [],
): AutoDiscoveredModule[] {
  const projectPkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(projectPkgPath)) return [];

  const projectPkg = JSON.parse(fs.readFileSync(projectPkgPath, 'utf-8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  const allDeps = {
    ...projectPkg.dependencies,
    ...projectPkg.devDependencies,
  };

  const modules: AutoDiscoveredModule[] = [];

  for (const depName of Object.keys(allDeps)) {
    if (!MODULE_PACKAGE.test(depName)) continue;
    if (excludeModules.includes(depName)) continue;

    const modulePkgPath = path.join(projectRoot, 'node_modules', depName, 'package.json');
    if (!fs.existsSync(modulePkgPath)) continue;

    const modulePkg = JSON.parse(fs.readFileSync(modulePkgPath, 'utf-8')) as {
      e2eModule?: { testDir?: string };
    };

    if (!modulePkg.e2eModule?.testDir) continue;

    const absoluteTestDir = path.join(projectRoot, 'node_modules', depName, modulePkg.e2eModule.testDir);
    if (!fs.existsSync(absoluteTestDir)) continue;

    modules.push({ name: depName, testDir: absoluteTestDir });
  }

  return modules;
}

/**
 * Looks for the active theme package (@samjuk/e2e-m2-theme-{themeName})
 * in the project's dependencies. If found and it has an "e2eTheme.testDir" field,
 * returns that directory so its specs can be added as a Playwright project.
 */
function discoverTheme(
  projectRoot: string,
  themeName?: string,
): AutoDiscoveredModule | null {
  if (!themeName) return null;

  const pkgName = `@samjuk/e2e-m2-theme-${themeName}`;
  const modulePkgPath = path.join(projectRoot, 'node_modules', pkgName, 'package.json');
  if (!fs.existsSync(modulePkgPath)) return null;

  const modulePkg = JSON.parse(fs.readFileSync(modulePkgPath, 'utf-8')) as {
    e2eTheme?: { testDir?: string };
  };

  if (!modulePkg.e2eTheme?.testDir) return null;

  const absoluteTestDir = path.join(projectRoot, 'node_modules', pkgName, modulePkg.e2eTheme.testDir);
  if (!fs.existsSync(absoluteTestDir)) return null;

  return { name: pkgName, testDir: absoluteTestDir };
}

/**
 * Scans an `app/code` directory for Magento modules that contain a `Test/E2E/`
 * subdirectory. Each such module is returned as a discovered test project.
 *
 * Walks exactly two directory levels: `{Vendor}/{Module}/Test/E2E/`
 * The project name is `{Vendor}_{Module}` (Magento module naming convention).
 *
 * @param projectRoot   Absolute path to the e2e project root (i.e. process.cwd())
 * @param appCodeDir    Explicit path, `undefined` for auto-detect, or `false` to disable
 */
function discoverLocalModules(
  projectRoot: string,
  appCodeDir?: string | false,
): AutoDiscoveredModule[] {
  if (appCodeDir === false) return [];

  // Default assumes the documented layout: <magento root>/dev/tests/e2e
  const resolvedAppCode = appCodeDir
    ? path.resolve(projectRoot, appCodeDir)
    : path.resolve(projectRoot, '..', '..', '..', 'app', 'code');

  if (!fs.existsSync(resolvedAppCode)) return [];

  const modules: AutoDiscoveredModule[] = [];

  for (const vendor of fs.readdirSync(resolvedAppCode)) {
    const vendorDir = path.join(resolvedAppCode, vendor);
    if (!fs.statSync(vendorDir).isDirectory()) continue;

    for (const moduleName of fs.readdirSync(vendorDir)) {
      const testDir = path.join(vendorDir, moduleName, 'Test', 'E2E');
      if (!fs.existsSync(testDir) || !fs.statSync(testDir).isDirectory()) continue;

      modules.push({
        name: `${vendor}_${moduleName}`,
        testDir,
      });
    }
  }

  return modules;
}

/**
 * Resolves the opt-in `vendorModules` allowlist to test projects. Each entry
 * is a composer package name; its spec dir is `Test/E2E/` inside the package,
 * overridable via `extra.e2e.testDir` in the package's composer.json.
 */
function discoverVendorModules(
  projectRoot: string,
  vendorModules?: string[],
): AutoDiscoveredModule[] {
  if (!vendorModules?.length) return [];

  const vendorDir = path.resolve(projectRoot, '..', '..', '..', 'vendor');
  const modules: AutoDiscoveredModule[] = [];

  for (const name of vendorModules) {
    const moduleDir = path.join(vendorDir, name);
    let testDir = path.join(moduleDir, 'Test', 'E2E');

    const composerJsonPath = path.join(moduleDir, 'composer.json');
    if (fs.existsSync(composerJsonPath)) {
      try {
        const composerJson = JSON.parse(fs.readFileSync(composerJsonPath, 'utf-8')) as {
          extra?: { e2e?: { testDir?: string } };
        };
        if (composerJson.extra?.e2e?.testDir) {
          testDir = path.join(moduleDir, composerJson.extra.e2e.testDir);
        }
      } catch {
        // unreadable composer.json — fall through to the default location
      }
    }

    if (!fs.existsSync(testDir)) {
      console.warn(`[e2e-core] vendorModules: "${name}" has no E2E test dir (looked in ${testDir})`);
      continue;
    }

    modules.push({ name, testDir });
  }

  return modules;
}

/**
 * Creates a Playwright config for a Magento 2 project.
 *
 * Auto-discovers installed @<scope>/e2e-m2-module-* packages and adds
 * their test directories as Playwright projects. Module tests reference
 * the project's own fixtures via the '#test' import alias (resolved through
 * the project's tsconfig paths).
 *
 * @param config        Project configuration
 * @param options.testDir       Directory containing project-specific tests (default: './tests')
 * @param options.globalSetup   Path to a global setup module (optional)
 * @param options.globalTeardown Path to a global teardown module (optional)
 * @param options.retries       Number of retries (overrides default)
 * @param options.grepInvert    Skip tests matching this pattern
 */
export function createPlaywrightConfig(
  config: ProjectConfig,
  options: {
    testDir?: string;
    globalSetup?: string;
    globalTeardown?: string;
    retries?: number;
    grepInvert?: RegExp;
    /**
     * Tests this store cannot run, each with a reason code. Preferred over a
     * bare `grepInvert`: the reasons are printed at run start, so a gap in the
     * suite stays visible instead of blending in with legitimate exclusions.
     */
    exclusions?: TestExclusion[];
    [key: string]: unknown;
  } = {},
): PlaywrightTestConfig {
  const projectRoot = process.cwd();
  const ciMultiplier = process.env.CI ? 2 : 1;

  const {
    testDir,
    globalSetup,
    globalTeardown,
    retries,
    grepInvert,
    exclusions,
    ...extraOptions
  } = options;

  // The fixtures read the admin credentials from the environment, so mirror
  // config.admin into it. Without this, `admin: { slug: '/admin', … }` in a
  // project's config is silently ignored and the fixtures fall back to
  // '/backend' — which lands on the storefront's 404 page and surfaces as a
  // timeout looking for the username field. Existing consumers all happened to
  // set PLAYWRIGHT_ADMIN_SLUG in .env too, which hid this.
  // The environment still wins, so a one-off override on the command line works.
  if (config.admin) {
    process.env.PLAYWRIGHT_ADMIN_SLUG ??= config.admin.slug;
    process.env.PLAYWRIGHT_ADMIN_USERNAME ??= config.admin.username;
    process.env.PLAYWRIGHT_ADMIN_PASSWORD ??= config.admin.password;
  }

  reportExclusions(exclusions);
  const combinedGrepInvert = buildGrepInvert(exclusions, grepInvert);

  const discoveredModules = discoverModules(projectRoot, config.excludeModules);
  const discoveredTheme = discoverTheme(projectRoot, config.theme);
  const localModules = discoverLocalModules(projectRoot, config.appCodeDir);
  const vendorModules = discoverVendorModules(projectRoot, config.vendorModules);

  const themeProject = discoveredTheme
    ? [{
        name: discoveredTheme.name,
        testDir: discoveredTheme.testDir,
        tsconfig: path.join(projectRoot, 'tsconfig.json'),
        use: { ...devices['Desktop Chrome'] },
      }]
    : [];

  const moduleProjects = discoveredModules.map((mod) => ({
    name: mod.name,
    testDir: mod.testDir,
    // The project's tsconfig.json must declare: "paths": { "#test": ["./fixtures.ts"] }
    // so that module specs can resolve their theme-agnostic test import.
    tsconfig: path.join(projectRoot, 'tsconfig.json'),
    use: { ...devices['Desktop Chrome'] },
  }));

  const localModuleProjects = localModules.map((mod) => ({
    name: mod.name,
    testDir: mod.testDir,
    tsconfig: path.join(projectRoot, 'tsconfig.json'),
    use: { ...devices['Desktop Chrome'] },
  }));

  const vendorModuleProjects = vendorModules.map((mod) => ({
    name: mod.name,
    testDir: mod.testDir,
    tsconfig: path.join(projectRoot, 'tsconfig.json'),
    use: { ...devices['Desktop Chrome'] },
  }));

  return defineConfig({
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    // Retried locally as well as in CI, deliberately.
    //
    // With no local retries an intermittent failure is indistinguishable from
    // a real one: the run just goes red and someone re-runs by hand to find
    // out which. Playwright already knows the difference and reports it as
    // "flaky" — but only if it is allowed to retry. Costing a few minutes on a
    // genuinely failing run is worth never mistaking flake for breakage again.
    retries: retries ?? 2,
    // Local dev-mode Magento cannot serve a full CPU's worth of parallel
    // browsers without page loads blowing test budgets.
    workers: process.env.CI ? 1 : 4,
    // Dev-mode Magento admin pages routinely take >10s each; 30s test
    // budgets flake on multi-page admin flows.
    timeout: 60_000 * ciMultiplier,
    expect: { timeout: 10_000 * ciMultiplier },
    reporter: [
      ['list'],
      ['html', { open: 'never', outputFolder: './test-report' }],
    ],

    use: {
      baseURL: config.baseUrl,
      headless: true,
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'on-first-retry',
      ignoreHTTPSErrors: true,
    },

    projects: [
      {
        name: 'project',
        testDir: testDir ?? './tests',
        use: { ...devices['Desktop Chrome'] },
      },
      ...themeProject,
      ...moduleProjects,
      ...localModuleProjects,
      ...vendorModuleProjects,
    ],

    ...(globalSetup && { globalSetup }),
    ...(globalTeardown && { globalTeardown }),
    ...(combinedGrepInvert && { grepInvert: combinedGrepInvert }),
    ...extraOptions,
  });
}

/** Identity helper for type-safe config definition in project repos */
export function defineProjectConfig(config: ProjectConfig): ProjectConfig {
  return config;
}
