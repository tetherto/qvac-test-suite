/**
 * Analyze HTML report to categorize test failures
 */

import * as fs from "fs";
import * as path from "path";

// Find latest HTML report
const reportsDir = path.join(import.meta.dir, "reports");
const reports = fs.readdirSync(reportsDir)
	.filter(f => f.endsWith(".html"))
	.sort()
	.reverse();

if (reports.length === 0) {
	console.error("❌ No HTML reports found");
	process.exit(1);
}

const latestReport = path.join(reportsDir, reports[0]);
console.log(`📊 Analyzing: ${reports[0]}\n`);

const html = fs.readFileSync(latestReport, "utf-8");

// Extract all failure entries
const failurePattern = /<tr class="failure-highlight">[\s\S]*?<td><strong>(.*?)<\/strong>[\s\S]*?<div class="output-text">(.*?)<\/div>/g;
const matches = Array.from(html.matchAll(failurePattern));

// Categorize failures
const categories = {
	noHandler: [] as string[],
	timeout: [] as string[],
	other: [] as Array<{ testId: string; error: string }>,
};

for (const match of matches) {
	const testId = match[1];
	const error = match[2];
	
	if (error.includes("No handler for test")) {
		categories.noHandler.push(testId);
	} else if (error.includes("Test timeout after")) {
		categories.timeout.push(testId);
	} else {
		categories.other.push({ testId, error });
	}
}

// Print analysis
console.log("═══════════════════════════════════════════════════════════");
console.log("  FAILURE ANALYSIS");
console.log("═══════════════════════════════════════════════════════════\n");

console.log(`📋 MISSING HANDLERS (${categories.noHandler.length} tests):`);
console.log("   These tests don't have implementation in test-executor.ts\n");
if (categories.noHandler.length > 0) {
	categories.noHandler.forEach((test, i) => {
		console.log(`   ${i + 1}. ${test}`);
	});
	console.log();
}

console.log(`⏱️  TIMEOUTS (${categories.timeout.length} tests):`);
console.log("   These tests hit the 30s timeout limit\n");
if (categories.timeout.length > 0) {
	// Group by test type
	const transcription = categories.timeout.filter(t => t.startsWith("transcription"));
	const completion = categories.timeout.filter(t => t.startsWith("completion"));
	const embed = categories.timeout.filter(t => t.startsWith("embed"));
	const rag = categories.timeout.filter(t => t.startsWith("rag"));
	const model = categories.timeout.filter(t => t.startsWith("model"));
	const translation = categories.timeout.filter(t => t.startsWith("translation"));
	
	if (transcription.length > 0) {
		console.log(`   🎤 Transcription (${transcription.length}):`);
		transcription.forEach(t => console.log(`      • ${t}`));
		console.log();
	}
	
	if (completion.length > 0) {
		console.log(`   💬 Completion (${completion.length}):`);
		completion.forEach(t => console.log(`      • ${t}`));
		console.log();
	}
	
	if (embed.length > 0) {
		console.log(`   📊 Embedding (${embed.length}):`);
		embed.forEach(t => console.log(`      • ${t}`));
		console.log();
	}
	
	if (rag.length > 0) {
		console.log(`   📚 RAG (${rag.length}):`);
		rag.forEach(t => console.log(`      • ${t}`));
		console.log();
	}
	
	if (model.length > 0) {
		console.log(`   🔧 Model (${model.length}):`);
		model.forEach(t => console.log(`      • ${t}`));
		console.log();
	}
	
	if (translation.length > 0) {
		console.log(`   🌐 Translation (${translation.length}):`);
		translation.forEach(t => console.log(`      • ${t}`));
		console.log();
	}
}

console.log(`🔴 OTHER ERRORS (${categories.other.length} tests):`);
if (categories.other.length > 0) {
	categories.other.forEach(({ testId, error }) => {
		console.log(`   • ${testId}`);
		console.log(`     Error: ${error.substring(0, 100)}...`);
	});
	console.log();
}

console.log("═══════════════════════════════════════════════════════════");
console.log("  DIAGNOSIS");
console.log("═══════════════════════════════════════════════════════════\n");

console.log("🔍 ROOT CAUSE ANALYSIS:\n");

if (categories.noHandler.length > 0) {
	console.log(`❌ ${categories.noHandler.length} tests are MISSING HANDLERS`);
	console.log("   → These need to be implemented in test-executor.ts\n");
}

if (categories.timeout.length > 0) {
	console.log(`⏱️  ${categories.timeout.length} tests are TIMING OUT`);
	console.log("   → Possible causes:");
	console.log("      1. SDK hanging after previous test");
	console.log("      2. Resource not released properly");
	console.log("      3. Genuinely slow operations");
	console.log("      4. Corrupted SDK state from earlier test\n");
	
	// Check if timeouts happen after specific test
	const firstTimeout = categories.timeout[0];
	console.log(`   📍 First timeout: ${firstTimeout}`);
	console.log("   → Need to check what test ran BEFORE this\n");
}

console.log("💡 RECOMMENDATION:\n");
console.log("   1. Fix missing handlers first (quick wins)");
console.log("   2. Run timeout tests in ISOLATION to verify if genuine");
console.log("   3. If isolation works → likely resource contamination");
console.log("   4. If isolation fails → genuine SDK/test issue\n");

