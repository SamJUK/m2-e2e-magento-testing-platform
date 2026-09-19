export type { ExclusionReason, TestExclusion } from './config/exclusions';
// Config
export * from './config/schema';
export * from './config/defaults';
export { createPlaywrightConfig, defineProjectConfig } from './config/playwright';

// Data
export { loadData } from './data';
export type { MergedData, CoreFeatures, CoreFixtures as CoreFixturesData, CoreInputs, CoreSelectors, CoreSlugs } from './data';

// Helpers
export { deepMerge } from './helpers/deep-merge';
export { sprintf } from './helpers/sprintf';
export { multiSelectAll } from './helpers/multiselect';
export { parseMoney, readMoney, readAllMoney } from './helpers/money';
export { waitForFormKey, resetFormKey, tamperFormKey } from './helpers/form-key';
export { getSessionId } from './helpers/session';
export { clickReachable } from './helpers/click';
export { displayedPrice, grossUp } from './helpers/price';
export { setCheckbox } from './helpers/checkbox';
export { setSelect } from './helpers/select';
export { cityName } from './helpers/address';
export { assertSearchEngineReachable } from './health/search-engine';
export { wardenShell, ddevShell, dockerComposeShell } from './shell/presets';
export type { DockerComposeShellOptions } from './shell/presets';
export { Mailpit, MailpitQuery } from './helpers/mailpit';
export type { MailpitQuerySegment } from './helpers/mailpit';

// Fixtures
export { coreTest } from './fixtures';
export type { CoreTest, CoreFixtures } from './fixtures';

// Global hooks
export { runGlobalSetup } from './globalSetup';
export { runGlobalTeardown } from './globalTeardown';
