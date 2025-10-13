import mqtt, { type IClientPublishOptions } from "mqtt";
import { env } from "./env";

interface TestResultMessage {
	consumerId: string;
	testId: string;
	params: Record<string, unknown> | undefined;
	outcome: "success" | "failure";
	duration: number;
	timestamp: string;
	error?: string;
}

const {
	MQTT_BROKER_URL: brokerUrl,
	MQTT_TOPIC: topic,
	MQTT_PUBLISH_INTERVAL_MS: intervalMs,
} = env;

const RESULT_TOPIC = "qvac/results";

const client = mqtt.connect(brokerUrl);
let publishTimer: NodeJS.Timeout | null = null;
let successCounter = 0;
let testCounter = 0;
let transcriptionSuccessCounter = 0;

const publishOptions: IClientPublishOptions = { qos: 0, retain: false };

const randomNumberString = () =>
	Math.floor(Math.random() * 1_000_000_000).toString();

const buildModelLoadTest = () => {
	return JSON.stringify({
		testId: "model-load-llm",
		params: {
			modelType: "llm",
			modelConstant: "LLAMA_3_2_1B_INST_Q4_0",
		},
		expectation: {
			type: "model-loaded",
			validation: "returns-model-id",
		},
		expectedOutcome: "pass",
	});
};

const buildModelUnloadTest = () => {
	return JSON.stringify({
		testId: "model-unload",
		params: {
			// Will use previously loaded model ID
			shouldClearStorage: false,
		},
		expectation: {
			type: "model-unloaded",
			validation: "unloads-successfully",
		},
		expectedOutcome: "pass",
	});
};

const buildModelLoadInvalidTest = () => {
	return JSON.stringify({
		testId: "model-load-invalid",
		params: {
			modelType: "llm",
			modelPath: "/invalid/path/nonexistent-model.gguf",
		},
		expectation: {
			type: "error",
			validation: "throws-error",
			errorContains: "failed to locate",
		},
		expectedOutcome: "pass", // Pass means it correctly threw an error
	});
};

const buildModelLoadEmbeddingTest = () => {
	return JSON.stringify({
		testId: "model-load-embedding",
		params: {
			modelType: "embeddings",
			modelConstant: "GTE_LARGE_FP16",
		},
		expectation: {
			type: "model-loaded",
			validation: "returns-model-id",
		},
		expectedOutcome: "pass",
	});
};

// LLM Completion Test Builders
const buildCompletionStreamingTest = () => {
	return JSON.stringify({
		testId: "completion-streaming",
		params: {
			history: [
				{ role: "user", content: "What is 1+1+1+1+1? Answer with only the number." },
			],
			stream: true,
		},
		expectation: {
			contains: ["5"],
			validation: "contains-all",
		},
		expectedOutcome: "pass",
	});
};

const buildCompletionContextSizeTest = (contextSize: number) => {
	return JSON.stringify({
		testId: "completion-context-size",
		params: {
			history: [
				{ role: "user", content: "What is 1+1? Answer with only the number." },
			],
			stream: false,
			contextSize,
		},
		expectation: {
			contains: "2",
			validation: "contains",
		},
		expectedOutcome: "pass",
	});
};

const buildCompletionTemperatureTest = (temperature: number) => {
	return JSON.stringify({
		testId: "completion-temperature",
		params: {
			history: [
				{ role: "user", content: "What is 2+2? Answer with just the number." },
			],
			stream: false,
			temperature,
		},
		expectation: {
			contains: "4",
			validation: "contains",
		},
		expectedOutcome: "pass",
	});
};

const buildCompletionEmptyPromptTest = () => {
	return JSON.stringify({
		testId: "completion-empty-prompt",
		params: {
			history: [
				{ role: "user", content: "" },
			],
			stream: false,
		},
		expectation: {
			validation: "handles-gracefully",
		},
		expectedOutcome: "pass",
	});
};

const buildCompletionLongPromptTest = () => {
	const longText = "In a world where technology advances rapidly, ".repeat(50);
	return JSON.stringify({
		testId: "completion-long-prompt",
		params: {
			history: [
				{ 
					role: "user", 
					content: `${longText}Please summarize the above in one word: technology` 
				},
			],
			stream: false,
		},
		expectation: {
			validation: "returns-response",
		},
		expectedOutcome: "pass",
	});
};

const buildCompletionMultiTurnTest = () => {
	return JSON.stringify({
		testId: "completion-multi-turn",
		params: {
			history: [
				{ role: "user", content: "My name is Alice." },
				{ role: "assistant", content: "Hello Alice! Nice to meet you." },
				{ role: "user", content: "What is my name?" },
			],
			stream: false,
		},
		expectation: {
			contains: "Alice",
			validation: "contains",
		},
		expectedOutcome: "pass",
	});
};

const buildCompletionPayload = (shouldPass: boolean) => {
	const timestamp = new Date().toISOString();
	const promptNumber = randomNumberString();
	let expectationNumber = promptNumber;

	if (!shouldPass) {
		while (expectationNumber === promptNumber) {
			expectationNumber = randomNumberString();
		}
	}

	return JSON.stringify({
		testId: "completion",
		params: {
			history: [
				{
					role: "session",
					content: "reset",
				},
				{
					role: "system",
					content:
						"You are running automated verification. When the user gives you a number, respond with that number only—no extra words or punctuation.",
				},
				{
					role: "user",
					content: `Metadata timestamp: ${timestamp}. IMPORTANT: Reply with ${promptNumber} exactly. Output only the number. Do not include the timestamp or any other text.`,
				},
			],
			stream: false,
		},
		expectation: {
			value: expectationNumber,
			match: "contains",
		},
		expectedOutcome: shouldPass ? "pass" : "fail",
	});
};

const buildTranscriptionPayload = (shouldPass: boolean) => {
	return JSON.stringify({
		testId: "transcription",
		params: {
			audioFileName: "sample-16khz.wav", // This file contains "these is a test and these is another test"
		},
		expectation: {
			value: shouldPass 
				? JSON.stringify(["these", "test", "and", "another"]) // All words exist - should pass
				: JSON.stringify(["this", "test", "and", "another"]), // "this" doesn't exist - should fail
			match: "contains",
		},
		expectedOutcome: shouldPass ? "pass" : "fail", // Tell consumer what outcome we expect
	});
};

// Transcription Test Builders
const buildTranscriptionShortWavTest = () => {
	return JSON.stringify({
		testId: "transcription-short-wav",
		params: {
			audioFileName: "transcription-short.wav",
			timeout: 300000, // 5 min timeout
		},
		expectation: {
			validation: "contains-keywords",
			keywords: ["hope", "transcription", "working", "expected"],
		},
		expectedOutcome: "pass",
	});
};

const buildTranscriptionShortMp3Test = () => {
	return JSON.stringify({
		testId: "transcription-short-mp3",
		params: {
			audioFileName: "transcription-short.mp3",
			timeout: 300000, // 5 min timeout
		},
		expectation: {
			validation: "contains-keywords",
			keywords: ["hope", "transcription", "working", "expected"],
		},
		expectedOutcome: "pass",
	});
};

const buildTranscriptionOnlyMusicTest = () => {
	return JSON.stringify({
		testId: "transcription-only-music",
		params: {
			audioFileName: "only-music.mp3",
			timeout: 300000, // 5 min timeout
		},
		expectation: {
			validation: "empty-or-minimal",
			maxLength: 0, // Should have very little or no transcription
		},
		expectedOutcome: "pass",
	});
};

const buildTranscriptionLongAudioTest = () => {
	return JSON.stringify({
		testId: "transcription-long-audio",
		params: {
			audioFileName: "10min-mp3-320kbps.mp3",
			timeout: 600000, // 10 min timeout
		},
		expectation: {
			validation: "long-transcription",
			minWords: 500,
			keywords: ["cursor", "favourite", "assisted", "attention", "week", "software", "agentic", "environment"],
		},
		expectedOutcome: "pass",
	});
};

// Additional format tests
const buildTranscriptionAacTest = () => {
	return JSON.stringify({
		testId: "transcription-aac",
		params: {
			audioFileName: "transcription-short.aac",
			timeout: 300000,
		},
		expectation: {
			validation: "contains-keywords",
			keywords: ["hope", "transcription", "working", "expected"],
		},
		expectedOutcome: "pass",
	});
};

const buildTranscriptionM4aTest = () => {
	return JSON.stringify({
		testId: "transcription-m4a",
		params: {
			audioFileName: "transcription-short.m4a",
			timeout: 300000,
		},
		expectation: {
			validation: "contains-keywords",
			keywords: ["hope", "transcription", "working", "expected"],
		},
		expectedOutcome: "pass",
	});
};

const buildTranscriptionOggTest = () => {
	return JSON.stringify({
		testId: "transcription-ogg",
		params: {
			audioFileName: "transcription-short.ogg",
			timeout: 300000,
		},
		expectation: {
			validation: "contains-keywords",
			keywords: ["hope", "transcription", "working", "expected"],
		},
		expectedOutcome: "pass",
	});
};

const buildTranscriptionSilenceTest = () => {
	return JSON.stringify({
		testId: "transcription-silence",
		params: {
			audioFileName: "silence.m4a",
			timeout: 300000,
		},
		expectation: {
			validation: "empty-or-minimal",
			maxLength: 50,
		},
		expectedOutcome: "pass",
	});
};

const buildTranscriptionCorruptedMp3Test = () => {
	return JSON.stringify({
		testId: "transcription-corrupted",
		params: {
			audioFileName: "corrupted.mp3",
		},
		expectation: {
			validation: "handles-error",
			shouldThrowError: true,
		},
		expectedOutcome: "pass", // Pass means it correctly handles the error
	});
};

const buildTranscriptionCorruptedWavTest = () => {
	return JSON.stringify({
		testId: "transcription-corrupted-wav",
		params: {
			audioFileName: "corrupted.wav",
		},
		expectation: {
			validation: "handles-error",
			shouldThrowError: true,
		},
		expectedOutcome: "pass",
	});
};

// Embedding Test Builders
const buildEmbedSimpleTextTest = () => {
	return JSON.stringify({
		testId: "embed-simple-text",
		params: {
			text: "Hello world, this is a test of text embedding.",
		},
		expectation: {
			validation: "returns-vector",
			minDimensions: 100,
		},
		expectedOutcome: "pass",
	});
};

const buildEmbedLongTextTest = () => {
	const longText = "Artificial intelligence and machine learning are transforming how we interact with technology. ".repeat(10);
	return JSON.stringify({
		testId: "embed-long-text",
		params: {
			text: longText,
		},
		expectation: {
			validation: "returns-vector",
			minDimensions: 100,
		},
		expectedOutcome: "pass",
	});
};

const buildEmbedEmptyTextTest = () => {
	return JSON.stringify({
		testId: "embed-empty-text",
		params: {
			text: "",
		},
		expectation: {
			validation: "handles-gracefully",
		},
		expectedOutcome: "pass",
	});
};

const buildEmbedSimilarityTest = () => {
	return JSON.stringify({
		testId: "embed-similarity",
		params: {
			text1: "The cat sits on the mat.",
			text2: "A feline rests on the rug.",
			text3: "Python is a programming language.",
		},
		expectation: {
			validation: "similarity-check",
		},
		expectedOutcome: "pass",
	});
};

const publish = () => {
	let payload: string;
	let testType: string;

	// Expanded test rotation - cycles through 35 different tests
	const testIndex = testCounter % 35;

	if (testIndex === 0) {
		payload = buildModelLoadTest();
		testType = "model-load-llm";
	} else if (testIndex === 1) {
		payload = buildCompletionStreamingTest();
		testType = "completion-streaming";
	} else if (testIndex === 2) {
		payload = buildCompletionContextSizeTest(512);
		testType = "completion-context-size-512";
	} else if (testIndex === 3) {
		payload = buildCompletionContextSizeTest(2048);
		testType = "completion-context-size-2048";
	} else if (testIndex === 4) {
		const shouldPass = transcriptionSuccessCounter < 2;
		payload = buildTranscriptionPayload(shouldPass);
		transcriptionSuccessCounter = shouldPass ? transcriptionSuccessCounter + 1 : 0;
		testType = `transcription (expect ${shouldPass ? "pass" : "fail"})`;
	} else if (testIndex === 5) {
		payload = buildModelLoadEmbeddingTest();
		testType = "model-load-embedding";
	} else if (testIndex === 6) {
		payload = buildCompletionTemperatureTest(0.1);
		testType = "completion-temperature-0.1";
	} else if (testIndex === 7) {
		payload = buildModelLoadInvalidTest();
		testType = "model-load-invalid";
	} else if (testIndex === 8) {
		payload = buildCompletionTemperatureTest(0.9);
		testType = "completion-temperature-0.9";
	} else if (testIndex === 9) {
		payload = buildCompletionEmptyPromptTest();
		testType = "completion-empty-prompt";
	} else if (testIndex === 10) {
		payload = buildCompletionLongPromptTest();
		testType = "completion-long-prompt";
	} else if (testIndex === 11) {
		payload = buildCompletionMultiTurnTest();
		testType = "completion-multi-turn";
	} else if (testIndex === 12) {
		const shouldPass = successCounter < 5;
		payload = buildCompletionPayload(shouldPass);
		successCounter = shouldPass ? successCounter + 1 : 0;
		testType = "completion";
	} else if (testIndex === 13) {
		const shouldPass = successCounter < 5;
		payload = buildCompletionPayload(shouldPass);
		successCounter = shouldPass ? successCounter + 1 : 0;
		testType = "completion";
	} else if (testIndex === 14) {
		const shouldPass = transcriptionSuccessCounter < 2;
		payload = buildTranscriptionPayload(shouldPass);
		transcriptionSuccessCounter = shouldPass ? transcriptionSuccessCounter + 1 : 0;
		testType = `transcription (expect ${shouldPass ? "pass" : "fail"})`;
	} else if (testIndex === 15) {
		const shouldPass = successCounter < 5;
		payload = buildCompletionPayload(shouldPass);
		successCounter = shouldPass ? successCounter + 1 : 0;
		testType = "completion";
	} else if (testIndex === 16) {
		const shouldPass = successCounter < 5;
		payload = buildCompletionPayload(shouldPass);
		successCounter = shouldPass ? successCounter + 1 : 0;
		testType = "completion";
	} else if (testIndex === 17) {
		const shouldPass = transcriptionSuccessCounter < 2;
		payload = buildTranscriptionPayload(shouldPass);
		transcriptionSuccessCounter = shouldPass ? transcriptionSuccessCounter + 1 : 0;
		testType = `transcription (expect ${shouldPass ? "pass" : "fail"})`;
	} else if (testIndex === 18) {
		const shouldPass = successCounter < 5;
		payload = buildCompletionPayload(shouldPass);
		successCounter = shouldPass ? successCounter + 1 : 0;
		testType = "completion";
	} else if (testIndex === 19) {
		payload = buildTranscriptionShortWavTest();
		testType = "transcription-short-wav";
	} else if (testIndex === 20) {
		payload = buildTranscriptionShortMp3Test();
		testType = "transcription-short-mp3";
	} else if (testIndex === 21) {
		payload = buildTranscriptionOnlyMusicTest();
		testType = "transcription-only-music";
	} else if (testIndex === 22) {
		payload = buildTranscriptionLongAudioTest();
		testType = "transcription-long-audio";
	} else if (testIndex === 23) {
		payload = buildTranscriptionAacTest();
		testType = "transcription-aac";
	} else if (testIndex === 24) {
		payload = buildTranscriptionM4aTest();
		testType = "transcription-m4a";
	} else if (testIndex === 25) {
		payload = buildTranscriptionOggTest();
		testType = "transcription-ogg";
	} else if (testIndex === 26) {
		payload = buildTranscriptionSilenceTest();
		testType = "transcription-silence";
	} else if (testIndex === 27) {
		payload = buildTranscriptionCorruptedMp3Test();
		testType = "transcription-corrupted-mp3";
	} else if (testIndex === 28) {
		payload = buildTranscriptionCorruptedWavTest();
		testType = "transcription-corrupted-wav";
	} else if (testIndex === 29) {
		payload = buildEmbedSimpleTextTest();
		testType = "embed-simple-text";
	} else if (testIndex === 30) {
		payload = buildEmbedLongTextTest();
		testType = "embed-long-text";
	} else if (testIndex === 31) {
		payload = buildEmbedEmptyTextTest();
		testType = "embed-empty-text";
	} else if (testIndex === 32) {
		payload = buildEmbedSimilarityTest();
		testType = "embed-similarity";
	} else {
		const shouldPass = successCounter < 5;
		payload = buildCompletionPayload(shouldPass);
		successCounter = shouldPass ? successCounter + 1 : 0;
		testType = "completion";
	}

	testCounter++;

	client.publish(topic, payload, publishOptions, (err) => {
		if (err) {
			console.error("[mqtt] publish error:", err);
		} else {
			console.info(`[mqtt] published ${testType}`);
		}
	});
};

client.on("connect", () => {
	console.info(`[mqtt] connected to ${brokerUrl}`);

	// Subscribe to results topic
	client.subscribe(RESULT_TOPIC, { qos: 0 }, (err) => {
		if (err) {
			console.error(`[mqtt] failed to subscribe to ${RESULT_TOPIC}:`, err);
		} else {
			console.info(`[mqtt] subscribed to ${RESULT_TOPIC}`);
		}
	});

	if (!publishTimer) {
		publishTimer = setInterval(publish, intervalMs);
	}

	publish();
});

client.on("reconnect", () => {
	console.warn("[mqtt] reconnecting…");
});

client.on("close", () => {
	console.warn("[mqtt] connection closed");
});

client.on("error", (err) => {
	console.error("[mqtt] connection error:", err);
});

client.on("message", (receivedTopic, payload) => {
	if (receivedTopic === RESULT_TOPIC) {
		try {
			const result: TestResultMessage = JSON.parse(payload.toString());

			console.log(
				"\n┌─────────────────────────────────────────────────────────────┐",
			);
			console.log(
				"│ TEST RESULT RECEIVED                                         │",
			);
			console.log(
				"├─────────────────────────────────────────────────────────────┤",
			);
			console.log(`│ Consumer ID: ${result.consumerId}`);
			console.log(`│ Test ID:     ${result.testId}`);
			console.log(
				`│ Outcome:     ${result.outcome === "success" ? "✅ SUCCESS" : "❌ FAILURE"}`,
			);
			console.log(`│ Duration:    ${result.duration}ms`);

			if (result.params) {
				console.log(
					`│ Parameters:  ${JSON.stringify(result.params).substring(0, 45)}...`,
				);
			}

			if (result.error) {
				console.log(`│ Error:       ${result.error}`);
			}

			console.log(
				"└─────────────────────────────────────────────────────────────┘\n",
			);
		} catch (error) {
			console.error("[mqtt] failed to parse result message:", error);
		}
	}
});

const shutdown = () => {
	console.info("[mqtt] shutting down");
	if (publishTimer) {
		clearInterval(publishTimer);
		publishTimer = null;
	}
	client.end(false, {}, () => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
