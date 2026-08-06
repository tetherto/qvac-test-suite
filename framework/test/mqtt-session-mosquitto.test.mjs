import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import test from 'node:test'

import mqtt from 'mqtt'
import {
  buildMqttSessionEndOptions,
  buildMqttSessionOptions,
  MQTT_SESSION_EXPIRY_SECONDS
} from '../dist/index.js'

const hasMosquitto = !spawnSync('mosquitto', ['-h'], { stdio: 'ignore' }).error
const OPERATION_TIMEOUT_MS = 2000

function withTimeout(promise, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), OPERATION_TIMEOUT_MS)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

async function reservePort() {
  const server = net.createServer()
  await listen(server)
  const address = server.address()
  assert.notEqual(address, null)
  assert.equal(typeof address, 'object')
  await closeServer(server)
  return address.port
}

function waitForBroker(port) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5000

    function attempt() {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', (error) => {
        socket.destroy()
        if (Date.now() >= deadline) {
          reject(error)
          return
        }
        setTimeout(attempt, 50)
      })
    }

    attempt()
  })
}

function waitForConnect(client) {
  return withTimeout(
    new Promise((resolve, reject) => {
      client.once('connect', resolve)
      client.once('error', reject)
    }),
    'Timed out waiting for MQTT client connection'
  )
}

function endClient(client, force, options = {}) {
  return withTimeout(
    new Promise((resolve) => client.end(force, options, resolve)),
    'Timed out ending MQTT client'
  )
}

async function forceEndClient(client) {
  if (client && !client.disconnected) {
    try {
      await endClient(client, true)
    } catch {
      client.stream?.destroy()
    }
  }
}

async function stopBroker(broker) {
  if (broker.exitCode !== null) {
    return
  }
  const exited = new Promise((resolve) => broker.once('exit', resolve))
  broker.kill('SIGTERM')
  try {
    await withTimeout(exited, 'Timed out stopping Mosquitto')
  } catch {
    broker.kill('SIGKILL')
    await withTimeout(exited, 'Timed out killing Mosquitto').catch(() => {})
  }
}

test(
  'MQTT 5 session expiry preserves queued QoS 1 messages and clears graceful sessions',
  { skip: !hasMosquitto, timeout: 10000 },
  async () => {
    const port = await reservePort()
    const broker = spawn('mosquitto', ['-p', String(port)])
    const brokerUrl = `mqtt://127.0.0.1:${port}`
    const topic = `qvac/session-test/${Date.now()}`
    const sessionOptions = {
      ...buildMqttSessionOptions('bounded-session-client', MQTT_SESSION_EXPIRY_SECONDS),
      reconnectPeriod: 0,
      connectTimeout: 1000
    }
    let subscriber
    let publisher
    let resumed
    let cleared

    try {
      await waitForBroker(port)

      subscriber = mqtt.connect(brokerUrl, sessionOptions)
      await waitForConnect(subscriber)
      await withTimeout(
        subscriber.subscribeAsync(topic, { qos: 1 }),
        'Timed out waiting for MQTT subscription acknowledgment'
      )
      await endClient(subscriber, true)

      publisher = mqtt.connect(brokerUrl, {
        clientId: `bounded-session-publisher-${Date.now()}`,
        protocolVersion: 5,
        clean: true,
        reconnectPeriod: 0,
        connectTimeout: 1000
      })
      await waitForConnect(publisher)
      await withTimeout(
        publisher.publishAsync(topic, 'queued-message', { qos: 1 }),
        'Timed out waiting for MQTT publish acknowledgment'
      )
      await endClient(publisher, false)

      resumed = mqtt.connect(brokerUrl, sessionOptions)
      const message = new Promise((resolve) => {
        resumed.once('message', (_topic, payload) => resolve(payload.toString()))
      })
      const resumedConnack = await waitForConnect(resumed)
      assert.equal(resumedConnack.sessionPresent, true)
      assert.equal(
        await withTimeout(message, 'Timed out waiting for queued QoS 1 message'),
        'queued-message'
      )
      await endClient(resumed, false, buildMqttSessionEndOptions(5))

      cleared = mqtt.connect(brokerUrl, sessionOptions)
      const clearedConnack = await waitForConnect(cleared)
      assert.equal(clearedConnack.sessionPresent, false)
      await endClient(cleared, false, buildMqttSessionEndOptions(5))
    } finally {
      await forceEndClient(subscriber)
      await forceEndClient(publisher)
      await forceEndClient(resumed)
      await forceEndClient(cleared)
      await stopBroker(broker)
    }
  }
)
