#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';
import { ConsumerBase } from '../core/consumer-base.js';
import { createMqttClient, buildMqttConnectionConfig } from '../utils/mqtt-connection.js';
import { loadConfig } from '../utils/config-loader.js';

loadDotenv();

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const arg = args.find((a) => a.startsWith('--' + name + '='));
  return arg ? arg.split('=')[1] : null;
};

const runId = getArg('runId');
const mqttBrokerOverride = getArg('mqtt-broker');
const configPath = getArg('config') || process.cwd();
const executorPath = getArg('executor');

if (!runId) {
  console.error('❌ --runId is required');
  process.exit(1);
}

if (!executorPath) {
  console.error('❌ --executor is required (path to bundled executor.js)');
  process.exit(1);
}

(async () => {
  try {
    const config = await loadConfig(configPath);
    const mqttConfig = buildMqttConnectionConfig(config);

    if (mqttBrokerOverride) {
      mqttConfig.brokerUrl = mqttBrokerOverride;
    }

    const executorUrl = pathToFileURL(executorPath).href;
    const executorModule = await import(executorUrl);
    const executor = executorModule.executor || executorModule.default;

    if (!executor || !executor.executeTest) {
      throw new Error(`Executor must export 'executor' with executeTest method`);
    }

    const client = createMqttClient(mqttConfig);
    const consumerId = `consumer-desktop-${os.hostname()}-${Date.now()}`;

    const consumer = new ConsumerBase(client, consumerId, 'desktop', runId, executor, {
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
})();
