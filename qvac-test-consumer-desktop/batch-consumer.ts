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
} from "@tetherto/sdk-dev";
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
	private translationModelId: string | null = null;
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
		
		// Handle unhandled promise rejections (e.g., async RPC errors from SDK)
		process.on("unhandledRejection", (reason: any) => {
			console.warn(`⚠️  Unhandled promise rejection: ${reason?.message || reason}`);
			// Don't crash - just log it and continue
		});
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
		// Determine which model to use based on test type (models kept loaded for speed)
	let modelId: string | null = null;
	
	// Determine which model to use based on test type
	if (testId.startsWith("transcription")) {
		modelId = this.whisperModelId;
	} else if (testId.startsWith("translation")) {
		modelId = this.translationModelId;
	} else if (testId.startsWith("embed") || testId.startsWith("rag-")) {
		modelId = this.embeddingModelId;
	} else if (testId.startsWith("completion") || testId.startsWith("model-load") || testId.startsWith("model-unload") || testId.startsWith("model-switch") || testId.startsWith("model-reload")) {
		modelId = this.llmModelId;
	} 
	// Handle error and parameter validation tests
	else if (testId.startsWith("error-") || testId.startsWith("param-")) {
		// Determine model based on test content
		if (testId.includes("completion") || testId.includes("translation") || testId.includes("malformed")) {
			modelId = this.llmModelId;
		} else if (testId.includes("embedding") || testId.includes("rag")) {
			modelId = this.embeddingModelId;
		} else if (testId.includes("transcription")) {
			modelId = this.whisperModelId;
		} else {
			// Default to LLM for generic error tests
			modelId = this.llmModelId;
		}
	}

	// Set timeout based on test type
	// - Known destructive tests (embed code, context overflow, corrupted audio): 10s (fail fast)
	// - Large RAG documents (32KB+): 120s (complex chunking and embedding)
	// - Medium RAG documents (10KB): 90s (moderate chunking and embedding)
	// - Small RAG documents: 60s (basic chunking and embedding)
	// - Long prompt tests: 60s (large input processing)
	// - Transcription tests: 60s (legitimate processing time for audio)
	// - Normal tests: 30s
	const isDestructiveTest = testId.includes("embed-python") || testId.includes("embed-javascript") || 
	                          testId.includes("embed-json") || testId.includes("embed-html") ||
	                          testId.includes("very-long") || testId.includes("extremely-long") ||
	                          testId.includes("corrupted");
	const isLargeRagTest = testId.includes("rag-large");
	const isMediumRagTest = testId.includes("rag-medium");
	const isSmallRagTest = testId.includes("rag-small");
	const isLongPromptTest = testId === "completion-long-prompt";
	const isTranscriptionTest = testId.startsWith("transcription-");
	
	let timeoutMs: number;
	if (isDestructiveTest) {
		timeoutMs = 10000; // 10s
	} else if (isLargeRagTest) {
		timeoutMs = 120000; // 120s
	} else if (isMediumRagTest) {
		timeoutMs = 90000; // 90s
	} else if (isSmallRagTest || isLongPromptTest) {
		timeoutMs = 60000; // 60s
	} else if (isTranscriptionTest) {
		timeoutMs = 60000; // 60s
	} else {
		timeoutMs = 60000; // 60s (increased from 30s for more stability)
	}
	
	if (isDestructiveTest) {
		console.log(`   ⚠️  Destructive test - reduced timeout to ${timeoutMs / 1000}s`);
	} else if (isLargeRagTest || isMediumRagTest || isSmallRagTest) {
		console.log(`   📚 RAG test - extended timeout to ${timeoutMs / 1000}s`);
	} else if (isLongPromptTest) {
		console.log(`   📝 Long prompt test - extended timeout to ${timeoutMs / 1000}s`);
	} else if (isTranscriptionTest) {
		console.log(`   🎤 Transcription test - extended timeout to ${timeoutMs / 1000}s`);
	}
			
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

		// Format expected and actual values for debugging
		const expected = this.formatExpectation(expectation);
		const actual = result.output || "No output";
		
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
				expected: outcome === "failure" ? expected : undefined,
				actual: outcome === "failure" ? actual : undefined,
			}),
			{ qos: 1 },
		);

		this.testsCompleted++;
	} catch (error: any) {
		const duration = Date.now() - startTime;
		const errorMsg = error.message || "Unknown error";
		
		console.error(`❌ ${testId} failed:`, errorMsg);

		// Check if this looks like an SDK crash/hang
		const isSdkCrash = errorMsg.includes("timeout") || errorMsg.includes("hung") || errorMsg.includes("GGML");
		if (isSdkCrash) {
			console.error(`   ⚠️  SDK CRASH DETECTED (C++ level - no recovery possible)`);
			console.error(`   ℹ️  Subsequent tests may fail (cascade effect)`);
		}

		// Format expected for error case
		const expected = this.formatExpectation(expectation);
		const actual = `Error: ${errorMsg}`;
		
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
				error: errorMsg,
				expected,
				actual,
				sdkCrash: isSdkCrash ? true : undefined,
			}),
			{ qos: 1 },
		);
		
		this.testsCompleted++;
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

	private formatExpectation(expectation: any): string {
		if (!expectation) return "No expectation defined";
		
		const parts: string[] = [];
		
		if (expectation.validation) {
			parts.push(`Validation: ${expectation.validation}`);
		}
		
		if (expectation.keywords && expectation.keywords.length > 0) {
			parts.push(`Keywords: ${expectation.keywords.join(", ")}`);
		}
		
		if (expectation.minLength) {
			parts.push(`Min length: ${expectation.minLength}`);
		}
		
		if (expectation.minDimensions) {
			parts.push(`Min dimensions: ${expectation.minDimensions}`);
		}
		
		if (expectation.minChunks) {
			parts.push(`Min chunks: ${expectation.minChunks}`);
		}
		
		if (expectation.maxChunks) {
			parts.push(`Max chunks: ${expectation.maxChunks}`);
		}
		
		if (expectation.errorExpected) {
			parts.push("Error expected: true");
		}
		
		return parts.length > 0 ? parts.join("\n") : "Test should pass";
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
				n_discarded: 256, // Enable context overflow prevention during generation (Gianfranco's recommendation)
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

	// Translation uses the LLM model (no separate translation model type in SDK)
	this.translationModelId = this.llmModelId;
	console.log(`   ℹ️  Translation will use LLM model\n`);

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

