import mqtt from "mqtt";

// Get monitoring duration from command line argument (in minutes) or use default
const monitorMinutes = process.argv[2] ? parseInt(process.argv[2]) : 10;
const monitorSeconds = monitorMinutes * 60;
const monitorMs = monitorSeconds * 1000;

console.log(`🔍 QVAC Test Monitor - Listening for ${monitorMinutes} minutes (${monitorSeconds} seconds)...\n`);

const client = mqtt.connect("mqtt://127.0.0.1:1883");

let testsSent = 0;
let resultsReceived = 0;
const testResults: Array<{
  testId: string;
  outcome: "success" | "failure";
  duration: number;
  consumerId: string;
  timestamp: string;
  error?: string;
  output?: string;
  params?: any;
  expectation?: any;
}> = [];
const testExpectations: Map<number, any> = new Map();
const publishedTests: Map<number, { testId: string; timestamp: number }> = new Map();

client.on("connect", () => {
  console.log("✅ Connected to MQTT broker");
  console.log("📊 Monitoring test execution...\n");
  console.log("=".repeat(80) + "\n");
  
  client.subscribe(["qvac/test", "qvac/results"], (err) => {
    if (err) {
      console.error("❌ Failed to subscribe:", err);
      process.exit(1);
    }
  });
});

client.on("message", (topic, payload) => {
  const time = new Date().toLocaleTimeString();
  
  if (topic === "qvac/test") {
    testsSent++;
    const test = JSON.parse(payload.toString());
    testExpectations.set(testsSent, test.expectation || {});
    publishedTests.set(testsSent, { testId: test.testId, timestamp: Date.now() });
    console.log(`[${time}] 📤 PUBLISHED: ${test.testId}`);
  } 
  
  if (topic === "qvac/results") {
    resultsReceived++;
    const result = JSON.parse(payload.toString());
    
    // Attach expectation to result for comparison
    const expectation = testExpectations.get(resultsReceived) || {};
    const resultWithExpectation = { ...result, expectation };
    testResults.push(resultWithExpectation);
    
    // Clear pass/fail indicator - simple logic:
    // If outcome is "success" → Test PASSED ✅
    // If outcome is "failure" → Test FAILED ❌
    const status = result.outcome === "success" ? "✅ PASS" : "❌ FAIL";
    
    console.log(`[${time}] 📥 RESULT: ${result.testId} → ${status} (${result.duration}ms)`);
    
    // Show error details for failures
    if (result.outcome === "failure") {
      if (result.error) {
        console.log(`   ⚠️  Error: ${result.error}`);
      }
      if (result.output) {
        console.log(`   📝 Actual: ${result.output}`);
      }
      // Show expectation if available
      if (expectation.value) {
        console.log(`   ✨ Expected: ${expectation.value}`);
      } else if (expectation.contains) {
        console.log(`   ✨ Expected to contain: ${JSON.stringify(expectation.contains)}`);
      } else if (expectation.errorContains) {
        console.log(`   ✨ Expected error containing: ${expectation.errorContains}`);
      } else if (expectation.validation) {
        console.log(`   ✨ Validation: ${expectation.validation}`);
      }
    }
    console.log("");
  }
});

client.on("error", (err) => {
  console.error("❌ MQTT error:", err);
});

// Report after specified duration
setTimeout(() => {
  console.log("\n" + "=".repeat(80));
  console.log("\n📊 TEST EXECUTION SUMMARY\n");
  console.log("=".repeat(80));
  
  console.log(`\nTests Published:  ${testsSent}`);
  console.log(`Results Received: ${resultsReceived}`);
  
  if (resultsReceived > 0) {
    const passed = testResults.filter(r => r.outcome === "success").length;
    const failed = testResults.filter(r => r.outcome === "failure").length;
    const avgDuration = testResults.reduce((sum, r) => sum + r.duration, 0) / testResults.length;
    
    console.log(`\n✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Average Duration: ${avgDuration.toFixed(0)}ms`);
    
    // Group by test type
    const byType: Record<string, { pass: number; fail: number }> = {};
    testResults.forEach(r => {
      if (!byType[r.testId]) {
        byType[r.testId] = { pass: 0, fail: 0 };
      }
      if (r.outcome === "success") {
        byType[r.testId].pass++;
      } else {
        byType[r.testId].fail++;
      }
    });
    
    // Check for stuck/missing tests
    const stuckTests: Array<{ testId: string; waitTime: number; index: number }> = [];
    const now = Date.now();
    for (let i = 1; i <= testsSent; i++) {
      if (i > resultsReceived) {
        const pub = publishedTests.get(i);
        if (pub) {
          const waitTime = now - pub.timestamp;
          stuckTests.push({ testId: pub.testId, waitTime, index: i });
        }
      }
    }

    console.log("\n📋 Results by Test Type:");
    console.log("-".repeat(80));
    Object.entries(byType).forEach(([testId, counts]) => {
      const total = counts.pass + counts.fail;
      const passRate = ((counts.pass / total) * 100).toFixed(0);
      console.log(`  ${testId.padEnd(30)} → ✅ ${counts.pass}  ❌ ${counts.fail}  (${passRate}% pass rate)`);
    });
    
    // Show stuck/pending tests
    if (stuckTests.length > 0) {
      console.log("\n⏳ PENDING/STUCK TESTS:");
      console.log("-".repeat(80));
      stuckTests.forEach((t, idx) => {
        const waitSec = (t.waitTime / 1000).toFixed(0);
        const status = t.waitTime > 300000 ? "🔴 STUCK" : t.waitTime > 60000 ? "⚠️  SLOW" : "⏳ PENDING";
        console.log(`  ${idx + 1}. [#${t.index}] ${t.testId.padEnd(30)} ${status} (waiting ${waitSec}s)`);
      });
      
      console.log(`\n💡 Total pending: ${stuckTests.length} tests`);
      console.log(`   - Tests waiting >5 min are likely STUCK`);
      console.log(`   - Tests waiting >1 min might be long-running (e.g., long-audio)`);
    }
    
    // Show detailed failures
    const failures = testResults.filter(r => r.outcome === "failure");
    if (failures.length > 0) {
      console.log("\n❌ FAILED TESTS - DETAILS:");
      console.log("-".repeat(80));
      failures.forEach((f, idx) => {
        console.log(`\n${idx + 1}. ${f.testId} (${f.duration}ms)`);
        console.log(`   Consumer: ${f.consumerId}`);
        console.log(`   Time: ${new Date(f.timestamp).toLocaleTimeString()}`);
        
        // Show Expected vs Actual comparison
        if (f.expectation) {
          console.log(`\n   📊 Expected vs Actual:`);
          if (f.expectation.value) {
            console.log(`      Expected: ${f.expectation.value}`);
            console.log(`      Actual:   ${f.output || f.error || 'N/A'}`);
          } else if (f.expectation.contains) {
            console.log(`      Expected to contain: ${JSON.stringify(f.expectation.contains)}`);
            console.log(`      Actual output:       ${(f.output || f.error || '').substring(0, 80)}...`);
          } else if (f.expectation.errorContains) {
            console.log(`      Expected error with: ${f.expectation.errorContains}`);
            console.log(`      Actual error:        ${(f.error || f.output || '').substring(0, 80)}...`);
          } else if (f.expectation.validation) {
            console.log(`      Validation type:     ${f.expectation.validation}`);
            console.log(`      Result:              ${f.output || f.error || 'N/A'}`);
          }
        } else {
          if (f.error) {
            console.log(`   Error: ${f.error}`);
          }
          if (f.output) {
            console.log(`   Output: ${f.output}`);
          }
        }
        
        if (f.params) {
          console.log(`\n   Params: ${JSON.stringify(f.params).substring(0, 100)}...`);
        }
      });
    }
    
    console.log("\n" + "=".repeat(80));
    console.log("\n🎯 OVERALL STATUS:");
    if (passed === resultsReceived) {
      console.log("✅ ALL TESTS PASSED!");
    } else if (failed === resultsReceived) {
      console.log("❌ ALL TESTS FAILED!");
    } else {
      console.log(`⚠️  MIXED RESULTS: ${passed} passed, ${failed} failed`);
    }
    
    console.log("\n💡 NOTE: Some tests are DESIGNED to fail (e.g., invalid input tests).");
    console.log("   Check the test name and expected outcome to understand if failure is correct.");
    
  } else if (testsSent > 0) {
    console.log("\n⚠️  Producer is publishing but Consumer is not responding.");
    console.log("   Possible causes:");
    console.log("   - Consumer still loading models");
    console.log("   - Consumer crashed");
    console.log("   - MQTT connection issue");
  } else {
    console.log("\n❌ No tests detected");
    console.log("   - Is the Producer running?");
  }
  
  console.log("\n" + "=".repeat(80) + "\n");
  
  client.end();
  process.exit(0);
}, monitorMs);

console.log(`⏱️  Monitoring for ${monitorMinutes} minutes (${monitorSeconds} seconds)`);
console.log("   Press Ctrl+C to stop early\n");
console.log("💡 Usage: bun run verify-tests.ts [minutes]");
console.log(`   Default: 10 minutes\n`);

