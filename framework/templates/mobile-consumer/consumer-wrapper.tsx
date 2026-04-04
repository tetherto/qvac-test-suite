import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Enable mqtt.js debug logging if configured
if (process.env.EXPO_PUBLIC_MQTT_DEBUG === 'true') {
  // @ts-ignore - debug is internal to mqtt
  if (typeof global !== 'undefined') {
    // @ts-ignore
    global.localStorage = global.localStorage || {
      debug: 'mqttjs*',
      getItem: (key: string) => key === 'debug' ? 'mqttjs*' : null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
}

import mqtt from 'mqtt';
import { ConsumerBase } from '@tetherto/qvac-test-suite/mobile';
import type { MqttClient } from 'mqtt';
import { executor } from './executor';
import { config as consumerConfig } from './consumer-config';

// Optional bootstrap hook — may or may not be exported by the user's executor module
let bootstrap: (() => Promise<void>) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const executorModule = require('./executor');
  if (typeof executorModule.bootstrap === 'function') {
    bootstrap = executorModule.bootstrap;
  }
} catch {
  // bootstrap not available
}

interface ConsumerWrapperProps {
  log: (message: string) => void;
  updateStats: (stats: {
    testsCompleted?: number;
    testsPassed?: number;
    testsFailed?: number;
    totalTests?: number;
    currentTest?: string;
    isComplete?: boolean;
  }) => void;
}

export function ConsumerWrapper({ log, updateStats }: ConsumerWrapperProps) {
  const consumerRef = useRef<ConsumerBase | null>(null);

  useEffect(() => {
    let client: MqttClient | null = null;
    let isInitialized = false;
    let isShuttingDown = false;

    (async () => {
      if (isInitialized) return;
      isInitialized = true;

      try {
        // MQTT.js debug logging can be enabled by uncommenting:
        // const debug = require('debug');
        // debug.log = console.log.bind(console);
        // debug.enable('mqtt*,mqttjs*,mqtt-packet*');

        // Read config (baked at build time)
        const { mqtt: mqttConfig, runId } = consumerConfig;

        log('🔧 Initializing consumer...');
        log(`📱 Device: ${Constants.deviceName || 'Unknown'} | Run ID: ${runId}`);
        log(`📡 Connecting to ${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}${mqttConfig.path}`);

        // Build broker URL with path for WebSocket
        const brokerUrl = `${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}${mqttConfig.path}`;

        // Build connection options
        const connectOptions: any = {
          connectTimeout: 10000,
          reconnectPeriod: 5000,
          keepalive: 60,
          clean: true,
        };

        // Add authentication if provided
        if (mqttConfig.username) {
          connectOptions.username = mqttConfig.username;
        }
        if (mqttConfig.password) {
          connectOptions.password = mqttConfig.password;
        }

        // Handle TLS/SSL options for wss
        if (mqttConfig.protocol === 'wss') {
          connectOptions.rejectUnauthorized = mqttConfig.rejectUnauthorized;
          
          // Add CA certificate if provided
          if (mqttConfig.ca) {
            connectOptions.ca = mqttConfig.ca;
          }
        }

        client = mqtt.connect(brokerUrl, connectOptions);

        // Set up error handlers BEFORE anything else to catch early failures
        client.on('error', (err: Error) => {
          // Ignore errors during shutdown - they're expected
          if (isShuttingDown) return;
          log(`❌ MQTT error: ${err.message}`);
        });

        // Attach stream error handler
        if (client.stream) {
          client.stream.on('error', (err: Error) => {
            // Ignore errors during shutdown - they're expected
            if (isShuttingDown) return;
            log(`❌ WebSocket error: ${err.message}`);
          });
        }

        // Generate consumer ID
        const consumerId = `consumer-mobile-${Constants.deviceName || Constants.sessionId || 'unknown'}-${runId === '*' ? Date.now() : runId}`;

        if (executor.initProfiling) {
          executor.initProfiling();
          log('📈 Profiling enabled');
        }

        // Create consumer using framework's ConsumerBase
        const consumer = new ConsumerBase(
          client,
          consumerId,
          `mobile-${Platform.OS}`,
          runId,
          executor,
          {
            log: (message: string) => {
              // Detect shutdown to suppress subsequent errors
              if (message.includes('Consumer shutting down')) {
                isShuttingDown = true;
              }
              log(message);
            },
            onBootstrap: bootstrap,
            updateStats: (update: Record<string, unknown>) => {
              updateStats(update as Parameters<typeof updateStats>[0]);
            },
          }
        );

        consumerRef.current = consumer;
        consumer.setupMqttHandlers();

        client.on('offline', () => {
          if (!isShuttingDown) log('📴 Client offline');
        });

        client.on('reconnect', () => {
          if (!isShuttingDown) log('🔄 Reconnecting...');
        });

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`❌ Fatal error: ${errorMessage}`);
        console.error(error);
      }
    })();

    return () => {
      isShuttingDown = true;
      if (consumerRef.current) {
        consumerRef.current.forceShutdown();
      }
      if (client) {
        client.end();
      }
    };
  }, []);

  return null; // This is a headless component
}

