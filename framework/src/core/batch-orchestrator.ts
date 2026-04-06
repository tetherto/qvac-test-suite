import type { MqttClient } from 'mqtt';
import type { TestDefinition } from '../types/test-definition.js';
import {
  consumerRegistrationSchema,
  testRequestSchema,
  testStartSchema,
  testResultSchema,
  heartbeatSchema,
  profilingDataSchema,
  type TestResult as MqttTestResult,
  type ProfilerExport,
} from '../schemas/messages.js';
import {
  generateHtmlReport,
  generateJsonReport,
  type ReportData,
  type ReportProfilingData,
} from '../utils/report-generator.js';
import { getMetricCount } from '../utils/profiler-adapter.js';

interface TestCase {
  id: string; // Unique test ID
  testId: string; // Test type
  metadata: Record<string, unknown>; // Test metadata (producer-side reporting only)
  suites?: string[];
  estimatedDurationMs: number;
}

interface TestAssignment {
  testCase: TestCase;
  consumerId: string;
  assignedAt: number;
  startedAt?: number;
  timeoutMs: number;
}

interface ConsumerInfo {
  consumerId: string;
  platform: string;
  registeredAt: number;
  lastSeen: number;
  testsCompleted: number;
  testsRunning: number;
}

// Test result type imported from schemas
type TestResult = MqttTestResult;

// Safety timeout for crashed consumers (normal path: all consumers publish on batch-complete)
const PROFILING_SAFETY_TIMEOUT_MS = 10000;

export class BatchOrchestrator {
  private client: MqttClient;
  private runId: string;
  private allowWildcardConsumers: boolean;
  private consumerTimeoutSec: number;
  private testQueue: TestCase[] = [];
  private assignedTests = new Map<string, TestAssignment>(); // uniqueTestId -> assignment
  private completedTests = new Map<string, TestResult>(); // uniqueTestId -> result
  private consumers = new Map<string, ConsumerInfo>(); // consumerId -> info
  private profilingData = new Map<string, ProfilerExport>(); // consumerId -> profiler export
  private testSuites = new Map<string, string[]>(); // testId -> suites
  private initialTotalTests = 0;
  private startTime = 0;
  private batchStarted = false;
  private shutdownTimer?: NodeJS.Timeout;
  private consumerTimeoutTimer?: NodeJS.Timeout;

  constructor(
    client: MqttClient,
    runId: string,
    allowWildcardConsumers: boolean = false,
    consumerTimeoutSec: number = 30
  ) {
    this.client = client;
    this.runId = runId;
    this.allowWildcardConsumers = allowWildcardConsumers;
    this.consumerTimeoutSec = consumerTimeoutSec;
    this.setupMqttHandlers();
  }

  private setupMqttHandlers() {
    this.client.on('connect', () => {
      console.log('✅ Producer connected to MQTT broker');
      console.log(`🔑 Run ID: ${this.runId}`);
      console.log(`🌐 Wildcard consumers: ${this.allowWildcardConsumers ? 'allowed' : 'disabled'}`);

      // Subscribe to all coordination topics
      this.client.subscribe(
        ['qvac/register', 'qvac/request-test', 'qvac/test-start', 'qvac/results', 'qvac/heartbeat', 'qvac/profiling'],
        { qos: 1 },
        (err) => {
          if (err) {
            console.error('❌ Failed to subscribe:', err);
            process.exit(1);
          }
          console.log('📡 Subscribed to coordination topics');
        }
      );
    });

    this.client.on('message', (topic, payload) => {
      try {
        const message = JSON.parse(payload.toString());

        const isWildcardConsumer = message.runId === '*';
        const isMatchingRunId = message.runId === this.runId;

        if (!isMatchingRunId && !(isWildcardConsumer && this.allowWildcardConsumers)) {
          return;
        }

        switch (topic) {
          case 'qvac/register':
            this.handleConsumerRegistration(message);
            break;
          case 'qvac/request-test':
            this.handleTestRequest(message);
            break;
          case 'qvac/test-start':
            this.handleTestStart(message);
            break;
          case 'qvac/results':
            this.handleTestResult(message);
            break;
          case 'qvac/heartbeat':
            this.handleHeartbeat(message);
            break;
          case 'qvac/profiling':
            this.handleProfilingData(message);
            break;
        }
      } catch (error) {
        console.error(`❌ Error handling ${topic}:`, error);
      }
    });

    this.client.on('reconnect', () => {
      console.log('🔄 Producer reconnecting to MQTT broker...');
    });

    this.client.on('offline', () => {
      console.log('📴 Producer offline');
    });

    this.client.on('close', () => {
      console.log('🔌 Producer MQTT connection closed');
    });

    this.client.on('error', (err) => {
      console.error('❌ MQTT error:', err);
    });
  }

  private handleConsumerRegistration(rawMessage: unknown) {
    const message = consumerRegistrationSchema.parse(rawMessage);
    const { consumerId, platform } = message;
    const now = Date.now();

    const existing = this.consumers.get(consumerId);
    if (existing) {
      existing.lastSeen = now;
      // Always re-send ack (consumer may not have received it yet)
      this.client.publish(
        `qvac/register-ack/${consumerId}`,
        JSON.stringify({ runId: this.runId, status: 'registered', totalTests: this.initialTotalTests }),
        { qos: 1 }
      );
      return;
    }

    // Cancel consumer timeout on first registration
    if (this.consumers.size === 0 && this.consumerTimeoutTimer) {
      clearTimeout(this.consumerTimeoutTimer);
      this.consumerTimeoutTimer = undefined;
    }

    this.consumers.set(consumerId, {
      consumerId,
      platform,
      registeredAt: now,
      lastSeen: now,
      testsCompleted: 0,
      testsRunning: 0,
    });

    console.log(`\n🔌 Consumer registered: ${consumerId} (${platform})`);
    this.displayStatus();

    // Send acknowledgment with initial total (not current queue length, which shrinks as tests are assigned)
    this.client.publish(
      `qvac/register-ack/${consumerId}`,
      JSON.stringify({ runId: this.runId, status: 'registered', totalTests: this.initialTotalTests }),
      { qos: 1 }
    );
  }

  private handleTestRequest(rawMessage: unknown) {
    const message = testRequestSchema.parse(rawMessage);
    const { consumerId } = message;
    const consumer = this.consumers.get(consumerId);

    if (!consumer) {
      console.warn(`⚠️  Test request from unregistered consumer: ${consumerId}`);
      return;
    }

    consumer.lastSeen = Date.now();

    // Find next available test in queue
    const nextTest = this.getNextTestForConsumer(consumerId);

    if (!nextTest) {
      // No more tests - signal queue empty
      this.client.publish(
        `qvac/test-assigned/${consumerId}`,
        JSON.stringify({ runId: this.runId, status: 'queue-empty' }),
        { qos: 1 }
      );
      console.log(`📭 No more tests for ${consumerId} (completed: ${consumer.testsCompleted})`);
      return;
    }

    // Assign test
    const assignment: TestAssignment = {
      testCase: nextTest,
      consumerId,
      assignedAt: Date.now(),
      // 3x estimate min 180s: accounts for setup phase (model loading) + test + buffer
      timeoutMs: Math.max(nextTest.estimatedDurationMs * 3, 180000),
    };

    this.assignedTests.set(nextTest.id, assignment);
    consumer.testsRunning++;

    // Remove from queue
    this.testQueue = this.testQueue.filter((t) => t.id !== nextTest.id);

    // Send test assignment — consumer resolves full definition locally
    this.client.publish(
      `qvac/test-assigned/${consumerId}`,
      JSON.stringify({
        runId: this.runId,
        status: 'assigned',
        uniqueTestId: nextTest.id,
        testId: nextTest.testId,
      }),
      { qos: 1 }
    );

    console.log(`📤 Assigned ${nextTest.testId} (${nextTest.id}) to ${consumerId}`);
    this.displayStatus();
  }

  private handleTestStart(rawMessage: unknown) {
    const message = testStartSchema.parse(rawMessage);
    const { consumerId, uniqueTestId } = message;
    const assignment = this.assignedTests.get(uniqueTestId);

    if (!assignment) {
      console.warn(`⚠️  Test start for unknown test: ${uniqueTestId}`);
      return;
    }

    assignment.startedAt = Date.now();
    console.log(`▶️  Test ${assignment.testCase.testId} started by ${consumerId}`);
  }

  private handleTestResult(rawMessage: unknown) {
    const message = testResultSchema.parse(rawMessage);
    const { consumerId, uniqueTestId, outcome, duration } = message;
    const assignment = this.assignedTests.get(uniqueTestId);

    if (!assignment) {
      console.warn(`⚠️  Result for unknown test: ${uniqueTestId}`);
      return;
    }

    // Update consumer stats
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      consumer.testsCompleted++;
      consumer.testsRunning--;
      consumer.lastSeen = Date.now();
    }

    // Store result
    this.completedTests.set(uniqueTestId, message);
    this.assignedTests.delete(uniqueTestId);

    const statusIcon = outcome === 'skipped' ? '⏭️' : outcome === 'success' ? '✅' : '❌';
    console.log(`${statusIcon} Test ${assignment.testCase.testId} ${outcome} (${duration}ms) - ${consumerId}`);

    if (message.error) {
      // Show full error, but split long errors into multiple lines
      const errorLines = message.error.split('\n');
      if (errorLines.length > 5) {
        console.log(`   Error: ${errorLines.slice(0, 5).join('\n   ')}`);
        console.log(`   ... (${errorLines.length - 5} more lines)`);
      } else {
        console.log(`   Error: ${message.error}`);
      }
    }

    this.displayStatus();
    this.checkBatchComplete();
  }

  private handleHeartbeat(rawMessage: unknown) {
    const message = heartbeatSchema.parse(rawMessage);
    const { consumerId } = message;
    const consumer = this.consumers.get(consumerId);
    if (consumer) {
      consumer.lastSeen = Date.now();
    }
  }

  private handleProfilingData(rawMessage: unknown) {
    const message = profilingDataSchema.parse(rawMessage);
    const { consumerId, profilerExport } = message;

    if (!this.consumers.has(consumerId)) {
      console.log(`⚠️  Ignoring profiling from unknown consumer: ${consumerId.split('-').slice(1, 3).join('-')}`);
      return;
    }

    this.profilingData.set(consumerId, profilerExport);
    const metricCount = getMetricCount(profilerExport);
    const metricLabel = metricCount !== undefined ? `${metricCount} metrics` : 'N/A';
    console.log(`📈 Received profiling data from ${consumerId.split('-').slice(1, 3).join('-')} (${metricLabel})`);
  }

  private getNextTestForConsumer(_consumerId: string): TestCase | null {
    // Simple FIFO for now - could be enhanced with dependency-aware scheduling
    return this.testQueue.length > 0 ? this.testQueue[0] : null;
  }

  private checkBatchComplete() {
    const queueEmpty = this.testQueue.length === 0;
    const noAssignedTests = this.assignedTests.size === 0;

    if (queueEmpty && noAssignedTests) {
      this.completeBatch();
    }
  }

  private checkTimeouts() {
    const now = Date.now();
    const timeouts: string[] = [];

    for (const [uniqueTestId, assignment] of this.assignedTests) {
      const elapsed = now - assignment.assignedAt;
      if (elapsed > assignment.timeoutMs) {
        timeouts.push(uniqueTestId);
      }
    }

    if (timeouts.length > 0) {
      console.log(`\n⏱️  ${timeouts.length} test(s) timed out:`);
      for (const uniqueTestId of timeouts) {
        const assignment = this.assignedTests.get(uniqueTestId);
        if (assignment) {
          console.log(`   - ${assignment.testCase.testId} (${assignment.consumerId})`);

          // Create timeout result
          const timeoutResult: TestResult = {
            runId: this.runId,
            consumerId: assignment.consumerId,
            testId: assignment.testCase.testId,
            uniqueTestId,
            outcome: 'failure',
            duration: Date.now() - assignment.assignedAt,
            timestamp: new Date().toISOString(),
            error: `Test timed out after ${assignment.timeoutMs}ms`,
          };

          this.completedTests.set(uniqueTestId, timeoutResult);
          this.assignedTests.delete(uniqueTestId);

          // Update consumer stats
          const consumer = this.consumers.get(assignment.consumerId);
          if (consumer) {
            consumer.testsRunning--;
          }
        }
      }

      this.checkBatchComplete();
    }
  }

  private displayStatus() {
    const total = this.testQueue.length + this.assignedTests.size + this.completedTests.size;
    const completed = this.completedTests.size;
    const running = this.assignedTests.size;
    const queued = this.testQueue.length;
    const consumers = this.consumers.size;
    const elapsed = this.startTime > 0 ? `${Math.round((Date.now() - this.startTime) / 1000)}s` : '0s';

    console.log(
      `\n📊 Status [${elapsed}]: ${completed}/${total} completed | ${running} running | ${queued} queued | ${consumers} consumers`
    );

    if (running > 0) {
      const now = Date.now();
      for (const assignment of this.assignedTests.values()) {
        const waitSec = Math.round((now - (assignment.startedAt ?? assignment.assignedAt)) / 1000);
        const timeoutSec = Math.round(assignment.timeoutMs / 1000);
        const phase = assignment.startedAt ? 'running' : 'setup';
        console.log(
          `   ⏳ ${assignment.testCase.testId} → ${assignment.consumerId} (${phase}, ${waitSec}s / ${timeoutSec}s)`
        );
      }
    }
    console.log();
  }

  private completeBatch() {
    if (this.shutdownTimer) return; // Already shutting down

    const duration = this.startTime > 0 ? Date.now() - this.startTime : 0;
    const totalTests = this.completedTests.size;
    const results = Array.from(this.completedTests.values());
    const successCount = results.filter((r) => r.outcome === 'success').length;
    const skippedCount = results.filter((r) => r.outcome === 'skipped').length;
    const failureCount = results.filter((r) => r.outcome === 'failure').length;

    console.log(`\n${'='.repeat(80)}`);
    console.log('🎉 BATCH COMPLETE');
    console.log('='.repeat(80));
    console.log(`⏱️  Total Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`📝 Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${successCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Failed: ${failureCount}`);
    console.log(`📈 Success Rate: ${((successCount / Math.max(totalTests - skippedCount, 1)) * 100).toFixed(1)}%`);
    console.log('\n👥 Consumer Stats:');

    for (const consumer of this.consumers.values()) {
      console.log(`   - ${consumer.consumerId} (${consumer.platform}): ${consumer.testsCompleted} tests`);
    }

    console.log('\n📋 Test Results by Category:\n');
    this.displayResultsByCategory();
    this.displayResultsBySuite();

    console.log(`\n📨 Signaling ${this.consumers.size} consumer(s) to complete...`);
    this.client.publish(
      'qvac/batch-complete',
      JSON.stringify({
        runId: this.runId,
        status: 'complete',
        totalTests,
        successCount,
        failureCount,
        skippedCount,
        duration,
      }),
      { qos: 1 }
    );

    const expectedIds = new Set(this.consumers.keys());
    this.waitForProfilingData(expectedIds);
  }

  private waitForProfilingData(expectedIds: Set<string>) {
    if (expectedIds.size === 0) {
      return this.finishAfterProfiling(false, []);
    }

    const startTime = Date.now();
    const timer = setInterval(() => {
      const pending = [...expectedIds].filter((id) => !this.profilingData.has(id));
      const timedOut = Date.now() - startTime >= PROFILING_SAFETY_TIMEOUT_MS;

      if (pending.length === 0 || timedOut) {
        clearInterval(timer);
        this.finishAfterProfiling(timedOut, pending);
      }
    }, 100);
  }

  private finishAfterProfiling(timedOut: boolean, pendingIds: string[]) {
    if (timedOut && pendingIds.length > 0) {
      const pendingShort = pendingIds.map((id) => id.split('-').slice(1, 3).join('-'));
      console.log(
        `⚠️  Safety timeout: missing profiling from ${pendingIds.length} consumer(s): ${pendingShort.join(', ')}`
      );
    } else {
      const receivedCount = this.profilingData.size;
      if (receivedCount > 0) {
        console.log(`✅ Received profiling data from all ${receivedCount} consumer(s)`);
      }
    }
    this.generateReports();
    this.scheduleShutdown();
  }

  private generateReports() {
    try {
      const profilingDataArray: ReportProfilingData[] = Array.from(this.profilingData.entries()).map(
        ([consumerId, profilerExport]) => ({ consumerId, profilerExport })
      );

      const completedTests = Array.from(this.completedTests.values()).map((result) => ({
        ...result,
        suites: this.testSuites.get(result.testId),
      }));

      const reportData: ReportData = {
        runId: this.runId,
        completedTests,
        consumers: this.consumers,
        startTime: this.startTime,
        profilingData: profilingDataArray.length > 0 ? profilingDataArray : undefined,
      };

      const htmlPath = generateHtmlReport(reportData);
      const jsonPath = generateJsonReport(reportData);

      console.log(`\n📄 Reports generated:`);
      console.log(`   HTML: ${htmlPath}`);
      console.log(`   JSON: ${jsonPath}`);
      if (profilingDataArray.length > 0) {
        console.log(`📈 Profiling data included from ${profilingDataArray.length} consumer(s)`);
      }
    } catch (error) {
      console.error('\n⚠️  Failed to generate reports:', error);
    }
  }

  private scheduleShutdown() {
    // Shutdown after 2 seconds
    this.shutdownTimer = setTimeout(() => {
      console.log('\n👋 Shutting down producer...\n');
      this.client.end(false, {}, () => process.exit(0));
    }, 2000);
  }

  private displayResultsByCategory() {
    const categories = new Map<string, { passed: number; failed: number; skipped: number }>();

    for (const result of this.completedTests.values()) {
      let category = result.testId;
      if (category.includes('-')) {
        category = category.split('-')[0];
      }

      if (!categories.has(category)) {
        categories.set(category, { passed: 0, failed: 0, skipped: 0 });
      }

      const stats = categories.get(category)!;
      if (result.outcome === 'success') {
        stats.passed++;
      } else if (result.outcome === 'skipped') {
        stats.skipped++;
      } else {
        stats.failed++;
      }
    }

    for (const [category, stats] of categories) {
      const total = stats.passed + stats.failed + stats.skipped;
      const rate = ((stats.passed / Math.max(total - stats.skipped, 1)) * 100).toFixed(0);
      const skipStr = stats.skipped > 0 ? `, ${stats.skipped} skipped` : '';
      console.log(`   ${category.padEnd(20)} ${stats.passed}/${total} (${rate}%${skipStr})`);
    }
  }

  private displayResultsBySuite() {
    if (this.testSuites.size === 0) return;

    const suites = new Map<string, { passed: number; failed: number; skipped: number }>();

    for (const [, result] of this.completedTests) {
      const testSuiteList = this.testSuites.get(result.testId);
      if (!testSuiteList) continue;

      for (const suite of testSuiteList) {
        if (!suites.has(suite)) {
          suites.set(suite, { passed: 0, failed: 0, skipped: 0 });
        }
        const stats = suites.get(suite)!;
        if (result.outcome === 'success') {
          stats.passed++;
        } else if (result.outcome === 'skipped') {
          stats.skipped++;
        } else {
          stats.failed++;
        }
      }
    }

    if (suites.size === 0) return;

    console.log('\n📋 Test Results by Suite:\n');
    for (const [suite, stats] of suites) {
      const total = stats.passed + stats.failed + stats.skipped;
      const rate = ((stats.passed / Math.max(total - stats.skipped, 1)) * 100).toFixed(0);
      const skipStr = stats.skipped > 0 ? `, ${stats.skipped} skipped` : '';
      console.log(`   ${suite.padEnd(20)} ${stats.passed}/${total} (${rate}%${skipStr})`);
    }
  }

  public buildTestQueue(tests: TestDefinition[]) {
    console.log('🔨 Building test queue...\n');

    let counter = 0;
    let skippedCount = 0;

    for (const test of tests) {
      if (test.skip && !test.skip.platforms) {
        skippedCount++;
        console.log(
          `⏭️  Skipping ${test.testId}: ${test.skip.reason}${test.skip.issue ? ` (${test.skip.issue})` : ''}`
        );

        // Record as skipped result so it appears in reports
        const skipId = `skip-${Date.now()}-${counter++}`;
        this.completedTests.set(skipId, {
          runId: this.runId,
          consumerId: 'producer',
          testId: test.testId,
          uniqueTestId: skipId,
          outcome: 'skipped',
          duration: 0,
          timestamp: new Date().toISOString(),
          error: `${test.skip.reason}${test.skip.issue ? ` (${test.skip.issue})` : ''}`,
        });
        continue;
      }

      const testCase: TestCase = {
        id: `test-${Date.now()}-${counter++}`,
        testId: test.testId,
        metadata: test.metadata || {},
        suites: test.suites,
        estimatedDurationMs: test.metadata?.estimatedDurationMs || 10000,
      };
      if (test.suites) {
        this.testSuites.set(test.testId, test.suites);
      }
      this.testQueue.push(testCase);
    }

    if (skippedCount > 0) {
      console.log(`\n⏭️  Skipped ${skippedCount} tests\n`);
    }

    // Group by category from metadata for reporting
    const byCategory = new Map<string, number>();
    for (const test of this.testQueue) {
      const category = (typeof test.metadata?.category === 'string' ? test.metadata.category : null) || 'uncategorized';
      byCategory.set(category, (byCategory.get(category) || 0) + 1);
    }

    this.initialTotalTests = this.testQueue.length + this.completedTests.size;

    console.log(`📦 Built ${this.testQueue.length} tests:`);
    for (const [category, count] of byCategory) {
      console.log(`   - ${category}: ${count} tests`);
    }
    console.log();
  }

  public start() {
    if (this.batchStarted) {
      console.warn('⚠️  Batch already started');
      return;
    }

    this.batchStarted = true;
    this.startTime = Date.now();

    console.log('🚀 Batch orchestration started');
    console.log(`📋 Total tests: ${this.testQueue.length}`);
    console.log(`⏳ Waiting for consumers to register (timeout: ${this.consumerTimeoutSec}s)...\n`);

    // Start consumer connection timeout
    this.consumerTimeoutTimer = setTimeout(() => {
      if (this.consumers.size === 0) {
        console.error(`\n❌ No consumers connected within ${this.consumerTimeoutSec}s timeout`);
        console.error('   Make sure the consumer is running with the same --runId');
        this.client.end(false, {}, () => process.exit(1));
      }
    }, this.consumerTimeoutSec * 1000);

    // Start timeout checker (every 10 seconds)
    setInterval(() => this.checkTimeouts(), 10000);

    // Display status every 30 seconds
    setInterval(() => {
      if (this.assignedTests.size > 0 || this.testQueue.length > 0) {
        this.displayStatus();
      }
    }, 30000);
  }

  public shutdown() {
    console.log('\n⚠️  Shutting down...');
    this.client.end(false, {}, () => process.exit(0));
  }
}

// Export for use as library
// Main execution removed - will be handled by CLI
