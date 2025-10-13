# QVAC Test System - Quick Start

## Prerequisites

✅ MQTT broker running on `localhost:1883` (already confirmed working)
✅ NPM_TOKEN environment variable set (for GitHub packages)
✅ Latest qvac-sdk v0.9.0 installed

## Run the System

### Terminal 1 - Producer (publishes test messages every 3 seconds)

```powershell
cd qvac-test-producer
bun run index.ts
```

**Expected output:**
```
[mqtt] connected to mqtt://127.0.0.1:1883
[mqtt] subscribed to qvac/results
[mqtt] published completion test to qvac/test: {...}
```

### Terminal 2 - Desktop Consumer (executes tests with AI models)

```powershell
cd qvac-test-consumer-desktop
bun run index.ts
```

**Expected output:**
```
[consumer] loading models...
Node runtime detected
Downloading model from hyperdrive...
[consumer] llm loaded
[consumer] whisper loaded
[consumer] connected to mqtt
[consumer] subscribed to qvac/test
[consumer] received test: completion
[consumer] test completion passed in 1234ms
```

**Note:** First run downloads ~1-2GB of models (LLaMA 3.2 1B, Whisper Tiny, Silero VAD)

### Terminal 3 - Mobile Consumer (React Native/Expo)

```powershell
cd qvac-test-consumer-mobile
bun run ios
# or
bun run android
```

Make sure to configure `env.ts` with your local IP for MQTT WebSocket connection.

## Alternative: Run with npm scripts

```powershell
# Producer
cd qvac-test-producer
bun dev

# Consumer Desktop
cd qvac-test-consumer-desktop
bun dev
```

## What's Happening?

1. **Producer** publishes test payloads on `qvac/test` topic:
   - Completion tests (LLM): Tests number repetition with pass/fail scenarios
   - Transcription tests (Whisper): Tests audio transcription with keyword matching

2. **Consumer** receives tests, executes them with local AI models, and publishes results on `qvac/results` topic

3. **Producer** displays formatted test results with duration, outcome, and error details

## Test Pattern

- Every 4th test is a transcription test
- Completion tests: 5 pass, then 1 fail (repeats)
- Transcription tests: 2 pass, then 1 fail (repeats)

## Troubleshooting

**Models downloading slowly?**
- Normal on first run, models are ~1-2GB total
- Check download progress in consumer output

**Consumer not receiving messages?**
- Verify producer is running and publishing
- Check MQTT broker is running: `Test-NetConnection localhost -Port 1883`

**Import errors?**
- Make sure you've run `bun install` in each project directory
- Verify `.npmrc` file exists in each project with your GitHub token

