/**
 * Test individual timeout failures in ISOLATION
 * to determine if they're genuine or caused by resource contamination
 */

import {
	loadModel,
	unloadModel,
	completion as runCompletion,
	embed as runEmbed,
	ragSaveEmbeddings,
	transcribe as runTranscription,
	LLAMA_3_2_1B_INST_Q4_0,
	WHISPER_TINY,
	VAD_SILERO_5_1_2,
	GTE_LARGE_FP16,
} from "@qvac/sdk";
import * as path from "path";
import * as fs from "fs";

// Tests that timeout in batch run - testing them individually
const SUSPECT_TESTS = [
	// Transcription (first timeout - likely culprit)
	"transcription-corrupted",
	"transcription-corrupted-wav",
	
	// Completion tests
	"completion-concurrent-requests",
	"completion-repeated-tokens",
	"completion-whitespace",
	"completion-json-format",
	"completion-code-generation",
	
	// Embedding tests
	"embed-python-code",
	"embed-javascript-code",
	
	// RAG tests
	"rag-embeddings-small-chunks",
	"rag-large-document-32kb",
	
	// Model tests
	"model-switch-llm",
	"model-reload-after-error",
];

interface TestResult {
	testId: string;
	status: "pass" | "fail" | "timeout" | "error";
	duration: number;
	error?: string;
}

async function runIsolatedTest(testId: string): Promise<TestResult> {
	const startTime = Date.now();
	
	try {
		console.log(`\n▶️  Testing: ${testId}`);
		
		// Load appropriate model for test
		let modelId: string | null = null;
		
		if (testId.startsWith("transcription")) {
			console.log("   Loading Whisper model...");
			modelId = await loadModel({
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
		} else if (testId.startsWith("embed") || testId.startsWith("rag")) {
			console.log("   Loading Embedding model...");
			modelId = await loadModel({
				modelSrc: GTE_LARGE_FP16,
				modelType: "embeddings",
			});
		} else if (testId.startsWith("completion") || testId.startsWith("model")) {
			console.log("   Loading LLM model...");
			modelId = await loadModel({
				modelSrc: LLAMA_3_2_1B_INST_Q4_0,
				modelType: "llm",
				modelConfig: {
					verbosity: 0,
					ctx_size: 2048,
					n_discarded: 256,
				},
			});
		}
		
		if (!modelId) {
			throw new Error("Failed to load model");
		}
		
		// Execute test with 60s timeout (double the batch timeout)
		const testPromise = executeTestLogic(testId, modelId);
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("Test timeout after 60s")), 60000)
		);
		
		await Promise.race([testPromise, timeoutPromise]);
		
		// Clean up
		await unloadModel({ modelId });
		
		const duration = Date.now() - startTime;
		console.log(`   ✅ PASS (${duration}ms)`);
		
		return {
			testId,
			status: "pass",
			duration,
		};
		
	} catch (error: any) {
		const duration = Date.now() - startTime;
		
		if (error.message.includes("timeout")) {
			console.log(`   ⏱️  TIMEOUT (${duration}ms)`);
			return {
				testId,
				status: "timeout",
				duration,
				error: error.message,
			};
		}
		
		console.log(`   ❌ ERROR: ${error.message}`);
		return {
			testId,
			status: "error",
			duration,
			error: error.message,
		};
	}
}

async function executeTestLogic(testId: string, modelId: string): Promise<void> {
	switch (testId) {
		case "transcription-corrupted":
			{
				const audioPath = path.join(import.meta.dir, "shared-test-data", "audio", "corrupted.mp3");
				await runTranscription({ modelId, audio: audioPath });
			}
			break;
			
		case "transcription-corrupted-wav":
			{
				const audioPath = path.join(import.meta.dir, "shared-test-data", "audio", "corrupted.wav");
				await runTranscription({ modelId, audio: audioPath });
			}
			break;
			
		case "completion-concurrent-requests":
			{
				await Promise.all([
					runCompletion({
						modelId,
						history: [{ role: "user", content: "What is 3 + 3? Answer with just the number." }],
						stream: false,
					}),
					runCompletion({
						modelId,
						history: [{ role: "user", content: "What is 5 + 5? Answer with just the number." }],
						stream: false,
					}),
					runCompletion({
						modelId,
						history: [{ role: "user", content: "What is 7 + 7? Answer with just the number." }],
						stream: false,
					}),
				]);
			}
			break;
			
		case "completion-repeated-tokens":
			{
				const result = await runCompletion({
					modelId,
					history: [{ role: "user", content: "Repeat after me: hello hello hello" }],
					stream: false,
				});
				await result.text;
			}
			break;
			
		case "completion-whitespace":
			{
				const result = await runCompletion({
					modelId,
					history: [{ role: "user", content: "   What is AI?   " }],
					stream: false,
				});
				await result.text;
			}
			break;
			
		case "completion-json-format":
			{
				const result = await runCompletion({
					modelId,
					history: [{ role: "user", content: 'Generate a JSON object with "name" and "age" fields.' }],
					stream: false,
				});
				await result.text;
			}
			break;
			
		case "completion-code-generation":
			{
				const result = await runCompletion({
					modelId,
					history: [{ role: "user", content: "Write a Python function to add two numbers." }],
					stream: false,
				});
				await result.text;
			}
			break;
			
		case "embed-python-code":
			{
				const codePath = path.join(import.meta.dir, "shared-test-data", "code", "example.py");
				const code = fs.readFileSync(codePath, "utf-8");
				await runEmbed({ modelId, text: code });
			}
			break;
			
		case "embed-javascript-code":
			{
				const codePath = path.join(import.meta.dir, "shared-test-data", "code", "example.js");
				const code = fs.readFileSync(codePath, "utf-8");
				await runEmbed({ modelId, text: code });
			}
			break;
			
		case "rag-embeddings-small-chunks":
			{
				const doc = "This is a test document for RAG embeddings. ".repeat(5);
				await ragSaveEmbeddings({
					modelId,
					workspace: "test-isolated",
					documents: [doc],
					chunk: true,
					chunkOpts: { chunkSize: 20, chunkOverlap: 5, chunkStrategy: "paragraph" },
				});
			}
			break;
			
		case "rag-large-document-32kb":
			{
				const docPath = path.join(import.meta.dir, "shared-test-data", "documents", "large-doc-32kb.txt");
				const doc = fs.readFileSync(docPath, "utf-8");
				await ragSaveEmbeddings({
					modelId,
					workspace: "test-large-doc",
					documents: [doc],
					chunk: true,
					chunkOpts: { chunkSize: 500, chunkOverlap: 100, chunkStrategy: "paragraph" },
				});
			}
			break;
			
		case "model-switch-llm":
			{
				// Switch to a different model
				await unloadModel({ modelId });
				const newModelId = await loadModel({
					modelSrc: LLAMA_3_2_1B_INST_Q4_0,
					modelType: "llm",
				});
				await unloadModel({ modelId: newModelId });
			}
			break;
			
		case "model-reload-after-error":
			{
				// Trigger an error then reload
				try {
					const result = await runCompletion({
						modelId,
						history: [{ role: "user", content: "x".repeat(10000) }], // Context overflow
						stream: false,
					});
					await result.text;
				} catch (e) {
					// Expected error
				}
				
				// Reload
				await unloadModel({ modelId });
				const newModelId = await loadModel({
					modelSrc: LLAMA_3_2_1B_INST_Q4_0,
					modelType: "llm",
				});
				await unloadModel({ modelId: newModelId });
			}
			break;
			
		default:
			throw new Error(`No test logic for: ${testId}`);
	}
}

// Run all tests
async function main() {
	console.log("═══════════════════════════════════════════════════════════");
	console.log("  ISOLATED TIMEOUT TEST RUNNER");
	console.log("═══════════════════════════════════════════════════════════");
	console.log(`\n📋 Testing ${SUSPECT_TESTS.length} suspect tests individually\n`);
	
	const results: TestResult[] = [];
	
	for (const testId of SUSPECT_TESTS) {
		const result = await runIsolatedTest(testId);
		results.push(result);
		
		// Small delay between tests
		await new Promise(resolve => setTimeout(resolve, 1000));
	}
	
	// Print summary
	console.log("\n═══════════════════════════════════════════════════════════");
	console.log("  RESULTS SUMMARY");
	console.log("═══════════════════════════════════════════════════════════\n");
	
	const passed = results.filter(r => r.status === "pass");
	const timedOut = results.filter(r => r.status === "timeout");
	const errored = results.filter(r => r.status === "error");
	
	console.log(`✅ PASSED:  ${passed.length}/${results.length}`);
	console.log(`⏱️  TIMEOUT: ${timedOut.length}/${results.length}`);
	console.log(`❌ ERRORS:  ${errored.length}/${results.length}\n`);
	
	if (timedOut.length > 0) {
		console.log("⏱️  GENUINE TIMEOUTS (even in isolation):");
		timedOut.forEach(r => console.log(`   • ${r.testId}`));
		console.log();
	}
	
	if (errored.length > 0) {
		console.log("❌ GENUINE ERRORS:");
		errored.forEach(r => console.log(`   • ${r.testId}: ${r.error}`));
		console.log();
	}
	
	if (passed.length > 0) {
		console.log("✅ FALSE POSITIVES (pass in isolation, fail in batch):");
		passed.forEach(r => console.log(`   • ${r.testId} (${r.duration}ms)`));
		console.log();
	}
	
	console.log("═══════════════════════════════════════════════════════════");
	console.log("  CONCLUSION");
	console.log("═══════════════════════════════════════════════════════════\n");
	
	if (passed.length === results.length) {
		console.log("🎉 ALL TESTS PASS IN ISOLATION!");
		console.log("   → Batch timeouts are FALSE POSITIVES");
		console.log("   → Resource contamination from previous tests");
		console.log("   → Need better cleanup between tests\n");
	} else if (timedOut.length > 0 || errored.length > 0) {
		console.log("⚠️  SOME TESTS FAIL EVEN IN ISOLATION");
		console.log("   → These are GENUINE SDK/test issues");
		console.log(`   → ${timedOut.length + errored.length} bugs need fixing\n`);
	}
}

main().catch(console.error);

