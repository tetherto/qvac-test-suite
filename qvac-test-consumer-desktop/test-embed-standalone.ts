/**
 * Standalone embedding test to isolate SDK bug
 * Run: bun run test-embed-standalone.ts
 */

import {
	loadModel,
	embed as runEmbed,
	GTE_LARGE_FP16,
} from "@tetherto/qvac-sdk";

console.log("🧪 Standalone Embedding Test\n");

async function testEmbedding() {
	try {
		// Step 1: Load embedding model
		console.log("1️⃣  Loading embedding model...");
		const startLoad = Date.now();
		const modelId = await loadModel({
			modelSrc: GTE_LARGE_FP16,
			modelType: "embeddings",
		});
		const loadDuration = Date.now() - startLoad;
		console.log(`✅ Model loaded in ${loadDuration}ms`);
		console.log(`   Model ID: ${modelId.substring(0, 16)}...`);

		// Step 2: Test simple text (this should hang based on test results)
		console.log("\n2️⃣  Testing simple text: 'Hello'...");
		console.log("   ⏳ Waiting max 10 seconds...");
		const startSimple = Date.now();
		
		const simplePromise = runEmbed({ modelId, text: "Hello" });
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error("Timeout after 10s")), 10000)
		);

		try {
			const simpleResult = await Promise.race([simplePromise, timeoutPromise]);
			const simpleDuration = Date.now() - startSimple;
			console.log(`✅ Simple text completed in ${simpleDuration}ms`);
			console.log(`   Vector length: ${simpleResult?.length || 0}`);
			console.log(`   First 5 values: ${simpleResult?.slice(0, 5)}`);
		} catch (timeoutError: any) {
			const simpleDuration = Date.now() - startSimple;
			console.log(`❌ Simple text TIMEOUT after ${simpleDuration}ms`);
			console.log(`   Error: ${timeoutError.message}`);
			console.log(`\n🐛 BUG CONFIRMED: SDK hangs on non-empty text embedding`);
		}

		// Step 3: Test very short text
		console.log("\n3️⃣  Testing very short text: 'Hi'...");
		console.log("   ⏳ Waiting max 10 seconds...");
		const startVeryShort = Date.now();
		
		try {
			const veryShortResult = await Promise.race([
				runEmbed({ modelId, text: "Hi" }),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("Timeout after 10s")), 10000)
				),
			]);
			const veryShortDuration = Date.now() - startVeryShort;
			console.log(`✅ Very short text completed in ${veryShortDuration}ms`);
			console.log(`   Vector length: ${veryShortResult?.length || 0}`);
		} catch (timeoutError: any) {
			const veryShortDuration = Date.now() - startVeryShort;
			console.log(`❌ Very short text TIMEOUT after ${veryShortDuration}ms`);
			console.log(`   Error: ${timeoutError.message}`);
		}

		console.log("\n✅ Test complete");
	} catch (error: any) {
		console.error(`\n❌ Test failed: ${error.message}`);
		console.error(error.stack);
	}
}

// Run the test
testEmbedding()
	.then(() => {
		console.log("\n👋 Exiting...");
		process.exit(0);
	})
	.catch((error) => {
		console.error("Fatal error:", error);
		process.exit(1);
	});

