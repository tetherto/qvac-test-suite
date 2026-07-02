import { z } from 'zod'

/**
 * Base consumer configuration (shared fields)
 */
const baseConsumerSchema = z.object({
  entry: z.string().describe('Entry point file for the consumer'),

  include: z
    .array(z.string())
    .describe('Glob patterns for files to bundle (e.g., ["./src/**", "./tests/**"])'),

  dependencies: z
    .union([z.literal('auto'), z.record(z.string())])
    .optional()
    .describe(
      'Dependencies to install: "auto" reads from package.json, or provide manual map of package@version'
    )
})

/**
 * Desktop consumer configuration schema
 */
const desktopConsumerSchema = baseConsumerSchema.extend({
  platforms: z.array(z.enum(['macos', 'windows', 'linux'])).describe('Target desktop platforms')
})

/**
 * Electron consumer configuration schema
 */
const electronConsumerSchema = baseConsumerSchema
  .omit({ include: true, dependencies: true })
  .extend({
    platforms: z
      .array(z.enum(['macos', 'windows', 'linux']))
      .describe('Target Electron desktop platforms'),

    appDir: z
      .string()
      .describe('Directory containing the Electron app package.json and Forge config'),

    appName: z
      .string()
      .optional()
      .describe(
        'Packaged Electron app executable/name. Defaults to package.json productName or name'
      ),

    outDir: z
      .string()
      .optional()
      .default('out')
      .describe('Electron Forge output directory relative to appDir'),

    packageManager: z
      .enum(['npm', 'bun', 'pnpm', 'yarn'])
      .optional()
      .default('npm')
      .describe('Package manager used to install and package the Electron app'),

    packageScript: z
      .string()
      .optional()
      .default('package')
      .describe('package.json script that packages the Electron app')
  })

/**
 * Mobile consumer configuration schema
 */
const mobileConsumerSchema = baseConsumerSchema.extend({
  platforms: z.array(z.enum(['ios', 'android'])).describe('Target mobile platforms'),

  mobileInit: z
    .string()
    .optional()
    .describe(
      'Optional mobile initialization file (e.g., "./mobile-init.ts") for platform-specific setup'
    ),

  metroConfig: z
    .string()
    .optional()
    .describe(
      'Optional Metro config file (e.g., "./metro.config.js") to override default Metro configuration'
    ),

  assets: z
    .object({
      patterns: z
        .array(z.string())
        .describe(
          'Glob patterns for assets to bundle (e.g., ["./assets/audio/**/*", "./assets/documents/**/*"])'
        )
    })
    .optional()
    .describe('Asset bundling configuration'),

  expoPlugins: z
    .array(z.union([z.string(), z.tuple([z.string(), z.any()])]))
    .optional()
    .describe('Additional Expo plugins to include (e.g., ["@qvac/sdk/expo-plugin"])'),

  copyArtifact: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to copy built APK/IPA to root of consumer directory (default: true)')
})

/**
 * MQTT broker configuration schema (separate host/port)
 */
const mqttBrokerSchema = z.object({
  protocol: z
    .union([z.enum(['mqtt', 'mqtts', 'ws', 'wss']), z.object({ env: z.string() })])
    .optional()
    .default('mqtt')
    .describe('MQTT protocol. Provide directly or { env: "VAR_NAME" }'),

  host: z
    .union([z.string(), z.object({ env: z.string() })])
    .describe('MQTT broker host. Provide directly or { env: "VAR_NAME" }'),

  port: z
    .union([z.number(), z.object({ env: z.string() })])
    .optional()
    .describe(
      'MQTT broker port. Provide directly or { env: "VAR_NAME" }. Defaults: mqtt=1883, mqtts=8883, ws=8080, wss=8081'
    ),

  path: z
    .union([z.string(), z.object({ env: z.string() })])
    .optional()
    .describe(
      'MQTT broker path for WebSocket (e.g., "/mqtt"). Provide directly or { env: "VAR_NAME" }'
    )
})

/**
 * Complete MQTT configuration schema (broker + auth + certs)
 */
const mqttConfigSchema = z.object({
  // Broker configuration - Option A: URL
  brokerUrl: z
    .union([z.string().url(), z.object({ env: z.string() })])
    .optional()
    .describe(
      'MQTT broker URL. Provide URL directly or { env: "VAR_NAME" }. Alternative: use broker object'
    ),

  // Broker configuration - Option B: Separate components
  broker: mqttBrokerSchema
    .optional()
    .describe('MQTT broker configuration (host/port). Alternative to brokerUrl'),

  // Authentication
  username: z
    .union([z.string(), z.object({ env: z.string() })])
    .optional()
    .describe(
      'Username for MQTT authentication. Provide string directly or { env: "VAR_NAME" } to read from env'
    ),

  password: z
    .union([z.string(), z.object({ env: z.string() })])
    .optional()
    .describe(
      'Password for MQTT authentication. Provide string directly or { env: "VAR_NAME" } to read from env'
    ),

  // TLS Certificates
  caPath: z
    .union([z.string(), z.object({ env: z.string() })])
    .optional()
    .describe(
      'Path to CA certificate. Provide path directly or { env: "VAR_NAME" } to read from env'
    ),

  certPath: z
    .union([z.string(), z.object({ env: z.string() })])
    .optional()
    .describe(
      'Path to client certificate. Provide path directly or { env: "VAR_NAME" } to read from env'
    ),

  keyPath: z
    .union([z.string(), z.object({ env: z.string() })])
    .optional()
    .describe('Path to client key. Provide path directly or { env: "VAR_NAME" } to read from env'),

  rejectUnauthorized: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'Verify TLS certificates (default: true). Set to false to disable certificate validation (testing only)'
    )
})

/**
 * Main configuration schema for QVAC test suite
 */
export const qvacTestConfigSchema = z.object({
  mqtt: mqttConfigSchema
    .optional()
    .describe('MQTT broker and authentication configuration. All MQTT-related settings go here'),

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
      desktop: desktopConsumerSchema
        .optional()
        .describe('Desktop consumer configuration for Node.js platforms (macOS, Windows, Linux)'),

      mobile: mobileConsumerSchema
        .optional()
        .describe('Mobile consumer configuration for React Native platforms (iOS, Android)'),

      electron: electronConsumerSchema
        .optional()
        .describe('Electron consumer configuration for packaged Electron apps'),

      shared: z
        .object({
          include: z
            .array(z.string())
            .describe(
              'Glob patterns for shared code included in both desktop and mobile builds (e.g., ["./tests/shared/**"])'
            )
        })
        .optional()
        .describe('Shared code configuration included in both desktop and mobile consumer builds')
    })
    .refine((data) => data.desktop || data.mobile || data.electron, {
      message: 'At least one consumer type (desktop, mobile, or electron) must be configured'
    })
    .describe('Consumer configuration per platform type'),

  comparison: z
    .object({
      baselineRef: z
        .string()
        .default('main')
        .describe(
          'Branch, tag, or commit to use as baseline for comparison (e.g., "main", "dev", "v1.0.0")'
        )
    })
    .optional()
    .describe('Report comparison configuration')
})

/**
 * Infer TypeScript type from schema
 */
export type QvacTestConfig = z.infer<typeof qvacTestConfigSchema>

/**
 * Helper function to define config with type safety and validation
 */
export function defineConfig(config: QvacTestConfig): QvacTestConfig {
  // Validate at definition time (catches errors early)
  return qvacTestConfigSchema.parse(config)
}
