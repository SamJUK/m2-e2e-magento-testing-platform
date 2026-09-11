# @samjuk/e2e-m2-playwright-core

Core Playwright framework for Magento 2 E2E testing. Provides fixtures, data helpers, config factory, and seeding utilities consumed by theme and module packages.

## Installation

```bash
pnpm add @samjuk/e2e-m2-playwright-core
```

**Peer dependency:** `@playwright/test ^1.50.0`

## Exports

| Subpath | Contents |
|---|---|
| `.` (main) | All public exports re-exported |
| `./fixtures` | `coreTest`, `CoreFixtures` type |
| `./config` | `createPlaywrightConfig`, `defineProjectConfig`, `ProjectConfig` |
| `./data` | `loadData`, `ProjectData` types |
| `./seed` | `seedMagento` (database seeding for global setup) |

## Setting up a project

### 1. Create `playwright.config.ts`

```typescript
import dotenv from 'dotenv';
import path from 'path';
import { createPlaywrightConfig, defineProjectConfig } from '@samjuk/e2e-m2-playwright-core';

dotenv.config({ path: path.join(__dirname, '.env') });

export const config = defineProjectConfig({
  baseUrl: process.env.PLAYWRIGHT_BASE_URL ?? 'https://store.test',
  mailpitUrl: process.env.MAILPIT_URL ?? 'https://mailpit.test',
  theme: 'luma',           // matches @samjuk/e2e-m2-theme-{name}
  admin: {
    slug: '/admin',
    username: process.env.PLAYWRIGHT_ADMIN_USERNAME ?? 'admin',
    password: process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'password123',
  },
  db: {
    strategy: 'none',      // 'none' | 'dump-restore' | 's3-import'
  },
});

export default createPlaywrightConfig(config, {
  testDir: './tests',
  globalSetup: require.resolve('./globalSetup'),
  globalTeardown: require.resolve('./globalTeardown'),
});
```

### 2. Create `fixtures.ts` (project composition point)

Import and re-export the theme fixture. This is what `#test` resolves to.

```typescript
// fixtures.ts
export { lumaTest as test, expect } from '@samjuk/e2e-m2-theme-luma';
```

Or compose multiple module extensions:

```typescript
import { lumaTest } from '@samjuk/e2e-m2-theme-luma';
import { withAcmeWidgets } from '@acme/e2e-m2-module-acme-widgets';

export const test = withAcmeWidgets(lumaTest);
export { expect } from '@playwright/test';
```

### 3. Configure `#test` resolution

In **`package.json`** (the package containing your spec files and any `app/code/` modules):

```json
{
  "imports": {
    "#test": "./fixtures.ts"
  }
}
```

In **`tsconfig.json`**:

```json
{
  "compilerOptions": {
    "paths": {
      "#test": ["./fixtures.ts"]
    }
  }
}
```

## `ProjectConfig` reference

```typescript
interface ProjectConfig {
  baseUrl: string;               // Magento storefront base URL
  mailpitUrl?: string;           // Mailpit API URL for email assertions
  theme?: string;                // Theme name, e.g. 'luma' or 'hyva'
  locale?: string;               // Store locale, e.g. 'en_GB'
  admin: {
    slug: string;                // Admin URL slug, e.g. '/backend'
    username: string;
    password: string;
  };
  db?: {
    strategy: 'none' | 'dump-restore' | 's3-import';
    dumpPath?: string;           // Local dump path for dump-restore
    s3Bucket?: string;           // S3 bucket for s3-import
    s3Key?: string;              // S3 object key for s3-import
  };
  shell?: {
    exec?: (cmd: string) => Promise<void>;      // Run cmd in Magento container
    dbDump?: (outPath: string) => Promise<void>;
    dbImport?: (inPath: string) => Promise<void>;
  };
  excludeModules?: string[];     // NPM module packages to exclude from discovery
  appCodeDir?: string | false;   // Path to app/code/, false to disable, omit for auto-detect
}
```

## Auto-discovery

`createPlaywrightConfig` builds the Playwright `projects` array from four sources, in order:

1. **`project`**: `options.testDir` (default `./tests`)
2. **Theme**: `node_modules/@samjuk/e2e-m2-theme-{config.theme}/` if it declares `"e2eTheme": { "testDir": "..." }`
3. **NPM module packages**: any `@<scope>/e2e-m2-module-*` dependency that declares `"e2eModule": { "testDir": "..." }`
4. **Local modules**: `app/code/{Vendor}/{Module}/Test/E2E/` directories (auto-detected at `../app/code` relative to `process.cwd()`)

All auto-discovered projects use the consuming project's `tsconfig.json` so that `#test` path resolution works consistently.

## Creating a theme package

A theme package must:
- Export `{name}Test` (an extension of `coreTest`) from its main entry and a `./fixtures` subpath.
- Declare `"e2eTheme": { "testDir": "dist/tests" }` in `package.json`.
- Ship built-in spec files compiled to `dist/tests/` (spec source in `src/tests/`, included in `tsc` compilation, NOT in `files[]`).

Spec files in the theme package import using relative source paths (`'../fixtures'`), which compile to relative `require` calls. This avoids Node.js self-reference resolution issues in pnpm's virtual store.

## Creating a module package

A module package must:
- Export theme-specific fixture extenders, e.g. `withRmaLuma` from `./luma`.
- Declare `"e2eModule": { "testDir": "src/tests" }` in `package.json`.
- Declare `"imports": { "#test": "./dist/fixtures/default.js" }` for standalone runs.

The default fixture stub (`src/fixtures/default.ts`) should extend `coreTest` with the module's page objects so tests can run independently of a consuming project.
