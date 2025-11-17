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
		executor: any,
		callbacks: ConsumerCallbacks
	) {
		super(client, consumerId, platform, executor, callbacks);
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
				mode: "caption",
				output_format: "plaintext",
				min_seconds: 2,
				max_seconds: 6,
				audio_format: "f32le",
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

