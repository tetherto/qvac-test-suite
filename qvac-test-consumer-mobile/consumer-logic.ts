import { ConsumerBase, type ConsumerCallbacks } from "../shared-consumer/consumer-base";
import type { MqttClient } from "mqtt";
import {
	unloadModel,
	cancel,
	type LoadModelOptions,
	LLAMA_3_2_1B_INST_Q4_0,
	WHISPER_TINY,
	VAD_SILERO_5_1_2,
	GTE_LARGE_FP16,
	QWEN3_1_7B_INST_Q4,
	SMOLVLM2_500M_MULTIMODAL_Q8_0,
	MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
	MARIAN_OPUS_DE_EN_Q4_0,
	BERGAMOT_EN_FR,
	OCR_LATIN_RECOGNIZER_1,
	TTS_TOKENIZER_EN_CHATTERBOX,
	TTS_SPEECH_ENCODER_EN_CHATTERBOX_FP32,
	TTS_EMBED_TOKENS_EN_CHATTERBOX_FP32,
	TTS_CONDITIONAL_DECODER_EN_CHATTERBOX_FP32,
	TTS_LANGUAGE_MODEL_EN_CHATTERBOX_FP32,
	TTS_TOKENIZER_SUPERTONIC,
	TTS_TEXT_ENCODER_SUPERTONIC_FP32,
	TTS_LATENT_DENOISER_SUPERTONIC_FP32,
	TTS_VOICE_DECODER_SUPERTONIC_FP32,
	TTS_VOICE_STYLE_SUPERTONIC,
} from "@tetherto/sdk-mono";

export class MobileConsumer extends ConsumerBase {
	protected loadModel(opts: LoadModelOptions): Promise<string> {
		return this.loadModelTracked(opts);
	}

	protected getEvictionThreshold(): number {
		return this.platform === "mobile-ios" ? 2 : 3;
	}

	constructor(
		client: MqttClient,
		consumerId: string,
		platform: string,
		runId: string,
		executor: any,
		callbacks: ConsumerCallbacks
	) {
		super(client, consumerId, platform, runId, executor, callbacks);
	}

	protected async loadLlmModel(): Promise<string> {
		return await this.loadModel({
			modelSrc: LLAMA_3_2_1B_INST_Q4_0,
			modelType: "llm",
		});
	}

	protected async loadWhisperModel(): Promise<string> {
		return await this.loadModel({
			modelSrc: WHISPER_TINY,
			modelType: "whisper",
			vadModelSrc: VAD_SILERO_5_1_2,
			modelConfig: {
				audio_format: "f32le",
				strategy: "greedy",
				language: "en",
				translate: false,
				no_timestamps: false,
				single_segment: false,
				temperature: 0.0,
				suppress_blank: true,
				suppress_nst: true,
				vad_params: {
					threshold: 0.35,
					min_speech_duration_ms: 200,
					min_silence_duration_ms: 150,
					max_speech_duration_s: 30.0,
					speech_pad_ms: 600,
					samples_overlap: 0.3,
				},
			},
		});
	}

	protected async loadEmbeddingModel(): Promise<string> {
		return await this.loadModel({
			modelSrc: GTE_LARGE_FP16,
			modelType: "embeddings",
		});
	}

	protected async loadToolsModel(): Promise<string> {
		return await this.loadModel({
			modelSrc: QWEN3_1_7B_INST_Q4,
			modelType: "llm",
			modelConfig: {
				ctx_size: 4096,
				tools: true,
			},
		});
	}

	protected async loadVisionModel(): Promise<string> {
		return await this.loadModel({
			modelSrc: SMOLVLM2_500M_MULTIMODAL_Q8_0,
			modelType: "llm",
			projectionModelSrc: MMPROJ_SMOLVLM2_500M_MULTIMODAL_Q8_0,
			modelConfig: {
				ctx_size: 1024,
			},
		});
	}

	protected async loadTtsChatterboxModel(): Promise<string> {
		const referenceAudioSrc = await this.executor.getAudioFilePath("transcription-short.wav");
		return await this.loadModel({
			modelSrc: TTS_TOKENIZER_EN_CHATTERBOX.src,
			modelType: "tts",
			modelConfig: {
				ttsEngine: "chatterbox",
				language: "en",
				ttsTokenizerSrc: TTS_TOKENIZER_EN_CHATTERBOX.src,
				ttsSpeechEncoderSrc: TTS_SPEECH_ENCODER_EN_CHATTERBOX_FP32.src,
				ttsEmbedTokensSrc: TTS_EMBED_TOKENS_EN_CHATTERBOX_FP32.src,
				ttsConditionalDecoderSrc: TTS_CONDITIONAL_DECODER_EN_CHATTERBOX_FP32.src,
				ttsLanguageModelSrc: TTS_LANGUAGE_MODEL_EN_CHATTERBOX_FP32.src,
				referenceAudioSrc,
			},
		});
	}

	protected async loadTtsSupertonicModel(): Promise<string> {
		return await this.loadModel({
			modelSrc: TTS_TOKENIZER_SUPERTONIC.src,
			modelType: "tts",
			modelConfig: {
				ttsEngine: "supertonic",
				language: "en",
				ttsTokenizerSrc: TTS_TOKENIZER_SUPERTONIC.src,
				ttsTextEncoderSrc: TTS_TEXT_ENCODER_SUPERTONIC_FP32.src,
				ttsLatentDenoiserSrc: TTS_LATENT_DENOISER_SUPERTONIC_FP32.src,
				ttsVoiceDecoderSrc: TTS_VOICE_DECODER_SUPERTONIC_FP32.src,
				ttsVoiceSrc: TTS_VOICE_STYLE_SUPERTONIC.src,
			},
		});
	}

	protected async loadNmtModel(): Promise<string> {
		// QVAC-9401: NMT model with generation parameters
		// QVAC-10524: Added engine: "Opus" (required after QVAC-9526)
		return await this.loadModel({
			modelSrc: MARIAN_OPUS_DE_EN_Q4_0,
			modelType: "nmt",
			modelConfig: {
				engine: "Opus",
				from: "de",
				to: "en",
				// Generation parameters (QVAC-9401)
				beamsize: 4,
				lengthpenalty: 1.0,
				maxlength: 512,
				temperature: 0.3,
				norepeatngramsize: 3,
			},
		});
	}

	protected async loadBergamotModel(): Promise<string> {
		// QVAC-10524: Bergamot translation engine support
		return await this.loadModel({
			modelSrc: BERGAMOT_EN_FR,
			modelType: "nmt",
			modelConfig: {
				engine: "Bergamot",
				from: "en",
				to: "fr",
			},
		});
	}

	protected async loadOcrModel(): Promise<string> {
		// Only need to pass the recognizer - detector is auto-derived
		return await this.loadModel({
			modelSrc: OCR_LATIN_RECOGNIZER_1,
			modelType: "ocr",
			modelConfig: {
				langList: ["en"],
			},
		});
	}

	protected getSdkVersion(): string {
		if (process.env.QVAC_SDK_VERSION) return process.env.QVAC_SDK_VERSION;
		try { return require("@qvac/sdk/package.json").version; } catch {}
		try { return require("@tetherto/sdk-mono/package.json").version; } catch {}
		return "unknown";
	}

	protected async getSDKFunctions() {
		return { unloadModel, cancel };
	}
}

