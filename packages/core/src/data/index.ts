import fs from 'fs';
import path from 'path';
import { deepMerge } from '../helpers/deep-merge';

import coreFeatures from './features.json';
import coreFixtures from './fixtures.json';
import coreInputs from './inputs.json';
import coreSelectors from './selectors.json';
import coreSlugs from './slugs.json';

export type CoreFeatures = typeof coreFeatures;
export type CoreFixtures = typeof coreFixtures;
export type CoreInputs = typeof coreInputs;
export type CoreSelectors = typeof coreSelectors;
export type CoreSlugs = typeof coreSlugs;

export interface MergedData {
  features: CoreFeatures;
  fixtures: CoreFixtures;
  inputs: CoreInputs;
  selectors: CoreSelectors;
  slugs: CoreSlugs;
}

/**
 * Loads and merges data in the following priority order (highest wins):
 *   1. Core defaults (bundled with this package)
 *   2. Theme overrides (passed in by the theme package)
 *   3. Project overrides (from <projectRoot>/config/)
 */
export function loadData(options: {
  projectRoot?: string;
  themeOverrides?: {
    features?: Partial<CoreFeatures>;
    selectors?: Partial<CoreSelectors>;
    fixtures?: Partial<CoreFixtures>;
    inputs?: Partial<CoreInputs>;
    slugs?: Partial<CoreSlugs>;
  };
} = {}): MergedData {
  const { projectRoot = process.cwd(), themeOverrides = {} } = options;

  const data: MergedData = {
    features: deepMerge<CoreFeatures>(coreFeatures, themeOverrides.features),
    fixtures: deepMerge<CoreFixtures>(coreFixtures, themeOverrides.fixtures),
    inputs: deepMerge<CoreInputs>(coreInputs, themeOverrides.inputs),
    selectors: deepMerge<CoreSelectors>(coreSelectors, themeOverrides.selectors as Partial<CoreSelectors>),
    slugs: deepMerge<CoreSlugs>(coreSlugs, themeOverrides.slugs),
  };

  const projectConfigDir = path.join(projectRoot, 'config');
  if (!fs.existsSync(projectConfigDir)) return data;

  const overrideFiles: (keyof MergedData)[] = ['features', 'fixtures', 'inputs', 'selectors', 'slugs'];
  for (const key of overrideFiles) {
    const overridePath = path.join(projectConfigDir, `${key}.json`);
    if (!fs.existsSync(overridePath)) continue;
    // Deliberately not swallowed: a malformed override would otherwise fall
    // back to the core defaults, silently running the suite against a
    // capability set the store never declared.
    let override: Record<string, unknown>;
    try {
      override = JSON.parse(fs.readFileSync(overridePath, 'utf-8'));
    } catch (error) {
      throw new Error(
        `[e2e-core] Failed to read override file ${overridePath}: ${(error as Error).message}`,
      );
    }
    (data as any)[key] = deepMerge((data as any)[key], override);
  }

  return data;
}
