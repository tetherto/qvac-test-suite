/** biome-ignore-all lint/complexity/useLiteralKeys: <?> */
import { z } from "zod";

const envSchema = z.object({
	MQTT_BROKER_URL: z.url().default("mqtt://127.0.0.1:1883"),
	MQTT_TOPIC: z.string().min(1).default("qvac/test"),
	MQTT_PUBLISH_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
});

export const env = envSchema.parse({
	MQTT_BROKER_URL: process.env["MQTT_BROKER_URL"],
	MQTT_TOPIC: process.env["MQTT_TOPIC"],
	MQTT_PUBLISH_INTERVAL_MS: process.env["MQTT_PUBLISH_INTERVAL_MS"],
});

export type Env = typeof env;
