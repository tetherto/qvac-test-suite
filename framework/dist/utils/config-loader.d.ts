import type { QvacTestConfig } from '../types/config.js';
/**
 * Load configuration from qvac-test.config.ts
 * @param configDir Directory containing qvac-test.config.ts (defaults to cwd)
 */
export declare function loadConfig(configDir?: string): Promise<QvacTestConfig>;
/**
 * Find config file by walking up directory tree
 */
export declare function findConfig(startDir?: string): string | null;
