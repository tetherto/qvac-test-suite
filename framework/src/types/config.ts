import { z } from 'zod';

/**
 * Consumer platform configuration schema
 */
const consumerPlatformSchema = z.object({
  platforms: z
    .array(z.enum(['macos', 'windows', 'linux', 'ios', 'android']))
    .describe('Target platforms for this consumer type'),

  entry: z.string().describe('Entry point file for the consumer (e.g., ./tests/desktop/consumer.ts)'),

  include: z.array(z.string()).describe('Glob patterns for files to bundle (e.g., ["./src/**", "./tests/**"])'),

  dependencies: z
    .union([z.literal('auto'), z.record(z.string())])
    .optional()
    .describe('Dependencies to install: "auto" reads from package.json, or provide manual map of package@version'),
});

/**
 * Main configuration schema for QVAC test suite
 */
export const qvacTestConfigSchema = z.object({
  brokerUrl: z
    .string()
    .url()
    .default('mqtt://localhost:1883')
    .describe('MQTT broker URL for producer-consumer coordination'),

  testDir: z.string().describe('Directory containing test definitions (e.g., "./tests")'),

  runIdStrategy: z
    .union([z.literal('auto'), z.literal('manual'), z.function()])
    .optional()
    .default('auto')
    .describe(
      'Run ID generation: "auto" generates repo-branch-commit-timestamp, "manual" requires --runId flag, or custom function'
    ),

  consumers: z
    .object({
      desktop: consumerPlatformSchema.optional().describe('Desktop consumer configuration for Node.js platforms'),

      mobile: consumerPlatformSchema.optional().describe('Mobile consumer configuration for React Native platforms'),
    })
    .refine((data) => data.desktop || data.mobile, {
      message: 'At least one consumer type (desktop or mobile) must be configured',
    })
    .describe('Consumer configuration per platform type'),

  comparison: z
    .object({
      baselineRef: z
        .string()
        .default('main')
        .describe('Branch, tag, or commit to use as baseline for comparison (e.g., "main", "dev", "v1.0.0")'),
    })
    .optional()
    .describe('Report comparison configuration'),
});

/**
 * Infer TypeScript type from schema
 */
export type QvacTestConfig = z.infer<typeof qvacTestConfigSchema>;

/**
 * Helper function to define config with type safety and validation
 */
export function defineConfig(config: QvacTestConfig): QvacTestConfig {
  // Validate at definition time (catches errors early)
  return qvacTestConfigSchema.parse(config);
}
