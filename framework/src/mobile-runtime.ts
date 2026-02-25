// Mobile runtime exports - no build-time utilities with dynamic imports

// Type exports
export type { Expectation } from './schemas/expectations.js';
export type { TestDefinition } from './types/test-definition.js';
export type { TestExecutor, TestResult } from './core/consumer-base.js';
export type { TestHandler, TestExecutorConfig } from './types/test-handler.js';

// Type exports for executor base classes
export type { TestDefinitions, ExtractTest, HandlerFn } from './core/base-executor.js';

// Core exports (mobile-compatible)
export { ConsumerBase } from './core/consumer-base.js';
export { createExecutor } from './core/test-executor.js';

// Executor base classes
export { BaseExecutor, SkipExecutor } from './core/base-executor.js';
export { AssetExecutor } from './mobile/asset-executor.js';

// Schema exports
export { expectationSchema } from './schemas/expectations.js';

// Utility exports (mobile-compatible only)
export { ValidationHelpers } from './utils/validation-helpers.js';
