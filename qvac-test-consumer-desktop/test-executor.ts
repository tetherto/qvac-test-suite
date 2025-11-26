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
import { TestExecutorBase, type SDKFunctions, type PlatformFunctions } from "../shared-test-executor/test-executor-base";
import * as path from "path";
import * as fs from "fs";

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
			pathJoin: path.join,
			pathResolve: path.resolve,
			getCwd: () => process.cwd(),
		};
		super(sdk, platform);
	}

	protected async readDocumentFile(filename: string, category: 'documents' | 'code'): Promise<string> {
		// Desktop uses standard fs with path construction
		const filePath = this.platform.pathJoin(__dirname, "..", "shared-test-data", category, filename);
		return fs.readFileSync(filePath, "utf-8");
	}

	protected async getAudioFilePath(filename: string): Promise<string> {
		// Desktop uses direct file path
		return this.platform.pathResolve(this.platform.getCwd(), "../shared-test-data/audio", filename);
	}
}

