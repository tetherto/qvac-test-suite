import mqtt, { type MqttClient } from "mqtt";
import { env } from "./env";
import { TestBuilder } from "./test-builders";

interface TestCase {
	id: string; // Unique test ID
	testId: string; // Test type
	payload: string;
	dependency: string; // Model dependency: "llm", "whisper", "embeddings", "none"
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
	filterTestIds?: string[] | null;
}

interface TestResult {
	consumerId: string;
	testId: string;
	uniqueTestId: string;
	outcome: "success" | "failure";
	duration: number;
	timestamp: string;
	error?: string;
	output?: string;
}

export class BatchOrchestrator {
	private client: MqttClient;
	private testQueue: TestCase[] = [];
	private assignedTests = new Map<string, TestAssignment>(); // uniqueTestId -> assignment
	private completedTests = new Map<string, TestResult>(); // uniqueTestId -> result
	private consumers = new Map<string, ConsumerInfo>(); // consumerId -> info
	private startTime = 0;
	private batchStarted = false;
	private shutdownTimer?: NodeJS.Timeout;

	constructor(brokerUrl: string) {
		this.client = mqtt.connect(brokerUrl);
		this.setupMqttHandlers();
	}

	private setupMqttHandlers() {
		this.client.on("connect", () => {
			console.log("✅ Producer connected to MQTT broker");
			
			// Subscribe to all coordination topics
			this.client.subscribe([
				"qvac/register",
				"qvac/request-test",
				"qvac/test-start",
				"qvac/results",
				"qvac/heartbeat",
			], { qos: 1 }, (err) => {
				if (err) {
					console.error("❌ Failed to subscribe:", err);
					process.exit(1);
				}
				console.log("📡 Subscribed to coordination topics");
			});
		});

		this.client.on("message", (topic, payload) => {
			try {
				const message = JSON.parse(payload.toString());
				
				switch (topic) {
					case "qvac/register":
						this.handleConsumerRegistration(message);
						break;
					case "qvac/request-test":
						this.handleTestRequest(message);
						break;
					case "qvac/test-start":
						this.handleTestStart(message);
						break;
					case "qvac/results":
						this.handleTestResult(message);
						break;
					case "qvac/heartbeat":
						this.handleHeartbeat(message);
						break;
				}
			} catch (error) {
				console.error(`❌ Error handling ${topic}:`, error);
			}
		});

		this.client.on("error", (err) => {
			console.error("❌ MQTT error:", err);
		});
	}

	private handleConsumerRegistration(message: any) {
		const { consumerId, platform } = message;
		const filterTestIds: string[] | null = Array.isArray(message.filterTestIds) && message.filterTestIds.length > 0
			? message.filterTestIds as string[]
			: null;
		const now = Date.now();
		
		this.consumers.set(consumerId, {
			consumerId,
			platform,
			registeredAt: now,
			lastSeen: now,
			testsCompleted: 0,
			testsRunning: 0,
			filterTestIds,
		});

		console.log(`\n🔌 Consumer registered: ${consumerId} (${platform})`);
		this.displayStatus();

		// Send acknowledgment (include filtered total for this consumer if applicable)
		const totalForConsumer = filterTestIds && filterTestIds.length > 0
			? this.testQueue.filter(t => filterTestIds.includes(t.testId)).length
			: this.testQueue.length;

		this.client.publish(
			`qvac/register-ack/${consumerId}`,
			JSON.stringify({ status: "registered", totalTests: totalForConsumer }),
			{ qos: 1 },
		);
	}

	private handleTestRequest(message: any) {
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
			// Check if there are any eligible tests for any consumer
			const anyEligible = this.hasAnyEligibleTests();
			// Signal queue empty for this consumer
			this.client.publish(
				`qvac/test-assigned/${consumerId}`,
				JSON.stringify({ status: "queue-empty" }),
				{ qos: 1 },
			);
			console.log(`📭 No eligible tests for ${consumerId}`);
			// If no eligible tests remain globally and nothing assigned, complete batch
			if (!anyEligible && this.assignedTests.size === 0) {
				this.completeBatch();
			}
			return;
		}

		// Assign test
		const assignment: TestAssignment = {
			testCase: nextTest,
			consumerId,
			assignedAt: Date.now(),
			// Use max of: 2x estimate OR 40s (to match consumer 30s + 10s MQTT buffer)
			timeoutMs: Math.max(nextTest.estimatedDurationMs * 2, 40000),
		};

		this.assignedTests.set(nextTest.id, assignment);
		consumer.testsRunning++;

		// Remove from queue
		this.testQueue = this.testQueue.filter(t => t.id !== nextTest.id);

		// Send test to consumer
		this.client.publish(
			`qvac/test-assigned/${consumerId}`,
			JSON.stringify({
				status: "assigned",
				uniqueTestId: nextTest.id,
				test: JSON.parse(nextTest.payload),
			}),
			{ qos: 1 },
		);

		console.log(`📤 Assigned ${nextTest.testId} (${nextTest.id}) to ${consumerId}`);
		this.displayStatus();
	}

	private handleTestStart(message: any) {
		const { consumerId, uniqueTestId } = message;
		const assignment = this.assignedTests.get(uniqueTestId);

		if (!assignment) {
			console.warn(`⚠️  Test start for unknown test: ${uniqueTestId}`);
			return;
		}

		assignment.startedAt = Date.now();
		console.log(`▶️  Test ${assignment.testCase.testId} started by ${consumerId}`);
	}

	private handleTestResult(message: TestResult) {
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

		const statusIcon = outcome === "success" ? "✅" : "❌";
		console.log(
			`${statusIcon} Test ${assignment.testCase.testId} ${outcome} (${duration}ms) - ${consumerId}`,
		);

		if (message.error) {
			console.log(`   Error: ${message.error.substring(0, 100)}`);
		}

		this.displayStatus();
		this.checkBatchComplete();
	}

	private handleHeartbeat(message: any) {
		const { consumerId } = message;
		const consumer = this.consumers.get(consumerId);
		if (consumer) {
			consumer.lastSeen = Date.now();
		}
	}

	private getNextTestForConsumer(consumerId: string): TestCase | null {
		// If the consumer provided a filter, pick the first matching test; otherwise FIFO
		const consumer = this.consumers.get(consumerId);
		const filter = consumer?.filterTestIds && consumer.filterTestIds.length > 0 ? consumer.filterTestIds : null;
		if (filter) {
			const idx = this.testQueue.findIndex(t => filter.includes(t.testId));
			if (idx >= 0) return this.testQueue[idx] ?? null;
			return null;
		}
		return this.testQueue.length > 0 ? this.testQueue[0] ?? null : null;
	}

	private checkBatchComplete() {
		const queueEmpty = this.testQueue.length === 0;
		const noAssignedTests = this.assignedTests.size === 0;

		// If queue is not empty but contains no tests eligible for any consumer, treat as complete
		const noEligibleForAnyConsumer = !queueEmpty && !this.hasAnyEligibleTests();

		if ((queueEmpty || noEligibleForAnyConsumer) && noAssignedTests) {
			this.completeBatch();
		}
	}

	private hasAnyEligibleTests(): boolean {
		if (this.testQueue.length === 0) return false;
		if (this.consumers.size === 0) return this.testQueue.length > 0;
		// If any test in queue matches any consumer's filter (or consumer has no filter), it's eligible
		for (const test of this.testQueue) {
			for (const consumer of this.consumers.values()) {
				const filter = consumer.filterTestIds && consumer.filterTestIds.length > 0 ? consumer.filterTestIds : null;
				if (!filter || filter.includes(test.testId)) return true;
			}
		}
		return false;
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
					console.log(
						`   - ${assignment.testCase.testId} (${assignment.consumerId})`,
					);

					// Create timeout result
					const timeoutResult: TestResult = {
						consumerId: assignment.consumerId,
						testId: assignment.testCase.testId,
						uniqueTestId,
						outcome: "failure",
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

		console.log(
			`\n📊 Status: ${completed}/${total} completed | ${running} running | ${queued} queued | ${consumers} consumers\n`,
		);
	}

	private completeBatch() {
		if (this.shutdownTimer) return; // Already shutting down

		const duration = Date.now() - this.startTime;
		const totalTests = this.completedTests.size;
		const successCount = Array.from(this.completedTests.values()).filter(
			r => r.outcome === "success",
		).length;
		const failureCount = totalTests - successCount;

		console.log("\n" + "=".repeat(80));
		console.log("🎉 BATCH COMPLETE");
		console.log("=".repeat(80));
		console.log(`⏱️  Total Duration: ${(duration / 1000).toFixed(2)}s`);
		console.log(`📝 Total Tests: ${totalTests}`);
		console.log(`✅ Passed: ${successCount}`);
		console.log(`❌ Failed: ${failureCount}`);
		console.log(`📈 Success Rate: ${((successCount / totalTests) * 100).toFixed(1)}%`);
		console.log("\n👥 Consumer Stats:");
		
		for (const consumer of this.consumers.values()) {
			console.log(
				`   - ${consumer.consumerId} (${consumer.platform}): ${consumer.testsCompleted} tests`,
			);
		}

		console.log("\n📋 Test Results by Category:\n");
		this.displayResultsByCategory();

		// Signal all consumers to shutdown
		this.client.publish("qvac/batch-complete", JSON.stringify({ 
			status: "complete",
			totalTests,
			successCount,
			failureCount,
			duration,
		}), { qos: 1 });

		// Shutdown after 2 seconds
		this.shutdownTimer = setTimeout(() => {
			console.log("\n👋 Shutting down producer...\n");
			this.client.end(false, {}, () => process.exit(0));
		}, 2000);
	}

	private displayResultsByCategory() {
		const categories = new Map<string, { passed: number; failed: number }>();

		for (const result of this.completedTests.values()) {
			// Extract category from testId
			let category = result.testId;
			if (category.includes("-")) {
				category = category.split("-")[0] ?? category;
			}

			if (!categories.has(category)) {
				categories.set(category, { passed: 0, failed: 0 });
			}

			const stats = categories.get(category)!;
			if (result.outcome === "success") {
				stats.passed++;
			} else {
				stats.failed++;
			}
		}

		for (const [category, stats] of categories) {
			const total = stats.passed + stats.failed;
			const rate = total > 0 ? ((stats.passed / total) * 100).toFixed(0) : "0";
			console.log(
				`   ${category.padEnd(20)} ${stats.passed}/${total} (${rate}%)`,
			);
		}
	}

	public buildTestQueue() {
		console.log("🔨 Building test queue...\n");

		const builder = new TestBuilder();
		const tests = builder.buildAllTests();

		let counter = 0;
		for (const test of tests) {
			const testCase: TestCase = {
				id: `test-${Date.now()}-${counter++}`,
				testId: test.testId,
				payload: test.payload,
				dependency: test.dependency,
				estimatedDurationMs: test.estimatedDurationMs,
			};
			this.testQueue.push(testCase);
		}

		// Group by dependency for better reporting
		const byDependency = new Map<string, number>();
		for (const test of this.testQueue) {
			byDependency.set(
				test.dependency,
				(byDependency.get(test.dependency) || 0) + 1,
			);
		}

		console.log(`📦 Built ${this.testQueue.length} tests:`);
		for (const [dep, count] of byDependency) {
			console.log(`   - ${dep}: ${count} tests`);
		}
		console.log();
	}

	public start() {
		if (this.batchStarted) {
			console.warn("⚠️  Batch already started");
			return;
		}

		this.batchStarted = true;
		this.startTime = Date.now();

		console.log("🚀 Batch orchestration started");
		console.log(`📋 Total tests: ${this.testQueue.length}`);
		console.log("⏳ Waiting for consumers to register...\n");

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
		console.log("\n⚠️  Shutting down...");
		this.client.end(false, {}, () => process.exit(0));
	}
}

// Main execution
const orchestrator = new BatchOrchestrator(env.MQTT_BROKER_URL);

orchestrator.buildTestQueue();

// Wait for MQTT connection before starting
setTimeout(() => {
	orchestrator.start();
}, 1000);

// Handle shutdown signals
process.on("SIGINT", () => orchestrator.shutdown());
process.on("SIGTERM", () => orchestrator.shutdown());

