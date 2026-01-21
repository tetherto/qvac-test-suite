import { getArgValue } from "../shared-utils/args";

/**
 * Desktop Consumer Environment Configuration
 * 
 * CLI arguments: --run-id
 * 
 * Environment Variables:
 * - MQTT_BROKER_URL: MQTT broker URL (default: mqtt://127.0.0.1:1883)
 * - MQTT_TOPIC: MQTT topic (default: qvac/test)
 * - RUN_ID: Test run ID (default: *)
 * - ESPEAK_DATA_PATH: Path to espeak-ng-data for TTS tests (optional)
 *   
 *   Example usage on Windows:
 *   $env:ESPEAK_DATA_PATH="C:\Program Files\eSpeak NG\espeak-ng-data"; bun run batch
 *   
 *   Example usage on macOS/Linux:
 *   ESPEAK_DATA_PATH=/opt/homebrew/share/espeak-ng-data bun run batch
 *   
 *   If not set, the consumer will use platform-specific default paths:
 *   - Windows: C:/Program Files/eSpeak NG/espeak-ng-data
 *   - macOS (ARM): /opt/homebrew/share/espeak-ng-data
 *   - macOS (Intel): /usr/local/share/espeak-ng-data
 *   - Linux: /usr/share/espeak-ng-data
 */

export const env = {
	MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || "mqtt://127.0.0.1:1883",
	MQTT_TOPIC: process.env.MQTT_TOPIC || "qvac/test",
	RUN_ID: getArgValue("run-id") || process.env.RUN_ID || "*",
	// Note: ESPEAK_DATA_PATH is handled in consumer-base.ts getESpeakDataPath()
};
