// Test builders organized by dependency

export interface TestDefinition {
	testId: string;
	payload: string;
	dependency: string; // "llm", "whisper", "embeddings", "none"
	estimatedDurationMs: number;
}

export class TestBuilder {
	private randomNumberString = () =>
		Math.floor(Math.random() * 1_000_000_000).toString();

	// ========== MODEL LOADING TESTS (No dependency - runs first) ==========

	buildModelLoadLlmTest(): TestDefinition {
		return {
			testId: "model-load-llm",
			payload: JSON.stringify({
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
			}),
			dependency: "none",
			estimatedDurationMs: 60000, // 1 minute for model loading
		};
	}

	buildModelLoadEmbeddingTest(): TestDefinition {
		return {
			testId: "model-load-embedding",
			payload: JSON.stringify({
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
			}),
			dependency: "none",
			estimatedDurationMs: 60000,
		};
	}

	buildModelLoadInvalidTest(): TestDefinition {
		return {
			testId: "model-load-invalid",
			payload: JSON.stringify({
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
				expectedOutcome: "pass",
			}),
			dependency: "none",
			estimatedDurationMs: 5000,
		};
	}

	// ========== LLM COMPLETION TESTS (Requires llm model) ==========

	buildCompletionStreamingTest(): TestDefinition {
		return {
			testId: "completion-streaming",
			payload: JSON.stringify({
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
			}),
			dependency: "llm",
			estimatedDurationMs: 10000,
		};
	}

	buildCompletionContextSizeTest(contextSize: number): TestDefinition {
		return {
			testId: "completion-context-size",
			payload: JSON.stringify({
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
			}),
			dependency: "llm",
			estimatedDurationMs: 8000,
		};
	}

	buildCompletionTemperatureTest(temperature: number): TestDefinition {
		return {
			testId: "completion-temperature",
			payload: JSON.stringify({
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
			}),
			dependency: "llm",
			estimatedDurationMs: 8000,
		};
	}

	buildCompletionEmptyPromptTest(): TestDefinition {
		return {
			testId: "completion-empty-prompt",
			payload: JSON.stringify({
				testId: "completion-empty-prompt",
				params: {
					history: [{ role: "user", content: "" }],
					stream: false,
				},
				expectation: {
					validation: "handles-gracefully",
				},
				expectedOutcome: "pass",
			}),
			dependency: "llm",
			estimatedDurationMs: 5000,
		};
	}

	buildCompletionLongPromptTest(): TestDefinition {
		const longText = "In a world where technology advances rapidly, ".repeat(50);
		return {
			testId: "completion-long-prompt",
			payload: JSON.stringify({
				testId: "completion-long-prompt",
				params: {
					history: [
						{
							role: "user",
							content: `${longText}Please summarize the above in one word: technology`,
						},
					],
					stream: false,
				},
				expectation: {
					validation: "returns-response",
				},
				expectedOutcome: "pass",
			}),
			dependency: "llm",
			estimatedDurationMs: 15000,
		};
	}

	buildCompletionMultiTurnTest(): TestDefinition {
		return {
			testId: "completion-multi-turn",
			payload: JSON.stringify({
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
			}),
			dependency: "llm",
			estimatedDurationMs: 10000,
		};
	}

	// ========== TRANSCRIPTION TESTS (Requires whisper model) ==========

	buildTranscriptionShortWavTest(): TestDefinition {
		return {
			testId: "transcription-short-wav",
			payload: JSON.stringify({
				testId: "transcription-short-wav",
				params: {
					audioFileName: "transcription-short.wav",
					timeout: 300000,
				},
				expectation: {
					validation: "contains-keywords",
					keywords: ["hope", "transcription", "working", "expected"],
				},
				expectedOutcome: "pass",
			}),
			dependency: "whisper",
			estimatedDurationMs: 30000,
		};
	}

	buildTranscriptionShortMp3Test(): TestDefinition {
		return {
			testId: "transcription-short-mp3",
			payload: JSON.stringify({
				testId: "transcription-short-mp3",
				params: {
					audioFileName: "transcription-short.mp3",
					timeout: 300000,
				},
				expectation: {
					validation: "contains-keywords",
					keywords: ["hope", "transcription", "working", "expected"],
				},
				expectedOutcome: "pass",
			}),
			dependency: "whisper",
			estimatedDurationMs: 30000,
		};
	}

	buildTranscriptionOnlyMusicTest(): TestDefinition {
		return {
			testId: "transcription-only-music",
			payload: JSON.stringify({
				testId: "transcription-only-music",
				params: {
					audioFileName: "only-music.mp3",
					timeout: 300000,
				},
				expectation: {
					validation: "empty-or-minimal",
					maxLength: 0,
				},
				expectedOutcome: "pass",
			}),
			dependency: "whisper",
			estimatedDurationMs: 60000,
		};
	}

	buildTranscriptionLongAudioTest(): TestDefinition {
		return {
			testId: "transcription-long-audio",
			payload: JSON.stringify({
				testId: "transcription-long-audio",
				params: {
					audioFileName: "10min-mp3-320kbps.mp3",
					timeout: 600000,
				},
				expectation: {
					validation: "long-transcription",
					minWords: 500,
					keywords: [
						"cursor",
						"favourite",
						"assisted",
						"attention",
						"week",
						"software",
						"agentic",
						"environment",
					],
				},
				expectedOutcome: "pass",
			}),
			dependency: "whisper",
			estimatedDurationMs: 300000, // 5 minutes
		};
	}

	buildTranscriptionAacTest(): TestDefinition {
		return {
			testId: "transcription-aac",
			payload: JSON.stringify({
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
			}),
			dependency: "whisper",
			estimatedDurationMs: 30000,
		};
	}

	buildTranscriptionM4aTest(): TestDefinition {
		return {
			testId: "transcription-m4a",
			payload: JSON.stringify({
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
			}),
			dependency: "whisper",
			estimatedDurationMs: 30000,
		};
	}

	buildTranscriptionOggTest(): TestDefinition {
		return {
			testId: "transcription-ogg",
			payload: JSON.stringify({
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
			}),
			dependency: "whisper",
			estimatedDurationMs: 30000,
		};
	}

	buildTranscriptionSilenceTest(): TestDefinition {
		return {
			testId: "transcription-silence",
			payload: JSON.stringify({
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
			}),
			dependency: "whisper",
			estimatedDurationMs: 30000,
		};
	}

	buildTranscriptionCorruptedMp3Test(): TestDefinition {
		return {
			testId: "transcription-corrupted",
			payload: JSON.stringify({
				testId: "transcription-corrupted",
				params: {
					audioFileName: "corrupted.mp3",
				},
				expectation: {
					validation: "handles-error",
					shouldThrowError: true,
				},
				expectedOutcome: "pass",
			}),
			dependency: "whisper",
			estimatedDurationMs: 10000,
		};
	}

	buildTranscriptionCorruptedWavTest(): TestDefinition {
		return {
			testId: "transcription-corrupted-wav",
			payload: JSON.stringify({
				testId: "transcription-corrupted-wav",
				params: {
					audioFileName: "corrupted.wav",
				},
				expectation: {
					validation: "handles-error",
					shouldThrowError: true,
				},
				expectedOutcome: "pass",
			}),
			dependency: "whisper",
			estimatedDurationMs: 10000,
		};
	}

	// ========== EMBEDDING TESTS (Requires embeddings model) ==========

	buildEmbedSimpleTextTest(): TestDefinition {
		return {
			testId: "embed-simple-text",
			payload: JSON.stringify({
				testId: "embed-simple-text",
				params: {
					text: "Hello world, this is a test of text embedding.",
				},
				expectation: {
					validation: "returns-vector",
					minDimensions: 100,
				},
				expectedOutcome: "pass",
			}),
			dependency: "embeddings",
			estimatedDurationMs: 5000,
		};
	}

	buildEmbedLongTextTest(): TestDefinition {
		const longText =
			"Artificial intelligence and machine learning are transforming how we interact with technology. ".repeat(
				10,
			);
		return {
			testId: "embed-long-text",
			payload: JSON.stringify({
				testId: "embed-long-text",
				params: {
					text: longText,
				},
				expectation: {
					validation: "returns-vector",
					minDimensions: 100,
				},
				expectedOutcome: "pass",
			}),
			dependency: "embeddings",
			estimatedDurationMs: 8000,
		};
	}

	buildEmbedEmptyTextTest(): TestDefinition {
		return {
			testId: "embed-empty-text",
			payload: JSON.stringify({
				testId: "embed-empty-text",
				params: {
					text: "",
				},
				expectation: {
					validation: "handles-gracefully",
				},
				expectedOutcome: "pass",
			}),
			dependency: "embeddings",
			estimatedDurationMs: 3000,
		};
	}

	buildEmbedSimilarityTest(): TestDefinition {
		return {
			testId: "embed-similarity",
			payload: JSON.stringify({
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
			}),
			dependency: "embeddings",
			estimatedDurationMs: 10000,
		};
	}

	// ========== BUILD ALL TESTS ==========

	buildAllTests(): TestDefinition[] {
		const tests: TestDefinition[] = [];

		// Model loading tests (no dependency - run first)
		tests.push(this.buildModelLoadLlmTest());
		tests.push(this.buildModelLoadEmbeddingTest());
		tests.push(this.buildModelLoadInvalidTest());

		// LLM completion tests
		tests.push(this.buildCompletionStreamingTest());
		tests.push(this.buildCompletionContextSizeTest(512));
		tests.push(this.buildCompletionContextSizeTest(2048));
		tests.push(this.buildCompletionTemperatureTest(0.1));
		tests.push(this.buildCompletionTemperatureTest(0.9));
		tests.push(this.buildCompletionEmptyPromptTest());
		tests.push(this.buildCompletionLongPromptTest());
		tests.push(this.buildCompletionMultiTurnTest());

		// Transcription tests
		tests.push(this.buildTranscriptionShortWavTest());
		tests.push(this.buildTranscriptionShortMp3Test());
		tests.push(this.buildTranscriptionAacTest());
		tests.push(this.buildTranscriptionM4aTest());
		tests.push(this.buildTranscriptionOggTest());
		tests.push(this.buildTranscriptionSilenceTest());
		tests.push(this.buildTranscriptionOnlyMusicTest());
		tests.push(this.buildTranscriptionLongAudioTest());
		tests.push(this.buildTranscriptionCorruptedMp3Test());
		tests.push(this.buildTranscriptionCorruptedWavTest());

		// Embedding tests
		tests.push(this.buildEmbedSimpleTextTest());
		tests.push(this.buildEmbedLongTextTest());
		tests.push(this.buildEmbedEmptyTextTest());
		tests.push(this.buildEmbedSimilarityTest());

		return tests;
	}
}

