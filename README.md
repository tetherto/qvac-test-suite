# QVAC SDK Test Suite

Automated E2E testing for the QVAC SDK across desktop and mobile platforms.

## Overview

- **Desktop consumer** (Bun + Bare runtime)
- **Mobile consumer** (React Native/Expo)
- **Producer** orchestrates tests via MQTT
- **HTML reports** generated after each run

## Quick Start

### Prerequisites

1. **Bun runtime v1.2+**: https://bun.sh
2. **MQTT broker** running locally (Mosquitto recommended)
3. **NPM token** set in environment:
   ```bash
   # Windows PowerShell
   $env:NPM_TOKEN="npm_YOUR_TOKEN_HERE"
   
   # Linux/macOS
   export NPM_TOKEN="npm_YOUR_TOKEN_HERE"
   ```

### Install Dependencies

```bash
cd qvac-test-producer && bun install
cd ../qvac-test-consumer-desktop && bun install
```

### Run Tests (Desktop)

Open **3 terminals**:

**Terminal 1: MQTT Broker**
```bash
mosquitto -v
```

**Terminal 2: Producer**
```bash
cd qvac-test-producer
bun run batch
```

**Terminal 3: Consumer**
```bash
cd qvac-test-consumer-desktop
bun run batch
```

**HTML Reports** are saved to `qvac-test-producer/reports/` when the batch completes.

### Run Tests (Mobile)

**Prerequisites:**
- Android Studio with emulator OR physical Android device

**Terminal 1 & 2:** Same as desktop (MQTT broker + Producer)

**Terminal 3: Build and run Android app**
```bash
cd qvac-test-consumer-mobile
bun install
bun run android
```

## Run Isolation

Multiple test runs can share the same MQTT broker using `--run-id`:

```bash
# Producer
bun run batch -- --run-id=my-run

# Consumer (must match)
bun run batch -- --run-id=my-run
```

For local development, enable wildcard consumers:
```bash
cd qvac-test-producer
bun run env:set-local    # Enable
bun run env:unset-local  # Disable
```

## Test Categories

| Category | Description |
|----------|-------------|
| **Completion** | LLM text generation and streaming |
| **Transcription** | Whisper audio transcription |
| **Embeddings** | Text and code embeddings |
| **RAG** | Document chunking and retrieval |
| **Translation** | NMT language translation (Opus/Bergamot) |
| **Vision** | Multimodal image understanding |
| **OCR** | Optical character recognition |
| **Tools** | Function calling |
| **TTS** | Text-to-speech synthesis |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NPM_TOKEN` | npm registry auth | Required |
| `MQTT_BROKER_URL` | MQTT broker URL | `mqtt://127.0.0.1:1883` |
| `RUN_ID` | Test run identifier | Auto-generated |
| `TEST_FILTER` | Filter tests by prefix | All tests |

## Project Structure

```
qvac-test-suite/
├── qvac-test-producer/         # Test orchestrator
├── qvac-test-consumer-desktop/ # Desktop test runner
├── qvac-test-consumer-mobile/  # Mobile test runner (Expo)
├── shared-test-data/           # Test assets (audio, images, docs)
├── shared-test-executor/       # Shared test execution logic
├── shared-consumer/            # Shared consumer base class
└── reports/                    # HTML test reports
```

## Troubleshooting

**Tests not starting:**
- Verify MQTT broker is running
- Check producer shows "Waiting for consumers..."

**Consumer not connecting:**
- Verify `--run-id` matches between producer and consumer
- Check MQTT broker URL

**Tests timing out:**
- Models download on first run (can take several minutes)
- Check available disk space for model storage

## License

Proprietary - Tether/QVAC
