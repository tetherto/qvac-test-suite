import type { MqttClient } from 'mqtt'
import type { TestDefinition } from '../types/test-definition.js'
import {
  batchCompleteSchema,
  profilingAckSchema,
  queueAbortSchema,
  registerAckSchema,
  type BatchComplete,
  type ProfilingData,
  type ProfilerExport,
  type QueueAbort,
  type RegisterAck,
  type TestQueueItem,
  type TestReload,
  type TestResult as MqttTestResult,
  type TestStart
} from '../schemas/messages.js'

export interface TestResult {
  passed: boolean
  output: string
  skipped?: boolean
}

export interface TestExecutor {
  setup?(testId: string, context: unknown): Promise<void>
  executeTest(
    testId: string,
    context: unknown,
    params: unknown,
    expectation: unknown
  ): Promise<TestResult>
  teardown?(testId: string, context: unknown): Promise<void>
  /**
   * Called between the first failed attempt and the retry when `retryOnFailure` is true.
   * Should fully unload model resources and re-run setup for a clean retry state.
   */
  reload?(testId: string, context: unknown): Promise<void>
  getProfilingData?(): ProfilerExport | undefined
  initProfiling?(): void
}

export interface ConsumerCallbacks {
  log: (message: string) => void
  updateStats?: (update: {
    testsCompleted?: number
    testsPassed?: number
    testsFailed?: number
    testsSkipped?: number
    totalTests?: number
    currentTest?: string
    isComplete?: boolean
  }) => void
  /**
   * Runs once after register-ack. `filteredTests` is the producer queue
   * resolved against local `testDefinitions`, excluding definitions skipped
   * on this platform. It is undefined when the consumer has no local
   * definitions.
   */
  onBootstrap?: (filteredTests?: TestDefinition[]) => Promise<void>
  onShutdown?: () => void | Promise<void>
}

const DEFAULT_TEARDOWN_TIMEOUT_MS = 120000
const DEFAULT_PROFILING_CHECKPOINT_INTERVAL_MS = 5000
const DEFAULT_PROFILING_ACK_TIMEOUT_MS = 30000
const DEFAULT_INTER_TEST_DELAY_MS = 100

type ProfilingPublishKind = 'checkpoint' | 'final'

interface LifecycleJournalEntry {
  start?: TestStart
  reload?: TestReload
  result?: MqttTestResult
}

interface PendingFinalProfiling {
  message: ProfilingData
  published: boolean
  acknowledged: boolean
  resolve: () => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

function readProfilingCheckpointIntervalMs(): number {
  const raw =
    typeof process !== 'undefined'
      ? (process.env?.EXPO_PUBLIC_QVAC_PROFILING_CHECKPOINT_INTERVAL_MS ??
        process.env?.QVAC_PROFILING_CHECKPOINT_INTERVAL_MS)
      : undefined
  const parsed = Number.parseInt(raw ?? String(DEFAULT_PROFILING_CHECKPOINT_INTERVAL_MS), 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_PROFILING_CHECKPOINT_INTERVAL_MS
}

function readProfilingAckTimeoutMs() {
  const raw =
    typeof process !== 'undefined'
      ? (process.env?.EXPO_PUBLIC_QVAC_PROFILING_ACK_TIMEOUT_MS ??
        process.env?.QVAC_PROFILING_ACK_TIMEOUT_MS)
      : undefined
  const parsed = Number.parseInt(raw ?? String(DEFAULT_PROFILING_ACK_TIMEOUT_MS), 10)
  return Number.isFinite(parsed) ? Math.max(1, parsed) : DEFAULT_PROFILING_ACK_TIMEOUT_MS
}

function readInterTestDelayMs() {
  const raw =
    typeof process !== 'undefined'
      ? (process.env?.EXPO_PUBLIC_QVAC_INTER_TEST_DELAY_MS ?? process.env?.QVAC_INTER_TEST_DELAY_MS)
      : undefined
  const parsed = Number.parseInt(raw ?? String(DEFAULT_INTER_TEST_DELAY_MS), 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_INTER_TEST_DELAY_MS
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

export class ConsumerBase {
  protected client: MqttClient
  protected consumerId: string
  protected platform: string
  protected runId: string
  protected isWildcard: boolean
  protected executor: TestExecutor
  protected testDefinitions: Map<string, TestDefinition>
  protected registered = false
  protected bootstrapped = false
  protected totalTests = 0
  protected testsCompleted = 0
  protected testsPassed = 0
  protected testsFailed = 0
  protected testsSkipped = 0
  protected testsRetried = 0
  protected testsRetriedPassed = 0
  protected isProcessingTest = false
  protected shutdownRequested = false
  protected callbacks: ConsumerCallbacks
  private messageQueue: Promise<void> = Promise.resolve()
  private pendingBatchComplete?: BatchComplete
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private registrationRetryTimer?: ReturnType<typeof setInterval>
  private sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  private queueExecutionStarted = false
  private queueExecutionSettled = false
  private completedQueueItems = new Set<string>()
  private lifecycleJournal = new Map<string, LifecycleJournalEntry>()
  private batchCompleteHandled = false
  private queueAbortHandled = false
  private profilingCheckpointTimer?: ReturnType<typeof setInterval>
  private profilingCheckpointIntervalMs = readProfilingCheckpointIntervalMs()
  private profilingAckTimeoutMs = readProfilingAckTimeoutMs()
  private interTestDelayMs = readInterTestDelayMs()
  private profilingPublishInFlight = false
  private profilingSequence = 0
  private pendingFinalProfiling?: PendingFinalProfiling
  private finalProfilingPublished = false
  // Guards forceShutdown() so its body runs at most once (double-Ctrl-C,
  // overlapping signal + React unmount).
  private forceShutdownStarted = false
  // Guards shutdown() so onShutdown/client teardown run at most once. On
  // mobile process.exit is a no-op, so finalize() -> shutdown() followed by a
  // React unmount -> forceShutdown() -> shutdown() would otherwise fire
  // onShutdown twice.
  private shutdownStarted = false
  protected teardownTimeoutMs = DEFAULT_TEARDOWN_TIMEOUT_MS

  constructor(
    client: MqttClient,
    consumerId: string,
    platform: string,
    runId: string,
    executor: TestExecutor,
    callbacks: ConsumerCallbacks,
    testDefinitions?: TestDefinition[]
  ) {
    this.client = client
    this.consumerId = consumerId
    this.platform = platform
    this.runId = runId
    this.isWildcard = runId === '*'
    this.executor = executor
    this.callbacks = callbacks
    this.testDefinitions = new Map()
    if (testDefinitions) {
      for (const def of testDefinitions) {
        this.testDefinitions.set(def.testId, def)
      }
    }
  }

  protected log(message: string) {
    this.callbacks.log(message)
  }

  public getSessionId() {
    return this.sessionId
  }

  protected updateStats(update: {
    testsCompleted?: number
    testsPassed?: number
    testsFailed?: number
    testsSkipped?: number
    totalTests?: number
    currentTest?: string
    isComplete?: boolean
  }) {
    if (this.callbacks.updateStats) {
      this.callbacks.updateStats(update)
    }
  }

  protected async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new TimeoutError(message)), timeoutMs)
        })
      ])
    } finally {
      if (timer) {
        clearTimeout(timer)
      }
    }
  }

  public setupMqttHandlers() {
    this.client.on('connect', () => {
      if (this.registered) {
        this.log('✅ Reconnected to MQTT broker')
      } else {
        this.log('✅ Connected to MQTT broker')
        this.log(`🔑 Run ID: ${this.runId}${this.isWildcard ? ' (wildcard mode)' : ''}`)
      }

      // Re-subscribe and re-register on every connection. This is required
      // when the broker loses persistent session state during an outage.
      this.client.subscribe(
        [
          `qvac/register-ack/${this.consumerId}`,
          `qvac/batch-complete/${this.consumerId}`,
          `qvac/queue-abort/${this.consumerId}`,
          `qvac/profiling-ack/${this.consumerId}`
        ],
        { qos: 1 },
        (err) => {
          if (err) {
            this.log(`❌ Failed to subscribe: ${err.message}`)
            return
          }
          this.log('📡 Subscribed to topics\n')

          // Bootstrap is deferred until the producer provides the queue.

          // Register with producer (with retry)
          this.sendRegistration()

          if (this.registrationRetryTimer) {
            clearInterval(this.registrationRetryTimer)
          }
          this.registrationRetryTimer = setInterval(() => {
            if (!this.registered) {
              this.log(`🔄 Re-sending registration...`)
              this.sendRegistration()
            } else {
              if (this.registrationRetryTimer) {
                clearInterval(this.registrationRetryTimer)
                this.registrationRetryTimer = undefined
              }
            }
          }, 3000)
        }
      )
    })

    this.client.on('message', (topic, payload) => {
      if (topic === `qvac/register-ack/${this.consumerId}` && this.pendingFinalProfiling) {
        try {
          const parsed = registerAckSchema.safeParse(JSON.parse(payload.toString()))
          if (
            parsed.success &&
            parsed.data.status === 'registered' &&
            parsed.data.sessionId === this.sessionId &&
            (this.isWildcard || parsed.data.runId === this.runId)
          ) {
            this.replayFinalProfiling()
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          this.log(`❌ Error handling ${topic}: ${errorMessage}`)
        }
        return
      }

      if (topic === `qvac/profiling-ack/${this.consumerId}`) {
        try {
          const message = JSON.parse(payload.toString())
          if (this.isWildcard || message.runId === this.runId) {
            this.handleProfilingAck(message)
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          this.log(`❌ Error handling ${topic}: ${errorMessage}`)
        }
        return
      }

      this.messageQueue = this.messageQueue.then(async () => {
        try {
          const message = JSON.parse(payload.toString())

          if (!this.isWildcard && message.runId !== this.runId) {
            return
          }

          if (topic === `qvac/register-ack/${this.consumerId}`) {
            await this.handleRegistrationAck(message)
          } else if (topic === `qvac/batch-complete/${this.consumerId}`) {
            await this.handleBatchComplete(message)
          } else if (topic === `qvac/queue-abort/${this.consumerId}`) {
            await this.handleQueueAbort(message)
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          this.log(`❌ Error handling ${topic}: ${errorMessage}`)
        }
      })
    })

    this.client.on('reconnect', () => {
      this.log('🔄 Reconnecting to MQTT broker...')
    })

    this.client.on('offline', () => {
      this.log('📴 Consumer offline')
    })

    this.client.on('close', () => {
      this.log('🔌 MQTT connection closed')
    })

    this.client.on('error', (err) => {
      this.log(`❌ MQTT error: ${err.message}`)
    })
  }

  protected sendRegistration() {
    this.client.publish(
      'qvac/register',
      JSON.stringify({
        runId: this.runId,
        consumerId: this.consumerId,
        sessionId: this.sessionId,
        platform: this.platform,
        timestamp: new Date().toISOString(),
        capabilities: ['queue-complete-v1']
      }),
      { qos: 1 }
    )
  }

  protected async handleRegistrationAck(rawMessage: unknown) {
    const parsed = registerAckSchema.safeParse(rawMessage)
    if (!parsed.success) {
      this.log(`⚠️  Invalid register-ack payload: ${parsed.error.message}`)
      return
    }
    const message: RegisterAck = parsed.data

    if (message.sessionId !== this.sessionId) {
      this.log(`⚠️  Ignoring register-ack for a different consumer session`)
      return
    }

    if (message.status === 'rejected') {
      this.log(`❌ Registration rejected: ${message.reason}`)
      this.shutdownRequested = true
      await this.shutdown()
      return
    }

    this.totalTests = Math.max(this.totalTests, message.totalTests)

    // Re-acks request an idempotent lifecycle replay after reconnect.
    if (this.registered) {
      this.publishQueueReady()
      this.replayLifecycle(message.queue)
      this.replayFinalProfiling()
      if (this.queueExecutionSettled) {
        this.publishQueueComplete()
      }
      return
    }

    this.registered = true
    if (this.registrationRetryTimer) {
      clearInterval(this.registrationRetryTimer)
      this.registrationRetryTimer = undefined
    }
    this.log(`🔌 Registration ack - ${this.totalTests} tests in queue\n`)
    this.updateStats({ totalTests: this.totalTests })
    this.startHeartbeat()

    if (this.callbacks.onBootstrap && !this.bootstrapped) {
      // Resolve the producer queue against local definitions. Bootstrap only
      // the dependencies required by this run and platform.
      let filteredTests: TestDefinition[] | undefined
      if (this.testDefinitions.size > 0) {
        filteredTests = []
        let unresolvedCount = 0
        let platformSkippedCount = 0
        const seenTestIds = new Set<string>()
        for (const { testId } of message.queue) {
          if (seenTestIds.has(testId)) {
            continue
          }
          seenTestIds.add(testId)
          const def = this.testDefinitions.get(testId)
          if (!def) {
            unresolvedCount++
            continue
          }
          if (def.skip?.platforms?.includes(this.platform)) {
            platformSkippedCount++
            continue
          }
          filteredTests.push(def)
        }
        if (unresolvedCount > 0) {
          this.log(
            `⚠️  Producer queued ${message.queue.length} test(s); ${unresolvedCount} test definition(s) don't resolve locally`
          )
        }
        if (platformSkippedCount > 0) {
          this.log(
            `⏭️  Dropping bootstrap deps for ${platformSkippedCount} test(s) marked as skipped on platform '${this.platform}'`
          )
        }
      }

      this.log('🔧 Running bootstrap...')
      const start = Date.now()
      try {
        await this.callbacks.onBootstrap(filteredTests)
        this.bootstrapped = true
        this.log(`🔧 Bootstrap completed in ${Date.now() - start}ms\n`)
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.log(`❌ Bootstrap failed: ${errorMsg}`)
        this.shutdown()
        return
      }
    } else {
      this.bootstrapped = true
    }

    this.startProfilingCheckpoints()
    this.publishQueueReady()
    void this.executeQueue(message.queue).catch(async (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.log(`❌ Queue execution failed: ${errorMessage}`)
      this.shutdownRequested = true
      await this.finalize()
    })
  }

  private async executeQueue(queue: TestQueueItem[]) {
    if (this.queueExecutionStarted) {
      return
    }
    this.queueExecutionStarted = true

    if (queue.length > 0 && !this.shutdownRequested) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }

    for (const item of queue) {
      if (this.shutdownRequested) {
        break
      }
      if (this.completedQueueItems.has(item.uniqueTestId)) {
        continue
      }

      const definition = this.testDefinitions.get(item.testId)
      if (!definition) {
        this.log(`❌ No local test definition for: ${item.testId}`)
        this.publishTestStart(item.uniqueTestId)
        this.publishTestResult({
          runId: this.runId,
          consumerId: this.consumerId,
          sessionId: this.sessionId,
          testId: item.testId,
          uniqueTestId: item.uniqueTestId,
          outcome: 'failure',
          duration: 0,
          timestamp: new Date().toISOString(),
          error: `No local test definition for: ${item.testId}`
        })
        this.testsCompleted++
        this.testsFailed++
        this.completedQueueItems.add(item.uniqueTestId)
        this.updateStats({
          testsCompleted: this.testsCompleted,
          testsFailed: this.testsFailed,
          currentTest: ''
        })
        await this.waitBeforeNextTest()
        continue
      }

      await this.executeTest(item.uniqueTestId, definition)
      this.completedQueueItems.add(item.uniqueTestId)
      await this.waitBeforeNextTest()
    }

    if (!this.shutdownRequested) {
      this.queueExecutionSettled = true
      this.publishQueueComplete()
      if (this.pendingBatchComplete) {
        const pendingBatchComplete = this.pendingBatchComplete
        this.pendingBatchComplete = undefined
        await this.handleBatchComplete(pendingBatchComplete)
      }
      this.log('📭 Local test queue complete - waiting for batch-complete')
    }
  }

  private async waitBeforeNextTest() {
    if (this.shutdownRequested || this.interTestDelayMs <= 0) {
      return
    }
    await new Promise<void>((resolve) => setTimeout(resolve, this.interTestDelayMs))
  }

  protected async handleBatchComplete(rawMessage: unknown) {
    const parsed = batchCompleteSchema.safeParse(rawMessage)
    if (!parsed.success) {
      this.log(`⚠️  Invalid batch-complete payload: ${parsed.error.message}`)
      return
    }
    const message: BatchComplete = parsed.data
    if (message.consumerId !== this.consumerId || message.sessionId !== this.sessionId) {
      this.log(`⚠️  Ignoring batch-complete for a different consumer session`)
      return
    }
    if (!this.registered) {
      this.pendingBatchComplete = message
      return
    }
    if (!this.queueExecutionSettled) {
      this.pendingBatchComplete = message
      return
    }
    if (this.batchCompleteHandled) {
      return
    }
    this.batchCompleteHandled = true

    this.log('\n🎉 Batch complete!')
    this.log(`📊 Total: ${message.totalTests || 0}`)
    this.log(`✅ Passed: ${message.successCount || 0}`)
    this.log(`❌ Failed: ${message.failureCount || 0}`)
    if (this.testsRetried > 0) {
      const retriedPassedCount = this.testsRetriedPassed
      const retriedFailedCount = this.testsRetried - this.testsRetriedPassed
      const parts: string[] = []
      if (retriedPassedCount > 0) parts.push(`✅ passed: ${retriedPassedCount}`)
      if (retriedFailedCount > 0) parts.push(`❌ failed: ${retriedFailedCount}`)
      this.log(`🔄 Retried: ${this.testsRetried} (${parts.join(', ')})`)
    }
    this.log(`⏱️  Duration: ${((message.duration || 0) / 1000).toFixed(2)}s`)

    this.shutdownRequested = true
    this.updateStats({ isComplete: true })

    if (this.isProcessingTest) {
      this.log('⏳ Waiting for in-progress test to complete before finalizing...')
      return
    }

    await this.finalize()
  }

  private async handleQueueAbort(rawMessage: unknown) {
    const parsed = queueAbortSchema.safeParse(rawMessage)
    if (!parsed.success) {
      this.log(`⚠️  Invalid queue-abort payload: ${parsed.error.message}`)
      return
    }
    const message: QueueAbort = parsed.data
    if (
      message.consumerId !== this.consumerId ||
      message.sessionId !== this.sessionId ||
      this.queueAbortHandled
    ) {
      return
    }
    this.queueAbortHandled = true
    this.shutdownRequested = true
    this.log(`❌ Queue aborted by producer: ${message.reason}`)
    await this.finalize()
  }

  protected async finalize() {
    if (this.finalProfilingPublished) {
      await this.shutdown()
      return
    }

    this.finalProfilingPublished = true
    this.stopProfilingCheckpoints()

    try {
      const profilingData = this.executor.getProfilingData?.()
      const exportData: ProfilerExport = profilingData ?? {
        config: {
          enabled: false,
          mode: 'summary',
          includeServerBreakdown: false,
          operationFilters: [],
          maxRecentEvents: 0
        },
        aggregates: {},
        exportedAt: Date.now()
      }
      await this.publishProfilingData(exportData, 'final')
    } catch (e) {
      this.log(`⚠️  Failed to publish profiling data: ${e}`)
    }

    this.shutdown()
  }

  protected getTestSkipReason(definition: TestDefinition): string | null {
    if (definition.skip?.platforms?.includes(this.platform)) {
      return definition.skip.reason
    }
    return null
  }

  private publishTestStart(uniqueTestId: string) {
    const message: TestStart = {
      runId: this.runId,
      consumerId: this.consumerId,
      sessionId: this.sessionId,
      uniqueTestId,
      timestamp: new Date().toISOString()
    }
    const entry = this.lifecycleJournal.get(uniqueTestId) ?? {}
    entry.start = message
    this.lifecycleJournal.set(uniqueTestId, entry)
    this.client.publish('qvac/test-start', JSON.stringify(message), { qos: 1 })
  }

  private publishTestReload(message: TestReload) {
    const entry = this.lifecycleJournal.get(message.uniqueTestId) ?? {}
    entry.reload = message
    this.lifecycleJournal.set(message.uniqueTestId, entry)
    this.client.publish('qvac/test-reload', JSON.stringify(message), { qos: 1 })
  }

  private publishTestResult(message: MqttTestResult) {
    const entry = this.lifecycleJournal.get(message.uniqueTestId) ?? {}
    entry.result = message
    this.lifecycleJournal.set(message.uniqueTestId, entry)
    this.client.publish('qvac/results', JSON.stringify(message), { qos: 1 })
  }

  private publishQueueReady() {
    this.client.publish(
      'qvac/queue-ready',
      JSON.stringify({
        runId: this.runId,
        consumerId: this.consumerId,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString()
      }),
      { qos: 1 }
    )
  }

  private publishQueueComplete() {
    this.client.publish(
      'qvac/queue-complete',
      JSON.stringify({
        runId: this.runId,
        consumerId: this.consumerId,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString()
      }),
      { qos: 1 }
    )
  }

  private replayLifecycle(queue: TestQueueItem[]) {
    for (const { uniqueTestId } of queue) {
      const entry = this.lifecycleJournal.get(uniqueTestId)
      if (!entry) {
        continue
      }
      if (entry.start) {
        this.client.publish('qvac/test-start', JSON.stringify(entry.start), { qos: 1 })
      }
      if (entry.reload) {
        this.client.publish('qvac/test-reload', JSON.stringify(entry.reload), { qos: 1 })
      }
      if (entry.result) {
        this.client.publish('qvac/results', JSON.stringify(entry.result), { qos: 1 })
      }
    }
  }

  protected async executeTest(uniqueTestId: string, definition: TestDefinition) {
    this.isProcessingTest = true
    const { testId, params, expectation } = definition
    let skipTeardown = false

    const progress = this.totalTests > 0 ? `[${this.testsCompleted + 1}/${this.totalTests}]` : ''
    this.log(`▶️  ${progress} ${testId}`)
    this.updateStats({ currentTest: testId })
    // Publish before setup so producer timeouts and memory attribution include
    // model loading and any other setup work.
    this.publishTestStart(uniqueTestId)

    // Check for conditional platform-based skip
    const skipReason = this.getTestSkipReason(definition)
    if (skipReason) {
      this.log(`⏭️  ${testId}: ${skipReason}`)
      this.testsCompleted++
      this.testsSkipped++
      this.updateStats({ testsCompleted: this.testsCompleted, testsSkipped: this.testsSkipped })
      this.publishTestResult({
        runId: this.runId,
        consumerId: this.consumerId,
        sessionId: this.sessionId,
        testId,
        uniqueTestId,
        outcome: 'skipped',
        duration: 0,
        timestamp: new Date().toISOString(),
        error: skipReason
      })
      this.isProcessingTest = false
      if (this.shutdownRequested) {
        await this.finalize()
      }
      return
    }

    const context = definition.metadata || {}

    // Setup is part of the producer-observed test window.
    if (this.executor.setup) {
      try {
        const setupStart = Date.now()
        await this.executor.setup(testId, context)
        const setupDuration = Date.now() - setupStart
        if (setupDuration > 1000) {
          this.log(`   Setup: ${setupDuration}ms`)
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Setup failed'
        this.log(`❌ ${testId} setup failed: ${errorMsg}`)
        this.testsCompleted++
        this.testsFailed++
        this.updateStats({ testsCompleted: this.testsCompleted, testsFailed: this.testsFailed })
        this.publishTestResult({
          runId: this.runId,
          consumerId: this.consumerId,
          sessionId: this.sessionId,
          testId,
          uniqueTestId,
          outcome: 'failure',
          duration: 0,
          timestamp: new Date().toISOString(),
          error: `Setup failed: ${errorMsg}`
        })
        this.isProcessingTest = false
        if (this.shutdownRequested) {
          await this.finalize()
        }
        return
      }
    }

    const startTime = Date.now()
    let publishedOutcome: MqttTestResult['outcome'] | undefined
    const stopConsumerAfterTimeout = (message: string) => {
      skipTeardown = true
      this.shutdownRequested = true
      this.log(message)
    }

    try {
      const metadata = definition.metadata || {}
      const estimatedMs =
        typeof metadata.estimatedDurationMs === 'number' ? metadata.estimatedDurationMs : 0
      const timeoutMs = Math.max(estimatedMs * 2, 120000)
      // A first-attempt timeout on a retry test becomes a failed result so it
      // hits the reload+retry path. Other throws keep the original fail-fast.
      let result: TestResult
      try {
        result = await this.runWithTimeout(
          this.executor.executeTest(testId, context, params, expectation),
          timeoutMs,
          `Test timeout after ${timeoutMs / 1000}s`
        )
      } catch (attemptError: unknown) {
        if (attemptError instanceof TimeoutError && definition.retryOnFailure === true) {
          result = { passed: false, output: attemptError.message }
        } else {
          throw attemptError
        }
      }

      let retried = false
      let retryPassed: boolean | undefined
      let retryOutput: string | undefined
      let attempt1DurationMs: number | undefined
      let reloadTimestamp: number | undefined

      if (!result.passed && !result.skipped && definition.retryOnFailure === true) {
        retried = true
        this.log(`   ❌ attempt 1:`)
        if (result.output) {
          result.output.split('\n').forEach((line) => this.log(`      ${line}`))
        }
        this.log(`   ┄┄ reload + retry ┄┄`)

        reloadTimestamp = Date.now()
        attempt1DurationMs = reloadTimestamp - startTime
        this.publishTestReload({
          runId: this.runId,
          consumerId: this.consumerId,
          sessionId: this.sessionId,
          uniqueTestId,
          testId,
          ts: reloadTimestamp
        })

        if (this.executor.reload) {
          try {
            const reloadStart = Date.now()
            await this.runWithTimeout(
              this.executor.reload(testId, context),
              timeoutMs,
              `Reload timeout after ${timeoutMs / 1000}s`
            )
            this.log(`   reload: ${Date.now() - reloadStart}ms`)
          } catch (reloadError: unknown) {
            const msg = reloadError instanceof Error ? reloadError.message : String(reloadError)
            if (reloadError instanceof TimeoutError) {
              stopConsumerAfterTimeout(`   ⚠️  consumer will stop after reload timeout`)
            }
            this.log(`   ⚠️  reload failed: ${msg}`)
            retryPassed = false
            retryOutput = `reload failed: ${msg}`
          }
        }

        if (retryOutput === undefined) {
          try {
            const retryResult = await this.runWithTimeout(
              this.executor.executeTest(testId, context, params, expectation),
              timeoutMs,
              `Retry timeout after ${timeoutMs / 1000}s`
            )
            retryPassed = retryResult.passed
            retryOutput = retryResult.output
            if (retryResult.passed) {
              this.log(`   ✅ attempt 2: PASSED`)
            } else {
              this.log(`   ❌ attempt 2: FAILED`)
              retryResult.output?.split('\n').forEach((line) => this.log(`      ${line}`))
            }
          } catch (retryErr: unknown) {
            retryPassed = false
            retryOutput = `retry threw: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`
            this.log(`   ❌ attempt 2 threw: ${retryOutput}`)
            if (retryErr instanceof TimeoutError) {
              stopConsumerAfterTimeout(`   ⚠️  consumer will stop after retry timeout`)
            }
          }
        }

        this.testsRetried++
        if (retryPassed) this.testsRetriedPassed++
      }

      const duration = Date.now() - startTime
      const outcome = result.skipped ? 'skipped' : result.passed ? 'success' : 'failure'

      if (result.skipped) {
        this.log(`⏭️  ${testId}: ${result.output}`)
      } else if (retried) {
        const verdict = retryPassed ? '✅ passed' : '❌ failed'
        this.log(`⚠️  ${testId} (${duration}ms) [retry:${verdict}]`)
      } else {
        this.log(`${outcome === 'success' ? '✅' : '❌'} ${testId} (${duration}ms)`)
        if (!result.passed && result.output) {
          const outputLines = result.output.split('\n')
          if (outputLines.length > 1) {
            outputLines.forEach((line) => this.log(`   ${line}`))
          } else {
            this.log(`   ${result.output}`)
          }
        }
      }

      // Update stats
      this.testsCompleted++
      if (result.skipped) {
        this.testsSkipped++
      } else if (outcome === 'success') {
        this.testsPassed++
      } else {
        this.testsFailed++
      }

      this.updateStats({
        testsCompleted: this.testsCompleted,
        testsPassed: this.testsPassed,
        testsFailed: this.testsFailed,
        testsSkipped: this.testsSkipped
      })

      // Send result to producer
      publishedOutcome = outcome
      this.publishTestResult({
        runId: this.runId,
        consumerId: this.consumerId,
        sessionId: this.sessionId,
        testId,
        uniqueTestId,
        outcome,
        duration: result.skipped ? 0 : duration,
        timestamp: new Date().toISOString(),
        error: result.skipped ? result.output : result.passed ? undefined : result.output,
        ...(retried && {
          retried: true,
          retryPassed,
          retryOutput,
          attempt1DurationMs,
          reloadTimestamp
        })
      })
    } catch (error: unknown) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'

      this.log(`❌ ${testId} failed: ${errorMsg}`)

      // Update stats
      this.testsCompleted++
      this.testsFailed++
      this.updateStats({
        testsCompleted: this.testsCompleted,
        testsFailed: this.testsFailed
      })

      // Send failure result
      publishedOutcome = 'failure'
      this.publishTestResult({
        runId: this.runId,
        consumerId: this.consumerId,
        sessionId: this.sessionId,
        testId,
        uniqueTestId,
        outcome: 'failure',
        duration,
        timestamp: new Date().toISOString(),
        error: errorMsg
      })
    } finally {
      let teardownError: string | undefined
      if (!skipTeardown) {
        teardownError = await this.runTeardown(testId, context)
      }

      if (teardownError) {
        if (publishedOutcome === 'success') {
          this.testsPassed = Math.max(0, this.testsPassed - 1)
          this.testsFailed++
          this.updateStats({
            testsPassed: this.testsPassed,
            testsFailed: this.testsFailed
          })
        }
        this.publishTestResult({
          runId: this.runId,
          consumerId: this.consumerId,
          sessionId: this.sessionId,
          testId,
          uniqueTestId,
          outcome: 'failure',
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          error: `Teardown failed: ${teardownError}`,
          teardownFailed: true
        })
      }

      this.isProcessingTest = false

      if (this.shutdownRequested) {
        await this.finalize()
      }
    }
  }

  private async runTeardown(testId: string, context: unknown): Promise<string | undefined> {
    if (!this.executor.teardown) {
      return
    }

    try {
      await this.runWithTimeout(
        this.executor.teardown(testId, context),
        this.teardownTimeoutMs,
        `Teardown timeout after ${Math.round(this.teardownTimeoutMs / 1000)}s`
      )
    } catch (teardownError: unknown) {
      const msg = teardownError instanceof Error ? teardownError.message : String(teardownError)
      this.log(`⚠️  ${testId} teardown error: ${msg}`)
      if (teardownError instanceof TimeoutError) {
        this.shutdownRequested = true
        this.log('   ⚠️  consumer will stop after teardown timeout')
      }
      return msg
    }
  }

  private async publishProfilingCheckpoint(force = false): Promise<void> {
    if ((!force && this.shutdownRequested) || this.profilingPublishInFlight) {
      return
    }

    // Never emit a checkpoint after the final profiling data has been published;
    // it would be stale and could arrive after 'final' at the orchestrator.
    if (this.finalProfilingPublished) {
      return
    }

    this.profilingPublishInFlight = true
    try {
      // getProfilingData() is user-supplied and may throw; keep it inside the
      // try so a checkpoint attempt is always best-effort and never rejects.
      const profilingData = this.executor.getProfilingData?.()
      if (!profilingData) {
        return
      }
      await this.publishProfilingData(profilingData, 'checkpoint')
    } catch (e) {
      this.log(`⚠️  Failed to publish profiling checkpoint: ${e}`)
    } finally {
      this.profilingPublishInFlight = false
    }
  }

  private startProfilingCheckpoints() {
    if (
      this.profilingCheckpointTimer ||
      this.profilingCheckpointIntervalMs <= 0 ||
      !this.executor.getProfilingData
    ) {
      return
    }

    void this.publishProfilingCheckpoint()
    this.profilingCheckpointTimer = setInterval(() => {
      void this.publishProfilingCheckpoint()
    }, this.profilingCheckpointIntervalMs)
  }

  private stopProfilingCheckpoints() {
    if (this.profilingCheckpointTimer) {
      clearInterval(this.profilingCheckpointTimer)
      this.profilingCheckpointTimer = undefined
    }
  }

  public publishProfilingData(
    profilerExport: ProfilerExport,
    kind: ProfilingPublishKind = 'final'
  ): Promise<void> {
    const sequence = ++this.profilingSequence
    const message: ProfilingData = {
      runId: this.runId,
      consumerId: this.consumerId,
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      kind,
      sequence,
      profilerExport
    }

    if (kind === 'final') {
      return this.publishFinalProfiling(message)
    }

    return new Promise((resolve, reject) => {
      this.client.publish('qvac/profiling', JSON.stringify(message), { qos: 1 }, (err) => {
        if (err) {
          this.log(`⚠️  Failed to publish profiling data: ${err.message}`)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  private publishFinalProfiling(message: ProfilingData): Promise<void> {
    if (this.pendingFinalProfiling) {
      return Promise.reject(new Error('Final profiling publication is already in progress'))
    }

    return new Promise((resolve, reject) => {
      const pending: PendingFinalProfiling = {
        message,
        published: false,
        acknowledged: false,
        resolve,
        reject
      }
      this.pendingFinalProfiling = pending
      pending.timer = setTimeout(() => {
        this.finishFinalProfiling(
          pending,
          new TimeoutError(
            `Producer did not acknowledge final profiling within ${Math.round(this.profilingAckTimeoutMs / 1000)}s`
          )
        )
      }, this.profilingAckTimeoutMs)
      this.publishPendingFinalProfiling(pending)
    })
  }

  private publishPendingFinalProfiling(pending: PendingFinalProfiling) {
    this.client.publish('qvac/profiling', JSON.stringify(pending.message), { qos: 1 }, (err) => {
      if (this.pendingFinalProfiling !== pending) {
        return
      }
      if (err) {
        this.log(`⚠️  Failed to publish final profiling data: ${err.message}`)
        return
      }
      pending.published = true
      if (pending.acknowledged) {
        this.finishFinalProfiling(pending)
      }
    })
  }

  private replayFinalProfiling() {
    if (this.pendingFinalProfiling) {
      this.publishPendingFinalProfiling(this.pendingFinalProfiling)
    }
  }

  private handleProfilingAck(rawMessage: unknown) {
    const parsed = profilingAckSchema.safeParse(rawMessage)
    if (!parsed.success) {
      this.log(`⚠️  Invalid profiling acknowledgment: ${parsed.error.message}`)
      return
    }
    const message = parsed.data
    const pending = this.pendingFinalProfiling
    if (
      !pending ||
      (!this.isWildcard && message.runId !== this.runId) ||
      message.consumerId !== this.consumerId ||
      message.sessionId !== this.sessionId ||
      message.sequence !== pending.message.sequence
    ) {
      return
    }
    pending.acknowledged = true
    if (pending.published) {
      this.finishFinalProfiling(pending)
    }
  }

  private finishFinalProfiling(pending: PendingFinalProfiling, error?: Error) {
    if (this.pendingFinalProfiling !== pending) {
      return
    }
    if (pending.timer) {
      clearTimeout(pending.timer)
    }
    this.pendingFinalProfiling = undefined
    if (error) {
      pending.reject(error)
      return
    }
    this.log('📈 Profiling data acknowledged by producer')
    pending.resolve()
  }

  private cancelFinalProfiling() {
    const pending = this.pendingFinalProfiling
    if (!pending) {
      return
    }
    if (pending.timer) {
      clearTimeout(pending.timer)
    }
    this.pendingFinalProfiling = undefined
    pending.resolve()
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (!this.shutdownRequested) {
        this.client.publish(
          'qvac/heartbeat',
          JSON.stringify({
            runId: this.runId,
            consumerId: this.consumerId,
            sessionId: this.sessionId,
            bootstrapped: this.bootstrapped,
            timestamp: new Date().toISOString()
          }),
          { qos: 0 }
        )
      }
    }, 15000)
  }

  protected async shutdown() {
    // Idempotent: finalize() and a later forceShutdown() both call this, but
    // onShutdown and the client teardown must run at most once.
    if (this.shutdownStarted) {
      return
    }
    this.shutdownStarted = true
    this.cancelFinalProfiling()

    this.log('\n👋 Consumer shutting down...')
    this.stopProfilingCheckpoints()
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
    if (this.registrationRetryTimer) {
      clearInterval(this.registrationRetryTimer)
      this.registrationRetryTimer = undefined
    }

    if (this.callbacks.onShutdown) {
      try {
        await this.callbacks.onShutdown()
      } catch (e) {
        this.log(`⚠️  onShutdown error: ${e}`)
      }
    }

    this.client.end(false, {}, () => {
      // Only call process.exit in Node.js environment, not React Native
      if (typeof process !== 'undefined' && typeof process.exit === 'function') {
        process.exit(0)
      }
    })
  }

  public async forceShutdown() {
    // Idempotent: re-entry (double-Ctrl-C, overlapping signal + unmount) is a no-op.
    if (this.forceShutdownStarted) {
      return
    }
    this.forceShutdownStarted = true
    this.shutdownRequested = true

    this.log('⚠️  Force shutdown - closing immediately')
    this.stopProfilingCheckpoints()
    // Best-effort checkpoint: skip if final was already published (stale) and
    // never let a publish failure reject forceShutdown — teardown must proceed.
    if (!this.finalProfilingPublished) {
      try {
        await this.publishProfilingCheckpoint(true)
      } catch (e) {
        this.log(`⚠️  Force shutdown checkpoint error: ${e}`)
      }
    }
    await this.shutdown()
  }
}
