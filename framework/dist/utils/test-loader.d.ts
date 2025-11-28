import type { TestDefinition } from '../types/test-definition.js';
import type { QvacTestConfig } from '../types/config.js';
/**
 * Load test definitions from configuration
 * @param config Test suite configuration
 * @param configDir Directory where config was loaded from
 */
export declare function loadTests(config: QvacTestConfig, configDir?: string): Promise<TestDefinition[]>;
