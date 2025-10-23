/**
 * SYSTEMATIC ISOLATION TEST RUNNER
 * 
 * Tests all failing tests from batch run individually to verify:
 * - Which failures are GENUINE SDK bugs
 * - Which failures are FALSE POSITIVES (framework/contamination issues)
 * 
 * Each test runs in complete isolation with fresh SDK state.
 */

import {
	loadModel,
	unloadModel,
	LLAMA_3_2_1B_INST_Q4_0,
	WHISPER_TINY,
	VAD_SILERO_5_1_2,
	GTE_LARGE_FP16,
} from "@qvac/sdk";
import { TestExecutor } from "./test-executor";
import * as fs from "fs";
import * as path from "path";

interface TestResult {
	testId: string;
	status: "pass" | "fail" | "timeout" | "error";
	duration: number;
	error?: string;
	output?: string;
}

// Load the list of failing tests
const failingTestsPath = path.join(import.meta.dir, "..", "failing-tests-list.json");
const failingTestsData = JSON.parse(fs.readFileSync(failingTestsPath, "utf-8"));
const testsToRun: string[] = failingTestsData.testsToIsolate;

console.log("═══════════════════════════════════════════════════════════");
console.log("  SYSTEMATIC ISOLATION TEST RUNNER");
console.log("═══════════════════════════════════════════════════════════");
console.log(`\n📊 Loaded ${testsToRun.length} failing tests from batch report`);
console.log(`📄 Source: ${failingTestsData.extractedFrom}\n`);

async function runIsolatedTest(
	testId: string,
	testParams: any,
	testExpectation: any
): Promise<TestResult> {
	const startTime = Date.now();
	let modelId: string | null = null;
	
	try {
		console.log(`\n▶️  Testing: ${testId}`);
		
		// Determine which model to load based on test type
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
		
		// Execute test with 60s timeout (2x batch timeout)
		const executor = new TestExecutor();
		const testPromise = executor.executeTest(testId, modelId, testParams, testExpectation);
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("Test timeout after 60s")), 60000)
		);
		
		const result = await Promise.race([testPromise, timeoutPromise]);
		
		// Clean up
		await unloadModel({ modelId });
		
		const duration = Date.now() - startTime;
		
		if (result.passed) {
			console.log(`   ✅ PASS (${duration}ms)`);
			return {
				testId,
				status: "pass",
				duration,
				output: result.output,
			};
		} else {
			console.log(`   ❌ FAIL (${duration}ms): ${result.output}`);
			return {
				testId,
				status: "fail",
				duration,
				error: result.output,
			};
		}
		
	} catch (error: any) {
		const duration = Date.now() - startTime;
		
		// Try to clean up if model was loaded
		if (modelId) {
			try {
				await unloadModel({ modelId });
			} catch (e) {
				// Cleanup failed, SDK might be hung
			}
		}
		
		if (error.message.includes("timeout")) {
			console.log(`   ⏱️  TIMEOUT (${duration}ms)`);
			return {
				testId,
				status: "timeout",
				duration,
				error: "Test timeout after 60s",
			};
		}
		
		console.log(`   ❌ ERROR (${duration}ms): ${error.message}`);
		return {
			testId,
			status: "error",
			duration,
			error: error.message,
		};
	}
}

// Load test definitions from producer
async function loadTestDefinitions(): Promise<Map<string, any>> {
	// Read producer test definitions
	const { TestBuilders } = await import("../qvac-test-producer/test-builders.ts");
	const builders = new TestBuilders();
	const allTests = builders.buildAllTests();
	
	const testMap = new Map<string, any>();
	for (const test of allTests) {
		const payload = JSON.parse(test.payload);
		testMap.set(payload.testId, {
			params: payload.params,
			expectation: payload.expectation,
		});
	}
	
	return testMap;
}

async function main() {
	console.log("🔧 Loading test definitions...\n");
	const testDefinitions = await loadTestDefinitions();
	
	const results: TestResult[] = [];
	let testNumber = 0;
	
	for (const testId of testsToRun) {
		testNumber++;
		console.log(`\n${"=".repeat(60)}`);
		console.log(`TEST ${testNumber}/${testsToRun.length}`);
		console.log("=".repeat(60));
		
		const testDef = testDefinitions.get(testId);
		if (!testDef) {
			console.log(`⚠️  Test definition not found: ${testId}`);
			results.push({
				testId,
				status: "error",
				duration: 0,
				error: "Test definition not found",
			});
			continue;
		}
		
		const result = await runIsolatedTest(testId, testDef.params, testDef.expectation);
		results.push(result);
		
		// Small delay between tests to let system settle
		await new Promise(resolve => setTimeout(resolve, 2000));
	}
	
	// Generate comprehensive report
	console.log("\n\n═══════════════════════════════════════════════════════════");
	console.log("  ISOLATION TEST RESULTS");
	console.log("═══════════════════════════════════════════════════════════\n");
	
	const passed = results.filter(r => r.status === "pass");
	const failed = results.filter(r => r.status === "fail");
	const timedOut = results.filter(r => r.status === "timeout");
	const errored = results.filter(r => r.status === "error");
	
	console.log(`📊 SUMMARY:\n`);
	console.log(`   Total Tested:    ${results.length}`);
	console.log(`   ✅ Passed:       ${passed.length} (${((passed.length / results.length) * 100).toFixed(1)}%)`);
	console.log(`   ❌ Failed:       ${failed.length} (${((failed.length / results.length) * 100).toFixed(1)}%)`);
	console.log(`   ⏱️  Timeout:      ${timedOut.length} (${((timedOut.length / results.length) * 100).toFixed(1)}%)`);
	console.log(`   🔴 Error:        ${errored.length} (${((errored.length / results.length) * 100).toFixed(1)}%)`);
	
	console.log("\n═══════════════════════════════════════════════════════════");
	console.log("  ANALYSIS");
	console.log("═══════════════════════════════════════════════════════════\n");
	
	if (passed.length > 0) {
		console.log(`✅ FALSE POSITIVES (${passed.length} tests):`);
		console.log("   These PASS in isolation but FAIL in batch");
		console.log("   → Caused by framework contamination or resource issues\n");
		passed.forEach((r, i) => {
			console.log(`   ${i + 1}. ${r.testId} (${r.duration}ms)`);
		});
		console.log();
	}
	
	if (failed.length > 0 || timedOut.length > 0 || errored.length > 0) {
		console.log(`🔴 GENUINE FAILURES (${failed.length + timedOut.length + errored.length} tests):`);
		console.log("   These FAIL even in isolation - report to SDK team\n");
		
		[...failed, ...timedOut, ...errored].forEach((r, i) => {
			console.log(`   ${i + 1}. ${r.testId}`);
			console.log(`      Status: ${r.status}`);
			console.log(`      Duration: ${r.duration}ms`);
			console.log(`      Error: ${r.error || "N/A"}`);
			console.log();
		});
	}
	
	// Save results to file
	const reportPath = path.join(import.meta.dir, "..", "isolation-test-results.json");
	fs.writeFileSync(reportPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		source: failingTestsData.extractedFrom,
		totalTested: results.length,
		summary: {
			passed: passed.length,
			failed: failed.length,
			timeout: timedOut.length,
			error: errored.length,
		},
		falsePositives: passed.map(r => ({
			testId: r.testId,
			duration: r.duration,
			output: r.output,
		})),
		genuineFailures: [...failed, ...timedOut, ...errored].map(r => ({
			testId: r.testId,
			status: r.status,
			duration: r.duration,
			error: r.error,
		})),
		allResults: results,
	}, null, 2));
	
	console.log("═══════════════════════════════════════════════════════════");
	console.log("  CONCLUSION");
	console.log("═══════════════════════════════════════════════════════════\n");
	
	const falsePositiveRate = (passed.length / results.length) * 100;
	const genuineFailureRate = ((failed.length + timedOut.length + errored.length) / results.length) * 100;
	
	console.log(`📊 False Positive Rate: ${falsePositiveRate.toFixed(1)}%`);
	console.log(`📊 Genuine Failure Rate: ${genuineFailureRate.toFixed(1)}%\n`);
	
	if (falsePositiveRate > 50) {
		console.log("✅ GOOD NEWS: Majority of failures are FALSE POSITIVES!");
		console.log("   → Framework/contamination issues, not SDK bugs");
		console.log("   → Test suite is actually in better shape than it appears\n");
	}
	
	if (genuineFailureRate < 20) {
		console.log("✅ EXCELLENT: Less than 20% genuine failures!");
		console.log("   → Only a few real SDK bugs to report\n");
	}
	
	console.log(`📄 Full report saved to: isolation-test-results.json\n`);
	console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch(error => {
	console.error("\n❌ Fatal error:", error);
	process.exit(1);
});

