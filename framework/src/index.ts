// Type exports
export type { QvacTestConfig } from './types/config.js';
export type { Expectation, TestDefinition } from './types/test-definition.js';
export type { TestExecutor, TestResult } from './core/consumer-base.js';
export type { TestHandler, TestExecutorConfig } from './types/test-handler.js';

// Schema exports (for validation)
export { expectationSchema, testDefinitionSchema } from './types/test-definition.js';
export { qvacTestConfigSchema } from './types/config.js';
export {
  consumerRegistrationSchema,
  testRequestSchema,
  testStartSchema,
  testResultSchema,
  heartbeatSchema,
  batchCompleteSchema,
  registerAckSchema,
  testAssignmentSchema,
} from './schemas/messages.js';

// Helper function exports
export { defineTests } from './types/test-definition.js';
export { defineConfig } from './types/config.js';

// Core exports
export { BatchOrchestrator } from './core/batch-orchestrator.js';
export { ConsumerBase } from './core/consumer-base.js';
export { createExecutor } from './core/test-executor.js';

// Utility exports
export { findConfig, loadConfig } from './utils/config-loader.js';
export { loadTests } from './utils/test-loader.js';
export { ValidationHelpers } from './utils/validation-helpers.js';
