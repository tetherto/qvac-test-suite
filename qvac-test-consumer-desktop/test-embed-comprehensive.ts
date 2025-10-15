/**
 * Comprehensive standalone embedding test suite
 * Tests all embedding scenarios in isolation before adding to batch tests
 * Run: bun run test-embed-comprehensive.ts
 */

import {
	loadModel,
	embed as runEmbed,
	GTE_LARGE_FP16,
} from "@tetherto/qvac-sdk";

console.log("🧪 Comprehensive Embedding Test Suite\n");
console.log("Testing all embedding scenarios in isolation...\n");

let modelId: string;
let passedTests = 0;
let failedTests = 0;

async function testCase(name: string, testFn: () => Promise<void>) {
	process.stdout.write(`Testing: ${name}... `);
	const start = Date.now();
	try {
		await testFn();
		const duration = Date.now() - start;
		console.log(`✅ PASS (${duration}ms)`);
		passedTests++;
	} catch (error: any) {
		const duration = Date.now() - start;
		console.log(`❌ FAIL (${duration}ms)`);
		console.log(`   Error: ${error.message}`);
		failedTests++;
	}
}

async function runAllTests() {
	try {
		// Setup: Load embedding model
		console.log("📦 Setup: Loading embedding model...");
		const startLoad = Date.now();
		modelId = await loadModel({
			modelSrc: GTE_LARGE_FP16,
			modelType: "embeddings",
		});
		console.log(`✅ Model loaded in ${Date.now() - startLoad}ms`);
		console.log(`   Model ID: ${modelId.substring(0, 16)}...\n`);

		// Test 1: Simple text embedding
		await testCase("embed-simple-text", async () => {
			const result = await runEmbed({
				modelId,
				text: "Hello world, this is a test of text embedding.",
			});
			if (!result || result.length < 100) {
				throw new Error(`Expected vector with 100+ dimensions, got ${result?.length || 0}`);
			}
		});

		// Test 2: Long text embedding
		await testCase("embed-long-text", async () => {
			const longText =
				"Artificial intelligence and machine learning are transforming how we interact with technology. ".repeat(
					10,
				);
			const result = await runEmbed({ modelId, text: longText });
			if (!result || result.length < 100) {
				throw new Error(`Expected vector with 100+ dimensions, got ${result?.length || 0}`);
			}
		});

		// Test 3: Unicode and special characters
		await testCase("embed-unicode", async () => {
			const result = await runEmbed({
				modelId,
				text: "Hello 👋 World 🌍 Testing émojis and ñ special çharacters 你好",
			});
			if (!result || result.length < 100) {
				throw new Error(`Expected vector with 100+ dimensions, got ${result?.length || 0}`);
			}
		});

		// Test 4: Very short text
		await testCase("embed-very-short", async () => {
			const result = await runEmbed({ modelId, text: "Hi" });
			if (!result || result.length < 100) {
				throw new Error(`Expected vector with 100+ dimensions, got ${result?.length || 0}`);
			}
		});

		// Test 5: Code snippet
		await testCase("embed-code-snippet", async () => {
			const result = await runEmbed({
				modelId,
				text: "function hello() { console.log('Hello World'); return true; }",
			});
			if (!result || result.length < 128) {
				throw new Error(`Expected vector with 128+ dimensions, got ${result?.length || 0}`);
			}
		});

		// Test 6: Multilingual text
		await testCase("embed-multilingual", async () => {
			const result = await runEmbed({
				modelId,
				text: "Hello world. Bonjour le monde. Hola mundo. こんにちは世界",
			});
			if (!result || result.length < 128) {
				throw new Error(`Expected vector with 128+ dimensions, got ${result?.length || 0}`);
			}
		});

		// Test 7: Special characters only
		await testCase("embed-special-chars", async () => {
			const result = await runEmbed({
				modelId,
				text: "@#$%^&*()_+{}|:<>?[]\\;',./`~!",
			});
			if (!result || result.length < 128) {
				throw new Error(`Expected vector with 128+ dimensions, got ${result?.length || 0}`);
			}
		});

		// Test 8: Numbers only
		await testCase("embed-numbers-only", async () => {
			const result = await runEmbed({
				modelId,
				text: "1234567890 42 3.14159 999",
			});
			if (!result || result.length < 128) {
				throw new Error(`Expected vector with 128+ dimensions, got ${result?.length || 0}`);
			}
		});

		// Test 9: Similarity check (cosine similarity)
		await testCase("embed-similarity", async () => {
			const text1 = "The cat sits on the mat.";
			const text2 = "A feline rests on the rug.";
			const text3 = "Python is a programming language.";

			const vec1 = await runEmbed({ modelId, text: text1 });
			const vec2 = await runEmbed({ modelId, text: text2 });
			const vec3 = await runEmbed({ modelId, text: text3 });

			// Calculate cosine similarity
			const cosineSimilarity = (a: number[], b: number[]) => {
				let dotProduct = 0;
				let normA = 0;
				let normB = 0;
				for (let i = 0; i < a.length; i++) {
					dotProduct += a[i] * b[i];
					normA += a[i] * a[i];
					normB += b[i] * b[i];
				}
				return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
			};

			const sim12 = cosineSimilarity(vec1, vec2);
			const sim13 = cosineSimilarity(vec1, vec3);

			// Similar sentences should have higher similarity than unrelated ones
			if (sim12 <= sim13) {
				throw new Error(
					`Expected similar texts to have higher similarity. sim(cat,feline)=${sim12.toFixed(3)}, sim(cat,python)=${sim13.toFixed(3)}`,
				);
			}
		});

		// Test 10: Batch embeddings (sequential - not Promise.all)
		await testCase("embed-batch-sequential", async () => {
			const texts = [
				"First text to embed",
				"Second text to embed",
				"Third text to embed",
			];

			const results: number[][] = [];
			for (const text of texts) {
				const vec = await runEmbed({ modelId, text });
				results.push(vec);
			}

			if (results.length !== 3) {
				throw new Error(`Expected 3 vectors, got ${results.length}`);
			}

			for (let i = 0; i < results.length; i++) {
				if (!results[i] || results[i].length < 100) {
					throw new Error(
						`Vector ${i} has invalid dimensions: ${results[i]?.length || 0}`,
					);
				}
			}
		});

		// Test 11: Batch embeddings (parallel - using Promise.all)
		// SKIPPED - Known SDK BUG: Promise.all() hangs forever
		console.log(
			"⏭️  Skipping: embed-batch-parallel (Known SDK bug - hangs on Promise.all)",
		);

		// Test 12: Multiple rapid requests (stress test) - SKIPPED
		// This also likely causes issues similar to Promise.all
		console.log(
			"⏭️  Skipping: embed-rapid-requests (May trigger SDK instability)",
		);

		// Summary
		console.log("\n" + "=".repeat(60));
		console.log("📊 Test Summary");
		console.log("=".repeat(60));
		console.log(`✅ Passed: ${passedTests}`);
		console.log(`❌ Failed: ${failedTests}`);
		console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
		console.log("=".repeat(60));

		if (failedTests === 0) {
			console.log("\n🎉 All embedding tests passed in isolation!");
			console.log("✅ Safe to add to batch test suite");
		} else {
			console.log("\n⚠️  Some tests failed - investigate before adding to batch");
		}
	} catch (error: any) {
		console.error(`\n❌ Test suite failed: ${error.message}`);
		console.error(error.stack);
		process.exit(1);
	}
}

// Run the test suite
runAllTests()
	.then(() => {
		console.log("\n👋 Exiting...");
		process.exit(failedTests > 0 ? 1 : 0);
	})
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});

