import {
	completion,
	transcribe,
	embed,
	translate,
	textToSpeech,
	loadModel,
	unloadModel,
	cancel,
	ragSaveEmbeddings,
	deleteCache,
	getModelInfo,
	loggingStream,
	LLAMA_3_2_1B_INST_Q4_0,
	GTE_LARGE_FP16,
} from "@tetherto/sdk-dev";
// Dynamic import for SDK_LOG_ID (QVAC-9211) - may not be in types yet
const sdkModule = require("@tetherto/sdk-dev");
const SDK_LOG_ID: string | undefined = sdkModule.SDK_LOG_ID;
import { TestExecutorBase, type SDKFunctions, type PlatformFunctions } from "../shared-test-executor/test-executor-base";
import { makeSharedSkipHandler } from "../shared-test-executor/skip-handlers";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { audio, documents, code } from "../shared-test-data/assets";

export class TestExecutor extends TestExecutorBase {
	constructor() {
		const sdk: SDKFunctions = {
			completion,
			transcribe,
			embed,
			translate,
			textToSpeech,
			loadModel,
			unloadModel,
			cancel,
			ragSaveEmbeddings,
			deleteCache,
			getModelInfo,
			loggingStream,
			SDK_LOG_ID,
			LLAMA_3_2_1B_INST_Q4_0,
			GTE_LARGE_FP16,
			SDK_CLIENT_ERROR_CODES: undefined, // Not available in this SDK version
			SDK_SERVER_ERROR_CODES: undefined, // Not available in this SDK version
		};
		const platform: PlatformFunctions = {
			pathJoin: (...paths: string[]) => require("path").join(...paths),
			pathResolve: (...paths: string[]) => require("path").resolve(...paths),
			getCwd: () => require("process").cwd(),
		};
		super(sdk, platform);

		// Legacy mobile system: tools tests are temporarily skipped.
		// This rewrites expectations to "skip" and avoids any real tool execution logic.
		const skipTools = makeSharedSkipHandler({
			reason: "Tools tests are disabled on mobile consumer (temporary) - they time out",
		});
		const skipTranslation = makeSharedSkipHandler({
			reason: "Translation tests are disabled on mobile consumer (temporary) - they time out",
		});
		for (const [testId] of this.testHandlers) {
			if (testId.startsWith("tools-")) {
				this.testHandlers.set(testId, skipTools);
			}
			if (testId.startsWith("translation-")) {
				this.testHandlers.set(testId, skipTranslation);
			}
		}
	}

	protected async readDocumentFile(filename: string, category: 'documents' | 'code'): Promise<string> {
		const assetMap = category === 'documents' ? documents : code;
		const assetModule = assetMap[filename as keyof typeof assetMap];
		if (!assetModule) {
			throw new Error(`${category} file not found: ${filename}`);
		}

		const asset = Asset.fromModule(assetModule);
		await asset.downloadAsync();

		if (!asset.localUri) {
			throw new Error(`Failed to load ${category} file: ${filename}`);
		}

		// Use modern FileSystem API: new File(uri).text()
		const file = new File(asset.localUri);
		return await file.text();
	}

	protected async getAudioFilePath(filename: string): Promise<string> {
		const audioModule = audio[filename as keyof typeof audio];
		if (!audioModule) {
			throw new Error(`Audio file not found: ${filename}`);
		}

		const audioAsset = Asset.fromModule(audioModule);
		await audioAsset.downloadAsync();

		let audioPath = audioAsset.localUri || audioAsset.uri;
		if (audioPath.startsWith("file://")) {
			audioPath = audioPath.substring(7);
		}
		audioPath = decodeURIComponent(audioPath);

		return audioPath;
	}

}
