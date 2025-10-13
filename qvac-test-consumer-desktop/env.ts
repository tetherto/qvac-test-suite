export const env = {
	MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || "mqtt://127.0.0.1:1883",
	MQTT_TOPIC: process.env.MQTT_TOPIC || "qvac/test",
};
