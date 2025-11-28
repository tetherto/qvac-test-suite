import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import mqtt from 'mqtt';
import { ConsumerBase } from '../../core/consumer-base.js';
import { loadConfig } from '../../utils/config-loader.js';

interface ConsumerOptions {
  runId: string;
  mqttBroker: string;
  config: string;
}

export async function runConsumerDesktop(options: ConsumerOptions) {
  try {
    console.log('🚀 Starting QVAC Test Consumer (Desktop)\n');

    // Load configuration
    console.log(`📂 Loading config from: ${options.config}`);
    const config = await loadConfig(options.config);

    if (!config.consumers.desktop) {
      throw new Error('No desktop consumer configuration found');
    }

    // Use broker from CLI arg or config
    const brokerUrl = options.mqttBroker || config.brokerUrl;

    // Load executor from entry point
    console.log(`📦 Loading executor from: ${config.consumers.desktop.entry}`);
    const executorPath = path.resolve(options.config, config.consumers.desktop.entry);
    const executorUrl = pathToFileURL(executorPath).href;
    const executorModule = await import(executorUrl);
    const executor = executorModule.executor || executorModule.default;

    if (!executor || !executor.executeTest) {
      throw new Error(`Executor must export 'executor' with executeTest method`);
    }

    console.log(`✅ Executor loaded\n`);

    // Create consumer ID
    const consumerId = `consumer-desktop-${os.hostname()}-${Date.now()}`;

    // Connect to MQTT
    const client = mqtt.connect(brokerUrl);

    // Create consumer
    const consumer = new ConsumerBase(client, consumerId, 'desktop', options.runId, executor, {
      log: (msg) => console.log(msg),
      updateStats: () => {}, // Could add stats display
      onShutdown: () => process.exit(0),
    });

    // Setup MQTT handlers
    consumer.setupMqttHandlers();

    // Handle shutdown signals
    process.on('SIGINT', () => consumer.forceShutdown());
    process.on('SIGTERM', () => consumer.forceShutdown());
  } catch (error: any) {
    console.error('❌ Failed to start consumer:', error.message);
    process.exit(1);
  }
}
