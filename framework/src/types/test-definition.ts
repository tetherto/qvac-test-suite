import { z } from 'zod';

/**
 * Expectation schemas for test validation
 */
const containsExpectationSchema = z.object({
  validation: z
    .enum(['contains-all', 'contains-any'])
    .describe('contains-all: all strings must be present | contains-any: at least one string must be present'),
  contains: z.array(z.string()).describe('Array of strings to check for in the result'),
});

const regexExpectationSchema = z.object({
  validation: z.literal('regex'),
  pattern: z.string().describe('Regular expression pattern to match against result'),
});

const numericExpectationSchema = z.object({
  validation: z.literal('numeric-range'),
  min: z.number().optional().describe('Minimum value (inclusive)'),
  max: z.number().optional().describe('Maximum value (inclusive)'),
});

const typeExpectationSchema = z.object({
  validation: z.literal('type'),
  expectedType: z
    .enum(['string', 'number', 'array', 'embedding'])
    .describe('Expected JavaScript type or special type (embedding = array of numbers)'),
  minDimensions: z.number().optional().describe('For embedding type: minimum array length'),
});

const errorExpectationSchema = z.object({
  validation: z.literal('throws-error'),
  errorContains: z.string().describe('String that must be present in the error message'),
});

const customExpectationSchema = z.object({
  validation: z.literal('custom'),
  validator: z
    .function()
    .args(z.any())
    .returns(z.boolean())
    .describe('Custom validation function: (result) => boolean'),
});

/**
 * Union of all expectation types
 */
export const expectationSchema = z.union([
  containsExpectationSchema,
  regexExpectationSchema,
  numericExpectationSchema,
  typeExpectationSchema,
  errorExpectationSchema,
  customExpectationSchema,
]);

export type Expectation = z.infer<typeof expectationSchema>;

/**
 * Test definition schema
 */
export const testDefinitionSchema = z.object({
  testId: z.string().describe('Unique identifier for this test (e.g., "api-create-user", "completion-basic")'),

  params: z.any().describe('Parameters to pass to the test executor'),

  expectation: expectationSchema.describe('Expected outcome specification for validation'),

  metadata: z
    .record(z.any())
    .optional()
    .describe('Optional metadata: setup requirements, categories, timeouts, or any repo-specific info'),
});

export type TestDefinition = z.infer<typeof testDefinitionSchema>;

/**
 * Helper function to define tests with type safety and validation
 */
export function defineTests(tests: TestDefinition[]): TestDefinition[] {
  // Validate all tests at definition time
  return tests.map((test, idx) => {
    try {
      return testDefinitionSchema.parse(test);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Test definition ${idx} (${test.testId || 'unknown'}) is invalid: ${errorMessage}`);
    }
  });
}
