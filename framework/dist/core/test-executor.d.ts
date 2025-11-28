import type { TestExecutor, TestExecutorConfig } from '../types';
/**
 * Creates a test executor from a configuration of handlers
 */
export declare function createExecutor(config: TestExecutorConfig): TestExecutor;
