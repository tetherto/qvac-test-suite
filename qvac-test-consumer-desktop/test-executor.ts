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
		super(sdk);
	}

	protected getSharedDataPath(): string {
		return path.join(__dirname, "..", "shared-test-data");
	}

	protected readDocumentFile(filePath: string): string {
		// Desktop uses standard fs
		return fs.readFileSync(filePath, "utf-8");
	}

	protected getAudioFilePath(filename: string): string {
		// Desktop uses direct file path
		return path.resolve(process.cwd(), "../shared-test-data/audio", filename);
	}
}

