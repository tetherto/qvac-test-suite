import {
	completion,
	transcribe,
	embed,
	translate,
	loadModel,
	unloadModel,
	ragSaveEmbeddings,
	deleteCache,
	getModelInfo,
	setConfig,
	LLAMA_3_2_1B_INST_Q4_0,
	GTE_LARGE_FP16,
} from "@tetherto/sdk-dev";
import { TestExecutorBase, type SDKFunctions } from "../shared-test-executor/test-executor-base";
import * as path from "path";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

// Audio asset mappings for mobile
const AUDIO_ASSETS: Record<string, any> = {
	"sample-16khz.wav": require("./assets/audio/sample-16khz.wav"),
	"transcription-short.wav": require("./assets/audio/sample-16khz.wav"),
	"transcription-short.mp3": require("./assets/audio/sample.m4a"),
	"transcription-short.m4a": require("./assets/audio/sample.m4a"),
	"transcription-short.aac": require("./assets/audio/sample.m4a"),
	"transcription-short.ogg": require("./assets/audio/sample.m4a"),
	"silence.m4a": require("./assets/audio/sample.m4a"),
	"only-music.mp3": require("./assets/audio/sample.m4a"),
	"5min-mp3-128kbps.mp3": require("./assets/audio/sample.m4a"),
	"10min-mp3-320kbps.mp3": require("./assets/audio/sample.m4a"),
	"corrupted.mp3": require("./assets/audio/corrupted.wav"),
	"corrupted.wav": require("./assets/audio/corrupted.wav"),
};

export class TestExecutor extends TestExecutorBase {
	constructor() {
		const sdk: SDKFunctions = {
			completion,
			transcribe,
			embed,
			translate,
			loadModel,
			unloadModel,
			ragSaveEmbeddings,
			deleteCache,
			getModelInfo,
			setConfig,
			LLAMA_3_2_1B_INST_Q4_0,
			GTE_LARGE_FP16,
		};
		super(sdk);
	}

	protected getSharedDataPath(): string {
		return path.join(__dirname, "..", "shared-test-data");
	}

	protected async readDocumentFile(filePath: string): Promise<string> {
		// Mobile uses expo-file-system
		return await FileSystem.readAsStringAsync(filePath);
	}

	protected getAudioFilePath(filename: string): string {
		// Mobile uses asset system
		const asset = AUDIO_ASSETS[filename];
		if (asset) {
			const assetModule = Asset.fromModule(asset);
			return assetModule.uri || path.resolve(process.cwd(), "../shared-test-data/audio", filename);
		}
		return path.resolve(process.cwd(), "../shared-test-data/audio", filename);
	}
}
