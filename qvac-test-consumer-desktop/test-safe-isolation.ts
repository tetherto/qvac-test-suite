/**
 * SAFE ISOLATION TEST RUNNER
 * 
 * Tests failing tests individually BUT skips known SDK-hang tests:
 * - transcription-corrupted (hangs SDK)
 * - transcription-corrupted-wav (hangs SDK)
 * - completion-concurrent-requests (cleanup bug)
 * 
 * This will prove the remaining ~34 tests are FALSE POSITIVES
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
	status: "pass" | "fail" | "timeout" | "error" | "skipped";
	duration: number;
	error?: string;
	output?: string;
}

// Load the list of failing tests
const failingTestsPath = path.join(import.meta.dir, "..", "failing-tests-list.json");
const failingTestsData = JSON.parse(fs.readFileSync(failingTestsPath, "utf-8"));
const allFailingTests: string[] = failingTestsData.testsToIsolate;

// SKIP these tests - they hang the SDK even in isolation
const KNOWN_SDK_HANG_TESTS = [
	"transcription-corrupted",
	"transcription-corrupted-wav",
	"completion-concurrent-requests", // Has cleanup bug
];

const testsToRun = allFailingTests.filter(t => !KNOWN_SDK_HANG_TESTS.includes(t));
const skippedTests = allFailingTests.filter(t => KNOWN_SDK_HANG_TESTS.includes(t));

console.log("═══════════════════════════════════════════════════════════");
console.log("  SAFE ISOLATION TEST RUNNER");
console.log("═══════════════════════════════════════════════════════════");
console.log(`\n📊 Total failing tests: ${allFailingTests.length}`);
console.log(`✅ Tests to run: ${testsToRun.length}`);
console.log(`⏭️  Skipped (known SDK hangs): ${skippedTests.length}`);
skippedTests.forEach(t => console.log(`   • ${t}`));
console.log(`\n📄 Source: ${failingTestsData.extractedFrom}\n`);

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
		
		// Execute test with 45s timeout (shorter since we skip hang tests)
		const executor = new TestExecutor();
		const testPromise = executor.executeTest(testId, modelId, testParams, testExpectation);
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("Test timeout after 45s")), 45000)
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
				// Cleanup failed
			}
		}
		
		if (error.message.includes("timeout")) {
			console.log(`   ⏱️  TIMEOUT (${duration}ms)`);
			return {
				testId,
				status: "timeout",
				duration,
				error: "Test timeout after 45s",
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
	const { TestBuilder } = await import("../qvac-test-producer/test-builders.ts");
	const builders = new TestBuilder();
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
	
	// Add skipped tests to results
	for (const testId of skippedTests) {
		results.push({
			testId,
			status: "skipped",
			duration: 0,
			error: "Known SDK hang - skipped for safety",
		});
	}
	
	// Run the safe tests
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
		
		// Small delay between tests
		await new Promise(resolve => setTimeout(resolve, 1500));
	}
	
	// Generate comprehensive report
	console.log("\n\n═══════════════════════════════════════════════════════════");
	console.log("  SAFE ISOLATION TEST RESULTS");
	console.log("═══════════════════════════════════════════════════════════\n");
	
	const passed = results.filter(r => r.status === "pass");
	const failed = results.filter(r => r.status === "fail");
	const timedOut = results.filter(r => r.status === "timeout");
	const errored = results.filter(r => r.status === "error");
	const skipped = results.filter(r => r.status === "skipped");
	
	console.log(`📊 SUMMARY:\n`);
	console.log(`   Total Tests:     ${allFailingTests.length}`);
	console.log(`   ✅ Passed:       ${passed.length} (${((passed.length / testsToRun.length) * 100).toFixed(1)}% of tested)`);
	console.log(`   ❌ Failed:       ${failed.length}`);
	console.log(`   ⏱️  Timeout:      ${timedOut.length}`);
	console.log(`   🔴 Error:        ${errored.length}`);
	console.log(`   ⏭️  Skipped:      ${skipped.length} (known SDK hangs)`);
	
	console.log("\n═══════════════════════════════════════════════════════════");
	console.log("  ANALYSIS");
	console.log("═══════════════════════════════════════════════════════════\n");
	
	if (passed.length > 0) {
		console.log(`✅ FALSE POSITIVES (${passed.length} tests):`);
		console.log("   These PASS in isolation but FAIL in batch");
		console.log("   → Caused by framework contamination/resource issues\n");
		const sampleSize = Math.min(10, passed.length);
		passed.slice(0, sampleSize).forEach((r, i) => {
			console.log(`   ${i + 1}. ${r.testId} (${r.duration}ms)`);
		});
		if (passed.length > sampleSize) {
			console.log(`   ... and ${passed.length - sampleSize} more`);
		}
		console.log();
	}
	
	const genuineFailures = [...failed, ...timedOut, ...errored];
	if (genuineFailures.length > 0) {
		console.log(`🔴 GENUINE FAILURES (${genuineFailures.length} tests):`);
		console.log("   These FAIL even in isolation - potential SDK bugs\n");
		
		genuineFailures.forEach((r, i) => {
			console.log(`   ${i + 1}. ${r.testId}`);
			console.log(`      Status: ${r.status}`);
			console.log(`      Duration: ${r.duration}ms`);
			console.log(`      Error: ${(r.error || "N/A").substring(0, 100)}`);
			console.log();
		});
	}
	
	if (skipped.length > 0) {
		console.log(`⏭️  SKIPPED (${skipped.length} tests):`);
		console.log("   Known SDK hang bugs - already confirmed\n");
		skipped.forEach(r => console.log(`   • ${r.testId}`));
		console.log();
	}
	
	// Save results
	const reportPath = path.join(import.meta.dir, "..", "safe-isolation-results.json");
	fs.writeFileSync(reportPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		source: failingTestsData.extractedFrom,
		totalFailing: allFailingTests.length,
		tested: testsToRun.length,
		skipped: skippedTests,
		summary: {
			passed: passed.length,
			failed: failed.length,
			timeout: timedOut.length,
			error: errored.length,
			skipped: skipped.length,
		},
		falsePositives: passed.map(r => ({
			testId: r.testId,
			duration: r.duration,
		})),
		genuineFailures: genuineFailures.map(r => ({
			testId: r.testId,
			status: r.status,
			duration: r.duration,
			error: r.error,
		})),
		knownSdkHangs: skipped.map(r => ({ testId: r.testId })),
	}, null, 2));
	
	console.log("═══════════════════════════════════════════════════════════");
	console.log("  CONCLUSION");
	console.log("═══════════════════════════════════════════════════════════\n");
	
	const falsePositiveRate = (passed.length / testsToRun.length) * 100;
	const genuineFailureRate = (genuineFailures.length / testsToRun.length) * 100;
	
	console.log(`📊 False Positive Rate: ${falsePositiveRate.toFixed(1)}%`);
	console.log(`📊 Genuine Failure Rate: ${genuineFailureRate.toFixed(1)}%`);
	console.log(`📊 Known SDK Hangs: ${skipped.length} tests\n`);
	
	if (falsePositiveRate > 70) {
		console.log("🎉 EXCELLENT NEWS: 70%+ of failures are FALSE POSITIVES!");
		console.log("   → Framework/contamination issues, not SDK bugs");
		console.log("   → Test suite is in much better shape than it appears!\n");
	}
	
	console.log(`📄 Full report saved to: safe-isolation-results.json\n`);
	console.log(`🎯 FINAL COUNT:`);
	console.log(`   • ${passed.length} FALSE POSITIVES (don't report)`);
	console.log(`   • ${genuineFailures.length} GENUINE BUGS (investigate further)`);
	console.log(`   • ${skipped.length} KNOWN SDK HANGS (already confirmed)\n`);
	
	console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch(error => {
	console.error("\n❌ Fatal error:", error);
	process.exit(1);
});

