import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import Constants from "expo-constants";
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
import * as FileSystem from "expo-file-system";
import { env } from "@/env";
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

interface BatchStats {
	testsCompleted: number;
	testsPassed: number;
	testsFailed: number;
	totalTests: number;
	currentTest: string;
	isComplete: boolean;
}

export default function BatchConsumer() {
	const [logs, setLogs] = useState<string[]>([]);
	const [stats, setStats] = useState<BatchStats>({
		testsCompleted: 0,
		testsPassed: 0,
		testsFailed: 0,
		totalTests: 0,
		currentTest: "",
		isComplete: false,
	});
	const [consumerId] = useState(
		`consumer-mobile-${Constants.deviceName || Constants.sessionId || "unknown"}-${Date.now()}`
	);

	const addLog = (message: string) => {
		console.log(message);
		setLogs((prev) => [...prev.slice(-50), message]); // Keep last 50 logs
	};

	useEffect(() => {
		let client: MqttClient;
		let executor: TestExecutor;
		let llmModelId: string | null = null;
		let whisperModelId: string | null = null;
		let embeddingModelId: string | null = null;
		let registered = false;
		let isProcessingTest = false;
		let shutdownRequested = false;

		const requestNextTest = () => {
			if (!registered || isProcessingTest || shutdownRequested) {
				return;
			}

			client.publish(
				"qvac/request-test",
				JSON.stringify({
					consumerId,
					timestamp: new Date().toISOString(),
				}),
				{ qos: 1 }
			);
		};

		const executeTest = async (uniqueTestId: string, test: TestMessage) => {
			isProcessingTest = true;
			const { testId, params, expectation } = test;

			addLog(`▶️  ${testId}`);
			setStats((prev) => ({ ...prev, currentTest: testId }));

			// Notify producer that test has started
			client.publish(
				"qvac/test-start",
				JSON.stringify({
					consumerId,
					uniqueTestId,
					timestamp: new Date().toISOString(),
				}),
				{ qos: 1 }
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
					if (whisperModelId) {
						addLog(`   🔄 Reloading Whisper...`);
						await unloadModel({ modelId: whisperModelId });
						whisperModelId = await loadModel({
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
						addLog(`   ✅ Whisper reloaded`);
					}
					modelId = whisperModelId;
					
				} else if (testId.startsWith("embed") || testId.startsWith("rag-")) {
					// Reload Embedding model for clean state (embeddings + RAG tests)
					if (embeddingModelId) {
						addLog(`   🔄 Reloading Embedding...`);
						await unloadModel({ modelId: embeddingModelId });
						embeddingModelId = await loadModel({
							modelSrc: GTE_LARGE_FP16,
							modelType: "embeddings",
						});
						addLog(`   ✅ Embedding reloaded`);
					}
					modelId = embeddingModelId;
					
				} else if (
					testId.startsWith("completion") ||
					testId.startsWith("model-load") ||
					testId.startsWith("model-unload")
				) {
					// Reload LLM model for clean state (unless this IS a model loading test)
					if (llmModelId && !testId.startsWith("model-load-llm") && !testId.startsWith("model-unload")) {
						addLog(`   🔄 Reloading LLM...`);
						await unloadModel({ modelId: llmModelId });
						llmModelId = await loadModel({
							modelSrc: LLAMA_3_2_1B_INST_Q4_0,
							modelType: "llm",
							modelConfig: {
								verbosity: 0 as 0,
								ctx_size: 2048,
							},
						});
						addLog(`   ✅ LLM reloaded`);
					}
					modelId = llmModelId;
				}

				// Set timeout - 1 minute max for all tests
				const timeoutMs = 90000; // 1.5 minutes (increased from 60s)

				// Execute the test with timeout
				const testPromise = executor.executeTest(testId, modelId, params, expectation);

				const timeoutPromise = new Promise<never>((_, reject) => {
					setTimeout(
						() => reject(new Error(`Test timeout after ${timeoutMs / 1000}s`)),
						timeoutMs
					);
				});

				const result = await Promise.race([testPromise, timeoutPromise]);

				const duration = Date.now() - startTime;
				const outcome = result.passed ? "success" : "failure";

				addLog(`${outcome === "success" ? "✅" : "❌"} ${testId} (${duration}ms)`);
				if (!result.passed && result.output) {
					addLog(`   ${result.output.substring(0, 100)}`);
				}

				// Add small delay after each test to let GPU recover
				await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay

				// Update model ID if test returned a new one
				if (result.modelId) {
					if (
						testId.startsWith("model-load-llm") ||
						testId.startsWith("model-switch") ||
						testId.startsWith("model-reload") ||
						testId.startsWith("completion")
					) {
						llmModelId = result.modelId;
					} else if (testId.startsWith("model-load-embedding")) {
						embeddingModelId = result.modelId;
					} else if (testId.startsWith("model-load-whisper")) {
						whisperModelId = result.modelId;
					}
				}

				// Update stats
				setStats((prev) => ({
					...prev,
					testsCompleted: prev.testsCompleted + 1,
					testsPassed: outcome === "success" ? prev.testsPassed + 1 : prev.testsPassed,
					testsFailed: outcome === "failure" ? prev.testsFailed + 1 : prev.testsFailed,
				}));

				// Send result to producer
				client.publish(
					"qvac/results",
					JSON.stringify({
						consumerId,
						testId,
						uniqueTestId,
						outcome,
						duration,
						timestamp: new Date().toISOString(),
						output: result.output,
						error: result.passed ? undefined : result.output,
					}),
					{ qos: 1 }
				);
			} catch (error: any) {
				const duration = Date.now() - startTime;
				addLog(`❌ ${testId} failed: ${error.message}`);

				// Update stats
				setStats((prev) => ({
					...prev,
					testsCompleted: prev.testsCompleted + 1,
					testsFailed: prev.testsFailed + 1,
				}));

				// Send failure result
				client.publish(
					"qvac/results",
					JSON.stringify({
						consumerId,
						testId,
						uniqueTestId,
						outcome: "failure",
						duration,
						timestamp: new Date().toISOString(),
						error: error.message,
					}),
					{ qos: 1 }
				);
			}

			isProcessingTest = false;

			// Request next test if not shutting down
			if (!shutdownRequested) {
				setTimeout(() => requestNextTest(), 100);
			}
		};

		(async () => {
			try {
				addLog("🔧 Initializing consumer...");
				addLog(`📱 Device: ${Constants.deviceName || "Unknown"}`);
				addLog(`🆔 ID: ${consumerId.substring(0, 30)}...\n`);

				// Initialize executor
				executor = new TestExecutor();

				// Load models
				addLog("📦 Loading models...");

				addLog("   - Loading LLM...");
				llmModelId = await loadModel({
					modelSrc: LLAMA_3_2_1B_INST_Q4_0,
					modelType: "llm",
					modelConfig: {
						verbosity: 0 as 0, // Reduce logging overhead
						ctx_size: 2048, // Increase context size for better performance
					},
				});
				addLog(`   ✅ LLM loaded`);

				addLog("   - Loading Whisper...");
				// Download VAD model first
				await loadModel({
					modelSrc: VAD_SILERO_5_1_2,
					modelType: "whisper",
					downloadOnly: true,
				});
				const vadModelPath = `${FileSystem.documentDirectory}.qvac/models/ggml-silero-v5.1.2.bin`;

				whisperModelId = await loadModel({
					modelSrc: WHISPER_TINY,
					modelType: "whisper",
					vadModelSrc: vadModelPath,
					modelConfig: {
						mode: "caption",
						output_format: "plaintext",
						min_seconds: 2,
						max_seconds: 6,
						audio_format: "f32le",
					},
				});
				addLog(`   ✅ Whisper loaded`);

				addLog("   - Loading Embedding...");
				embeddingModelId = await loadModel({
					modelSrc: GTE_LARGE_FP16,
					modelType: "embeddings",
				});
				addLog(`   ✅ Embedding loaded\n`);

				addLog("✅ All models loaded\n");

				// Connect to MQTT
				const protocol = env.useSsl ? "wss" : "ws";
				const port = env.useSsl
					? env.EXPO_PUBLIC_MQTT_PORT_SSL
					: env.EXPO_PUBLIC_MQTT_PORT;
				const brokerUrl = `${protocol}://${env.EXPO_PUBLIC_MQTT_HOST}:${port}${env.EXPO_PUBLIC_MQTT_PATH}`;

				addLog("📡 Connecting to MQTT...");
				client = mqtt.connect(brokerUrl);

				client.on("connect", () => {
					addLog("✅ Connected to MQTT broker");

					// Subscribe to consumer-specific topics
					client.subscribe(
						[
							`qvac/register-ack/${consumerId}`,
							`qvac/test-assigned/${consumerId}`,
							"qvac/batch-complete",
						],
						{ qos: 1 },
						(err) => {
							if (err) {
								addLog(`❌ Failed to subscribe: ${err.message}`);
								return;
							}
							addLog("📡 Subscribed to topics\n");

							// Register with producer
							addLog(`🔌 Registering with producer...`);
							client.publish(
								"qvac/register",
								JSON.stringify({
									consumerId,
									platform: "mobile-android",
									timestamp: new Date().toISOString(),
								}),
								{ qos: 1 }
							);
						}
					);
				});

				client.on("message", async (topic, payload) => {
					try {
						const message = JSON.parse(payload.toString());

						if (topic === `qvac/register-ack/${consumerId}`) {
							addLog(`🔌 Registration ack - ${message.totalTests} tests in queue\n`);
							registered = true;
							setStats((prev) => ({ ...prev, totalTests: message.totalTests }));
							requestNextTest();
						} else if (topic === `qvac/test-assigned/${consumerId}`) {
							if (message.status === "queue-empty") {
								addLog("📭 No more tests in queue");
								return;
							}

							if (message.status === "assigned" && message.test && message.uniqueTestId) {
								await executeTest(message.uniqueTestId, message.test);
							}
						} else if (topic === "qvac/batch-complete") {
							addLog("\n🎉 Batch complete!");
							addLog(`📊 Total: ${message.totalTests}`);
							addLog(`✅ Passed: ${message.successCount}`);
							addLog(`❌ Failed: ${message.failureCount}`);
							addLog(`⏱️  Duration: ${(message.duration / 1000).toFixed(2)}s`);

							setStats((prev) => ({ ...prev, isComplete: true }));
							shutdownRequested = true;
						}
					} catch (error: any) {
						addLog(`❌ Error handling ${topic}: ${error.message}`);
					}
				});

				client.on("error", (err) => {
					addLog(`❌ MQTT error: ${err.message}`);
				});
			} catch (error: any) {
				addLog(`❌ Fatal error: ${error.message}`);
			}
		})();

		return () => {
			client?.end();
		};
	}, [consumerId]);

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>QVAC Batch Consumer (Mobile)</Text>
				<Text style={styles.consumerId}>{consumerId.substring(0, 40)}...</Text>
			</View>

			<View style={styles.statsContainer}>
				<View style={styles.statBox}>
					<Text style={styles.statValue}>{stats.testsCompleted}</Text>
					<Text style={styles.statLabel}>Completed</Text>
				</View>
				<View style={styles.statBox}>
					<Text style={[styles.statValue, { color: "#4ade80" }]}>{stats.testsPassed}</Text>
					<Text style={styles.statLabel}>Passed</Text>
				</View>
				<View style={styles.statBox}>
					<Text style={[styles.statValue, { color: "#f87171" }]}>{stats.testsFailed}</Text>
					<Text style={styles.statLabel}>Failed</Text>
				</View>
				<View style={styles.statBox}>
					<Text style={styles.statValue}>{stats.totalTests}</Text>
					<Text style={styles.statLabel}>Total</Text>
				</View>
			</View>

			{stats.currentTest && !stats.isComplete && (
				<View style={styles.currentTestContainer}>
					<Text style={styles.currentTestLabel}>Current Test:</Text>
					<Text style={styles.currentTest}>{stats.currentTest}</Text>
				</View>
			)}

			{stats.isComplete && (
				<View style={styles.completeContainer}>
					<Text style={styles.completeText}>✅ Batch Complete!</Text>
				</View>
			)}

			<View style={styles.logsContainer}>
				<Text style={styles.logsTitle}>Console Logs</Text>
				<ScrollView
					style={styles.logsScroll}
					contentContainerStyle={styles.logsContent}
				>
					{logs.map((log, index) => (
						<Text key={index} style={styles.logLine}>
							{log}
						</Text>
					))}
				</ScrollView>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#0a0a0a",
		padding: 16,
	},
	header: {
		marginBottom: 20,
		paddingBottom: 16,
		borderBottomWidth: 1,
		borderBottomColor: "#333",
	},
	title: {
		fontSize: 20,
		fontWeight: "bold",
		color: "#fff",
		marginBottom: 4,
	},
	consumerId: {
		fontSize: 10,
		color: "#888",
		fontFamily: "monospace",
	},
	statsContainer: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginBottom: 20,
		gap: 8,
	},
	statBox: {
		flex: 1,
		backgroundColor: "#1a1a1a",
		padding: 12,
		borderRadius: 8,
		alignItems: "center",
	},
	statValue: {
		fontSize: 24,
		fontWeight: "bold",
		color: "#60a5fa",
		marginBottom: 4,
	},
	statLabel: {
		fontSize: 10,
		color: "#888",
		textTransform: "uppercase",
	},
	currentTestContainer: {
		backgroundColor: "#1a1a1a",
		padding: 12,
		borderRadius: 8,
		marginBottom: 16,
	},
	currentTestLabel: {
		fontSize: 10,
		color: "#888",
		textTransform: "uppercase",
		marginBottom: 4,
	},
	currentTest: {
		fontSize: 14,
		color: "#60a5fa",
		fontFamily: "monospace",
	},
	completeContainer: {
		backgroundColor: "#1a1a1a",
		padding: 16,
		borderRadius: 8,
		marginBottom: 16,
		alignItems: "center",
	},
	completeText: {
		fontSize: 18,
		color: "#4ade80",
		fontWeight: "bold",
	},
	logsContainer: {
		flex: 1,
		backgroundColor: "#1a1a1a",
		borderRadius: 8,
		overflow: "hidden",
	},
	logsTitle: {
		fontSize: 12,
		color: "#888",
		textTransform: "uppercase",
		padding: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#333",
	},
	logsScroll: {
		flex: 1,
	},
	logsContent: {
		padding: 12,
	},
	logLine: {
		fontSize: 11,
		color: "#ddd",
		fontFamily: "monospace",
		marginBottom: 4,
	},
});

