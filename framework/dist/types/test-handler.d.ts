import type { Expectation } from './test-definition';
/**
 * Result returned by test execution
 */
export interface TestResult {
    /** Test output/error message */
    output: string;
    /** Whether the test passed */
    passed: boolean;
    /** Optional: model ID if test loaded/switched models */
    modelId?: string;
}
/**
 * Test handler interface - implement this to handle test execution
 */
export interface TestHandler {
    /** Pattern to match test IDs (e.g., /^completion-/) */
    pattern: RegExp;
    /**
     * Execute a test
     * @param testId - Unique test identifier
     * @param modelId - Currently loaded model ID (or null)
     * @param params - Test parameters
     * @param expectation - Expected outcome specification
     * @returns Test result
     */
    execute(testId: string, modelId: string | null, params: any, expectation: Expectation): Promise<TestResult>;
}
/**
 * Test executor configuration
 */
export interface TestExecutorConfig {
    /** Array of test handlers */
    handlers: TestHandler[];
}
/**
 * Test executor interface
 */
export interface TestExecutor {
    /**
     * Execute a test by finding matching handler
     * @param testId - Unique test identifier
     * @param modelId - Currently loaded model ID (or null)
     * @param params - Test parameters
     * @param expectation - Expected outcome specification
     * @returns Test result
     */
    executeTest(testId: string, modelId: string | null, params: any, expectation: Expectation): Promise<TestResult>;
}
