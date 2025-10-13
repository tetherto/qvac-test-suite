import mqtt from "mqtt";

// Simple monitoring dashboard for batch orchestration

const client = mqtt.connect("mqtt://127.0.0.1:1883");

interface ConsumerStats {
	consumerId: string;
	platform: string;
	testsCompleted: number;
	lastSeen: Date;
}

interface TestInProgress {
	uniqueTestId: string;
	testId: string;
	consumerId: string;
	startedAt: Date;
}

const consumers = new Map<string, ConsumerStats>();
const testsInProgress = new Map<string, TestInProgress>();
const completedTests: Array<{ testId: string; outcome: string; duration: number; consumerId: string }> = [];

let totalTestsInBatch = 0;
let batchStartTime = Date.now();
let batchComplete = false;

function clearScreen() {
	console.clear();
}

function displayDashboard() {
	clearScreen();
	
	const elapsed = (Date.now() - batchStartTime) / 1000;
	const completed = completedTests.length;
	const running = testsInProgress.size;
	const successCount = completedTests.filter(t => t.outcome === "success").length;
	const failureCount = completed - successCount;
	
	console.log("╔════════════════════════════════════════════════════════════════╗");
	console.log("║           QVAC BATCH TEST ORCHESTRATION MONITOR                ║");
	console.log("╚════════════════════════════════════════════════════════════════╝\n");
	
	console.log(`⏱️  Elapsed Time: ${elapsed.toFixed(1)}s`);
	console.log(`📊 Progress: ${completed}/${totalTestsInBatch || '?'} completed | ${running} running`);
	
	if (totalTestsInBatch > 0) {
		const progress = Math.floor((completed / totalTestsInBatch) * 100);
		const barLength = 50;
		const filledLength = Math.floor((progress / 100) * barLength);
		const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
		console.log(`📈 [${bar}] ${progress}%`);
	}
	
	console.log(`✅ Passed: ${successCount} | ❌ Failed: ${failureCount}`);
	
	if (completed > 0) {
		const successRate = ((successCount / completed) * 100).toFixed(1);
		console.log(`📈 Success Rate: ${successRate}%`);
	}
	
	console.log("\n👥 ACTIVE CONSUMERS:");
	console.log("─".repeat(64));
	
	if (consumers.size === 0) {
		console.log("   (No consumers registered)");
	} else {
		for (const consumer of consumers.values()) {
			const timeSinceLastSeen = (Date.now() - consumer.lastSeen.getTime()) / 1000;
			const status = timeSinceLastSeen > 30 ? "⚠️  STALE" : "✅ ACTIVE";
			console.log(`   ${status} ${consumer.consumerId}`);
			console.log(`           Platform: ${consumer.platform} | Tests: ${consumer.testsCompleted}`);
		}
	}
	
	console.log("\n🔄 TESTS IN PROGRESS:");
	console.log("─".repeat(64));
	
	if (testsInProgress.size === 0) {
		console.log("   (No tests currently running)");
	} else {
		for (const test of testsInProgress.values()) {
			const duration = (Date.now() - test.startedAt.getTime()) / 1000;
			console.log(`   ▶️  ${test.testId} (${duration.toFixed(1)}s)`);
			console.log(`       Consumer: ${test.consumerId}`);
		}
	}
	
	console.log("\n📋 RECENT COMPLETIONS:");
	console.log("─".repeat(64));
	
	const recent = completedTests.slice(-5).reverse();
	if (recent.length === 0) {
		console.log("   (No completed tests yet)");
	} else {
		for (const test of recent) {
			const icon = test.outcome === "success" ? "✅" : "❌";
			const durationSec = (test.duration / 1000).toFixed(1);
			console.log(`   ${icon} ${test.testId} (${durationSec}s) - ${test.consumerId}`);
		}
	}
	
	if (batchComplete) {
		console.log("\n╔════════════════════════════════════════════════════════════════╗");
		console.log("║                    🎉 BATCH COMPLETE! 🎉                       ║");
		console.log("╚════════════════════════════════════════════════════════════════╝");
	}
	
	console.log("\n─".repeat(64));
	console.log("Press Ctrl+C to exit monitor");
}

client.on("connect", () => {
	console.log("📡 Connected to MQTT broker - Monitoring batch orchestration...\n");
	
	client.subscribe([
		"qvac/register",
		"qvac/test-assigned/+",
		"qvac/test-start",
		"qvac/results",
		"qvac/batch-complete",
	], { qos: 0 });
	
	// Update display every second
	setInterval(displayDashboard, 1000);
});

client.on("message", (topic, payload) => {
	try {
		const message = JSON.parse(payload.toString());
		
		if (topic === "qvac/register") {
			consumers.set(message.consumerId, {
				consumerId: message.consumerId,
				platform: message.platform,
				testsCompleted: 0,
				lastSeen: new Date(),
			});
		} else if (topic.startsWith("qvac/test-assigned/")) {
			if (message.status === "assigned") {
				const consumer = consumers.get(message.test ? topic.split("/")[2] : "");
				if (consumer) {
					consumer.lastSeen = new Date();
				}
			}
		} else if (topic === "qvac/test-start") {
			testsInProgress.set(message.uniqueTestId, {
				uniqueTestId: message.uniqueTestId,
				testId: message.uniqueTestId.split("-").slice(0, -2).join("-") || "unknown",
				consumerId: message.consumerId,
				startedAt: new Date(),
			});
			
			const consumer = consumers.get(message.consumerId);
			if (consumer) {
				consumer.lastSeen = new Date();
			}
		} else if (topic === "qvac/results") {
			testsInProgress.delete(message.uniqueTestId);
			
			completedTests.push({
				testId: message.testId,
				outcome: message.outcome,
				duration: message.duration,
				consumerId: message.consumerId,
			});
			
			const consumer = consumers.get(message.consumerId);
			if (consumer) {
				consumer.testsCompleted++;
				consumer.lastSeen = new Date();
			}
		} else if (topic === "qvac/batch-complete") {
			totalTestsInBatch = message.totalTests;
			batchComplete = true;
			displayDashboard();
			
			// Generate HTML report
			generateHtmlReport();
			
			setTimeout(() => {
				console.log("\n\n👋 Monitor shutting down...\n");
				client.end();
				process.exit(0);
			}, 5000);
		}
		
		displayDashboard();
	} catch (error) {
		// Ignore parse errors
	}
});

client.on("error", (err) => {
	console.error("❌ MQTT error:", err);
	process.exit(1);
});

function generateHtmlReport() {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const fs = require('fs');
	
	// Create reports directory if it doesn't exist
	if (!fs.existsSync('reports')) {
		fs.mkdirSync('reports');
	}
	
	const filename = `reports/batch-report-${timestamp}.html`;
	
	const elapsed = (Date.now() - batchStartTime) / 1000;
	const successCount = completedTests.filter(t => t.outcome === "success").length;
	const failureCount = completedTests.filter(t => t.outcome === "failure").length;
	const successRate = completedTests.length > 0 ? ((successCount / completedTests.length) * 100).toFixed(1) : "0.0";
	
	// Group tests by consumer
	const testsByConsumer = new Map<string, typeof completedTests>();
	for (const test of completedTests) {
		if (!testsByConsumer.has(test.consumerId)) {
			testsByConsumer.set(test.consumerId, []);
		}
		testsByConsumer.get(test.consumerId)!.push(test);
	}
	
	// Group tests by category
	const testsByCategory = new Map<string, typeof completedTests>();
	for (const test of completedTests) {
		const category = test.testId.split("-")[0];
		if (!testsByCategory.has(category)) {
			testsByCategory.set(category, []);
		}
		testsByCategory.get(category)!.push(test);
	}
	
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>QVAC Batch Test Report - ${new Date().toLocaleString()}</title>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		body { 
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
			background: #f5f5f5;
			padding: 20px;
		}
		.container { max-width: 1200px; margin: 0 auto; }
		.header {
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
			padding: 30px;
			border-radius: 10px;
			margin-bottom: 20px;
			box-shadow: 0 4px 6px rgba(0,0,0,0.1);
		}
		.header h1 { margin-bottom: 10px; }
		.header p { opacity: 0.9; }
		.stats {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
			gap: 15px;
			margin-bottom: 20px;
		}
		.stat-card {
			background: white;
			padding: 20px;
			border-radius: 8px;
			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
		}
		.stat-card h3 { color: #666; font-size: 14px; margin-bottom: 5px; }
		.stat-card .value { font-size: 32px; font-weight: bold; }
		.stat-card.success .value { color: #10b981; }
		.stat-card.failure .value { color: #ef4444; }
		.stat-card.info .value { color: #3b82f6; }
		.section {
			background: white;
			padding: 25px;
			border-radius: 8px;
			margin-bottom: 20px;
			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
		}
		.section h2 {
			color: #333;
			margin-bottom: 20px;
			padding-bottom: 10px;
			border-bottom: 2px solid #e5e7eb;
		}
		table {
			width: 100%;
			border-collapse: collapse;
			margin-top: 15px;
		}
		th {
			background: #f9fafb;
			padding: 12px;
			text-align: left;
			font-weight: 600;
			color: #374151;
			border-bottom: 2px solid #e5e7eb;
		}
		td {
			padding: 12px;
			border-bottom: 1px solid #e5e7eb;
		}
		tr:hover { background: #f9fafb; }
		.badge {
			display: inline-block;
			padding: 4px 12px;
			border-radius: 12px;
			font-size: 12px;
			font-weight: 600;
		}
		.badge.success { background: #d1fae5; color: #065f46; }
		.badge.failure { background: #fee2e2; color: #991b1b; }
		.consumer-section { margin-bottom: 30px; }
		.consumer-header {
			background: #f3f4f6;
			padding: 15px;
			border-radius: 6px;
			margin-bottom: 15px;
		}
		.consumer-header h3 { color: #1f2937; }
		.consumer-stats {
			display: flex;
			gap: 20px;
			margin-top: 10px;
			font-size: 14px;
			color: #6b7280;
		}
		.category-row {
			background: #fafafa;
			font-weight: 600;
		}
		.footer {
			text-align: center;
			color: #6b7280;
			margin-top: 30px;
			padding: 20px;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<h1>🧪 QVAC Batch Test Report</h1>
			<p>Generated: ${new Date().toLocaleString()}</p>
		</div>

		<div class="stats">
			<div class="stat-card info">
				<h3>Total Tests</h3>
				<div class="value">${completedTests.length}</div>
			</div>
			<div class="stat-card success">
				<h3>Passed</h3>
				<div class="value">${successCount}</div>
			</div>
			<div class="stat-card failure">
				<h3>Failed</h3>
				<div class="value">${failureCount}</div>
			</div>
			<div class="stat-card info">
				<h3>Success Rate</h3>
				<div class="value">${successRate}%</div>
			</div>
			<div class="stat-card info">
				<h3>Duration</h3>
				<div class="value">${elapsed.toFixed(0)}s</div>
			</div>
			<div class="stat-card info">
				<h3>Consumers</h3>
				<div class="value">${consumers.size}</div>
			</div>
		</div>

		<div class="section">
			<h2>📊 Results by Category</h2>
			<table>
				<thead>
					<tr>
						<th>Category</th>
						<th>Total</th>
						<th>Passed</th>
						<th>Failed</th>
						<th>Rate</th>
					</tr>
				</thead>
				<tbody>
					${Array.from(testsByCategory.entries()).map(([category, tests]) => {
						const passed = tests.filter(t => t.outcome === "success").length;
						const failed = tests.filter(t => t.outcome === "failure").length;
						const rate = ((passed / tests.length) * 100).toFixed(0);
						return `
						<tr>
							<td><strong>${category}</strong></td>
							<td>${tests.length}</td>
							<td>${passed}</td>
							<td>${failed}</td>
							<td>${rate}%</td>
						</tr>`;
					}).join('')}
				</tbody>
			</table>
		</div>

		<div class="section">
			<h2>👥 Results by Consumer</h2>
			${Array.from(testsByConsumer.entries()).map(([consumerId, tests]) => {
				const consumer = consumers.get(consumerId);
				const passed = tests.filter(t => t.outcome === "success").length;
				const failed = tests.filter(t => t.outcome === "failure").length;
				const avgDuration = tests.reduce((sum, t) => sum + t.duration, 0) / tests.length;
				
				return `
				<div class="consumer-section">
					<div class="consumer-header">
						<h3>${consumerId}</h3>
						<div class="consumer-stats">
							<span>Platform: ${consumer?.platform || "unknown"}</span>
							<span>Tests: ${tests.length}</span>
							<span>Passed: ${passed}</span>
							<span>Failed: ${failed}</span>
							<span>Avg Duration: ${(avgDuration / 1000).toFixed(1)}s</span>
						</div>
					</div>
					<table>
						<thead>
							<tr>
								<th>Test</th>
								<th>Status</th>
								<th>Duration</th>
							</tr>
						</thead>
						<tbody>
							${tests.map(test => `
							<tr>
								<td>${test.testId}</td>
								<td><span class="badge ${test.outcome}">${test.outcome.toUpperCase()}</span></td>
								<td>${(test.duration / 1000).toFixed(2)}s</td>
							</tr>
							`).join('')}
						</tbody>
					</table>
				</div>
				`;
			}).join('')}
		</div>

		<div class="section">
			<h2>📋 All Test Results</h2>
			<table>
				<thead>
					<tr>
						<th>Test</th>
						<th>Consumer</th>
						<th>Status</th>
						<th>Duration</th>
					</tr>
				</thead>
				<tbody>
					${completedTests.map(test => `
					<tr>
						<td>${test.testId}</td>
						<td>${test.consumerId.split('-').slice(-1)[0]}</td>
						<td><span class="badge ${test.outcome}">${test.outcome.toUpperCase()}</span></td>
						<td>${(test.duration / 1000).toFixed(2)}s</td>
					</tr>
					`).join('')}
				</tbody>
			</table>
		</div>

		<div class="footer">
			<p>Generated by QVAC Batch Test Monitor</p>
			<p>Total execution time: ${elapsed.toFixed(1)} seconds</p>
		</div>
	</div>
</body>
</html>`;

	try {
		require('fs').writeFileSync(filename, html);
		console.log(`\n✅ HTML report generated: ${filename}\n`);
	} catch (error) {
		console.error(`\n❌ Failed to generate HTML report:`, error);
	}
}

// Handle shutdown (interruption - no report)
process.on("SIGINT", () => {
	console.log("\n\n⚠️  Monitor interrupted - no report generated");
	console.log("👋 Monitor shutting down...\n");
	client.end();
	process.exit(0);
});

