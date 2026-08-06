import type { IClientOptions, IDisconnectPacket } from 'mqtt'

export const MQTT_SESSION_EXPIRY_SECONDS = 2 * 60 * 60
const MQTT_SESSION_EXPIRY_MAX_SECONDS = 0xfffffffe

function assertSessionExpiryInterval(sessionExpiryInterval: number) {
  if (
    !Number.isInteger(sessionExpiryInterval) ||
    sessionExpiryInterval < 1 ||
    sessionExpiryInterval > MQTT_SESSION_EXPIRY_MAX_SECONDS
  ) {
    throw new RangeError(
      `sessionExpiryInterval must be an integer between 1 and ${MQTT_SESSION_EXPIRY_MAX_SECONDS}`
    )
  }
}

export function buildMqttProtocolOptions(sessionExpiryInterval?: number) {
  if (sessionExpiryInterval === undefined) {
    return {}
  }

  assertSessionExpiryInterval(sessionExpiryInterval)

  return {
    protocolVersion: 5,
    clean: false,
    properties: {
      sessionExpiryInterval
    }
  } satisfies IClientOptions
}

export function buildMqttSessionOptions(clientId: string, sessionExpiryInterval?: number) {
  const options = {
    clientId,
    clean: false
  } satisfies IClientOptions

  if (sessionExpiryInterval === undefined) {
    return options
  }

  return {
    ...options,
    ...buildMqttProtocolOptions(sessionExpiryInterval)
  } satisfies IClientOptions
}

export function buildMqttSessionEndOptions(protocolVersion?: IClientOptions['protocolVersion']) {
  if (protocolVersion !== 5) {
    return {}
  }

  return {
    properties: {
      sessionExpiryInterval: 0
    }
  } satisfies Partial<IDisconnectPacket>
}
