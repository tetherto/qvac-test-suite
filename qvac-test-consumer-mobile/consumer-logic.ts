import { ConsumerBase, type ConsumerCallbacks } from "../shared-consumer/consumer-base";
import type { MqttClient } from "mqtt";
import {
	loadModel,
	unloadModel,
	LLAMA_3_2_1B_INST_Q4_0,
	WHISPER_TINY,
	VAD_SILERO_5_1_2,
	GTE_LARGE_FP16,
} from "@tetherto/sdk-dev";

export class MobileConsumer extends ConsumerBase {
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
		return await loadModel({
			modelSrc: LLAMA_3_2_1B_INST_Q4_0,
			modelType: "llm",
		});
	}

	protected async loadWhisperModel(): Promise<string> {
		return await loadModel({
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
		return await loadModel({
			modelSrc: GTE_LARGE_FP16,
			modelType: "embeddings",
		});
	}

	protected async getSDKFunctions() {
		return { unloadModel };
	}
}

