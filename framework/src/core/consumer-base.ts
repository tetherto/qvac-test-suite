import type { MqttClient } from 'mqtt'
import type { TestDefinition } from '../types/test-definition.js'
import {
  registerAckSchema,
  testAssignmentSchema,
  type ProfilerExport,
  type RegisterAck,
  type TestAssignment
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
   * Runs once after register-ack. `filteredTests` is the post-filter test
   * set resolved from `registerAck.filteredTestIds` against local
   * `testDefinitions`; `undefined` if the producer didn't send the field
   * (older framework) or the consumer has no local definitions — callers
   * should then fall back to their "no filter" path.
   */
  onBootstrap?: (filteredTests?: TestDefinition[]) => Promise<void>
  onShutdown?: () => void | Promise<void>
}

const DEFAULT_REQUEST_ASSIGNMENT_TIMEOUT_MS = 10000
const DEFAULT_TEARDOWN_TIMEOUT_MS = 120000
const DEFAULT_PROFILING_CHECKPOINT_INTERVAL_MS = 5000

type ProfilingPublishKind = 'checkpoint' | 'final'

function readProfilingCheckpointIntervalMs(): number {
  const raw =
    typeof process !== 'undefined'
      ? (process.env?.EXPO_PUBLIC_QVAC_PROFILING_CHECKPOINT_INTERVAL_MS ??
        process.env?.QVAC_PROFILING_CHECKPOINT_INTERVAL_MS)
      : undefined
  const parsed = Number.parseInt(raw ?? String(DEFAULT_PROFILING_CHECKPOINT_INTERVAL_MS), 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : DEFAULT_PROFILING_CHECKPOINT_INTERVAL_MS
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
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private outstandingRequestTimer?: ReturnType<typeof setTimeout>
  // True between publishing `qvac/request-test` and receiving the matching
  // `qvac/test-assigned` reply. Without this, any caller of
  // `requestNextTest()` that fires inside that on-the-wire window (e.g. the
  // `connect` handler on an MQTT reconnect, or a stacked `setTimeout`
  // retry) would re-publish and the producer would assign a second test,
  // leaving the first one orphaned in its `assignedTests` map until it
  // hits the 180 s timeout.
  private outstandingRequest = false
  private seenAssignmentIds = new Set<string>()
  private profilingCheckpointTimer?: ReturnType<typeof setInterval>
  private profilingCheckpointIntervalMs = readProfilingCheckpointIntervalMs()
  private profilingPublishInFlight = false
  private profilingSequence = 0
  private finalProfilingPublished = false
  // Guards forceShutdown() so its body runs at most once (double-Ctrl-C,
  // overlapping signal + React unmount).
  private forceShutdownStarted = false
  protected requestAssignmentTimeoutMs = DEFAULT_REQUEST_ASSIGNMENT_TIMEOUT_MS
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

  protected requestNextTest() {
    // `registered` flips before `await onBootstrap`, so a reconnect during
    // bootstrap could otherwise pull a test the consumer can't run yet. The
    // trailing requestNextTest() in handleRegistrationAck (or shutdown on
    // bootstrap failure) covers the suppressed call.
    //
    // `outstandingRequest` covers the symmetric race on the other side: a
    // request-test is on the wire, the producer hasn't replied yet, so
    // `isProcessingTest` is still false but a second publish would still
    // get a second assignment. Cleared in `handleTestAssignment`.
    if (
      !this.registered ||
      !this.bootstrapped ||
      this.isProcessingTest ||
      this.outstandingRequest ||
      this.shutdownRequested
    ) {
      return
    }

    this.outstandingRequest = true
    this.publishTestRequest()
  }

  private publishTestRequest() {
    this.client.publish(
      'qvac/request-test',
      JSON.stringify({
        runId: this.runId,
        consumerId: this.consumerId,
        timestamp: new Date().toISOString()
      }),
      { qos: 1 }
    )
    this.armOutstandingRequestTimer()
  }

  private armOutstandingRequestTimer() {
    if (this.outstandingRequestTimer) {
      clearTimeout(this.outstandingRequestTimer)
    }

    this.outstandingRequestTimer = setTimeout(() => {
      this.outstandingRequestTimer = undefined
      if (!this.outstandingRequest || this.shutdownRequested) {
        return
      }

      if (!this.registered || !this.bootstrapped || this.isProcessingTest) {
        this.clearOutstandingRequest()
        return
      }

      this.log(
        `⚠️  No test assignment received within ${Math.round(this.requestAssignmentTimeoutMs / 1000)}s - re-sending request`
      )
      this.publishTestRequest()
    }, this.requestAssignmentTimeoutMs)
  }

  private clearOutstandingRequest() {
    this.outstandingRequest = false
    if (this.outstandingRequestTimer) {
      clearTimeout(this.outstandingRequestTimer)
      this.outstandingRequestTimer = undefined
    }
  }

  private rememberAssignment(uniqueTestId: string) {
    this.seenAssignmentIds.add(uniqueTestId)
  }

  public setupMqttHandlers() {
    this.client.on('connect', () => {
      if (this.registered) {
        this.log('✅ Reconnected to MQTT broker')
        this.requestNextTest()
        return
      }

      this.log('✅ Connected to MQTT broker')
      this.log(`🔑 Run ID: ${this.runId}${this.isWildcard ? ' (wildcard mode)' : ''}`)

      // Subscribe to consumer-specific topics
      this.client.subscribe(
        [
          `qvac/register-ack/${this.consumerId}`,
          `qvac/test-assigned/${this.consumerId}`,
          'qvac/batch-complete'
        ],
        { qos: 1 },
        (err) => {
          if (err) {
            this.log(`❌ Failed to subscribe: ${err.message}`)
            return
          }
          this.log('📡 Subscribed to topics\n')

          // Bootstrap is deferred to handleRegistrationAck — we need the
          // producer's filteredTestIds before we can scope it.

          // Register with producer (with retry)
          this.sendRegistration()

          const registrationInterval = setInterval(() => {
            if (!this.registered) {
              this.log(`🔄 Re-sending registration...`)
              this.sendRegistration()
            } else {
              clearInterval(registrationInterval)
            }
          }, 3000)
        }
      )
    })

    this.client.on('message', (topic, payload) => {
      this.messageQueue = this.messageQueue.then(async () => {
        try {
          const message = JSON.parse(payload.toString())

          if (!this.isWildcard && message.runId !== this.runId) {
            return
          }

          if (topic === `qvac/register-ack/${this.consumerId}`) {
            await this.handleRegistrationAck(message)
          } else if (topic === `qvac/test-assigned/${this.consumerId}`) {
            await this.handleTestAssignment(message)
          } else if (topic === 'qvac/batch-complete') {
            await this.handleBatchComplete(message)
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
        platform: this.platform,
        timestamp: new Date().toISOString()
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

    this.totalTests = Math.max(this.totalTests, message.totalTests)

    // Re-acks fire on every reconnect; only the first one bootstraps.
    if (this.registered) {
      return
    }

    this.registered = true
    this.log(`🔌 Registration ack - ${this.totalTests} tests in queue\n`)
    this.updateStats({ totalTests: this.totalTests })
    this.startHeartbeat()

    if (this.callbacks.onBootstrap && !this.bootstrapped) {
      // Resolve producer's testIds against local definitions; drop ids
      // unknown to this consumer build and tests skipped on this platform
      // (the producer can't pre-filter per consumer). Pass undefined when
      // the producer didn't send the field at all so callbacks fall back
      // to their "no filter" path.
      let filteredTests: TestDefinition[] | undefined
      if (message.filteredTestIds && this.testDefinitions.size > 0) {
        filteredTests = []
        let unresolvedCount = 0
        let platformSkippedCount = 0
        for (const testId of message.filteredTestIds) {
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
            `⚠️  Producer sent ${message.filteredTestIds.length} testId(s); ${unresolvedCount} don't resolve against local definitions`
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
    this.requestNextTest()
  }

  protected async handleTestAssignment(rawAssignment: unknown) {
    const parsed = testAssignmentSchema.safeParse(rawAssignment)
    if (!parsed.success) {
      this.log(`⚠️  Invalid test-assigned payload: ${parsed.error.message}`)
      return
    }

    const assignment: TestAssignment = parsed.data
    if (assignment.status === 'assigned' && assignment.uniqueTestId) {
      if (this.seenAssignmentIds.has(assignment.uniqueTestId)) {
        this.log(
          `⚠️  Ignoring duplicate assignment for already handled test: ${assignment.uniqueTestId}`
        )
        this.clearOutstandingRequest()
        if (!this.shutdownRequested && !this.isProcessingTest) {
          setTimeout(() => this.requestNextTest(), 100)
        }
        return
      }

      if (this.isProcessingTest) {
        this.log(
          `⚠️  Ignoring assignment while already processing a test: ${assignment.uniqueTestId}`
        )
        this.clearOutstandingRequest()
        return
      }
    }

    // Producer replied to our request-test (whether with an assignment,
    // queue-empty, or anything else). Clear the in-flight flag so the
    // next requestNextTest() can publish; otherwise the flag would stick
    // forever after queue-empty and any reconnect path would silently
    // no-op.
    this.clearOutstandingRequest()

    if (assignment.status === 'queue-empty') {
      this.log('📭 No more tests in queue - waiting for batch-complete')
      return
    }

    if (assignment.status === 'assigned' && assignment.testId && assignment.uniqueTestId) {
      this.rememberAssignment(assignment.uniqueTestId)
      const definition = this.testDefinitions.get(assignment.testId)
      if (!definition) {
        this.log(`❌ No local test definition for: ${assignment.testId}`)
        this.client.publish(
          'qvac/results',
          JSON.stringify({
            runId: this.runId,
            consumerId: this.consumerId,
            testId: assignment.testId,
            uniqueTestId: assignment.uniqueTestId,
            outcome: 'failure',
            duration: 0,
            timestamp: new Date().toISOString(),
            error: `No local test definition for: ${assignment.testId}`
          }),
          { qos: 1 }
        )
        if (!this.shutdownRequested) {
          setTimeout(() => this.requestNextTest(), 100)
        }
        return
      }
      await this.executeTest(assignment.uniqueTestId, definition)
    }
  }

  protected async handleBatchComplete(message: {
    totalTests?: number
    successCount?: number
    failureCount?: number
    duration?: number
  }) {
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
    this.clearOutstandingRequest()
    this.updateStats({ isComplete: true })

    if (this.isProcessingTest) {
      this.log('⏳ Waiting for in-progress test to complete before finalizing...')
      return
    }

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

  protected async executeTest(uniqueTestId: string, definition: TestDefinition) {
    this.isProcessingTest = true
    const { testId, params, expectation } = definition
    let skipTeardown = false

    const progress = this.totalTests > 0 ? `[${this.testsCompleted + 1}/${this.totalTests}]` : ''
    this.log(`▶️  ${progress} ${testId}`)
    this.updateStats({ currentTest: testId })

    // Check for conditional platform-based skip
    const skipReason = this.getTestSkipReason(definition)
    if (skipReason) {
      this.log(`⏭️  ${testId}: ${skipReason}`)
      this.testsCompleted++
      this.testsSkipped++
      this.updateStats({ testsCompleted: this.testsCompleted, testsSkipped: this.testsSkipped })
      this.client.publish(
        'qvac/results',
        JSON.stringify({
          runId: this.runId,
          consumerId: this.consumerId,
          testId,
          uniqueTestId,
          outcome: 'skipped',
          duration: 0,
          timestamp: new Date().toISOString(),
          error: skipReason
        }),
        { qos: 1 }
      )
      this.isProcessingTest = false
      if (!this.shutdownRequested) {
        setTimeout(() => this.requestNextTest(), 100)
      }
      return
    }

    const context = definition.metadata || {}

    // Setup phase: runs BEFORE timeout and test-start notification
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
        this.client.publish(
          'qvac/results',
          JSON.stringify({
            runId: this.runId,
            consumerId: this.consumerId,
            testId,
            uniqueTestId,
            outcome: 'failure',
            duration: 0,
            timestamp: new Date().toISOString(),
            error: `Setup failed: ${errorMsg}`
          }),
          { qos: 1 }
        )
        this.isProcessingTest = false
        if (!this.shutdownRequested) {
          setTimeout(() => this.requestNextTest(), 100)
        }
        return
      }
    }

    // Notify producer that test execution is starting (after setup)
    this.client.publish(
      'qvac/test-start',
      JSON.stringify({
        runId: this.runId,
        consumerId: this.consumerId,
        uniqueTestId,
        timestamp: new Date().toISOString()
      }),
      { qos: 1 }
    )

    const startTime = Date.now()
    const stopConsumerAfterTimeout = (message: string) => {
      skipTeardown = true
      this.shutdownRequested = true
      this.clearOutstandingRequest()
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

      if (!result.passed && !result.skipped && definition.retryOnFailure === true) {
        retried = true
        this.log(`   ❌ attempt 1:`)
        if (result.output) {
          result.output.split('\n').forEach((line) => this.log(`      ${line}`))
        }
        this.log(`   ┄┄ reload + retry ┄┄`)

        const reloadBoundaryTs = Date.now()
        attempt1DurationMs = reloadBoundaryTs - startTime
        this.client.publish(
          'qvac/test-reload',
          JSON.stringify({
            runId: this.runId,
            consumerId: this.consumerId,
            uniqueTestId,
            testId,
            ts: reloadBoundaryTs
          }),
          { qos: 1 }
        )

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
      this.client.publish(
        'qvac/results',
        JSON.stringify({
          runId: this.runId,
          consumerId: this.consumerId,
          testId,
          uniqueTestId,
          outcome,
          duration: result.skipped ? 0 : duration,
          timestamp: new Date().toISOString(),
          error: result.skipped ? result.output : result.passed ? undefined : result.output,
          ...(retried && { retried: true, retryPassed, retryOutput, attempt1DurationMs })
        }),
        { qos: 1 }
      )
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
      this.client.publish(
        'qvac/results',
        JSON.stringify({
          runId: this.runId,
          consumerId: this.consumerId,
          testId,
          uniqueTestId,
          outcome: 'failure',
          duration,
          timestamp: new Date().toISOString(),
          error: errorMsg
        }),
        { qos: 1 }
      )
    } finally {
      if (!skipTeardown) {
        await this.runTeardown(testId, context)
      }

      this.isProcessingTest = false

      if (!this.shutdownRequested) {
        setTimeout(() => this.requestNextTest(), 100)
      } else {
        await this.finalize()
      }
    }
  }

  private async runTeardown(testId: string, context: unknown) {
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
    return new Promise((resolve, reject) => {
      const sequence = ++this.profilingSequence
      const payload = JSON.stringify({
        runId: this.runId,
        consumerId: this.consumerId,
        timestamp: new Date().toISOString(),
        kind,
        sequence,
        profilerExport
      })

      this.client.publish('qvac/profiling', payload, { qos: 1 }, (err) => {
        if (err) {
          this.log(`⚠️  Failed to publish profiling data: ${err.message}`)
          reject(err)
        } else {
          if (kind === 'final') {
            this.log('📈 Profiling data published')
          }
          resolve()
        }
      })
    })
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (!this.shutdownRequested) {
        this.client.publish(
          'qvac/heartbeat',
          JSON.stringify({
            runId: this.runId,
            consumerId: this.consumerId,
            bootstrapped: this.bootstrapped,
            outstandingRequest: this.outstandingRequest,
            timestamp: new Date().toISOString()
          }),
          { qos: 0 }
        )
      }
    }, 15000)
  }

  protected async shutdown() {
    this.log('\n👋 Consumer shutting down...')
    this.stopProfilingCheckpoints()
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
    this.clearOutstandingRequest()

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
