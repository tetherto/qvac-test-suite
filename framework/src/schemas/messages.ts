import { z } from 'zod'

/**
 * Consumer registration message schema
 */
export const consumerRegistrationSchema = z.object({
  runId: z.string().describe('Run identifier for this test batch'),
  consumerId: z.string().describe('Unique consumer identifier'),
  sessionId: z.string().min(1).describe('Consumer process session identifier'),
  platform: z.string().describe('Platform: desktop, ios, android, etc.'),
  timestamp: z.string().describe('ISO timestamp of registration')
})

export type ConsumerRegistration = z.infer<typeof consumerRegistrationSchema>

/**
 * Test start notification schema
 */
export const testStartSchema = z.object({
  runId: z.string(),
  consumerId: z.string(),
  sessionId: z.string(),
  uniqueTestId: z.string(),
  timestamp: z.string()
})

export type TestStart = z.infer<typeof testStartSchema>

/**
 * Published immediately before reload starts.
 */
export const testReloadSchema = z.object({
  runId: z.string(),
  consumerId: z.string(),
  sessionId: z.string(),
  uniqueTestId: z.string(),
  testId: z.string(),
  ts: z.number()
})

export type TestReload = z.infer<typeof testReloadSchema>

/**
 * Test result schema
 */
export const testResultSchema = z.object({
  runId: z.string(),
  consumerId: z.string(),
  sessionId: z.string(),
  testId: z.string().describe('Test identifier'),
  uniqueTestId: z.string().describe('Unique test instance ID'),
  outcome: z.enum(['success', 'failure', 'skipped']),
  duration: z.number().describe('Test duration in milliseconds including retry if any'),
  timestamp: z.string(),
  error: z.string().optional().describe('Error message if failed'),
  output: z.string().optional().describe('Test output'),
  retried: z.boolean().optional(),
  retryPassed: z.boolean().optional(),
  retryOutput: z.string().optional(),
  attempt1DurationMs: z.number().optional(),
  reloadTimestamp: z.number().optional()
})

export type TestResult = z.infer<typeof testResultSchema>

/**
 * Heartbeat message schema
 */
export const heartbeatSchema = z.object({
  runId: z.string(),
  consumerId: z.string(),
  sessionId: z.string(),
  bootstrapped: z.boolean().optional(),
  timestamp: z.string().optional()
})

export type Heartbeat = z.infer<typeof heartbeatSchema>

/**
 * Consumer notification that bootstrap is complete and queue execution can
 * begin (or, for an empty queue, the batch can complete).
 */
export const queueReadySchema = z.object({
  runId: z.string(),
  consumerId: z.string(),
  sessionId: z.string(),
  timestamp: z.string()
})

export type QueueReady = z.infer<typeof queueReadySchema>

/**
 * Batch complete message schema
 */
export const batchCompleteSchema = z.object({
  runId: z.string(),
  consumerId: z.string(),
  sessionId: z.string(),
  status: z.literal('complete'),
  totalTests: z.number(),
  successCount: z.number(),
  failureCount: z.number(),
  skippedCount: z.number(),
  duration: z.number()
})

export type BatchComplete = z.infer<typeof batchCompleteSchema>

/**
 * A producer-selected test instance that the consumer resolves against its
 * local definitions.
 */
export const testQueueItemSchema = z.object({
  uniqueTestId: z.string(),
  testId: z.string()
})

export type TestQueueItem = z.infer<typeof testQueueItemSchema>

/**
 * Registration acknowledgment schema
 */
export const registeredAckSchema = z.object({
  runId: z.string(),
  status: z.literal('registered'),
  sessionId: z.string(),
  totalTests: z.number(),
  queue: z.array(testQueueItemSchema),
  // Retained for integrations that inspect the filtered catalog. `queue` is
  // the canonical execution and bootstrap source.
  filteredTestIds: z.array(z.string()).optional()
})

export const registrationRejectedSchema = z.object({
  runId: z.string(),
  status: z.literal('rejected'),
  sessionId: z.string(),
  reason: z.string()
})

export const registerAckSchema = z.discriminatedUnion('status', [
  registeredAckSchema,
  registrationRejectedSchema
])

export type RegisterAck = z.infer<typeof registerAckSchema>

/**
 * Aggregate statistics for a single metric.
 */
export const aggregateStatsSchema = z.object({
  count: z.number().describe('Number of samples collected'),
  min: z.number().describe('Minimum value observed'),
  max: z.number().describe('Maximum value observed'),
  avg: z.number().describe('Arithmetic mean of all samples'),
  sum: z.number().optional().describe('Sum of all sample values'),
  total: z.number().optional().describe('Sum of all sample values alias for sum'),
  last: z.number().optional().describe('Most recent sample value')
})

export type AggregateStats = z.infer<typeof aggregateStatsSchema>

/**
 * Profiler configuration as reported in export.
 */
export const profilerConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.string().optional(),
    includeServerBreakdown: z.boolean().optional(),
    operationFilters: z.array(z.string()).optional(),
    maxRecentEvents: z.number().optional()
  })
  .passthrough()

/**
 * Profiler export data schema.
 */
export const profilerExportSchema = z
  .object({
    config: profilerConfigSchema.optional(),
    aggregates: z.record(z.string(), aggregateStatsSchema).optional(),
    recentEvents: z.array(z.record(z.string(), z.unknown())).optional(),
    exportedAt: z.number().optional()
  })
  .passthrough()

export type ProfilerExport = z.infer<typeof profilerExportSchema>

/**
 * Profiling data message schema
 */
export const profilingDataSchema = z.object({
  runId: z.string(),
  consumerId: z.string(),
  sessionId: z.string(),
  timestamp: z.string(),
  kind: z.enum(['checkpoint', 'final']).optional(),
  sequence: z.number().int().nonnegative().optional(),
  profilerExport: profilerExportSchema
})

export type ProfilingData = z.infer<typeof profilingDataSchema>

/**
 * Producer acknowledgement for a final profiling export.
 */
export const profilingAckSchema = z.object({
  runId: z.string(),
  consumerId: z.string(),
  sessionId: z.string(),
  sequence: z.number().int().positive()
})

export type ProfilingAck = z.infer<typeof profilingAckSchema>
