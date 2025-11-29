import { BatchOrchestrator } from '../../core/batch-orchestrator.js';
import { loadConfig } from '../../utils/config-loader.js';
import { loadTests } from '../../utils/test-loader.js';

interface ProducerOptions {
  runId?: string;
  mqttBroker: string;
  config: string;
  filter?: string; // Filter tests by category or testId prefix (comma-separated)
}

export async function runProducer(options: ProducerOptions) {
  try {
    console.log('🚀 Starting QVAC Test Producer\n');

    // Generate runId if not provided
    const runId = options.runId || `run-${Date.now()}`;

    // Load configuration
    console.log(`📂 Loading config from: ${options.config}`);
    const config = await loadConfig(options.config);
    console.log(`✅ Config loaded\n`);

    // Use broker from CLI arg or config
    const brokerUrl = options.mqttBroker || config.brokerUrl;

    // Load tests
    console.log(`📋 Loading tests from: ${config.testDir}`);
    let tests = await loadTests(config, options.config);

    // Apply filter if specified
    if (options.filter) {
      const filters = options.filter.split(',').map((f) => f.trim());
      console.log(`🔍 Filtering tests by: ${filters.join(', ')}`);

      const originalCount = tests.length;
      tests = tests.filter((test) => {
        // Match by testId prefix OR by metadata.category
        return filters.some((filter) => test.testId.startsWith(filter) || test.metadata?.category === filter);
      });

      console.log(`📋 Filtered: ${tests.length} of ${originalCount} tests\n`);
    } else {
      console.log(`✅ Loaded ${tests.length} tests\n`);
    }

    // Initialize orchestrator
    const orchestrator = new BatchOrchestrator(brokerUrl, runId, false);

    // Build test queue from loaded tests
    orchestrator.buildTestQueue(tests);

    // Wait for MQTT connection before starting
    setTimeout(() => {
      orchestrator.start();
    }, 1000);

    // Handle shutdown signals
    process.on('SIGINT', () => orchestrator.shutdown());
    process.on('SIGTERM', () => orchestrator.shutdown());
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Failed to start producer:', errorMessage);
    process.exit(1);
  }
}
