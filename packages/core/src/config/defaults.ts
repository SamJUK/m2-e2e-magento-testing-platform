/**
 * Copyright (c) 2026 Sam James. Licensed under the Open Software License version 3.0.
 * SPDX-License-Identifier: OSL-3.0
 */

import type { ProjectConfig } from './schema';

export const defaultConfig: Omit<ProjectConfig, 'baseUrl'> = {
  admin: {
    slug: '/backend',
    username: 'playwright',
    password: 'Password1',
  },
  db: {
    strategy: 'none',
    dumpPath: '/tmp/e2e-db-dump.sql',
  },
};
