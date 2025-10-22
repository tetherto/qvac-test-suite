import mqtt, { type MqttClient } from "mqtt";
import {
	loadModel,
	unloadModel,
	completion as runCompletion,
	transcribe as runTranscribe,
	embed as runEmbed,
	LLAMA_3_2_1B_INST_Q4_0,
	WHISPER_TINY,
	VAD_SILERO_5_1_2,
	GTE_LARGE_FP16,
} from "@qvac/sdk";
import { env } from "./env";
import * as path from "path";
import * as os from "os";
import { TestExecutor } from "./test-executor";

interface TestMessage {
	testId: string;
	params: any;
	expectation: any;
	expectedOutcome?: string;
}

interface TestAssignment {
	status: string;
	uniqueTestId?: string;
	test?: TestMessage;
	totalTests?: number;
}

export class BatchConsumer {
	private client: MqttClient;
	private consumerId: string;
	private platform: string;
	private llmModelId: string | null = null;
	private whisperModelId: string | null = null;
	private embeddingModelId: string | null = null;
	private executor: TestExecutor;
	private registered = false;
	private testsCompleted = 0;
	private isProcessingTest = false;
	private shutdownRequested = false;

	constructor(brokerUrl: string, platform: string = "desktop") {
		this.consumerId = `consumer-${platform}-${os.hostname()}-${Date.now()}`;
		this.platform = platform;
		this.client = mqtt.connect(brokerUrl);
		this.executor = new TestExecutor();
		this.setupMqttHandlers();
	}

	private setupMqttHandlers() {
		this.client.on("connect", () => {
			console.log("✅ Consumer connected to MQTT broker");

			// Subscribe to consumer-specific topics
			this.client.subscribe(
				[
					`qvac/register-ack/${this.consumerId}`,
					`qvac/test-assigned/${this.consumerId}`,
					"qvac/batch-complete",
				],
				{ qos: 1 },
				(err) => {
					if (err) {
						console.error("❌ Failed to subscribe:", err);
						process.exit(1);
					}
					console.log("📡 Subscribed to consumer topics");
				},
			);
		});

		this.client.on("message", (topic, payload) => {
			try {
				const message = JSON.parse(payload.toString());

				if (topic === `qvac/register-ack/${this.consumerId}`) {
					this.handleRegistrationAck(message);
				} else if (topic === `qvac/test-assigned/${this.consumerId}`) {
					this.handleTestAssignment(message);
				} else if (topic === "qvac/batch-complete") {
					this.handleBatchComplete(message);
				}
			} catch (error) {
				console.error(`❌ Error handling ${topic}:`, error);
			}
		});

		this.client.on("error", (err) => {
			console.error("❌ MQTT error:", err);
		});
	}

	private async handleRegistrationAck(message: any) {
		console.log(`🔌 Registration acknowledged - ${message.totalTests} tests in queue`);
		this.registered = true;

		// Start requesting tests after models are loaded
		this.requestNextTest();
	}

	private async handleTestAssignment(assignment: TestAssignment) {
		if (assignment.status === "queue-empty") {
			console.log("📭 No more tests in queue");
			if (!this.isProcessingTest) {
				this.shutdown();
			}
			return;
		}

		if (assignment.status === "assigned" && assignment.test && assignment.uniqueTestId) {
			await this.executeTest(assignment.uniqueTestId, assignment.test);
		}
	}

	private handleBatchComplete(message: any) {
		console.log("\n🎉 Batch complete signal received");
		console.log(`📊 Total tests: ${message.totalTests}`);
		console.log(`✅ Passed: ${message.successCount}`);
		console.log(`❌ Failed: ${message.failureCount}`);
		console.log(`⏱️  Duration: ${(message.duration / 1000).toFixed(2)}s`);

		this.shutdownRequested = true;
		if (!this.isProcessingTest) {
			this.shutdown();
		}
	}

	private async executeTest(uniqueTestId: string, test: TestMessage) {
		this.isProcessingTest = true;
		const { testId, params, expectation } = test;

		console.log(`\n▶️  Executing: ${testId} (${uniqueTestId})`);

		// Notify producer that test has started
		this.client.publish(
			"qvac/test-start",
			JSON.stringify({
				consumerId: this.consumerId,
				uniqueTestId,
				timestamp: new Date().toISOString(),
			}),
			{ qos: 1 },
		);

		const startTime = Date.now();

		try {
			// ============================================================
			// 🧹 CLEAN SLATE STRATEGY: Reload model before EACH test
			// ============================================================
			// This ensures complete test isolation by:
			// 1. Clearing any corrupted SDK state from previous tests
			// 2. Preventing context overflow errors from affecting subsequent tests
			// 3. Ensuring each test starts with a fresh model instance
			// ============================================================
			
			// Determine which model to use and reload it fresh
			let modelId: string | null = null;
			
			if (testId.startsWith("transcription")) {
				// Reload Whisper model for clean state
				if (this.whisperModelId) {
					console.log(`   🔄 Reloading Whisper model for clean state...`);
					await unloadModel({ modelId: this.whisperModelId });
					this.whisperModelId = await loadModel({
						modelSrc: WHISPER_TINY,
						modelType: "whisper",
						vadModelSrc: VAD_SILERO_5_1_2,
						modelConfig: {
							mode: "caption",
							output_format: "plaintext",
							min_seconds: 2,
							max_seconds: 6,
							audio_format: "f32le",
						},
					});
					console.log(`   ✅ Whisper model reloaded: ${this.whisperModelId.substring(0, 12)}...`);
				}
				modelId = this.whisperModelId;
				
			} else if (testId.startsWith("embed")) {
				// Reload Embedding model for clean state
				if (this.embeddingModelId) {
					console.log(`   🔄 Reloading Embedding model for clean state...`);
					await unloadModel({ modelId: this.embeddingModelId });
					this.embeddingModelId = await loadModel({
						modelSrc: GTE_LARGE_FP16,
						modelType: "embeddings",
					});
					console.log(`   ✅ Embedding model reloaded: ${this.embeddingModelId.substring(0, 12)}...`);
				}
				modelId = this.embeddingModelId;
				
			} else if (testId.startsWith("completion") || testId.startsWith("model-load") || testId.startsWith("model-unload")) {
				// Reload LLM model for clean state (unless this IS a model loading test)
				if (this.llmModelId && !testId.startsWith("model-load-llm") && !testId.startsWith("model-unload")) {
					console.log(`   🔄 Reloading LLM model for clean state...`);
					await unloadModel({ modelId: this.llmModelId });
					this.llmModelId = await loadModel({
						modelSrc: LLAMA_3_2_1B_INST_Q4_0,
						modelType: "llm",
						modelConfig: {
							verbosity: 0,
							ctx_size: 2048,
						},
					});
					console.log(`   ✅ LLM model reloaded: ${this.llmModelId.substring(0, 12)}...`);
				}
				modelId = this.llmModelId;
			}

		// Set timeout - 90 seconds max for all tests (increased from 60s)
		const timeoutMs = 90000; // 1.5 minutes
			
			// Execute the test with timeout
			const testPromise = this.executor.executeTest(
				testId,
				modelId,
				params,
				expectation,
			);

			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error(`Test timeout after ${timeoutMs / 1000}s`)), timeoutMs);
			});

			const result = await Promise.race([testPromise, timeoutPromise]);

			const duration = Date.now() - startTime;
			const outcome = result.passed ? "success" : "failure";

			console.log(`${outcome === "success" ? "✅" : "❌"} ${testId} ${outcome} (${duration}ms)`);
			if (!result.passed && result.output) {
				console.log(`   Output: ${result.output}`);
			}

			// Add small delay after each test to let GPU recover
			await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay

			// Update model ID if test returned a new one (for model reload/switch tests)
			if (result.modelId) {
				if (testId.startsWith("model-load-llm") || testId.startsWith("model-switch") || testId.startsWith("model-reload") || testId.startsWith("completion")) {
					this.llmModelId = result.modelId;
					console.log(`   🔄 Updated LLM model ID: ${result.modelId.substring(0, 12)}...`);
				} else if (testId.startsWith("model-load-embedding")) {
					this.embeddingModelId = result.modelId;
					console.log(`   🔄 Updated Embedding model ID: ${result.modelId.substring(0, 12)}...`);
				} else if (testId.startsWith("model-load-whisper")) {
					this.whisperModelId = result.modelId;
					console.log(`   🔄 Updated Whisper model ID: ${result.modelId.substring(0, 12)}...`);
				}
			}

			// Send result to producer
			this.client.publish(
				"qvac/results",
				JSON.stringify({
					consumerId: this.consumerId,
					testId,
					uniqueTestId,
					outcome,
					duration,
					timestamp: new Date().toISOString(),
					output: result.output,
					error: result.passed ? undefined : result.output,
				}),
				{ qos: 1 },
			);

			this.testsCompleted++;
		} catch (error: any) {
			const duration = Date.now() - startTime;
			console.error(`❌ ${testId} failed:`, error.message);

			// Send failure result
			this.client.publish(
				"qvac/results",
				JSON.stringify({
					consumerId: this.consumerId,
					testId,
					uniqueTestId,
					outcome: "failure",
					duration,
					timestamp: new Date().toISOString(),
					error: error.message,
				}),
				{ qos: 1 },
			);
		}

		this.isProcessingTest = false;

		// Request next test if not shutting down
		if (!this.shutdownRequested) {
			// Small delay to avoid overwhelming the producer
			setTimeout(() => this.requestNextTest(), 100);
		} else {
			this.shutdown();
		}
	}

	private requestNextTest() {
		if (!this.registered || this.isProcessingTest || this.shutdownRequested) {
			return;
		}

		this.client.publish(
			"qvac/request-test",
			JSON.stringify({
				consumerId: this.consumerId,
				timestamp: new Date().toISOString(),
			}),
			{ qos: 1 },
		);
	}

	private async registerWithProducer() {
		console.log(`🔌 Registering as: ${this.consumerId}`);
		this.client.publish(
			"qvac/register",
			JSON.stringify({
				consumerId: this.consumerId,
				platform: this.platform,
				timestamp: new Date().toISOString(),
			}),
			{ qos: 1 },
		);
	}

	public async initialize() {
		console.log("🔧 Initializing consumer...");
		console.log(`📱 Platform: ${this.platform}`);
		console.log(`🆔 Consumer ID: ${this.consumerId}\n`);

		// Load models
		console.log("📦 Loading models...");

		try {
			console.log("   - Loading LLM model...");
			this.llmModelId = await loadModel({
				modelSrc: LLAMA_3_2_1B_INST_Q4_0,
				modelType: "llm",
				modelConfig: {
					verbosity: 0, // Reduce logging overhead
					ctx_size: 2048, // Increase context size for better performance
				},
			});
			console.log(`   ✅ LLM loaded: ${this.llmModelId}`);

			console.log("   - Loading Whisper model...");
			this.whisperModelId = await loadModel({
				modelSrc: WHISPER_TINY,
				modelType: "whisper",
				vadModelSrc: VAD_SILERO_5_1_2,
				modelConfig: {
					mode: "caption",
					output_format: "plaintext",
					min_seconds: 2,
					max_seconds: 6,
					audio_format: "f32le",
				},
			});
			console.log(`   ✅ Whisper loaded: ${this.whisperModelId}`);

			console.log("   - Loading Embedding model...");
			this.embeddingModelId = await loadModel({
				modelSrc: GTE_LARGE_FP16,
				modelType: "embeddings",
			});
			console.log(`   ✅ Embedding loaded: ${this.embeddingModelId}\n`);

			console.log("✅ All models loaded successfully\n");

			// Wait a bit for MQTT to be fully connected
			await new Promise(resolve => setTimeout(resolve, 1000));

			// Register with producer
			await this.registerWithProducer();
		} catch (error: any) {
			console.error("❌ Failed to initialize:", error);
			process.exit(1);
		}
	}

	private shutdown() {
		console.log(`\n👋 Consumer shutting down...`);
		console.log(`📊 Tests completed: ${this.testsCompleted}`);

		this.client.end(false, {}, () => {
			console.log("✅ Disconnected from MQTT");
			process.exit(0);
		});
	}

	public forceShutdown() {
		console.log("\n⚠️  Force shutdown requested");
		this.shutdownRequested = true;
		if (!this.isProcessingTest) {
			this.shutdown();
		}
	}
}

// Main execution
const consumer = new BatchConsumer(env.MQTT_BROKER_URL);

consumer.initialize().catch((err) => {
	console.error("❌ Fatal error:", err);
	process.exit(1);
});

// Handle shutdown signals
process.on("SIGINT", () => consumer.forceShutdown());
process.on("SIGTERM", () => consumer.forceShutdown());

