import { useEffect } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import Constants from "expo-constants";
import mqtt from "mqtt";
import {
  loadModel,
  unloadModel,
  completion as runCompletion,
  transcribe as runTranscribe,
  embed as runEmbed,
  LLAMA_3_2_1B_INST_Q4_0,
  WHISPER_TINY,
  VAD_SILERO_5_1_2,
  GTE_LARGE_FP16,
} from "@tetherto/qvac-sdk";
import * as FileSystem from "expo-file-system";
import { Asset } from "expo-asset";
import { env } from "@/env";

const CONSUMER_ID = `consumer-mobile-${Constants.deviceName || Constants.sessionId || "unknown"}`;
const RESULT_TOPIC = "qvac/results";

async function completion(modelId: string, params: any, expectation: any) {
  const { history = [], stream = false } = params;
  const result = runCompletion({ modelId, history, stream });
  const text = (await result.text).trim();

  const passed =
    expectation.match === "contains"
      ? text.includes(expectation.value)
      : text === expectation.value;

  return { output: text, passed };
}

async function transcription(modelId: string, params: any, expectation: any) {
  const audioModule = require("../../assets/audio/sample-16khz.wav");
  const audioAsset = Asset.fromModule(audioModule);
  await audioAsset.downloadAsync();

  let audioPath = audioAsset.localUri || audioAsset.uri;
  if (audioPath.startsWith("file://")) audioPath = audioPath.substring(7);
  audioPath = decodeURIComponent(audioPath);

  const text = (await runTranscribe({ modelId, audioChunk: audioPath })).trim();

  let passed = false;
  if (expectation.match === "contains") {
    const keywords = JSON.parse(expectation.value);
    passed = keywords.every((keyword: string) =>
      text.toLowerCase().includes(keyword.toLowerCase()),
    );
  } else {
    passed = text === expectation.value;
  }

  return { output: text, passed };
}

// Transcription Format Tests
async function transcriptionMp3(modelId: string, params: any, expectation: any) {
  try {
    const audioModule = require("../../assets/audio/sample.mp3");
    const audioAsset = Asset.fromModule(audioModule);
    await audioAsset.downloadAsync();

    let audioPath = audioAsset.localUri || audioAsset.uri;
    if (audioPath.startsWith("file://")) audioPath = audioPath.substring(7);
    audioPath = decodeURIComponent(audioPath);

    const text = (await runTranscribe({ modelId, audioChunk: audioPath })).trim();
    
    const passed = expectation.minLength 
      ? text.length >= expectation.minLength
      : text.length > 0;
    
    return { 
      output: `MP3 transcription (${text.length} chars): ${text.substring(0, 100)}...`, 
      passed 
    };
  } catch (error: any) {
    return { 
      output: `Error: ${error.message}`, 
      passed: false 
    };
  }
}

async function transcriptionM4a(modelId: string, params: any, expectation: any) {
  try {
    const audioModule = require("../../assets/audio/sample.m4a");
    const audioAsset = Asset.fromModule(audioModule);
    await audioAsset.downloadAsync();

    let audioPath = audioAsset.localUri || audioAsset.uri;
    if (audioPath.startsWith("file://")) audioPath = audioPath.substring(7);
    audioPath = decodeURIComponent(audioPath);

    const text = (await runTranscribe({ modelId, audioChunk: audioPath })).trim();
    
    const passed = expectation.minLength 
      ? text.length >= expectation.minLength
      : text.length > 0;
    
    return { 
      output: `M4A transcription (${text.length} chars): ${text.substring(0, 100)}...`, 
      passed 
    };
  } catch (error: any) {
    return { 
      output: `Error: ${error.message}`, 
      passed: false 
    };
  }
}

async function transcriptionCorrupted(modelId: string, params: any, expectation: any) {
  try {
    const audioModule = require(`../../assets/audio/${params.audioFileName}`);
    const audioAsset = Asset.fromModule(audioModule);
    await audioAsset.downloadAsync();

    let audioPath = audioAsset.localUri || audioAsset.uri;
    if (audioPath.startsWith("file://")) audioPath = audioPath.substring(7);
    audioPath = decodeURIComponent(audioPath);

    await runTranscribe({ modelId, audioChunk: audioPath });
    
    return { 
      output: "ERROR: Transcribed corrupted file when it should have failed", 
      passed: false 
    };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    return { 
      output: `Correctly handled corrupted file: ${errorMsg.substring(0, 100)}`, 
      passed: true 
    };
  }
}

async function transcriptionCorruptedWav(modelId: string, params: any, expectation: any) {
  return transcriptionCorrupted(modelId, params, expectation);
}

// Model Loading Tests
async function modelLoadLlm(modelId: string, params: any, expectation: any) {
  try {
    const modelConstant = params.modelConstant || "LLAMA_3_2_1B_INST_Q4_0";
    const modelConstants: Record<string, string> = {
      LLAMA_3_2_1B_INST_Q4_0,
    };
    
    const loadedModelId = await loadModel({
      modelSrc: modelConstants[modelConstant],
      modelType: "llm",
    });
    
    const passed = typeof loadedModelId === "string" && loadedModelId.length > 0;
    return { 
      output: `Model loaded with ID: ${loadedModelId}`, 
      passed,
      modelId: loadedModelId,
    };
  } catch (error: any) {
    return { 
      output: `Error: ${error.message}`, 
      passed: false 
    };
  }
}

async function modelLoadEmbedding(modelId: string, params: any, expectation: any) {
  try {
    const loadedModelId = await loadModel({
      modelSrc: GTE_LARGE_FP16,
      modelType: "embeddings",
    });
    
    const passed = typeof loadedModelId === "string" && loadedModelId.length > 0;
    return { 
      output: `Embedding model loaded with ID: ${loadedModelId}`, 
      passed 
    };
  } catch (error: any) {
    return { 
      output: `Error: ${error.message}`, 
      passed: false 
    };
  }
}

async function modelLoadInvalid(modelId: string, params: any, expectation: any) {
  try {
    const invalidPath = params.modelPath || "/invalid/path/model.gguf";
    await loadModel({
      modelSrc: invalidPath,
      modelType: "llm",
    });
    
    return { 
      output: "ERROR: Model loaded when it should have failed", 
      passed: false 
    };
  } catch (error: any) {
    const errorMsg = error.message || String(error);
    const passed = expectation.errorContains 
      ? errorMsg.toLowerCase().includes(expectation.errorContains.toLowerCase())
      : true;
    
    return { 
      output: `Correctly threw error: ${errorMsg}`, 
      passed 
    };
  }
}

async function modelUnload(modelId: string, params: any, expectation: any) {
  try {
    if (!modelId) {
      return { 
        output: "ERROR: No model ID provided to unload", 
        passed: false 
      };
    }
    
    await unloadModel({ 
      modelId, 
      clearStorage: params.shouldClearStorage || false 
    });
    
    return { 
      output: `Model ${modelId} unloaded successfully`, 
      passed: true 
    };
  } catch (error: any) {
    return { 
      output: `Error unloading: ${error.message}`, 
      passed: false 
    };
  }
}

const tests: Record<
  string,
  (
    modelId: string,
    params: any,
    expectation: any,
  ) => Promise<{ output: string; passed: boolean; modelId?: string }>
> = {
  completion,
  transcription,
  "transcription-mp3": transcriptionMp3,
  "transcription-m4a": transcriptionM4a,
  "transcription-corrupted": transcriptionCorrupted,
  "transcription-corrupted-wav": transcriptionCorruptedWav,
  "model-load-llm": modelLoadLlm,
  "model-load-embedding": modelLoadEmbedding,
  "model-load-invalid": modelLoadInvalid,
  "model-unload": modelUnload,
};

export default function HomeScreen() {
  useEffect(() => {
    let llmModelId: string;
    let whisperModelId: string;
    let mqttClient: any;

    (async () => {
      console.log("[consumer] loading models...");
      llmModelId = await loadModel(LLAMA_3_2_1B_INST_Q4_0, {
        modelType: "llm",
      });
      console.log("[consumer] llm loaded");

      await loadModel(VAD_SILERO_5_1_2, { modelType: "whisper", downloadOnly: true });
      const vadModelPath = `${FileSystem.documentDirectory}.qvac/models/ggml-silero-v5.1.2.bin`;

      whisperModelId = await loadModel(WHISPER_TINY, {
        modelType: "whisper",
        modelConfig: {
          mode: "caption",
          output_format: "plaintext",
          min_seconds: 2,
          max_seconds: 6,
          audio_format: "f32le",
          vad_model: vadModelPath,
        },
      });
      console.log("[consumer] whisper loaded");

      const protocol = env.useSsl ? "wss" : "ws";
      const port = env.useSsl
        ? env.EXPO_PUBLIC_MQTT_PORT_SSL
        : env.EXPO_PUBLIC_MQTT_PORT;
      const brokerUrl = `${protocol}://${env.EXPO_PUBLIC_MQTT_HOST}:${port}${env.EXPO_PUBLIC_MQTT_PATH}`;

      mqttClient = mqtt.connect(brokerUrl);

      mqttClient.on("connect", () => {
        console.log("[consumer] connected to mqtt");
        mqttClient.subscribe(env.topics[0]);
        console.log("[consumer] subscribed to", env.topics[0]);
      });

      mqttClient.on("message", async (_topic: string, payload: Buffer) => {
        const message = JSON.parse(payload.toString());
        const { testId, params, expectation } = message;

        console.log(`[consumer] received test: ${testId}`);

        // Check if test handler exists
        if (!tests[testId]) {
          console.warn(`[consumer] no handler for test: ${testId}`);
          const errorMessage = {
            consumerId: CONSUMER_ID,
            testId,
            params,
            outcome: "failure",
            duration: 0,
            timestamp: new Date().toISOString(),
            output: "",
            error: `No test handler implemented for: ${testId}`,
          };
          mqttClient.publish(RESULT_TOPIC, JSON.stringify(errorMessage), {
            qos: 0,
            retain: false,
          });
          return;
        }

        const startTime = Date.now();
        // Determine which model to use based on test type
        const modelId = testId.startsWith("transcription") ? whisperModelId : llmModelId;

        const { output, passed } = await tests[testId](
          modelId,
          params,
          expectation,
        );
        const duration = Date.now() - startTime;

        console.log(
          `[consumer] test ${testId} ${passed ? "passed" : "failed"} in ${duration}ms`,
        );
        console.log(`[consumer] output: ${output}`);

        const outcome = passed ? "success" : "failure";
        const resultMessage = {
          consumerId: CONSUMER_ID,
          testId,
          params,
          outcome,
          duration,
          timestamp: new Date().toISOString(),
          output: output || "",
          error: !passed ? output : undefined,
        };

        mqttClient.publish(RESULT_TOPIC, JSON.stringify(resultMessage), {
          qos: 0,
          retain: false,
        });
      });
    })();

    return () => {
      mqttClient?.end();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Image
        source={{
          uri: "https://preview.redd.it/6o6blcul5n841.jpg?auto=webp&s=ccfaf79f8c679b8d075131e67319d955cda25a30",
        }}
        style={styles.image}
        resizeMode="contain"
      />
      <Text style={styles.caption}>
        "This is not the UI you're looking for."
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  image: {
    width: "100%",
    height: "70%",
    marginBottom: 20,
  },
  caption: {
    fontSize: 18,
    color: "#fff",
    textAlign: "center",
    fontStyle: "italic",
  },
});
