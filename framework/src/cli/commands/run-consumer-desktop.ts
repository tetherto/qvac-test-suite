import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ConsumerBase } from '../../core/consumer-base.js';
import { loadConfig } from '../../utils/config-loader.js';
import { buildMqttConnectionConfig, createMqttClient } from '../../utils/mqtt-connection.js';

interface ConsumerOptions {
  runId: string;
  mqttBroker?: string;
  config: string;
}

export async function runConsumerDesktop(options: ConsumerOptions) {
  try {
    console.log('🚀 Starting QVAC Test Consumer (Desktop)\n');

    console.log(`📂 Loading config from: ${options.config}`);
    const config = await loadConfig(options.config);

    if (!config.consumers.desktop) {
      throw new Error('No desktop consumer configuration found');
    }

    const mqttConfig = buildMqttConnectionConfig(config);

    if (options.mqttBroker) {
      mqttConfig.brokerUrl = options.mqttBroker;
    }

    console.log(`📦 Loading executor from: ${config.consumers.desktop.entry}`);
    const executorPath = path.resolve(options.config, config.consumers.desktop.entry);
    const executorUrl = pathToFileURL(executorPath).href;
    const executorModule = await import(executorUrl);
    const executor = executorModule.executor || executorModule.default;

    if (!executor || !executor.executeTest) {
      throw new Error(`Executor must export 'executor' with executeTest method`);
    }

    console.log(`✅ Executor loaded\n`);

    const consumerId = `consumer-desktop-${os.hostname()}-${Date.now()}`;
    const client = createMqttClient(mqttConfig);

    const consumer = new ConsumerBase(client, consumerId, 'desktop', options.runId, executor, {
      log: (msg) => console.log(msg),
      updateStats: () => {},
      onShutdown: () => process.exit(0),
    });

    consumer.setupMqttHandlers();

    process.on('SIGINT', () => consumer.forceShutdown());
    process.on('SIGTERM', () => consumer.forceShutdown());
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Failed to start consumer:', errorMessage);
    process.exit(1);
  }
}
