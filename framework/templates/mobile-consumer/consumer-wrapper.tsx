import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import Constants from 'expo-constants'

// Enable mqtt.js debug logging if configured
if (process.env.EXPO_PUBLIC_MQTT_DEBUG === 'true') {
  // @ts-ignore - debug is internal to mqtt
  if (typeof global !== 'undefined') {
    // @ts-ignore
    global.localStorage = global.localStorage || {
      debug: 'mqttjs*',
      getItem: (key: string) => (key === 'debug' ? 'mqttjs*' : null),
      setItem: () => {},
      removeItem: () => {}
    }
  }
}

import mqtt from 'mqtt'
import { ConsumerBase } from '@tetherto/qvac-test-suite/mobile'
import type { IClientOptions, MqttClient } from 'mqtt'
import { executor } from './executor'
import { config as consumerConfig } from './consumer-config'

// react-native-performance-toolkit is loaded lazily so the consumer still
// works on builds that haven't installed the optional dependency.
let getMemoryUsage: (() => number) | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  getMemoryUsage = require('react-native-performance-toolkit').getMemoryUsage
} catch {
  // toolkit not installed; in-app memory publishing will be skipped.
}

// Optional bootstrap hook — may or may not be exported by the user's executor module
let bootstrap: (() => Promise<void>) | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const executorModule = require('./executor')
  if (typeof executorModule.bootstrap === 'function') {
    bootstrap = executorModule.bootstrap
  }
} catch {
  // bootstrap not available
}

// Optional test definitions — required for consumer-side test resolution
let testDefinitions: any[] | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const testDefsModule = require('./test-definitions')
  testDefinitions = testDefsModule.tests || testDefsModule.default
} catch {
  // test definitions not bundled — consumer will fail on test assignment
}

interface ConsumerWrapperProps {
  log: (message: string) => void
  updateStats: (stats: {
    testsCompleted?: number
    testsPassed?: number
    testsFailed?: number
    totalTests?: number
    currentTest?: string
    isComplete?: boolean
  }) => void
}

export function ConsumerWrapper({ log, updateStats }: ConsumerWrapperProps) {
  const consumerRef = useRef<ConsumerBase | null>(null)

  useEffect(() => {
    let client: MqttClient | null = null
    let isInitialized = false
    let isShuttingDown = false
    let memMeasureHandle: ReturnType<typeof setInterval> | undefined
    let memReportHandle: ReturnType<typeof setInterval> | undefined

    // lunte-disable-next-line require-await
    ;(async () => {
      if (isInitialized) return
      isInitialized = true

      try {
        // MQTT.js debug logging can be enabled by uncommenting:
        // const debug = require('debug');
        // debug.log = console.log.bind(console);
        // debug.enable('mqtt*,mqttjs*,mqtt-packet*');

        // Read config (baked at build time)
        const { mqtt: mqttConfig, runId } = consumerConfig

        log('🔧 Initializing consumer...')
        log(`📱 Device: ${Constants.deviceName || 'Unknown'} | Run ID: ${runId}`)
        log(
          `📡 Connecting to ${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}${mqttConfig.path}`
        )

        // Build broker URL with path for WebSocket
        const brokerUrl = `${mqttConfig.protocol}://${mqttConfig.host}:${mqttConfig.port}${mqttConfig.path}`

        // Generate consumer ID early so we can use it as MQTT clientId
        const consumerId = `consumer-mobile-${Constants.deviceName || Constants.sessionId || 'unknown'}-${runId === '*' ? Date.now() : runId}`

        // Build connection options
        const connectOptions: IClientOptions = {
          clientId: consumerId,
          connectTimeout: 15000,
          reconnectPeriod: 3000,
          keepalive: 30,
          clean: false
        }

        // Add authentication if provided
        if (mqttConfig.username) {
          connectOptions.username = mqttConfig.username
        }
        if (mqttConfig.password) {
          connectOptions.password = mqttConfig.password
        }

        // Handle TLS/SSL options for wss
        if (mqttConfig.protocol === 'wss') {
          connectOptions.rejectUnauthorized = mqttConfig.rejectUnauthorized

          // Add CA certificate if provided
          if (mqttConfig.ca) {
            connectOptions.ca = mqttConfig.ca
          }
        }

        client = mqtt.connect(brokerUrl, connectOptions)

        // Set up error handlers BEFORE anything else to catch early failures
        client.on('error', (err: Error) => {
          // Ignore errors during shutdown - they're expected
          if (isShuttingDown) return
          log(`❌ MQTT error: ${err.message}`)
        })

        // Attach stream error handler
        if (client.stream) {
          client.stream.on('error', (err: Error) => {
            // Ignore errors during shutdown - they're expected
            if (isShuttingDown) return
            log(`❌ WebSocket error: ${err.message}`)
          })
        }

        if (executor.initProfiling) {
          executor.initProfiling()
          log('📈 Profiling enabled')
        }

        if (!testDefinitions) {
          log('⚠️  No test definitions bundled — consumer will fail on test assignment')
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
                isShuttingDown = true
              }
              log(message)
            },
            onBootstrap: bootstrap,
            updateStats: (update: Record<string, unknown>) => {
              updateStats(update as Parameters<typeof updateStats>[0])
            }
          },
          testDefinitions
        )

        consumerRef.current = consumer
        consumer.setupMqttHandlers()

        client.on('offline', () => {
          if (!isShuttingDown) log('📴 Client offline')
        })

        client.on('reconnect', () => {
          if (!isShuttingDown) log('🔄 Reconnecting...')
        })

        // In-app memory poller.
        //
        // Reads task_vm_info (iOS) / smaps_rollup (Android) directly from the
        // app process and publishes over MQTT to the producer's qvac/app-memory
        // topic. This is the only source of memory data on mobile -- samples
        // hit the producer immediately, so a hard crash on the device only
        // loses the un-published delta since the last report tick.
        //
        // Caveat: the poller pauses while the JS thread is blocked, so a long
        // synchronous workload won't be sampled until it yields.
        //
        // Two rates:
        //   - measure: how often we read the in-process memory counter
        //   - report:  how often we publish to MQTT (publishes the max over
        //              the report window)
        // Decoupling lets us catch sub-report-interval spikes without flooding
        // MQTT. Defaults: measure 50 ms (20 Hz), report 200 ms (5 Hz).
        // EXPO_PUBLIC_QVAC_APP_MEM_INTERVAL_MS overrides the report rate;
        // EXPO_PUBLIC_QVAC_APP_MEM_MEASURE_MS overrides the measure rate.
        // Setting either to 0 disables that side; report=0 disables in-app
        // entirely.
        const reportIntervalMs = parseInt(
          process.env.EXPO_PUBLIC_QVAC_APP_MEM_INTERVAL_MS || '200',
          10
        )
        const measureIntervalMs = parseInt(
          process.env.EXPO_PUBLIC_QVAC_APP_MEM_MEASURE_MS || '50',
          10
        )
        if (typeof getMemoryUsage === 'function' && reportIntervalMs > 0 && measureIntervalMs > 0) {
          const platformName: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android'
          const metric = platformName === 'ios' ? 'task_vm_info.physFootprint' : 'smaps_rollup.pss'

          // Window state. Resets on each report tick.
          let windowMaxMb = 0
          let windowMaxTs = 0

          const stopMemoryPoller = () => {
            if (memMeasureHandle) {
              clearInterval(memMeasureHandle)
              memMeasureHandle = undefined
            }
            if (memReportHandle) {
              clearInterval(memReportHandle)
              memReportHandle = undefined
            }
          }

          const measure = () => {
            // Stop the moment shutdown starts so we don't keep recording
            // a window that will never get published.
            if (isShuttingDown) {
              stopMemoryPoller()
              return
            }
            try {
              const mb = getMemoryUsage!()
              if (typeof mb !== 'number' || !isFinite(mb) || mb <= 0) return
              if (mb > windowMaxMb) {
                windowMaxMb = mb
                windowMaxTs = Date.now()
              }
            } catch (err) {
              if (process.env.EXPO_PUBLIC_QVAC_APP_MEM_DEBUG === 'true') {
                log(`mem measure err: ${(err as Error).message}`)
              }
            }
          }

          const report = () => {
            // Once shutdown has started the MQTT client may already be
            // closed — publishing would either silently fail or log a
            // stream error. Stop the timer entirely.
            if (isShuttingDown) {
              stopMemoryPoller()
              return
            }
            if (windowMaxMb <= 0) return // no measurements taken (JS thread was blocked)
            const memoryKb = Math.round(windowMaxMb * 1024)
            const ts = windowMaxTs
            // Reset window before publish so that the next interval starts fresh.
            windowMaxMb = 0
            windowMaxTs = 0
            try {
              client?.publish(
                'qvac/app-memory',
                JSON.stringify({
                  runId,
                  consumerId,
                  ts,
                  memoryKb,
                  metric,
                  platform: platformName
                }),
                { qos: 0 }
              )
            } catch (err) {
              if (process.env.EXPO_PUBLIC_QVAC_APP_MEM_DEBUG === 'true') {
                log(`mem publish err: ${(err as Error).message}`)
              }
            }
          }

          memMeasureHandle = setInterval(measure, measureIntervalMs)
          memReportHandle = setInterval(report, reportIntervalMs)

          // Stop the poller only on real teardown (client.end()), not on
          // transient `close` events that fire during normal MQTT reconnect
          // cycles -- otherwise the first transient disconnect would
          // permanently clear both intervals and memory metrics would go
          // silent for the rest of the run. The measure/report callbacks
          // already self-guard via isShuttingDown for the in-flight
          // shutdown race.
          client.on('end', stopMemoryPoller)
          log(
            `📈 In-app memory poller started (measure ${measureIntervalMs}ms, report ${reportIntervalMs}ms, window-max)`
          )
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        log(`❌ Fatal error: ${errorMessage}`)
        console.error(error)
      }
    })()

    return () => {
      isShuttingDown = true
      if (memMeasureHandle) {
        clearInterval(memMeasureHandle)
        memMeasureHandle = undefined
      }
      if (memReportHandle) {
        clearInterval(memReportHandle)
        memReportHandle = undefined
      }
      if (consumerRef.current) {
        consumerRef.current.forceShutdown()
      }
      if (client) {
        client.end()
      }
    }
  }, [])

  return null // This is a headless component
}
