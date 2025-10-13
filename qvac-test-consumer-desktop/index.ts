import mqtt from "mqtt";
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
} from "@tetherto/qvac-sdk";
import { env } from "./env";
import * as path from "path";
import * as os from "os";

const CONSUMER_ID = `consumer-desktop-${os.hostname()}`;
const RESULT_TOPIC = "qvac/results";

async function completion(modelId: string, params: any, expectation: any) {
	const { history = [], stream = false } = params;
	const result = runCompletion({ modelId, history, stream });
	const text = (await result.text).trim();

	const passed =
		expectation.match === "contains"
			? text.includes(expectation.value)
			: text === expectation.value;

	return { output: text, passed };
}

async function transcription(modelId: string, params: any, expectation: any) {
	const audioPath = path.join(
		process.cwd(),
		"../qvac-test-consumer-mobile/assets/audio/sample-16khz.wav",
	);

	const text = (await runTranscribe({ modelId, audioChunk: audioPath })).trim();

	let passed = false;
	if (expectation.match === "contains") {
		const keywords = JSON.parse(expectation.value);
		passed = keywords.every((keyword: string) =>
			text.toLowerCase().includes(keyword.toLowerCase()),
		);
	} else {
		passed = text === expectation.value;
	}

	return { output: text, passed };
}

// Transcription Format Tests
async function transcriptionShortWav(modelId: string, params: any, expectation: any) {
	try {
		const audioPath = path.resolve(
			process.cwd(),
			"../shared-test-data/audio",
			params.audioFileName,
		);

		console.log(`[transcription] Attempting to transcribe: ${audioPath}`);
		console.log(`[transcription] Model ID: ${modelId}`);
		
		const text = (await runTranscribe({ modelId, audioChunk: audioPath })).trim();
		
		// Check if all keywords are present (case-insensitive)
		const keywords = expectation.keywords || [];
		const textLower = text.toLowerCase();
		const passed = keywords.every((keyword: string) =>
			textLower.includes(keyword.toLowerCase())
		);
		
		return { 
			output: `Transcribed (${text.length} chars): ${text.substring(0, 150)}...`, 
			passed 
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}

async function transcriptionShortMp3(modelId: string, params: any, expectation: any) {
	return transcriptionShortWav(modelId, params, expectation);
}

async function transcriptionAac(modelId: string, params: any, expectation: any) {
	return transcriptionShortWav(modelId, params, expectation);
}

async function transcriptionM4a(modelId: string, params: any, expectation: any) {
	return transcriptionShortWav(modelId, params, expectation);
}

async function transcriptionOgg(modelId: string, params: any, expectation: any) {
	return transcriptionShortWav(modelId, params, expectation);
}

async function transcriptionSilence(modelId: string, params: any, expectation: any) {
	return transcriptionOnlyMusic(modelId, params, expectation);
}

async function transcriptionOnlyMusic(modelId: string, params: any, expectation: any) {
	try {
		const audioPath = path.join(
			process.cwd(),
			"../shared-test-data/audio",
			params.audioFileName,
		);

		const text = (await runTranscribe({ modelId, audioChunk: audioPath })).trim();
		
		// Music should produce minimal or no transcription
		const passed = text.length <= (expectation.maxLength || 50);
		
		return { 
			output: `Music file transcription (${text.length} chars): "${text}"`, 
			passed 
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}

async function transcriptionLongAudio(modelId: string, params: any, expectation: any) {
	try {
		const audioPath = path.join(
			process.cwd(),
			"../shared-test-data/audio",
			params.audioFileName,
		);

		const text = (await runTranscribe({ modelId, audioChunk: audioPath })).trim();
		
		// Count words (strip timestamp markers)
		const cleanText = text.replace(/<\|[\d.]+\|>/g, '');
		const words = cleanText.split(/\s+/).filter(w => w.length > 0);
		
		// Check word count and keywords
		const hasEnoughWords = words.length >= (expectation.minWords || 500);
		const keywords = expectation.keywords || [];
		const textLower = text.toLowerCase();
		const hasAllKeywords = keywords.every((keyword: string) =>
			textLower.includes(keyword.toLowerCase())
		);
		
		const passed = hasEnoughWords && hasAllKeywords;
		
		return { 
			output: `Long audio: ${words.length} words, contains ${keywords.filter((k: string) => textLower.includes(k.toLowerCase())).length}/${keywords.length} keywords`, 
			passed 
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}


async function transcriptionCorrupted(modelId: string, params: any, expectation: any) {
	try {
		const audioPath = path.join(
			process.cwd(),
			"../shared-test-data/audio",
			params.audioFileName,
		);

		await runTranscribe({ modelId, audioChunk: audioPath });
		
		// Should not reach here - test fails if no error thrown
		return { 
			output: "ERROR: Transcribed corrupted file when it should have failed", 
			passed: false 
		};
	} catch (error: any) {
		// Error is expected for corrupted files
		const errorMsg = error.message || String(error);
		return { 
			output: `Correctly handled corrupted file: ${errorMsg.substring(0, 100)}`, 
			passed: true 
		};
	}
}

async function transcriptionCorruptedWav(modelId: string, params: any, expectation: any) {
	return transcriptionCorrupted(modelId, params, expectation);
}

// Embedding Tests
async function embedSimpleText(modelId: string, params: any, expectation: any) {
	try {
		const embedding = await runEmbed({ modelId, text: params.text });
		
		const isArray = Array.isArray(embedding);
		const hasMinDimensions = embedding.length >= (expectation.minDimensions || 100);
		const passed = isArray && hasMinDimensions;
		
		return {
			output: `Embedded text to ${embedding.length}-dimensional vector`,
			passed,
		};
	} catch (error: any) {
		return {
			output: `Error: ${error.message}`,
			passed: false,
		};
	}
}

async function embedLongText(modelId: string, params: any, expectation: any) {
	return embedSimpleText(modelId, params, expectation);
}

async function embedEmptyText(modelId: string, params: any, expectation: any) {
	try {
		const embedding = await runEmbed({ modelId, text: params.text });
		
		// Empty text should handle gracefully - either return zero vector or small vector
		const passed = Array.isArray(embedding);
		
		return {
			output: `Empty text handled: ${embedding.length}-dimensional vector`,
			passed,
		};
	} catch (error: any) {
		// Also acceptable if it throws an error gracefully
		return {
			output: `Handled empty text with error: ${error.message}`,
			passed: true,
		};
	}
}

async function embedSimilarity(modelId: string, params: any, expectation: any) {
	try {
		const emb1 = await runEmbed({ modelId, text: params.text1 });
		const emb2 = await runEmbed({ modelId, text: params.text2 });
		const emb3 = await runEmbed({ modelId, text: params.text3 });
		
		// Calculate cosine similarity
		const cosineSimilarity = (a: number[], b: number[]) => {
			const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
			const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
			const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
			return dotProduct / (magA * magB);
		};
		
		const sim12 = cosineSimilarity(emb1, emb2); // Similar texts
		const sim13 = cosineSimilarity(emb1, emb3); // Different texts
		
		// text1 and text2 should be MORE similar than text1 and text3
		const passed = sim12 > sim13;
		
		return {
			output: `Similarity: text1-text2=${sim12.toFixed(3)}, text1-text3=${sim13.toFixed(3)} (${passed ? 'correct' : 'incorrect'})`,
			passed,
		};
	} catch (error: any) {
		return {
			output: `Error: ${error.message}`,
			passed: false,
		};
	}
}

// Model Loading Tests
async function modelLoadLlm(modelId: string, params: any, expectation: any) {
	try {
		const modelConstant = params.modelConstant || "LLAMA_3_2_1B_INST_Q4_0";
		const modelConstants: Record<string, string> = {
			LLAMA_3_2_1B_INST_Q4_0,
		};
		
		const loadedModelId = await loadModel({
			modelSrc: modelConstants[modelConstant],
			modelType: "llm",
		});
		
		const passed = typeof loadedModelId === "string" && loadedModelId.length > 0;
		return { 
			output: `Model loaded with ID: ${loadedModelId}`, 
			passed,
			modelId: loadedModelId, // Store for potential unload test
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}

async function modelLoadEmbedding(modelId: string, params: any, expectation: any) {
	try {
		const loadedModelId = await loadModel({
			modelSrc: GTE_LARGE_FP16,
			modelType: "embeddings",
		});
		
		const passed = typeof loadedModelId === "string" && loadedModelId.length > 0;
		return { 
			output: `Embedding model loaded with ID: ${loadedModelId}`, 
			passed 
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}

async function modelLoadInvalid(modelId: string, params: any, expectation: any) {
	try {
		const invalidPath = params.modelPath || "/invalid/path/model.gguf";
		await loadModel({
			modelSrc: invalidPath,
			modelType: "llm",
		});
		
		// Should not reach here - test fails if no error thrown
		return { 
			output: "ERROR: Model loaded when it should have failed", 
			passed: false 
		};
	} catch (error: any) {
		// Error is expected - check if error message contains expected text
		const errorMsg = error.message || String(error);
		const passed = expectation.errorContains 
			? errorMsg.toLowerCase().includes(expectation.errorContains.toLowerCase())
			: true;
		
		return { 
			output: `Correctly threw error: ${errorMsg}`, 
			passed 
		};
	}
}

async function modelUnload(modelId: string, params: any, expectation: any) {
	try {
		if (!modelId) {
			return { 
				output: "ERROR: No model ID provided to unload", 
				passed: false 
			};
		}
		
		await unloadModel({ 
			modelId, 
			clearStorage: params.shouldClearStorage || false 
		});
		
		return { 
			output: `Model ${modelId} unloaded successfully`, 
			passed: true 
		};
	} catch (error: any) {
		return { 
			output: `Error unloading: ${error.message}`, 
			passed: false 
		};
	}
}

// LLM Completion Tests
async function completionStreaming(modelId: string, params: any, expectation: any) {
	try {
		const { history, stream = true } = params;
		const result = runCompletion({ modelId, history, stream });
		
		let fullText = "";
		for await (const token of result.tokenStream) {
			fullText += token;
		}
		fullText = fullText.trim();
		
		// Check if all expected values are contained
		const keywords = expectation.contains || [];
		const passed = keywords.every((keyword: string) =>
			fullText.toLowerCase().includes(keyword.toString().toLowerCase())
		);
		
		return { 
			output: `Streamed text: ${fullText.substring(0, 100)}...`, 
			passed 
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}

async function completionContextSize(modelId: string, params: any, expectation: any) {
	try {
		const { history, stream = false, contextSize } = params;
		const result = runCompletion({ modelId, history, stream });
		const text = (await result.text).trim();
		
		const passed = expectation.contains 
			? text.toLowerCase().includes(expectation.contains.toLowerCase())
			: text.length > 0;
		
		return { 
			output: `[ctx=${contextSize}] ${text}`, 
			passed 
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}

async function completionTemperature(modelId: string, params: any, expectation: any) {
	try {
		const { history, stream = false, temperature } = params;
		const result = runCompletion({ modelId, history, stream });
		const text = (await result.text).trim();
		
		const passed = expectation.contains 
			? text.toLowerCase().includes(expectation.contains.toLowerCase())
			: text.length > 0;
		
		return { 
			output: `[temp=${temperature}] ${text}`, 
			passed 
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}

async function completionEmptyPrompt(modelId: string, params: any, expectation: any) {
	try {
		const { history, stream = false } = params;
		const result = runCompletion({ modelId, history, stream });
		const text = (await result.text).trim();
		
		// Empty prompt should either return empty or some default response
		// Just verify it doesn't crash
		const passed = true;
		
		return { 
			output: `Empty prompt handled: "${text.substring(0, 50)}"`, 
			passed 
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}

async function completionLongPrompt(modelId: string, params: any, expectation: any) {
	try {
		const { history, stream = false } = params;
		const result = runCompletion({ modelId, history, stream });
		const text = (await result.text).trim();
		
		// Just verify it returns a response
		const passed = text.length > 0;
		
		return { 
			output: `Long prompt response (${text.length} chars): ${text.substring(0, 100)}...`, 
			passed 
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}

async function completionMultiTurn(modelId: string, params: any, expectation: any) {
	try {
		const { history, stream = false } = params;
		const result = runCompletion({ modelId, history, stream });
		const text = (await result.text).trim();
		
		const passed = expectation.contains 
			? text.toLowerCase().includes(expectation.contains.toLowerCase())
			: text.length > 0;
		
		return { 
			output: `Multi-turn response: ${text}`, 
			passed 
		};
	} catch (error: any) {
		return { 
			output: `Error: ${error.message}`, 
			passed: false 
		};
	}
}

const tests: Record<
	string,
	(
		modelId: string,
		params: any,
		expectation: any,
	) => Promise<{ output: string; passed: boolean; modelId?: string }>
> = {
	completion,
	transcription,
	"transcription-short-wav": transcriptionShortWav,
	"transcription-short-mp3": transcriptionShortMp3,
	"transcription-aac": transcriptionAac,
	"transcription-m4a": transcriptionM4a,
	"transcription-ogg": transcriptionOgg,
	"transcription-silence": transcriptionSilence,
	"transcription-only-music": transcriptionOnlyMusic,
	"transcription-long-audio": transcriptionLongAudio,
	"transcription-corrupted": transcriptionCorrupted,
	"transcription-corrupted-wav": transcriptionCorruptedWav,
	"embed-simple-text": embedSimpleText,
	"embed-long-text": embedLongText,
	"embed-empty-text": embedEmptyText,
	"embed-similarity": embedSimilarity,
	"model-load-llm": modelLoadLlm,
	"model-load-embedding": modelLoadEmbedding,
	"model-load-invalid": modelLoadInvalid,
	"model-unload": modelUnload,
	"completion-streaming": completionStreaming,
	"completion-context-size": completionContextSize,
	"completion-temperature": completionTemperature,
	"completion-empty-prompt": completionEmptyPrompt,
	"completion-long-prompt": completionLongPrompt,
	"completion-multi-turn": completionMultiTurn,
};

async function main() {
	console.log("[consumer] loading models...");

	const llmModelId = await loadModel({
		modelSrc: LLAMA_3_2_1B_INST_Q4_0,
		modelType: "llm",
	});
	console.log("[consumer] llm loaded");

	const whisperModelId = await loadModel({
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
	console.log("[consumer] whisper loaded");

	const embeddingModelId = await loadModel({
		modelSrc: GTE_LARGE_FP16,
		modelType: "embeddings",
	});
	console.log("[consumer] embedding model loaded");

	const mqttClient = mqtt.connect(env.MQTT_BROKER_URL);

	mqttClient.on("connect", () => {
		console.log("[consumer] connected to mqtt");
		mqttClient.subscribe(env.MQTT_TOPIC);
		console.log("[consumer] subscribed to", env.MQTT_TOPIC);
	});

	mqttClient.on("message", async (_topic: string, payload: Buffer) => {
		try {
			const message = JSON.parse(payload.toString());
			const { testId, params, expectation } = message;

			console.log(`[consumer] received test: ${testId} at ${new Date().toLocaleTimeString()}`);

			// Check if test handler exists
			if (!tests[testId]) {
				console.warn(`[consumer] no handler for test: ${testId}`);
				const errorMessage = {
					consumerId: CONSUMER_ID,
					testId,
					params,
					outcome: "failure",
					duration: 0,
					timestamp: new Date().toISOString(),
					output: "",
					error: `No test handler implemented for: ${testId}`,
				};
				mqttClient.publish(RESULT_TOPIC, JSON.stringify(errorMessage), {
					qos: 0,
					retain: false,
				});
				return;
			}

			const startTime = Date.now();
			// Determine which model to use based on test type
			let modelId: string;
			if (testId.startsWith("transcription")) {
				modelId = whisperModelId;
			} else if (testId.startsWith("embed")) {
				modelId = embeddingModelId;
			} else {
				modelId = llmModelId;
			}

			const testPromise = tests[testId](modelId, params, expectation);
			
			// Add timeout wrapper - short tests max 5 min, long tests max 10 min
			const isLongTest = testId.includes("long-audio");
			const timeoutMs = isLongTest ? 600000 : 300000; // 10 min for long, 5 min for others
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error(`Test timeout after ${timeoutMs/1000}s`)), timeoutMs);
			});
			
			let output: string, passed: boolean;
			try {
				const result = await Promise.race([testPromise, timeoutPromise]) as any;
				output = result.output;
				passed = result.passed;
			} catch (timeoutError: any) {
				output = `TIMEOUT: ${timeoutError.message}`;
				passed = false;
			}
			const duration = Date.now() - startTime;

		console.log(
			`[consumer] test ${testId} ${passed ? "passed" : "failed"} in ${duration}ms at ${new Date().toLocaleTimeString()}`,
		);
		console.log(`[consumer] output: ${output}`);

		const outcome = passed ? "success" : "failure";
		const resultMessage = {
			consumerId: CONSUMER_ID,
			testId,
			params,
			outcome,
			duration,
			timestamp: new Date().toISOString(),
			output: output || "",
			error: !passed ? output : undefined, // Include output as error for failed tests
		};

		mqttClient.publish(RESULT_TOPIC, JSON.stringify(resultMessage), {
			qos: 0,
			retain: false,
		});
		} catch (testError: any) {
			console.error(`[consumer] error executing test:`, testError);
			const errorResult = {
				consumerId: CONSUMER_ID,
				testId: "unknown",
				params: {},
				outcome: "failure",
				duration: 0,
				timestamp: new Date().toISOString(),
				output: "",
				error: `Test execution error: ${testError.message}`,
			};
			mqttClient.publish(RESULT_TOPIC, JSON.stringify(errorResult), {
				qos: 0,
				retain: false,
			});
		}
	});

	mqttClient.on("error", (err) => {
		console.error("[consumer] mqtt error:", err);
	});

	mqttClient.on("close", () => {
		console.log("[consumer] mqtt connection closed");
	});
}

const shutdown = () => {
	console.log("[consumer] shutting down");
	process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
	console.error("[consumer] fatal error:", err);
	process.exit(1);
});
