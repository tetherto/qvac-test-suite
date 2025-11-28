import type { MqttClient } from 'mqtt';

export interface TestMessage {
  testId: string;
  params: any;
  expectation: any;
}

export interface TestAssignment {
  status: string;
  uniqueTestId?: string;
  test?: TestMessage;
  totalTests?: number;
}

export interface TestResult {
  passed: boolean;
  output: string;
}

export interface TestExecutor {
  executeTest(testId: string, context: any, params: any, expectation: any): Promise<TestResult>;
}

export interface ConsumerCallbacks {
  log: (message: string) => void;
  updateStats?: (update: {
    testsCompleted?: number;
    testsPassed?: number;
    testsFailed?: number;
    totalTests?: number;
    currentTest?: string;
    isComplete?: boolean;
  }) => void;
  onShutdown?: () => void;
}

export class ConsumerBase {
  protected client: MqttClient;
  protected consumerId: string;
  protected platform: string;
  protected runId: string;
  protected isWildcard: boolean;
  protected executor: TestExecutor;
  protected registered = false;
  protected testsCompleted = 0;
  protected testsPassed = 0;
  protected testsFailed = 0;
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
          this.handleRegistrationAck(message);
        } else if (topic === `qvac/test-assigned/${this.consumerId}`) {
          await this.handleTestAssignment(message);
        } else if (topic === 'qvac/batch-complete') {
          this.handleBatchComplete(message);
        }
      } catch (error: any) {
        this.log(`❌ Error handling ${topic}: ${error.message}`);
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

  protected handleRegistrationAck(message: any) {
    this.log(`🔌 Registration ack - ${message.totalTests} tests in queue\n`);
    this.registered = true;
    this.updateStats({ totalTests: message.totalTests });
    this.requestNextTest();
  }

  protected async handleTestAssignment(assignment: TestAssignment) {
    if (assignment.status === 'queue-empty') {
      this.log('📭 No more tests in queue');
      if (!this.isProcessingTest) {
        this.shutdown();
      }
      return;
    }

    if (assignment.status === 'assigned' && assignment.test && assignment.uniqueTestId) {
      await this.executeTest(assignment.uniqueTestId, assignment.test);
    }
  }

  protected handleBatchComplete(message: any) {
    this.log('\n🎉 Batch complete!');
    this.log(`📊 Total: ${message.totalTests}`);
    this.log(`✅ Passed: ${message.successCount}`);
    this.log(`❌ Failed: ${message.failureCount}`);
    this.log(`⏱️  Duration: ${(message.duration / 1000).toFixed(2)}s`);

    this.shutdownRequested = true;
    this.updateStats({ isComplete: true });

    if (!this.isProcessingTest) {
      this.shutdown();
    }
  }

  protected async executeTest(uniqueTestId: string, test: TestMessage) {
    this.isProcessingTest = true;
    const { testId, params, expectation } = test;

    this.log(`▶️  ${testId}`);
    this.updateStats({ currentTest: testId });

    // Notify producer that test has started
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
      // Default timeout: 60 seconds
      const timeoutMs = test.expectation?.metadata?.timeout || 60000;

      // Execute the test with timeout
      const testPromise = this.executor.executeTest(testId, {}, params, expectation);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Test timeout after ${timeoutMs / 1000}s`)), timeoutMs);
      });

      const result = await Promise.race([testPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      const outcome = result.passed ? 'success' : 'failure';

      this.log(`${outcome === 'success' ? '✅' : '❌'} ${testId} (${duration}ms)`);
      if (!result.passed && result.output) {
        this.log(`   ${result.output.substring(0, 100)}`);
      }

      // Update stats
      this.testsCompleted++;
      if (outcome === 'success') {
        this.testsPassed++;
      } else {
        this.testsFailed++;
      }

      this.updateStats({
        testsCompleted: this.testsCompleted,
        testsPassed: this.testsPassed,
        testsFailed: this.testsFailed,
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
          duration,
          timestamp: new Date().toISOString(),
          error: result.passed ? undefined : result.output,
        }),
        { qos: 1 }
      );
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMsg = error.message || 'Unknown error';

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
      this.isProcessingTest = false;

      if (!this.shutdownRequested) {
        setTimeout(() => this.requestNextTest(), 100);
      } else if (this.shutdownRequested) {
        this.shutdown();
      }
    }
  }

  protected shutdown() {
    this.log('\n👋 Consumer shutting down...');
    this.client.end(false, {}, () => {
      if (this.callbacks.onShutdown) {
        this.callbacks.onShutdown();
      }
      process.exit(0);
    });
  }

  public forceShutdown() {
    this.log('⚠️  Force shutdown - closing immediately');
    this.shutdown();
  }
}
