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
import { TestExecutorBase, type SDKFunctions, type PlatformFunctions, type TestResult } from "../shared-test-executor/test-executor-base";
import { Asset } from "expo-asset";
import * as FileSystemLegacy from "expo-file-system/legacy";
import { audio, documents, code } from "../shared-test-data/assets";

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
		const platform: PlatformFunctions = {
			pathJoin: (...paths: string[]) => require("path").join(...paths),
			pathResolve: (...paths: string[]) => require("path").resolve(...paths),
			getCwd: () => require("process").cwd(),
		};
		super(sdk, platform);
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

		return await FileSystemLegacy.readAsStringAsync(asset.localUri);
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

	// Override cacheConfigDirectory to use mobile-appropriate cache directory
	protected async cacheConfigDirectory(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
		const { cacheDirectory } = params;
		
		// On mobile, use the app's cache directory instead of /tmp
		// If the test specifies /tmp, replace it with the mobile cache directory
		let mobileCacheDirectory = cacheDirectory;
		if (cacheDirectory === "/tmp/qvac-test-cache" || cacheDirectory?.startsWith("/tmp/")) {
			// Use Expo's cache directory + subdirectory
			// FileSystemLegacy.cacheDirectory returns a file:// URL, convert to absolute path
			let cacheDir = FileSystemLegacy.cacheDirectory || "";
			
			// Remove file:// prefix if present
			if (cacheDir.startsWith("file://")) {
				cacheDir = cacheDir.substring(7);
			}
			
			// Ensure it's an absolute path and ends with /
			if (!cacheDir.startsWith("/")) {
				// If not absolute, try to get document directory as fallback
				const docDir = FileSystemLegacy.documentDirectory || "";
				if (docDir.startsWith("file://")) {
					cacheDir = docDir.substring(7);
				} else {
					cacheDir = docDir;
				}
			}
			
			// Ensure trailing slash
			if (!cacheDir.endsWith("/")) {
				cacheDir += "/";
			}
			
			mobileCacheDirectory = `${cacheDir}qvac-test-cache`;
		}
		
		try {
			const result = await this.sdk.setConfig({ cacheDirectory: mobileCacheDirectory });
			return {
				output: `Set cache directory to '${mobileCacheDirectory}' (mapped from '${cacheDirectory}'): ${result.success}`,
				passed: result.success === expectation.success
			};
		} catch (error: any) {
			return { output: `Error: ${error.message}`, passed: false };
		}
	}
}
