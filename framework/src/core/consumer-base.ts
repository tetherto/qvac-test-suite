import type { MqttClient } from 'mqtt';
import type { SkipInfo } from '../types/test-definition.js';
import type { ProfilerExport } from '../schemas/messages.js';

export interface TestMessage {
  testId: string;
  params: unknown;
  expectation: unknown;
  metadata?: Record<string, unknown>;
  skip?: SkipInfo;
}

export interface TestAssignment {
  status: string;
  uniqueTestId?: string;
  test?: TestMessage;
  totalTests?: number;
  runId?: string;
}

export interface TestResult {
  passed: boolean;
  output: string;
  skipped?: boolean;
}

export interface TestExecutor {
  setup?(testId: string, context: unknown): Promise<void>;
  executeTest(testId: string, context: unknown, params: unknown, expectation: unknown): Promise<TestResult>;
  teardown?(testId: string, context: unknown): Promise<void>;
  getProfilingData?(): ProfilerExport | undefined;
  initProfiling?(): void;
}

export interface ConsumerCallbacks {
  log: (message: string) => void;
  updateStats?: (update: {
    testsCompleted?: number;
    testsPassed?: number;
    testsFailed?: number;
    testsSkipped?: number;
    totalTests?: number;
    currentTest?: string;
    isComplete?: boolean;
  }) => void;
  onBootstrap?: () => Promise<void>;
  onShutdown?: () => void | Promise<void>;
}

export class ConsumerBase {
  protected client: MqttClient;
  protected consumerId: string;
  protected platform: string;
  protected runId: string;
  protected isWildcard: boolean;
  protected executor: TestExecutor;
  protected registered = false;
  protected bootstrapped = false;
  protected testsCompleted = 0;
  protected testsPassed = 0;
  protected testsFailed = 0;
  protected testsSkipped = 0;
  protected isProcessingTest = false;
  protected shutdownRequested = false;
  protected callbacks: ConsumerCallbacks;

  constructor(
    client: MqttClient,
    consumerId: string,
    platform: string,
    runId: string,
    executor: TestExecutor,
    callbacks: ConsumerCallbacks
  ) {
    this.client = client;
    this.consumerId = consumerId;
    this.platform = platform;
    this.runId = runId;
    this.isWildcard = runId === '*';
    this.executor = executor;
    this.callbacks = callbacks;
  }

  protected log(message: string) {
    this.callbacks.log(message);
  }

  protected updateStats(update: {
    testsCompleted?: number;
    testsPassed?: number;
    testsFailed?: number;
    testsSkipped?: number;
    totalTests?: number;
    currentTest?: string;
    isComplete?: boolean;
  }) {
    if (this.callbacks.updateStats) {
      this.callbacks.updateStats(update);
    }
  }

  protected requestNextTest() {
    if (!this.registered || this.isProcessingTest || this.shutdownRequested) {
      return;
    }

    this.client.publish(
      'qvac/request-test',
      JSON.stringify({
        runId: this.runId,
        consumerId: this.consumerId,
        timestamp: new Date().toISOString(),
      }),
      { qos: 1 }
    );
  }

  public setupMqttHandlers() {
    this.client.on('connect', () => {
      this.log('✅ Connected to MQTT broker');
      this.log(`🔑 Run ID: ${this.runId}${this.isWildcard ? ' (wildcard mode)' : ''}`);

      // Subscribe to consumer-specific topics
      this.client.subscribe(
        [`qvac/register-ack/${this.consumerId}`, `qvac/test-assigned/${this.consumerId}`, 'qvac/batch-complete'],
        { qos: 1 },
        (err) => {
          if (err) {
            this.log(`❌ Failed to subscribe: ${err.message}`);
            return;
          }
          this.log('📡 Subscribed to topics\n');

          // Register with producer (with retry)
          this.sendRegistration();

          const registrationInterval = setInterval(() => {
            if (!this.registered) {
              this.log(`🔄 Re-sending registration...`);
              this.sendRegistration();
            } else {
              clearInterval(registrationInterval);
            }
          }, 3000);
        }
      );
    });

    this.client.on('message', async (topic, payload) => {
      try {
        const message = JSON.parse(payload.toString());

        if (!this.isWildcard && message.runId !== this.runId) {
          return;
        }

        if (topic === `qvac/register-ack/${this.consumerId}`) {
          await this.handleRegistrationAck(message);
        } else if (topic === `qvac/test-assigned/${this.consumerId}`) {
          await this.handleTestAssignment(message);
        } else if (topic === 'qvac/batch-complete') {
          await this.handleBatchComplete(message);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`❌ Error handling ${topic}: ${errorMessage}`);
      }
    });

    this.client.on('error', (err) => {
      this.log(`❌ MQTT error: ${err.message}`);
    });
  }

  protected sendRegistration() {
    this.client.publish(
      'qvac/register',
      JSON.stringify({
        runId: this.runId,
        consumerId: this.consumerId,
        platform: this.platform,
        timestamp: new Date().toISOString(),
      }),
      { qos: 1 }
    );
  }

  protected async handleRegistrationAck(message: { totalTests?: number; runId?: string }) {
    this.log(`🔌 Registration ack - ${message.totalTests} tests in queue\n`);
    this.registered = true;
    this.updateStats({ totalTests: message.totalTests });

    if (!this.callbacks.onBootstrap) {
      this.bootstrapped = true;
    }

    if (!this.bootstrapped) {
      try {
        this.log('🔧 Running bootstrap...');
        const start = Date.now();
        await this.callbacks.onBootstrap!();
        this.bootstrapped = true;
        this.log(`🔧 Bootstrap completed in ${Date.now() - start}ms\n`);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log(`❌ Bootstrap failed: ${errorMsg}`);
        this.shutdown();
        return;
      }
    }

    this.requestNextTest();
  }

  protected async handleTestAssignment(assignment: TestAssignment) {
    if (assignment.status === 'queue-empty') {
      this.log('📭 No more tests in queue - waiting for batch-complete');
      return;
    }

    if (assignment.status === 'assigned' && assignment.test && assignment.uniqueTestId) {
      await this.executeTest(assignment.uniqueTestId, assignment.test);
    }
  }

  protected async handleBatchComplete(message: {
    totalTests?: number;
    successCount?: number;
    failureCount?: number;
    duration?: number;
  }) {
    this.log('\n🎉 Batch complete!');
    this.log(`📊 Total: ${message.totalTests || 0}`);
    this.log(`✅ Passed: ${message.successCount || 0}`);
    this.log(`❌ Failed: ${message.failureCount || 0}`);
    this.log(`⏱️  Duration: ${((message.duration || 0) / 1000).toFixed(2)}s`);

    this.shutdownRequested = true;
    this.updateStats({ isComplete: true });

    if (this.isProcessingTest) {
      this.log('⏳ Waiting for in-progress test to complete before finalizing...');
      return;
    }

    await this.finalize();
  }

  protected async finalize() {
    try {
      const profilingData = this.executor.getProfilingData?.();
      const exportData: ProfilerExport = profilingData ?? {
        config: {
          enabled: false,
          mode: 'summary',
          includeServerBreakdown: false,
          operationFilters: [],
          maxRecentEvents: 0,
        },
        aggregates: {},
        exportedAt: Date.now(),
      };
      await this.publishProfilingData(exportData);
    } catch (e) {
      this.log(`⚠️  Failed to publish profiling data: ${e}`);
    }

    this.shutdown();
  }

  protected getTestSkipReason(testId: string, test?: TestMessage): string | null {
    if (test?.skip?.platforms?.includes(this.platform)) {
      return test.skip.reason;
    }
    return null;
  }

  protected async executeTest(uniqueTestId: string, test: TestMessage) {
    this.isProcessingTest = true;
    const { testId, params, expectation } = test;

    this.log(`▶️  ${testId}`);
    this.updateStats({ currentTest: testId });

    // Check for conditional platform-based skip
    const skipReason = this.getTestSkipReason(testId, test);
    if (skipReason) {
      this.log(`⏭️  ${testId}: ${skipReason}`);
      this.testsCompleted++;
      this.testsSkipped++;
      this.updateStats({ testsCompleted: this.testsCompleted, testsSkipped: this.testsSkipped });
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
          error: skipReason,
        }),
        { qos: 1 }
      );
      this.isProcessingTest = false;
      if (!this.shutdownRequested) {
        setTimeout(() => this.requestNextTest(), 100);
      }
      return;
    }

    const context = test.metadata || {};

    // Setup phase: runs BEFORE timeout and test-start notification
    if (this.executor.setup) {
      try {
        await this.executor.setup(testId, context);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Setup failed';
        this.log(`❌ ${testId} setup failed: ${errorMsg}`);
        this.testsCompleted++;
        this.testsFailed++;
        this.updateStats({ testsCompleted: this.testsCompleted, testsFailed: this.testsFailed });
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
            error: `Setup failed: ${errorMsg}`,
          }),
          { qos: 1 }
        );
        this.isProcessingTest = false;
        if (!this.shutdownRequested) {
          setTimeout(() => this.requestNextTest(), 100);
        }
        return;
      }
    }

    // Notify producer that test execution is starting (after setup)
    this.client.publish(
      'qvac/test-start',
      JSON.stringify({
        runId: this.runId,
        consumerId: this.consumerId,
        uniqueTestId,
        timestamp: new Date().toISOString(),
      }),
      { qos: 1 }
    );

    const startTime = Date.now();

    try {
      const metadata = test.metadata || (context as Record<string, unknown>) || {};
      const estimatedMs = typeof metadata.estimatedDurationMs === 'number' ? metadata.estimatedDurationMs : 0;
      const timeoutMs = Math.max(estimatedMs * 2, 120000);

      const testPromise = this.executor.executeTest(testId, context, params, expectation);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Test timeout after ${timeoutMs / 1000}s`)), timeoutMs);
      });

      const result = await Promise.race([testPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      const outcome = result.skipped ? 'skipped' : result.passed ? 'success' : 'failure';

      if (result.skipped) {
        this.log(`⏭️  ${testId}: ${result.output}`);
      } else {
        this.log(`${outcome === 'success' ? '✅' : '❌'} ${testId} (${duration}ms)`);
        if (!result.passed && result.output) {
          const outputLines = result.output.split('\n');
          if (outputLines.length > 1) {
            outputLines.forEach((line) => this.log(`   ${line}`));
          } else {
            this.log(`   ${result.output}`);
          }
        }
      }

      // Update stats
      this.testsCompleted++;
      if (result.skipped) {
        this.testsSkipped++;
      } else if (outcome === 'success') {
        this.testsPassed++;
      } else {
        this.testsFailed++;
      }

      this.updateStats({
        testsCompleted: this.testsCompleted,
        testsPassed: this.testsPassed,
        testsFailed: this.testsFailed,
        testsSkipped: this.testsSkipped,
      });

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
        }),
        { qos: 1 }
      );
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      this.log(`❌ ${testId} failed: ${errorMsg}`);

      // Update stats
      this.testsCompleted++;
      this.testsFailed++;
      this.updateStats({
        testsCompleted: this.testsCompleted,
        testsFailed: this.testsFailed,
      });

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
          error: errorMsg,
        }),
        { qos: 1 }
      );
    } finally {
      // Teardown phase: runs after test execution regardless of outcome
      if (this.executor.teardown) {
        try {
          await this.executor.teardown(testId, context);
        } catch (teardownError: unknown) {
          const msg = teardownError instanceof Error ? teardownError.message : String(teardownError);
          this.log(`⚠️  ${testId} teardown error: ${msg}`);
        }
      }

      this.isProcessingTest = false;

      if (!this.shutdownRequested) {
        setTimeout(() => this.requestNextTest(), 100);
      } else {
        await this.finalize();
      }
    }
  }

  public publishProfilingData(profilerExport: ProfilerExport): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        runId: this.runId,
        consumerId: this.consumerId,
        timestamp: new Date().toISOString(),
        profilerExport,
      });

      this.client.publish('qvac/profiling', payload, { qos: 1 }, (err) => {
        if (err) {
          this.log(`⚠️  Failed to publish profiling data: ${err.message}`);
          reject(err);
        } else {
          this.log('📈 Profiling data published');
          resolve();
        }
      });
    });
  }

  protected async shutdown() {
    this.log('\n👋 Consumer shutting down...');

    if (this.callbacks.onShutdown) {
      try {
        await this.callbacks.onShutdown();
      } catch (e) {
        this.log(`⚠️  onShutdown error: ${e}`);
      }
    }

    this.client.end(false, {}, () => {
      // Only call process.exit in Node.js environment, not React Native
      if (typeof process !== 'undefined' && typeof process.exit === 'function') {
        process.exit(0);
      }
    });
  }

  public forceShutdown() {
    this.log('⚠️  Force shutdown - closing immediately');
    this.shutdown();
  }
}
