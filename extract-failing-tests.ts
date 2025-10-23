/**
 * Extract all failing tests from HTML report and create isolation test list
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

// Extract all failure entries with their error messages
const failurePattern = /<tr class="failure-highlight">[\s\S]*?<td><strong>(.*?)<\/strong>[\s\S]*?<div class="output-text">(.*?)<\/div>/g;
const matches = Array.from(html.matchAll(failurePattern));

interface FailedTest {
	testId: string;
	error: string;
	category: string;
}

const failedTests: FailedTest[] = [];

for (const match of matches) {
	const testId = match[1];
	const error = match[2];
	
	let category = "other";
	if (error.includes("No handler for test")) {
		category = "no-handler";
	} else if (error.includes("Test timeout after")) {
		category = "timeout";
	} else if (error.includes("context overflow")) {
		category = "context-overflow";
	} else if (error.includes("not yet implemented")) {
		category = "not-implemented";
	}
	
	failedTests.push({ testId, error, category });
}

console.log("═══════════════════════════════════════════════════════════");
console.log("  FAILED TESTS EXTRACTION");
console.log("═══════════════════════════════════════════════════════════\n");

console.log(`📋 Total Failed Tests: ${failedTests.length}\n`);

// Group by category
const byCategory = {
	"no-handler": failedTests.filter(t => t.category === "no-handler"),
	"timeout": failedTests.filter(t => t.category === "timeout"),
	"context-overflow": failedTests.filter(t => t.category === "context-overflow"),
	"not-implemented": failedTests.filter(t => t.category === "not-implemented"),
	"other": failedTests.filter(t => t.category === "other"),
};

console.log("📊 BREAKDOWN BY CATEGORY:\n");
Object.entries(byCategory).forEach(([category, tests]) => {
	if (tests.length > 0) {
		console.log(`   ${category}: ${tests.length} tests`);
	}
});

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  GENERATING ISOLATION TEST FILE");
console.log("═══════════════════════════════════════════════════════════\n");

// Generate the test list for isolation
const testList = failedTests
	.filter(t => t.category !== "no-handler" && t.category !== "not-implemented")
	.map(t => t.testId);

console.log(`✅ Extracted ${testList.length} tests to verify in isolation`);
console.log(`   (Excluded ${byCategory["no-handler"].length} no-handler + ${byCategory["not-implemented"].length} not-implemented)\n`);

// Write to file
const outputPath = path.join(import.meta.dir, "failing-tests-list.json");
fs.writeFileSync(outputPath, JSON.stringify({
	extractedFrom: reports[0],
	totalFailed: failedTests.length,
	testsToIsolate: testList,
	breakdown: {
		"no-handler": byCategory["no-handler"].map(t => t.testId),
		"timeout": byCategory["timeout"].map(t => t.testId),
		"context-overflow": byCategory["context-overflow"].map(t => t.testId),
		"not-implemented": byCategory["not-implemented"].map(t => t.testId),
		"other": byCategory["other"].map(t => t.testId),
	}
}, null, 2));

console.log(`📄 Saved to: failing-tests-list.json\n`);

console.log("═══════════════════════════════════════════════════════════");
console.log("  NEXT STEP");
console.log("═══════════════════════════════════════════════════════════\n");
console.log("Run: bun run test-failing-in-isolation.ts");
console.log("This will test each failing test individually to verify if genuine.\n");

