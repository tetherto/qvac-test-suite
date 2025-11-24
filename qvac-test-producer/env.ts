/** biome-ignore-all lint/complexity/useLiteralKeys: <?> */
import { z } from "zod";
import { getArgValue, hasFlag } from "../shared-utils/args";

/**
 * Producer Environment Configuration
 * CLI arguments: --run-id, --section, --allow-wildcard-consumers
 */

const envSchema = z.object({
	MQTT_BROKER_URL: z.url().default("mqtt://127.0.0.1:1883"),
	MQTT_TOPIC: z.string().min(1).default("qvac/test"),
	MQTT_PUBLISH_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
	TEST_FILTER: z.string().optional(),
	RUN_ID: z.string().optional(),
	ALLOW_WILDCARD_CONSUMERS: z.enum(["true", "false"]).default("true"),
});

const parsed = envSchema.parse({
	MQTT_BROKER_URL: process.env["MQTT_BROKER_URL"],
	MQTT_TOPIC: process.env["MQTT_TOPIC"],
	MQTT_PUBLISH_INTERVAL_MS: process.env["MQTT_PUBLISH_INTERVAL_MS"],
	TEST_FILTER: getArgValue("section") || process.env["TEST_FILTER"],
	RUN_ID: getArgValue("run-id") || process.env["RUN_ID"],
	ALLOW_WILDCARD_CONSUMERS: (() => {
		const cliFlag = hasFlag("allow-wildcard-consumers");
		if (cliFlag !== undefined) return cliFlag ? "true" : "false";
		return process.env["ALLOW_WILDCARD_CONSUMERS"];
	})(),
});

export const env = {
	...parsed,
	RUN_ID: parsed.RUN_ID || `run-${Date.now()}`,
	ALLOW_WILDCARD_CONSUMERS: parsed.ALLOW_WILDCARD_CONSUMERS === "true",
};

export type Env = typeof env;
