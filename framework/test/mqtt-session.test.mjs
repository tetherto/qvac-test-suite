import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import net from 'node:net'
import test from 'node:test'

import aedes from 'aedes'
import mqtt from 'mqtt'
import * as framework from '../dist/index.js'

const SESSION_EXPIRY_SECONDS = 2 * 60 * 60

test('preserves MQTT 3.1.1 persistent sessions unless expiry is configured', () => {
  assert.equal(typeof framework.buildMqttSessionOptions, 'function')

  const options = framework.buildMqttSessionOptions('ci-client')

  assert.deepEqual(options, {
    clientId: 'ci-client',
    clean: false
  })
})

test('builds a bounded MQTT 5 persistent session when expiry is configured', () => {
  const options = framework.buildMqttSessionOptions('ci-client', SESSION_EXPIRY_SECONDS)

  assert.deepEqual(options, {
    clientId: 'ci-client',
    protocolVersion: 5,
    clean: false,
    properties: {
      sessionExpiryInterval: SESSION_EXPIRY_SECONDS
    }
  })
})

test('applies bounded MQTT 5 options to consumers that call buildMqttOptions directly', () => {
  const config = framework.buildMqttConnectionConfig({
    mqtt: {
      brokerUrl: 'mqtt://localhost:1883',
      sessionExpiryInterval: SESSION_EXPIRY_SECONDS
    }
  })

  assert.deepEqual(framework.buildMqttOptions(config), {
    keepalive: 30,
    reconnectPeriod: 3000,
    connectTimeout: 15000,
    protocolVersion: 5,
    clean: false,
    rejectUnauthorized: true,
    properties: {
      sessionExpiryInterval: SESSION_EXPIRY_SECONDS
    }
  })
})

test('rejects invalid or unbounded MQTT 5 session expiry values', () => {
  for (const value of [0, 0xffffffff, 0x100000000]) {
    assert.throws(
      () => framework.buildMqttSessionOptions('ci-client', value),
      /sessionExpiryInterval must be an integer between 1 and 4294967294/
    )
  }
})

test('exports the bounded session helpers to mobile consumers', async () => {
  const mobileRuntime = await readFile(new URL('../src/mobile-runtime.ts', import.meta.url), 'utf8')

  assert.match(
    mobileRuntime,
    /export \{ buildMqttSessionOptions, buildMqttSessionEndOptions \} from '.\/utils\/mqtt-session\.js'/
  )
})

test('clears persistent broker state after a graceful disconnect', () => {
  assert.equal(typeof framework.buildMqttSessionEndOptions, 'function')

  assert.deepEqual(framework.buildMqttSessionEndOptions(5), {
    properties: {
      sessionExpiryInterval: 0
    }
  })
})

test('does not send MQTT 5 disconnect properties to MQTT 3.1.1 brokers', () => {
  assert.deepEqual(framework.buildMqttSessionEndOptions(4), {})
})

test('mobile template uses the shared MQTT session lifecycle', async () => {
  const template = await readFile(
    new URL('../templates/mobile-consumer/consumer-wrapper.tsx', import.meta.url),
    'utf8'
  )

  assert.match(template, /buildMqttSessionOptions\(consumerId, mqttConfig\.sessionExpiryInterval\)/)
  assert.match(template, /buildMqttSessionEndOptions\(client\.options\.protocolVersion\)/)
  assert.doesNotMatch(template, /clean:\s*(?:true|false)/)
  assert.match(template, /catch \(error: unknown\)[\s\S]*client\?\.end\(true\)/)
})

test('resolves bounded session expiry from framework config', () => {
  const config = framework.buildMqttConnectionConfig({
    mqtt: {
      brokerUrl: 'mqtt://localhost:1883',
      sessionExpiryInterval: SESSION_EXPIRY_SECONDS
    }
  })

  assert.equal(config.sessionExpiryInterval, SESSION_EXPIRY_SECONDS)
})

test('default session options remain compatible with the embedded MQTT 3.1.1 broker', async () => {
  const broker = aedes()
  const server = net.createServer(broker.handle)

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  assert.notEqual(address, null)
  assert.equal(typeof address, 'object')

  const client = mqtt.connect(`mqtt://127.0.0.1:${address.port}`, {
    ...framework.buildMqttSessionOptions('embedded-broker-client'),
    connectTimeout: 1000,
    reconnectPeriod: 0
  })

  try {
    await new Promise((resolve, reject) => {
      client.once('connect', resolve)
      client.once('error', reject)
    })
    assert.equal(client.options.protocolVersion, 4)
  } finally {
    await new Promise((resolve) => client.end(true, resolve))
    await new Promise((resolve) => server.close(resolve))
    await new Promise((resolve) => broker.close(resolve))
  }
})
