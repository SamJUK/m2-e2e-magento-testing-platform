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
