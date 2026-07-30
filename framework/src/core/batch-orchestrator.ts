import * as fs from 'node:fs'
import * as path from 'node:path'
import type { MqttClient } from 'mqtt'
import type { TestDefinition } from '../types/test-definition.js'
import {
  consumerRegistrationEnvelopeSchema,
  consumerRegistrationSchema,
  testStartSchema,
  testResultSchema,
  testReloadSchema,
  heartbeatSchema,
  queueReadySchema,
  queueCompleteSchema,
  profilingDataSchema,
  type TestResult as MqttTestResult,
  type TestReload,
  type ProfilerExport,
  type BatchComplete,
  type QueueAbort
} from '../schemas/messages.js'
import {
  generateHtmlReport,
  generateJsonReport,
  type ReportData,
  type ReportProfilingData
} from '../utils/report-generator.js'
import { getMetricCount } from '../utils/profiler-adapter.js'
import { aggregateMemory, type MemorySummary } from '../utils/memory-aggregator.js'

interface TestCase {
  id: string // Unique test ID
  testId: string // Test type
  metadata: Record<string, unknown> // Test metadata (producer-side reporting only)
  suites?: string[]
  estimatedDurationMs: number
}

interface RunningTest {
  testCase: TestCase
  consumerId: string
  sessionId: string
  startedAt: number
  timelineStartedAt: number
  timeoutMs: number
  originalTimeoutMs: number
  reloadRecorded?: boolean
}

interface ConsumerInfo {
  consumerId: string
  sessionId: string
  platform: string
  registeredAt: number
  lastSeen: number
  testsCompleted: number
  testsRunning: number
  bootstrapped?: boolean
  queueReady: boolean
  queueComplete: boolean
}

interface ProfilingSnapshot {
  profilerExport: ProfilerExport
  kind: 'checkpoint' | 'final'
  sequence?: number
  timestamp: string
  receivedAt: number
}

// Producer catalog skips and orphaned queued tests do not belong to a consumer session.
type ProducerTestResult = Omit<MqttTestResult, 'consumerId' | 'sessionId'> & {
  consumerId: 'producer' | 'none'
  sessionId?: never
}
type TestResult = MqttTestResult | ProducerTestResult

// Slightly exceeds the consumer's default 30-second final-profiling ACK timeout.
const DEFAULT_PROFILING_SAFETY_TIMEOUT_MS = 35000
const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 20 * 60 * 1000
const TIMEOUT_CHECK_INTERVAL_MS = 10000
const TIMEOUT_GRACE_MS = TIMEOUT_CHECK_INTERVAL_MS + 5000
const MAX_PENDING_MEMORY_SAMPLES = 1000

function readProfilingSafetyTimeoutMs() {
  const parsed = Number.parseInt(
    process.env.QVAC_PROFILING_SAFETY_TIMEOUT_MS ?? String(DEFAULT_PROFILING_SAFETY_TIMEOUT_MS),
    10
  )
  return Number.isFinite(parsed) ? Math.max(1, parsed) : DEFAULT_PROFILING_SAFETY_TIMEOUT_MS
}

function readBootstrapTimeoutMs() {
  const parsed = Number.parseInt(
    process.env.QVAC_BOOTSTRAP_TIMEOUT_MS ?? String(DEFAULT_BOOTSTRAP_TIMEOUT_MS),
    10
  )
  return Number.isFinite(parsed) ? Math.max(1, parsed) : DEFAULT_BOOTSTRAP_TIMEOUT_MS
}

export class BatchOrchestrator {
  private client: MqttClient
  private runId: string
  private allowWildcardConsumers: boolean
  private consumerTimeoutSec: number
  private consumerInactivityTimeoutMs: number
  private reportDir?: string
  private timelinePath?: string
  private appMemPath?: string
  private testQueue: TestCase[] = []
  private runningTests = new Map<string, RunningTest>() // uniqueTestId -> running test
  private completedTests = new Map<string, TestResult>() // uniqueTestId -> result
  private consumers = new Map<string, ConsumerInfo>() // consumerId -> info
  private queueConsumerId?: string
  private pendingTestResults = new Map<string, MqttTestResult>()
  private pendingTestReloads = new Map<string, TestReload>()
  private pendingAppMemorySamples: Record<string, unknown>[] = []
  private latestMemorySampleTs = new Map<string, number>()
  private profilingData = new Map<string, ProfilingSnapshot>() // consumerId -> latest profiler snapshot
  private finalProfilingConsumers = new Set<string>()
  private profilingSafetyTimeoutMs = readProfilingSafetyTimeoutMs()
  private bootstrapTimeoutMs = readBootstrapTimeoutMs()
  private testSuites = new Map<string, string[]>() // testId -> suites
  private testCategories = new Map<string, string>() // testId -> metadata.category
  // Unique post-filter testIds, snapshotted in buildTestQueue and replayed
  // in every register-ack so late-joining/reconnecting consumers see a
  // stable set even after testQueue starts shrinking.
  private filteredTestIds: string[] = []
  private initialTotalTests = 0
  private startTime = 0
  private batchStarted = false
  private batchCompleting = false
  private batchCompleteSummary?: Omit<BatchComplete, 'consumerId' | 'sessionId'>
  private batchCompleteSentSessions = new Set<string>()
  private disconnectedCompletionRecipients = new Map<string, ConsumerInfo>()
  private allConsumersDead = false
  private fatalBatchFailure = false
  private queueAborted = false
  private queueAbortSummary?: QueueAbort
  private shutdownTimer?: NodeJS.Timeout
  private consumerTimeoutTimer?: NodeJS.Timeout

  constructor(
    client: MqttClient,
    runId: string,
    allowWildcardConsumers: boolean = false,
    consumerTimeoutSec: number = 30,
    consumerInactivityTimeoutSec: number = 120,
    reportDir?: string
  ) {
    this.client = client
    this.runId = runId
    this.allowWildcardConsumers = allowWildcardConsumers
    this.consumerTimeoutSec = consumerTimeoutSec
    this.consumerInactivityTimeoutMs = consumerInactivityTimeoutSec * 1000
    this.reportDir = reportDir
    if (reportDir) {
      try {
        fs.mkdirSync(reportDir, { recursive: true })
      } catch {}
      this.timelinePath = path.join(reportDir, 'test-timeline.ndjson')
      this.appMemPath = path.join(reportDir, 'app-mem.ndjson')
    }
    this.setupMqttHandlers()
  }

  private handleAppMemorySample(rawMessage: unknown): void {
    if (!this.appMemPath) return
    if (!rawMessage || typeof rawMessage !== 'object') return
    const m = rawMessage as Record<string, unknown>
    // Validate the minimum shape; ignore obviously broken entries.
    if (typeof m.ts !== 'number' || typeof m.memoryKb !== 'number') return
    if (typeof m.platform !== 'string') return
    const consumerId = typeof m.consumerId === 'string' ? m.consumerId : undefined
    const sessionId = typeof m.sessionId === 'string' ? m.sessionId : undefined
    if (!consumerId || !sessionId) {
      return
    }
    if (!this.queueConsumerId) {
      this.pendingAppMemorySamples.push(m)
      if (this.pendingAppMemorySamples.length > MAX_PENDING_MEMORY_SAMPLES) {
        this.pendingAppMemorySamples.shift()
      }
      return
    }
    if (
      consumerId !== this.queueConsumerId ||
      !this.isCurrentConsumerSession(consumerId, sessionId)
    ) {
      return
    }
    this.appendAppMemorySample(m, consumerId, sessionId)
  }

  private appendAppMemorySample(
    message: Record<string, unknown>,
    consumerId: string,
    sessionId: string
  ) {
    if (!this.appMemPath) {
      return
    }
    // unit/limitKb/peakKb are passed through for extended memory series
    // (/proc-derived Android values and task_vm_info-derived iOS values). Older
    // publishers omit them; default to the resident-memory shape (kb, no
    // ceiling).
    const unit = message.unit === 'count' ? 'count' : 'kb'
    const record = {
      ts: message.ts,
      pid: typeof message.pid === 'number' ? message.pid : null,
      memoryKb: message.memoryKb,
      peakKb: typeof message.peakKb === 'number' ? message.peakKb : null,
      limitKb: typeof message.limitKb === 'number' ? message.limitKb : null,
      metric: typeof message.metric === 'string' ? message.metric : 'in-app',
      unit,
      platform: message.platform,
      consumerId,
      sessionId
    }
    if (typeof message.ts === 'number') {
      const sessionKey = this.getConsumerSessionKey(consumerId, sessionId)
      const previousTs = this.latestMemorySampleTs.get(sessionKey) ?? 0
      this.latestMemorySampleTs.set(sessionKey, Math.max(previousTs, message.ts))
    }
    try {
      fs.appendFileSync(this.appMemPath, JSON.stringify(record) + '\n')
    } catch {
      // Non-fatal: app memory ndjson is auxiliary.
    }
  }

  private flushPendingAppMemorySamples() {
    const pending = this.pendingAppMemorySamples
    this.pendingAppMemorySamples = []
    for (const sample of pending) {
      this.handleAppMemorySample(sample)
    }
  }

  private appendTimeline(event: {
    ts: number
    consumerId: string
    sessionId?: string
    testId: string
    uniqueTestId: string
    phase: 'start' | 'end' | 'reload'
    incomplete?: boolean
  }): void {
    if (!this.timelinePath) return
    try {
      fs.appendFileSync(this.timelinePath, JSON.stringify(event) + '\n')
    } catch {
      // non-fatal: timeline is auxiliary
    }
  }

  private setupMqttHandlers() {
    this.client.on('connect', () => {
      console.log('✅ Producer connected to MQTT broker')
      console.log(`🔑 Run ID: ${this.runId}`)
      console.log(`🌐 Wildcard consumers: ${this.allowWildcardConsumers ? 'allowed' : 'disabled'}`)

      // Subscribe to all coordination topics
      this.client.subscribe(
        [
          'qvac/register',
          'qvac/test-start',
          'qvac/test-reload',
          'qvac/results',
          'qvac/heartbeat',
          'qvac/queue-ready',
          'qvac/queue-complete',
          'qvac/profiling',
          'qvac/app-memory'
        ],
        { qos: 1 },
        (err) => {
          if (err) {
            console.error('❌ Failed to subscribe:', err)
            process.exit(1)
          }
          console.log('📡 Subscribed to coordination topics')
          for (const consumer of this.consumers.values()) {
            this.publishRegistrationAck(consumer)
            this.publishQueueAbort(consumer)
            if (this.batchCompleteSummary) {
              this.publishBatchComplete(consumer, true)
            }
          }
        }
      )
    })

    this.client.on('message', (topic, payload) => {
      try {
        const message = JSON.parse(payload.toString())

        const isWildcardConsumer = message.runId === '*'
        const isMatchingRunId = message.runId === this.runId

        if (!isMatchingRunId && !(isWildcardConsumer && this.allowWildcardConsumers)) {
          return
        }

        switch (topic) {
          case 'qvac/register':
            this.handleConsumerRegistration(message)
            break
          case 'qvac/test-start':
            this.handleTestStart(message)
            break
          case 'qvac/test-reload':
            this.handleTestReload(message)
            break
          case 'qvac/results':
            this.handleTestResult(message)
            break
          case 'qvac/heartbeat':
            this.handleHeartbeat(message)
            break
          case 'qvac/queue-ready':
            this.handleQueueReady(message)
            break
          case 'qvac/queue-complete':
            this.handleQueueComplete(message)
            break
          case 'qvac/profiling':
            this.handleProfilingData(message)
            break
          case 'qvac/app-memory':
            this.handleAppMemorySample(message)
            break
        }
      } catch (error) {
        console.error(`❌ Error handling ${topic}:`, error)
      }
    })

    this.client.on('reconnect', () => {
      console.log('🔄 Producer reconnecting to MQTT broker...')
    })

    this.client.on('offline', () => {
      console.log('📴 Producer offline')
    })

    this.client.on('close', () => {
      console.log('🔌 Producer MQTT connection closed')
    })

    this.client.on('error', (err) => {
      console.error('❌ MQTT error:', err)
    })
  }

  private handleConsumerRegistration(rawMessage: unknown) {
    const envelope = consumerRegistrationEnvelopeSchema.parse(rawMessage)
    const { consumerId, sessionId, capabilities } = envelope

    if (!sessionId || !capabilities.includes('queue-complete-v1')) {
      const rejectionSessionId = sessionId ?? 'incompatible'
      this.publishRegistrationRejection(
        consumerId,
        rejectionSessionId,
        'Consumer does not support the queue completion protocol'
      )
      if (!this.queueConsumerId) {
        this.fatalBatchFailure = true
        this.abortQueue(`Incompatible consumer registration: ${consumerId}`)
      }
      return
    }

    const message = consumerRegistrationSchema.parse(envelope)
    const { platform } = message
    const now = Date.now()

    let existing = this.consumers.get(consumerId)
    if (!existing && consumerId === this.queueConsumerId) {
      const disconnectedConsumer = this.disconnectedCompletionRecipients.get(consumerId)
      if (disconnectedConsumer) {
        if (disconnectedConsumer.sessionId !== sessionId) {
          this.publishRegistrationRejection(
            consumerId,
            sessionId,
            'Consumer ID belongs to another session'
          )
          return
        }
        existing = disconnectedConsumer
        this.consumers.set(consumerId, existing)
        this.disconnectedCompletionRecipients.delete(consumerId)
      }
    }
    if (existing) {
      if (existing.sessionId !== sessionId) {
        this.publishRegistrationRejection(
          consumerId,
          sessionId,
          'Consumer ID belongs to another active session'
        )
        return
      }

      existing.lastSeen = now
      this.publishRegistrationAck(existing)
      this.publishQueueAbort(existing)
      if (this.batchCompleteSummary) {
        this.publishBatchComplete(existing, true)
      } else {
        this.checkBatchComplete()
      }
      return
    }

    if (this.queueConsumerId) {
      const reason = `Test queue is already owned by ${this.queueConsumerId}`
      console.warn(`⚠️  Rejecting additional consumer ${consumerId}; ${reason}`)
      this.publishRegistrationRejection(consumerId, sessionId, reason)
      return
    }

    this.queueConsumerId = consumerId

    // Cancel consumer timeout on first registration
    if (this.consumers.size === 0 && this.consumerTimeoutTimer) {
      clearTimeout(this.consumerTimeoutTimer)
      this.consumerTimeoutTimer = undefined
    }

    const consumer: ConsumerInfo = {
      consumerId,
      sessionId,
      platform,
      registeredAt: now,
      lastSeen: now,
      testsCompleted: 0,
      testsRunning: 0,
      queueReady: false,
      queueComplete: false
    }
    this.consumers.set(consumerId, consumer)

    console.log(`\n🔌 Consumer registered: ${consumerId} (${platform})`)
    this.displayStatus()

    this.flushPendingAppMemorySamples()
    this.publishRegistrationAck(consumer)
  }

  private publishRegistrationAck(consumer: ConsumerInfo) {
    const runningQueue = Array.from(this.runningTests.values())
      .filter((runningTest) => runningTest.consumerId === consumer.consumerId)
      .map(({ testCase }) => testCase)
    const queue = [...runningQueue, ...this.testQueue].map(({ id, testId }) => ({
      uniqueTestId: id,
      testId
    }))
    this.client.publish(
      `qvac/register-ack/${consumer.consumerId}`,
      JSON.stringify({
        runId: this.runId,
        status: 'registered',
        sessionId: consumer.sessionId,
        totalTests: this.initialTotalTests,
        queue,
        filteredTestIds: this.filteredTestIds
      }),
      { qos: 1 }
    )
  }

  private getConsumerSessionKey(consumerId: string, sessionId: string) {
    return `${consumerId}:${sessionId}`
  }

  private publishRegistrationRejection(consumerId: string, sessionId: string, reason: string) {
    this.client.publish(
      `qvac/register-ack/${consumerId}`,
      JSON.stringify({
        runId: this.runId,
        status: 'rejected',
        sessionId,
        reason
      }),
      { qos: 1 }
    )
  }

  private isCurrentConsumerSession(consumerId: string, sessionId: string) {
    const current = this.consumers.get(consumerId)
    if (!current) {
      return false
    }
    return current.sessionId === sessionId
  }

  private handleTestStart(rawMessage: unknown) {
    const message = testStartSchema.parse(rawMessage)
    const { consumerId, sessionId, uniqueTestId, timestamp } = message
    if (!this.isCurrentConsumerSession(consumerId, sessionId)) {
      console.warn(`⚠️  Ignoring test start from stale consumer session: ${consumerId}`)
      return
    }
    const existing = this.runningTests.get(uniqueTestId)

    if (existing) {
      return
    }

    if (this.completedTests.has(uniqueTestId)) {
      return
    }

    const testCase = this.testQueue.find((test) => test.id === uniqueTestId)
    if (!testCase) {
      console.warn(`⚠️  Test start for unknown test: ${uniqueTestId}`)
      return
    }

    const consumer = this.consumers.get(consumerId)
    if (!consumer || consumerId !== this.queueConsumerId) {
      console.warn(`⚠️  Test start from unregistered consumer: ${consumerId}`)
      return
    }

    const startedAt = Date.now()
    const consumerStartedAt = Date.parse(timestamp)
    const timelineStartedAt = Number.isFinite(consumerStartedAt) ? consumerStartedAt : startedAt
    const timeoutMs = Math.max(testCase.estimatedDurationMs * 3, 180000)
    const assignment: RunningTest = {
      testCase,
      consumerId,
      sessionId,
      startedAt,
      timelineStartedAt,
      timeoutMs,
      originalTimeoutMs: timeoutMs
    }

    this.runningTests.set(uniqueTestId, assignment)
    this.testQueue = this.testQueue.filter((test) => test.id !== uniqueTestId)
    consumer.testsRunning++
    consumer.lastSeen = startedAt

    // Start is published before consumer setup, preserving memory attribution
    // for model loading and other setup work.
    this.appendTimeline({
      ts: timelineStartedAt,
      consumerId,
      sessionId,
      testId: testCase.testId,
      uniqueTestId,
      phase: 'start'
    })

    console.log(`▶️  Test ${testCase.testId} started by ${consumerId}`)
    this.displayStatus()

    const pendingReload = this.pendingTestReloads.get(uniqueTestId)
    if (pendingReload) {
      this.pendingTestReloads.delete(uniqueTestId)
      this.handleTestReload(pendingReload)
    }
    const pendingResult = this.pendingTestResults.get(uniqueTestId)
    if (pendingResult) {
      this.pendingTestResults.delete(uniqueTestId)
      this.handleTestResult(pendingResult)
    }
  }

  private handleTestReload(rawMessage: unknown) {
    const message = testReloadSchema.parse(rawMessage)
    const { consumerId, sessionId, uniqueTestId, testId, ts } = message

    if (!this.isCurrentConsumerSession(consumerId, sessionId)) {
      console.warn(`⚠️  Ignoring reload from stale consumer session: ${consumerId}`)
      return
    }

    const assignment = this.runningTests.get(uniqueTestId)

    if (!assignment) {
      if (this.completedTests.has(uniqueTestId)) {
        return
      }
      if (this.testQueue.some((test) => test.id === uniqueTestId)) {
        this.pendingTestReloads.set(uniqueTestId, message)
        return
      }
      console.warn(`⚠️  Reload boundary for unknown/timed-out test: ${uniqueTestId}`)
      return
    }

    if (!assignment.reloadRecorded) {
      assignment.reloadRecorded = true
      const elapsed = Date.now() - assignment.startedAt
      assignment.timeoutMs = elapsed + 2 * assignment.originalTimeoutMs

      this.appendTimeline({
        ts,
        consumerId,
        sessionId,
        testId,
        uniqueTestId,
        phase: 'reload'
      })
      const skewMs = Date.now() - ts
      console.log(
        `🔄 Test ${testId} reload boundary (${uniqueTestId}) from ${consumerId} (consumer skew: ${skewMs}ms)`
      )
    } else {
      console.log(`⚠️  Ignoring duplicate reload boundary for ${uniqueTestId} (QoS-1 redelivery)`)
    }
  }

  private handleTestResult(rawMessage: unknown) {
    const message = testResultSchema.parse(rawMessage)
    const { consumerId, sessionId, uniqueTestId, outcome, duration } = message
    if (!this.isCurrentConsumerSession(consumerId, sessionId)) {
      console.warn(`⚠️  Ignoring result from stale consumer session: ${consumerId}`)
      return
    }
    const assignment = this.runningTests.get(uniqueTestId)

    if (!assignment) {
      if (this.completedTests.has(uniqueTestId)) {
        const completed = this.completedTests.get(uniqueTestId)
        if (
          message.teardownFailed === true &&
          completed?.consumerId === consumerId &&
          completed.sessionId === sessionId
        ) {
          this.completedTests.set(uniqueTestId, message)
          console.error(
            `❌ Test ${message.testId} corrected to failure after teardown error - ${consumerId}`
          )
        }
        return
      }
      if (this.testQueue.some((test) => test.id === uniqueTestId)) {
        this.pendingTestResults.set(uniqueTestId, message)
        return
      }
      console.warn(`⚠️  Result for unknown test: ${uniqueTestId}`)
      return
    }

    // Update consumer stats
    const consumer = this.consumers.get(consumerId)
    if (consumer) {
      consumer.testsCompleted++
      consumer.testsRunning--
      consumer.lastSeen = Date.now()
    }

    if (message.retried && !assignment.reloadRecorded) {
      assignment.reloadRecorded = true
      const baseTs = assignment.timelineStartedAt
      const attempt1DurationMs =
        typeof message.attempt1DurationMs === 'number'
          ? Math.max(0, Math.floor(message.attempt1DurationMs))
          : 0
      const syntheticReloadTs =
        typeof message.reloadTimestamp === 'number'
          ? message.reloadTimestamp
          : baseTs + attempt1DurationMs
      this.appendTimeline({
        ts: syntheticReloadTs,
        consumerId,
        sessionId,
        testId: assignment.testCase.testId,
        uniqueTestId,
        phase: 'reload'
      })
      console.log(
        `⚠️  Synthetic reload boundary for ${assignment.testCase.testId} (results arrived before reload event)`
      )
    }

    // Store result
    this.completedTests.set(uniqueTestId, message)
    this.runningTests.delete(uniqueTestId)

    const consumerCompletedAt = Date.parse(message.timestamp)
    this.appendTimeline({
      ts: Number.isFinite(consumerCompletedAt) ? consumerCompletedAt : Date.now(),
      consumerId,
      sessionId,
      testId: assignment.testCase.testId,
      uniqueTestId,
      phase: 'end'
    })

    const statusIcon = outcome === 'skipped' ? '⏭️' : outcome === 'success' ? '✅' : '❌'
    console.log(
      `${statusIcon} Test ${assignment.testCase.testId} ${outcome} (${duration}ms) - ${consumerId}`
    )

    if (message.error) {
      // Show full error, but split long errors into multiple lines
      const errorLines = message.error.split('\n')
      if (errorLines.length > 5) {
        console.log(`   Error: ${errorLines.slice(0, 5).join('\n   ')}`)
        console.log(`   ... (${errorLines.length - 5} more lines)`)
      } else {
        console.log(`   Error: ${message.error}`)
      }
    }

    this.displayStatus()
    if (message.queueAborted) {
      this.abortQueue(`Consumer aborted after ${message.testId}: ${message.error ?? 'timeout'}`)
    } else {
      this.checkBatchComplete()
    }
  }

  private handleHeartbeat(rawMessage: unknown) {
    const message = heartbeatSchema.parse(rawMessage)
    const { consumerId, sessionId } = message
    if (!this.isCurrentConsumerSession(consumerId, sessionId)) {
      return
    }
    const consumer = this.consumers.get(consumerId)
    if (consumer) {
      consumer.lastSeen = Date.now()
      consumer.bootstrapped = message.bootstrapped
    }
  }

  private handleQueueReady(rawMessage: unknown) {
    const message = queueReadySchema.parse(rawMessage)
    const { consumerId, sessionId } = message
    if (!this.isCurrentConsumerSession(consumerId, sessionId)) {
      return
    }
    const consumer = this.consumers.get(consumerId)
    if (!consumer) {
      return
    }
    consumer.queueReady = true
    consumer.bootstrapped = true
    consumer.lastSeen = Date.now()
    this.checkBatchComplete()
  }

  private handleQueueComplete(rawMessage: unknown) {
    const message = queueCompleteSchema.parse(rawMessage)
    const { consumerId, sessionId } = message
    if (!this.isCurrentConsumerSession(consumerId, sessionId)) {
      return
    }
    const consumer = this.consumers.get(consumerId)
    if (!consumer) {
      return
    }
    consumer.queueComplete = true
    consumer.lastSeen = Date.now()
    this.checkBatchComplete()
  }

  private handleProfilingData(rawMessage: unknown) {
    const message = profilingDataSchema.parse(rawMessage)
    const { consumerId, sessionId, profilerExport } = message
    const consumer =
      this.consumers.get(consumerId) ?? this.disconnectedCompletionRecipients.get(consumerId)
    if (!consumer || consumer.sessionId !== sessionId) {
      console.log(
        `⚠️  Ignoring profiling from unknown consumer: ${consumerId.split('-').slice(1, 3).join('-')}`
      )
      return
    }

    const kind = message.kind ?? 'final'
    const existing = this.profilingData.get(consumerId)

    // Guards run BEFORE the .set() so a late checkpoint can never overwrite the
    // final snapshot: forceShutdown force-publishes a checkpoint (with a higher
    // sequence) after finalize already published final, and QoS-1 reconnects can
    // reorder delivery. lastSeen is still bumped below regardless of the guards.
    if (this.consumers.has(consumerId)) {
      consumer.lastSeen = Date.now()
    }

    // Never downgrade a final snapshot to a checkpoint.
    if (kind === 'checkpoint' && existing?.kind === 'final') {
      return
    }
    // Drop out-of-order checkpoints. Skipped when either sequence is undefined so
    // older publishers keep last-write-wins and never lose data.
    if (
      kind === 'checkpoint' &&
      existing &&
      message.sequence !== undefined &&
      existing.sequence !== undefined &&
      message.sequence <= existing.sequence
    ) {
      return
    }

    this.profilingData.set(consumerId, {
      profilerExport,
      kind,
      sequence: message.sequence,
      timestamp: message.timestamp,
      receivedAt: Date.now()
    })
    if (kind === 'final') {
      this.finalProfilingConsumers.add(consumerId)
      if (message.sequence !== undefined) {
        this.client.publish(
          `qvac/profiling-ack/${consumerId}`,
          JSON.stringify({
            runId: this.runId,
            consumerId,
            sessionId,
            sequence: message.sequence
          }),
          { qos: 1 }
        )
      }
    }

    const metricCount = getMetricCount(profilerExport)
    const metricLabel = metricCount !== undefined ? `${metricCount} metrics` : 'N/A'
    console.log(
      `📈 Received ${kind} profiling data from ${consumerId.split('-').slice(1, 3).join('-')} (${metricLabel})`
    )
  }

  private checkBatchComplete() {
    const queueEmpty = this.testQueue.length === 0
    const noRunningTests = this.runningTests.size === 0
    const queueOwnerReady =
      this.queueConsumerId !== undefined &&
      this.consumers.get(this.queueConsumerId)?.queueReady === true
    const queueOwnerComplete =
      this.queueConsumerId !== undefined &&
      this.consumers.get(this.queueConsumerId)?.queueComplete === true

    if (queueEmpty && noRunningTests && queueOwnerReady && queueOwnerComplete) {
      this.completeBatch()
    }
  }

  private getInterruptedTimelineEnd(assignment: RunningTest) {
    const latestSampleTs = this.latestMemorySampleTs.get(
      this.getConsumerSessionKey(assignment.consumerId, assignment.sessionId)
    )
    if (latestSampleTs !== undefined) {
      return Math.max(assignment.timelineStartedAt, latestSampleTs)
    }
    const producerElapsed = Math.max(0, Date.now() - assignment.startedAt)
    return assignment.timelineStartedAt + producerElapsed
  }

  private checkTimeouts() {
    const now = Date.now()
    const timeouts: string[] = []
    const queueOwner =
      this.queueConsumerId !== undefined ? this.consumers.get(this.queueConsumerId) : undefined

    if (
      queueOwner &&
      !queueOwner.queueReady &&
      now - queueOwner.registeredAt > this.bootstrapTimeoutMs
    ) {
      console.error(
        `\n⏱️  Consumer bootstrap timed out after ${Math.round(this.bootstrapTimeoutMs / 1000)}s: ${queueOwner.consumerId}`
      )
      this.fatalBatchFailure = true
      this.abortQueue(
        `Consumer bootstrap timed out after ${Math.round(this.bootstrapTimeoutMs / 1000)}s`
      )
      return
    }

    for (const [uniqueTestId, assignment] of this.runningTests) {
      const elapsed = now - assignment.startedAt
      if (elapsed > assignment.timeoutMs + TIMEOUT_GRACE_MS) {
        timeouts.push(uniqueTestId)
      }
    }

    if (timeouts.length > 0) {
      console.log(`\n⏱️  ${timeouts.length} test(s) timed out:`)
      for (const uniqueTestId of timeouts) {
        const assignment = this.runningTests.get(uniqueTestId)
        if (assignment) {
          console.log(`   - ${assignment.testCase.testId} (${assignment.consumerId})`)

          // Create timeout result
          const timeoutResult: TestResult = {
            runId: this.runId,
            consumerId: assignment.consumerId,
            sessionId: assignment.sessionId,
            testId: assignment.testCase.testId,
            uniqueTestId,
            outcome: 'failure',
            duration: Date.now() - assignment.startedAt,
            timestamp: new Date().toISOString(),
            error: `Test timed out after ${assignment.timeoutMs}ms`
          }

          this.completedTests.set(uniqueTestId, timeoutResult)
          this.runningTests.delete(uniqueTestId)
          this.appendTimeline({
            ts: this.getInterruptedTimelineEnd(assignment),
            consumerId: assignment.consumerId,
            sessionId: assignment.sessionId,
            testId: assignment.testCase.testId,
            uniqueTestId,
            phase: 'end',
            incomplete: true
          })

          // Update consumer stats
          const consumer = this.consumers.get(assignment.consumerId)
          if (consumer) {
            consumer.testsCompleted++
            consumer.testsRunning = Math.max(0, consumer.testsRunning - 1)
          }
        }
      }

      this.abortQueue(`Test timed out: ${timeouts.join(', ')}`)
    }

    // Check consumer liveness (heartbeat-based)
    const deadConsumers: string[] = []
    for (const [consumerId, consumer] of this.consumers) {
      const silent = now - consumer.lastSeen
      if (silent > this.consumerInactivityTimeoutMs) {
        deadConsumers.push(consumerId)
      }
    }

    for (const consumerId of deadConsumers) {
      const disconnectedConsumer = this.consumers.get(consumerId)
      const silent = now - (disconnectedConsumer?.lastSeen ?? 0)
      console.error(
        `\n💀 Consumer ${consumerId.split('-').slice(1, 3).join('-')} unresponsive for ${Math.round(silent / 1000)}s — marking as dead`
      )
      if (disconnectedConsumer) {
        // Preserve its persistent-session address so batch-complete is queued
        // by MQTT even when the consumer reconnects after the inactivity limit.
        this.disconnectedCompletionRecipients.set(consumerId, disconnectedConsumer)
      }

      for (const [uniqueTestId, assignment] of this.runningTests) {
        if (assignment.consumerId === consumerId) {
          const failResult: TestResult = {
            runId: this.runId,
            consumerId,
            sessionId: assignment.sessionId,
            testId: assignment.testCase.testId,
            uniqueTestId,
            outcome: 'failure',
            duration: Date.now() - assignment.startedAt,
            timestamp: new Date().toISOString(),
            error: `Consumer became unresponsive (no heartbeat for ${Math.round(silent / 1000)}s)`
          }
          this.completedTests.set(uniqueTestId, failResult)
          this.runningTests.delete(uniqueTestId)
          this.appendTimeline({
            ts: this.getInterruptedTimelineEnd(assignment),
            consumerId,
            sessionId: assignment.sessionId,
            testId: assignment.testCase.testId,
            uniqueTestId,
            phase: 'end',
            incomplete: true
          })
          if (disconnectedConsumer) {
            disconnectedConsumer.testsCompleted++
            disconnectedConsumer.testsRunning = Math.max(0, disconnectedConsumer.testsRunning - 1)
          }
        }
      }

      this.consumers.delete(consumerId)
    }

    if (deadConsumers.length > 0) {
      if (this.consumers.size === 0 && this.queueConsumerId) {
        console.error('\n❌ All consumers are dead. Terminating batch.')
        this.allConsumersDead = true

        // Fail all remaining queued tests
        while (this.testQueue.length > 0) {
          const testCase = this.testQueue.shift()!
          const uniqueTestId = testCase.id
          const failResult: TestResult = {
            runId: this.runId,
            consumerId: 'none',
            testId: testCase.testId,
            uniqueTestId,
            outcome: 'failure',
            duration: 0,
            timestamp: new Date().toISOString(),
            error: 'Consumer died before test could be executed'
          }
          this.completedTests.set(uniqueTestId, failResult)
        }

        this.completeBatch()
      } else {
        this.checkBatchComplete()
      }
    }
  }

  private abortQueue(reason: string) {
    if (this.queueAborted || this.batchCompleting) {
      return
    }
    this.queueAborted = true

    while (this.testQueue.length > 0) {
      const testCase = this.testQueue.shift()!
      const failResult: TestResult = {
        runId: this.runId,
        consumerId: 'none',
        testId: testCase.testId,
        uniqueTestId: testCase.id,
        outcome: 'failure',
        duration: 0,
        timestamp: new Date().toISOString(),
        error: `Queue aborted because an active test timed out: ${reason}`
      }
      this.completedTests.set(testCase.id, failResult)
    }

    if (this.queueConsumerId) {
      const consumer =
        this.consumers.get(this.queueConsumerId) ??
        this.disconnectedCompletionRecipients.get(this.queueConsumerId)
      if (consumer) {
        this.queueAbortSummary = {
          runId: this.runId,
          consumerId: consumer.consumerId,
          sessionId: consumer.sessionId,
          reason
        }
        this.publishQueueAbort(consumer)
      }
    }

    this.completeBatch()
  }

  private publishQueueAbort(consumer: ConsumerInfo) {
    const message = this.queueAbortSummary
    if (
      !message ||
      message.consumerId !== consumer.consumerId ||
      message.sessionId !== consumer.sessionId
    ) {
      return
    }
    this.client.publish(`qvac/queue-abort/${consumer.consumerId}`, JSON.stringify(message), {
      qos: 1
    })
  }

  private displayStatus() {
    const total = this.testQueue.length + this.runningTests.size + this.completedTests.size
    const completed = this.completedTests.size
    const running = this.runningTests.size
    const queued = this.testQueue.length
    const consumers = this.consumers.size
    const elapsed =
      this.startTime > 0 ? `${Math.round((Date.now() - this.startTime) / 1000)}s` : '0s'

    console.log(
      `\n📊 Status [${elapsed}]: ${completed}/${total} completed | ${running} running | ${queued} queued | ${consumers} consumers`
    )

    if (running > 0) {
      const now = Date.now()
      for (const assignment of this.runningTests.values()) {
        const waitSec = Math.round((now - assignment.startedAt) / 1000)
        const timeoutSec = Math.round(assignment.timeoutMs / 1000)
        console.log(
          `   ⏳ ${assignment.testCase.testId} → ${assignment.consumerId} (active, ${waitSec}s / ${timeoutSec}s)`
        )
      }
    }
    if (this.consumers.size > 0) {
      const consumerStates = Array.from(this.consumers.values())
        .map((c) => `${c.consumerId} <bootstrapped=${c.bootstrapped ?? false}>`)
        .join(', ')
      console.log(`   🫀 ${consumerStates}`)
    }
    console.log()
  }

  private completeBatch() {
    if (this.batchCompleting) return
    this.batchCompleting = true

    const duration = this.startTime > 0 ? Date.now() - this.startTime : 0
    const totalTests = this.completedTests.size
    const results = Array.from(this.completedTests.values())
    const successCount = results.filter((r) => r.outcome === 'success').length
    const skippedCount = results.filter((r) => r.outcome === 'skipped').length
    const failureCount = results.filter((r) => r.outcome === 'failure').length

    console.log(`\n${'='.repeat(80)}`)
    console.log('🎉 BATCH COMPLETE')
    console.log('='.repeat(80))
    console.log(`⏱️  Total Duration: ${(duration / 1000).toFixed(2)}s`)
    console.log(`📝 Total Tests: ${totalTests}`)
    console.log(`✅ Passed: ${successCount}`)
    console.log(`⏭️  Skipped: ${skippedCount}`)
    console.log(`❌ Failed: ${failureCount}`)
    console.log(
      `📈 Success Rate: ${((successCount / Math.max(totalTests - skippedCount, 1)) * 100).toFixed(1)}%`
    )
    console.log('\n👥 Consumer Stats:')

    const completionRecipients = this.getCompletionRecipients()
    for (const consumer of completionRecipients.values()) {
      console.log(
        `   - ${consumer.consumerId} (${consumer.platform}): ${consumer.testsCompleted} tests`
      )
    }

    console.log('\n📋 Test Results by Category:\n')
    this.displayResultsByCategory()
    this.displayResultsBySuite()

    console.log(`\n📨 Signaling ${completionRecipients.size} consumer(s) to complete...`)
    this.batchCompleteSummary = {
      runId: this.runId,
      status: 'complete',
      totalTests,
      successCount,
      failureCount,
      skippedCount,
      duration
    }
    for (const consumer of completionRecipients.values()) {
      this.publishBatchComplete(consumer)
    }

    // Disconnected recipients still receive batch-complete through their
    // persistent MQTT sessions, but they were already declared dead after the
    // heartbeat timeout and cannot be required to finish report generation.
    // Their latest checkpoint remains available as incomplete profiling data.
    this.waitForProfilingData(new Set(this.consumers.keys()))
  }

  private publishBatchComplete(consumer: ConsumerInfo, force = false) {
    if (!this.batchCompleteSummary) {
      return
    }
    const sessionKey = this.getConsumerSessionKey(consumer.consumerId, consumer.sessionId)
    if (!force && this.batchCompleteSentSessions.has(sessionKey)) {
      return
    }
    this.batchCompleteSentSessions.add(sessionKey)
    this.client.publish(
      `qvac/batch-complete/${consumer.consumerId}`,
      JSON.stringify({
        ...this.batchCompleteSummary,
        consumerId: consumer.consumerId,
        sessionId: consumer.sessionId
      }),
      { qos: 1 }
    )
  }

  private getCompletionRecipients() {
    const recipients = new Map(this.disconnectedCompletionRecipients)
    for (const [consumerId, consumer] of this.consumers) {
      recipients.set(consumerId, consumer)
    }
    return recipients
  }

  private waitForProfilingData(expectedIds: Set<string>) {
    if (expectedIds.size === 0) {
      return this.finishAfterProfiling(false, [])
    }

    const startTime = Date.now()
    const timer = setInterval(() => {
      const pending = [...expectedIds].filter(
        (id) => this.consumers.has(id) && !this.finalProfilingConsumers.has(id)
      )
      const timedOut = Date.now() - startTime >= this.profilingSafetyTimeoutMs

      if (pending.length === 0 || timedOut) {
        clearInterval(timer)
        this.finishAfterProfiling(timedOut, pending)
      }
    }, 100)
  }

  private finishAfterProfiling(timedOut: boolean, pendingIds: string[]) {
    if (timedOut && pendingIds.length > 0) {
      const pendingShort = pendingIds.map((id) => id.split('-').slice(1, 3).join('-'))
      console.log(
        `⚠️  Safety timeout: missing profiling from ${pendingIds.length} consumer(s): ${pendingShort.join(', ')}`
      )
    } else {
      const receivedCount = this.finalProfilingConsumers.size
      if (receivedCount > 0) {
        console.log(`✅ Received profiling data from all ${receivedCount} consumer(s)`)
      }
    }
    this.generateReports()
    this.scheduleShutdown()
  }

  private generateReports() {
    try {
      const profilingDataArray: ReportProfilingData[] = Array.from(
        this.profilingData.entries()
      ).map(([consumerId, snapshot]) => ({
        consumerId,
        profilerExport: snapshot.profilerExport,
        kind: snapshot.kind,
        sequence: snapshot.sequence,
        timestamp: snapshot.timestamp,
        receivedAt: snapshot.receivedAt,
        incomplete: snapshot.kind !== 'final'
      }))

      const completedTests = Array.from(this.completedTests.values()).map((result) => ({
        ...result,
        suites: this.testSuites.get(result.testId),
        category: this.testCategories.get(result.testId)
      }))

      let memorySummaries: MemorySummary[] = []
      let memNdjsonPath: string | undefined
      if (this.reportDir) {
        memNdjsonPath = this.appMemPath
        try {
          memorySummaries = aggregateMemory(this.reportDir)
        } catch (e) {
          console.warn(`⚠️  Failed to aggregate memory data: ${(e as Error).message}`)
        }
      }

      const reportData: ReportData = {
        runId: this.runId,
        completedTests,
        consumers: this.getCompletionRecipients(),
        duration: this.batchCompleteSummary?.duration ?? 0,
        profilingData: profilingDataArray.length > 0 ? profilingDataArray : undefined,
        memorySummaries: memorySummaries.length > 0 ? memorySummaries : undefined,
        reportDir: this.reportDir
      }

      const htmlPath = generateHtmlReport(reportData)
      const jsonPath = generateJsonReport(reportData)

      console.log(`\n📄 Reports generated:`)
      console.log(`   HTML: ${htmlPath}`)
      console.log(`   JSON: ${jsonPath}`)
      if (profilingDataArray.length > 0) {
        console.log(`📈 Profiling data included from ${profilingDataArray.length} consumer(s)`)
      }
      if (memorySummaries.length > 0) {
        const primary = memorySummaries[0]
        const peak =
          primary.unit === 'count'
            ? `${primary.peakSuite.memoryKb} ${primary.metric}`
            : `${(primary.peakSuite.memoryKb / 1024).toFixed(1)} MB`
        const series = memorySummaries.map((s) => `${s.metric} (${s.chart.length})`).join(', ')
        console.log(
          `📉 Memory: ${memorySummaries.length} series [${series}] — peak ${peak} — ${memNdjsonPath}`
        )
      } else if (memNdjsonPath) {
        // Diagnostic: explain why the memory tab is missing.
        let reason = 'no samples captured'
        try {
          if (!fs.existsSync(memNdjsonPath)) reason = `${memNdjsonPath} not found`
          else if (fs.statSync(memNdjsonPath).size === 0) reason = `${memNdjsonPath} is empty`
        } catch {}
        console.log(`📉 Memory: skipped (${reason})`)
      }
    } catch (error) {
      console.error('\n⚠️  Failed to generate reports:', error)
    }
  }

  private scheduleShutdown() {
    const exitCode = this.allConsumersDead || this.fatalBatchFailure ? 1 : 0
    this.shutdownTimer = setTimeout(() => {
      console.log('\n👋 Shutting down producer...\n')
      this.client.end(false, {}, () => process.exit(exitCode))
    }, 2000)
  }

  private displayResultsByCategory() {
    const categories = new Map<string, { passed: number; failed: number; skipped: number }>()

    for (const result of this.completedTests.values()) {
      // Prefer the test's declared metadata.category over deriving from
      // testId — splitting "wrong-model-..." would otherwise bucket it
      // as "wrong" instead of "wrong-model".
      const category =
        this.testCategories.get(result.testId) ??
        (result.testId.includes('-') ? result.testId.split('-')[0] : result.testId)

      if (!categories.has(category)) {
        categories.set(category, { passed: 0, failed: 0, skipped: 0 })
      }

      const stats = categories.get(category)!
      if (result.outcome === 'success') {
        stats.passed++
      } else if (result.outcome === 'skipped') {
        stats.skipped++
      } else {
        stats.failed++
      }
    }

    for (const [category, stats] of categories) {
      const total = stats.passed + stats.failed + stats.skipped
      const rate = ((stats.passed / Math.max(total - stats.skipped, 1)) * 100).toFixed(0)
      const skipStr = stats.skipped > 0 ? `, ${stats.skipped} skipped` : ''
      console.log(`   ${category.padEnd(20)} ${stats.passed}/${total} (${rate}%${skipStr})`)
    }
  }

  private displayResultsBySuite() {
    if (this.testSuites.size === 0) return

    const suites = new Map<string, { passed: number; failed: number; skipped: number }>()

    for (const [, result] of this.completedTests) {
      const testSuiteList = this.testSuites.get(result.testId)
      if (!testSuiteList) continue

      for (const suite of testSuiteList) {
        if (!suites.has(suite)) {
          suites.set(suite, { passed: 0, failed: 0, skipped: 0 })
        }
        const stats = suites.get(suite)!
        if (result.outcome === 'success') {
          stats.passed++
        } else if (result.outcome === 'skipped') {
          stats.skipped++
        } else {
          stats.failed++
        }
      }
    }

    if (suites.size === 0) return

    console.log('\n📋 Test Results by Suite:\n')
    for (const [suite, stats] of suites) {
      const total = stats.passed + stats.failed + stats.skipped
      const rate = ((stats.passed / Math.max(total - stats.skipped, 1)) * 100).toFixed(0)
      const skipStr = stats.skipped > 0 ? `, ${stats.skipped} skipped` : ''
      console.log(`   ${suite.padEnd(20)} ${stats.passed}/${total} (${rate}%${skipStr})`)
    }
  }

  public buildTestQueue(tests: TestDefinition[]) {
    console.log('🔨 Building test queue...\n')

    let counter = 0
    let skippedCount = 0

    for (const test of tests) {
      if (test.skip && !test.skip.platforms) {
        skippedCount++
        console.log(
          `⏭️  Skipping ${test.testId}: ${test.skip.reason}${test.skip.issue ? ` (${test.skip.issue})` : ''}`
        )

        // Record as skipped result so it appears in reports
        const skipId = `skip-${Date.now()}-${counter++}`
        this.completedTests.set(skipId, {
          runId: this.runId,
          consumerId: 'producer',
          testId: test.testId,
          uniqueTestId: skipId,
          outcome: 'skipped',
          duration: 0,
          timestamp: new Date().toISOString(),
          error: `${test.skip.reason}${test.skip.issue ? ` (${test.skip.issue})` : ''}`
        })
        if (typeof test.metadata?.category === 'string' && test.metadata.category.length > 0) {
          this.testCategories.set(test.testId, test.metadata.category)
        }
        continue
      }

      const testCase: TestCase = {
        id: `test-${Date.now()}-${counter++}`,
        testId: test.testId,
        metadata: test.metadata || {},
        suites: test.suites,
        estimatedDurationMs: test.metadata?.estimatedDurationMs || 10000
      }
      if (test.suites) {
        this.testSuites.set(test.testId, test.suites)
      }
      if (typeof test.metadata?.category === 'string' && test.metadata.category.length > 0) {
        this.testCategories.set(test.testId, test.metadata.category)
      }
      this.testQueue.push(testCase)
    }

    if (skippedCount > 0) {
      console.log(`\n⏭️  Skipped ${skippedCount} tests\n`)
    }

    // Group by category from metadata for reporting
    const byCategory = new Map<string, number>()
    for (const test of this.testQueue) {
      const category =
        (typeof test.metadata?.category === 'string' ? test.metadata.category : null) ||
        'uncategorized'
      byCategory.set(category, (byCategory.get(category) || 0) + 1)
    }

    this.initialTotalTests = this.testQueue.length + this.completedTests.size
    // Dedupe N-iteration tests; consumers only need each testId once.
    this.filteredTestIds = Array.from(new Set(this.testQueue.map((t) => t.testId)))

    console.log(`📦 Built ${this.testQueue.length} tests:`)
    for (const [category, count] of byCategory) {
      console.log(`   - ${category}: ${count} tests`)
    }
    console.log()
  }

  public start() {
    if (this.batchStarted) {
      console.warn('⚠️  Batch already started')
      return
    }

    this.batchStarted = true
    this.startTime = Date.now()

    console.log('🚀 Batch orchestration started')
    console.log(`📋 Total tests: ${this.testQueue.length}`)
    console.log(`⏳ Waiting for consumers to register (timeout: ${this.consumerTimeoutSec}s)...\n`)

    // Start consumer connection timeout
    this.consumerTimeoutTimer = setTimeout(() => {
      if (this.consumers.size === 0) {
        console.error(`\n❌ No consumers connected within ${this.consumerTimeoutSec}s timeout`)
        console.error('   Make sure the consumer is running with the same --runId')
        this.client.end(false, {}, () => process.exit(1))
      }
    }, this.consumerTimeoutSec * 1000)

    // Start timeout checker (every 10 seconds)
    setInterval(() => this.checkTimeouts(), TIMEOUT_CHECK_INTERVAL_MS)

    // Display status every 30 seconds
    setInterval(() => {
      if (this.runningTests.size > 0 || this.testQueue.length > 0) {
        this.displayStatus()
      }
    }, 30000)
  }

  public shutdown() {
    console.log('\n⚠️  Shutting down...')
    this.client.end(false, {}, () => process.exit(0))
  }
}

// Export for use as library
// Main execution removed - will be handled by CLI
