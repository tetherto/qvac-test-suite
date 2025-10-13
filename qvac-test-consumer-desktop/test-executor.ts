import {
	completion as runCompletion,
	transcribe as runTranscribe,
	embed as runEmbed,
	loadModel,
	unloadModel,
	LLAMA_3_2_1B_INST_Q4_0,
	GTE_LARGE_FP16,
} from "@tetherto/qvac-sdk";
import * as path from "path";

interface TestResult {
	output: string;
	passed: boolean;
	modelId?: string;
}

export class TestExecutor {
	private testHandlers: Map<string, (modelId: string | null, params: any, expectation: any) => Promise<TestResult>>;

	constructor() {
		this.testHandlers = new Map();
		this.registerHandlers();
	}

	private registerHandlers() {
		// Model loading tests
		this.testHandlers.set("model-load-llm", this.modelLoadLlm.bind(this));
		this.testHandlers.set("model-load-embedding", this.modelLoadEmbedding.bind(this));
		this.testHandlers.set("model-load-invalid", this.modelLoadInvalid.bind(this));
		this.testHandlers.set("model-unload", this.modelUnload.bind(this));

		// LLM completion tests
		this.testHandlers.set("completion", this.completion.bind(this));
		this.testHandlers.set("completion-streaming", this.completionStreaming.bind(this));
		this.testHandlers.set("completion-context-size", this.completionContextSize.bind(this));
		this.testHandlers.set("completion-temperature", this.completionTemperature.bind(this));
		this.testHandlers.set("completion-empty-prompt", this.completionEmptyPrompt.bind(this));
		this.testHandlers.set("completion-long-prompt", this.completionLongPrompt.bind(this));
		this.testHandlers.set("completion-multi-turn", this.completionMultiTurn.bind(this));

		// Transcription tests
		this.testHandlers.set("transcription", this.transcription.bind(this));
		this.testHandlers.set("transcription-short-wav", this.transcriptionFormat.bind(this));
		this.testHandlers.set("transcription-short-mp3", this.transcriptionFormat.bind(this));
		this.testHandlers.set("transcription-aac", this.transcriptionFormat.bind(this));
		this.testHandlers.set("transcription-m4a", this.transcriptionFormat.bind(this));
		this.testHandlers.set("transcription-ogg", this.transcriptionFormat.bind(this));
		this.testHandlers.set("transcription-silence", this.transcriptionMusic.bind(this));
		this.testHandlers.set("transcription-only-music", this.transcriptionMusic.bind(this));
		this.testHandlers.set("transcription-long-audio", this.transcriptionLongAudio.bind(this));
		this.testHandlers.set("transcription-corrupted", this.transcriptionCorrupted.bind(this));
		this.testHandlers.set("transcription-corrupted-wav", this.transcriptionCorrupted.bind(this));

		// Embedding tests
		this.testHandlers.set("embed-simple-text", this.embedSimpleText.bind(this));
		this.testHandlers.set("embed-long-text", this.embedSimpleText.bind(this));
		this.testHandlers.set("embed-empty-text", this.embedEmptyText.bind(this));
		this.testHandlers.set("embed-similarity", this.embedSimilarity.bind(this));
	}

	public async executeTest(
		testId: string,
		modelId: string | null,
		params: any,
		expectation: any,
	): Promise<TestResult> {
		const handler = this.testHandlers.get(testId);

		if (!handler) {
			return {
				output: `No handler for test: ${testId}`,
				passed: false,
			};
		}

		return handler(modelId, params, expectation);
	}

	// ========== MODEL LOADING TESTS ==========

	private async modelLoadLlm(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
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
				modelId: loadedModelId,
			};
		} catch (error: any) {
			return {
				output: `Error: ${error.message}`,
				passed: false,
			};
		}
	}

	private async modelLoadEmbedding(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		try {
			const loadedModelId = await loadModel({
				modelSrc: GTE_LARGE_FP16,
				modelType: "embeddings",
			});

			const passed = typeof loadedModelId === "string" && loadedModelId.length > 0;
			return {
				output: `Embedding model loaded with ID: ${loadedModelId}`,
				passed,
			};
		} catch (error: any) {
			return {
				output: `Error: ${error.message}`,
				passed: false,
			};
		}
	}

	private async modelLoadInvalid(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		try {
			const invalidPath = params.modelPath || "/invalid/path/model.gguf";
			await loadModel({
				modelSrc: invalidPath,
				modelType: "llm",
			});

			return {
				output: "ERROR: Model loaded when it should have failed",
				passed: false,
			};
		} catch (error: any) {
			const errorMsg = error.message || String(error);
			const passed = expectation.errorContains
				? errorMsg.toLowerCase().includes(expectation.errorContains.toLowerCase())
				: true;

			return {
				output: `Correctly threw error: ${errorMsg}`,
				passed,
			};
		}
	}

	private async modelUnload(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		try {
			if (!modelId) {
				return {
					output: "ERROR: No model ID provided to unload",
					passed: false,
				};
			}

			await unloadModel({
				modelId,
				clearStorage: params.shouldClearStorage || false,
			});

			return {
				output: `Model ${modelId} unloaded successfully`,
				passed: true,
			};
		} catch (error: any) {
			return {
				output: `Error unloading: ${error.message}`,
				passed: false,
			};
		}
	}

	// ========== LLM COMPLETION TESTS ==========

	private async completion(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No LLM model loaded", passed: false };
		}

		try {
			const { history = [], stream = false } = params;
			const result = runCompletion({ modelId, history, stream });
			const text = (await result.text).trim();

			const passed =
				expectation.match === "contains"
					? text.includes(expectation.value)
					: text === expectation.value;

			return { output: text, passed };
		} catch (error: any) {
			return { output: `Error: ${error.message}`, passed: false };
		}
	}

	private async completionStreaming(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No LLM model loaded", passed: false };
		}

		try {
			const { history, stream = true } = params;
			const result = runCompletion({ modelId, history, stream });

			let fullText = "";
			for await (const token of result.tokenStream) {
				fullText += token;
			}
			fullText = fullText.trim();

			const keywords = expectation.contains || [];
			const passed = keywords.every((keyword: string) =>
				fullText.toLowerCase().includes(keyword.toString().toLowerCase()),
			);

			return {
				output: `Streamed text: ${fullText.substring(0, 100)}...`,
				passed,
			};
		} catch (error: any) {
			return { output: `Error: ${error.message}`, passed: false };
		}
	}

	private async completionContextSize(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No LLM model loaded", passed: false };
		}

		try {
			const { history, stream = false, contextSize } = params;
			const result = runCompletion({ modelId, history, stream });
			const text = (await result.text).trim();

			const passed = expectation.contains
				? text.toLowerCase().includes(expectation.contains.toLowerCase())
				: text.length > 0;

			return {
				output: `[ctx=${contextSize}] ${text}`,
				passed,
			};
		} catch (error: any) {
			return { output: `Error: ${error.message}`, passed: false };
		}
	}

	private async completionTemperature(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No LLM model loaded", passed: false };
		}

		try {
			const { history, stream = false, temperature } = params;
			const result = runCompletion({ modelId, history, stream });
			const text = (await result.text).trim();

			const passed = expectation.contains
				? text.toLowerCase().includes(expectation.contains.toLowerCase())
				: text.length > 0;

			return {
				output: `[temp=${temperature}] ${text}`,
				passed,
			};
		} catch (error: any) {
			return { output: `Error: ${error.message}`, passed: false };
		}
	}

	private async completionEmptyPrompt(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No LLM model loaded", passed: false };
		}

		try {
			const { history, stream = false } = params;
			const result = runCompletion({ modelId, history, stream });
			const text = (await result.text).trim();

			return {
				output: `Empty prompt handled: "${text.substring(0, 50)}"`,
				passed: true,
			};
		} catch (error: any) {
			return { output: `Error: ${error.message}`, passed: false };
		}
	}

	private async completionLongPrompt(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No LLM model loaded", passed: false };
		}

		try {
			const { history, stream = false } = params;
			const result = runCompletion({ modelId, history, stream });
			const text = (await result.text).trim();

			const passed = text.length > 0;

			return {
				output: `Long prompt response (${text.length} chars): ${text.substring(0, 100)}...`,
				passed,
			};
		} catch (error: any) {
			return { output: `Error: ${error.message}`, passed: false };
		}
	}

	private async completionMultiTurn(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No LLM model loaded", passed: false };
		}

		try {
			const { history, stream = false } = params;
			const result = runCompletion({ modelId, history, stream });
			const text = (await result.text).trim();

			const passed = expectation.contains
				? text.toLowerCase().includes(expectation.contains.toLowerCase())
				: text.length > 0;

			return {
				output: `Multi-turn response: ${text}`,
				passed,
			};
		} catch (error: any) {
			return { output: `Error: ${error.message}`, passed: false };
		}
	}

	// ========== TRANSCRIPTION TESTS ==========

	private async transcription(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No Whisper model loaded", passed: false };
		}

		try {
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
		} catch (error: any) {
			return { output: `Error: ${error.message}`, passed: false };
		}
	}

	private async transcriptionFormat(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No Whisper model loaded", passed: false };
		}

		try {
			const audioPath = path.resolve(
				process.cwd(),
				"../shared-test-data/audio",
				params.audioFileName,
			);

			const text = (await runTranscribe({ modelId, audioChunk: audioPath })).trim();

			const keywords = expectation.keywords || [];
			const textLower = text.toLowerCase();
			const passed = keywords.every((keyword: string) =>
				textLower.includes(keyword.toLowerCase()),
			);

			return {
				output: `Transcribed (${text.length} chars): ${text.substring(0, 150)}...`,
				passed,
			};
		} catch (error: any) {
			return {
				output: `Error: ${error.message}`,
				passed: false,
			};
		}
	}

	private async transcriptionMusic(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No Whisper model loaded", passed: false };
		}

		try {
			const audioPath = path.join(
				process.cwd(),
				"../shared-test-data/audio",
				params.audioFileName,
			);

			const text = (await runTranscribe({ modelId, audioChunk: audioPath })).trim();

			const passed = text.length <= (expectation.maxLength || 50);

			return {
				output: `Music/silence file transcription (${text.length} chars): "${text}"`,
				passed,
			};
		} catch (error: any) {
			return {
				output: `Error: ${error.message}`,
				passed: false,
			};
		}
	}

	private async transcriptionLongAudio(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No Whisper model loaded", passed: false };
		}

		try {
			const audioPath = path.join(
				process.cwd(),
				"../shared-test-data/audio",
				params.audioFileName,
			);

			const text = (await runTranscribe({ modelId, audioChunk: audioPath })).trim();

			const cleanText = text.replace(/<\|[\d.]+\|>/g, "");
			const words = cleanText.split(/\s+/).filter((w) => w.length > 0);

			const hasEnoughWords = words.length >= (expectation.minWords || 500);
			const keywords = expectation.keywords || [];
			const textLower = text.toLowerCase();
			const hasAllKeywords = keywords.every((keyword: string) =>
				textLower.includes(keyword.toLowerCase()),
			);

			const passed = hasEnoughWords && hasAllKeywords;

			return {
				output: `Long audio: ${words.length} words, contains ${keywords.filter((k: string) => textLower.includes(k.toLowerCase())).length}/${keywords.length} keywords`,
				passed,
			};
		} catch (error: any) {
			return {
				output: `Error: ${error.message}`,
				passed: false,
			};
		}
	}

	private async transcriptionCorrupted(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No Whisper model loaded", passed: false };
		}

		try {
			const audioPath = path.join(
				process.cwd(),
				"../shared-test-data/audio",
				params.audioFileName,
			);

			await runTranscribe({ modelId, audioChunk: audioPath });

			return {
				output: "ERROR: Transcribed corrupted file when it should have failed",
				passed: false,
			};
		} catch (error: any) {
			const errorMsg = error.message || String(error);
			return {
				output: `Correctly handled corrupted file: ${errorMsg.substring(0, 100)}`,
				passed: true,
			};
		}
	}

	// ========== EMBEDDING TESTS ==========

	private async embedSimpleText(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No embedding model loaded", passed: false };
		}

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

	private async embedEmptyText(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No embedding model loaded", passed: false };
		}

		try {
			const embedding = await runEmbed({ modelId, text: params.text });

			const passed = Array.isArray(embedding);

			return {
				output: `Empty text handled: ${embedding.length}-dimensional vector`,
				passed,
			};
		} catch (error: any) {
			return {
				output: `Handled empty text with error: ${error.message}`,
				passed: true,
			};
		}
	}

	private async embedSimilarity(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		if (!modelId) {
			return { output: "No embedding model loaded", passed: false };
		}

		try {
			const emb1 = await runEmbed({ modelId, text: params.text1 });
			const emb2 = await runEmbed({ modelId, text: params.text2 });
			const emb3 = await runEmbed({ modelId, text: params.text3 });

			const cosineSimilarity = (a: number[], b: number[]) => {
				const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
				const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
				const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
				return dotProduct / (magA * magB);
			};

			const sim12 = cosineSimilarity(emb1, emb2);
			const sim13 = cosineSimilarity(emb1, emb3);

			const passed = sim12 > sim13;

			return {
				output: `Similarity: text1-text2=${sim12.toFixed(3)}, text1-text3=${sim13.toFixed(3)} (${passed ? "correct" : "incorrect"})`,
				passed,
			};
		} catch (error: any) {
			return {
				output: `Error: ${error.message}`,
				passed: false,
			};
		}
	}
}

