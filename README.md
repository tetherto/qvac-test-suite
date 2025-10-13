# QVAC SDK Test Suite

Distributed test runner for QVAC SDK using MQTT messaging with comprehensive test coverage.

## 🏗️ Architecture

- **Producer** (`qvac-test-producer`): Publishes test payloads via MQTT
- **Desktop Consumer** (`qvac-test-consumer-desktop`): Executes tests using Node.js/Bun
- **Mobile Consumer** (`qvac-test-consumer-mobile`): Executes tests on iOS/Android (Expo)
- **Monitor** (`verify-tests.ts`): Real-time test monitoring and reporting

## 🚀 Quick Start

### 1. Prerequisites
- MQTT broker running (Mosquitto on `localhost:1883`)
- GitHub Personal Access Token with `read:packages` scope
- Set `NPM_TOKEN` environment variable

### 2. Run Tests

**Terminal 1 - Producer:**
```powershell
cd qvac-test-producer
bun run index.ts
```

**Terminal 2 - Desktop Consumer:**
```powershell
cd qvac-test-consumer-desktop
bun run index.ts
```

**Terminal 3 - Monitor:**
```powershell
bun run verify-tests.ts
```

## 📊 Test Coverage

**13 Test Types Implemented:**

### Model Loading (3 tests)
- ✅ Load LLM model
- ✅ Load Embedding model
- ✅ Invalid path error handling

### LLM Completion (6 tests)
- ✅ Streaming completion
- ✅ Different context sizes (512, 2048)
- ✅ Temperature variations (0.1, 0.9)
- ✅ Empty prompt handling
- ✅ Long prompt (2500+ chars)
- ✅ Multi-turn conversation

### Transcription (4 tests)
- ❌ MP3 format (SDK bug found)
- ❌ M4A format (SDK bug found)
- ✅ Corrupted MP3 error handling
- ✅ Corrupted WAV error handling

## 📁 Project Structure

```
qvac-test/
├── qvac-test-producer/          # Test publisher
├── qvac-test-consumer-desktop/  # Desktop test executor
├── qvac-test-consumer-mobile/   # Mobile test executor
│   └── assets/audio/            # Test audio files
├── docs/                        # Documentation
│   ├── RUN.md                   # Detailed setup
│   ├── ANDROID-SETUP.md         # Mobile setup
│   └── TEST-BATCH-*.md          # Test documentation
├── bugs/                        # SDK bug reports
├── test-data/                   # Test case specifications
├── verify-tests.ts              # Test monitor
└── README.md                    # This file
```

## 🐛 Known Issues

### SDK Bugs Found:
1. **MP3/M4A Transcription Fails** - `prompt.map is not a function` error
   - See: `bugs/TRANSCRIPTION-MP3-M4A-BUG-REPORT.md`

## 📖 Documentation

- **Setup Guide**: `docs/RUN.md`
- **Android Setup**: `docs/ANDROID-SETUP.md`
- **Progress Summary**: `docs/PROGRESS-SUMMARY.md`
- **Bug Tracking**: `bugs/SDK-BUGS-FOUND.md`

## 🎯 Test Principles

- ✅ **NO Mocks** - All real SDK API calls
- ✅ **NO Simulations** - Real models, real audio, real data
- ✅ **Real Error Handling** - Actual error cases tested
- ✅ **Comprehensive Reporting** - Expected vs Actual comparison

## 📈 Current Status

- **SDK Version**: `@tetherto/qvac-sdk@0.10.1`
- **Test Types**: 13 implemented
- **Pass Rate**: ~94% (excluding designed fails)
- **Bugs Found**: 1 (MP3/M4A transcription)

## 🔄 Test Rotation

Tests cycle through 25 different scenarios every 3 seconds:
- Model loading tests
- LLM completion variants
- Transcription format tests
- Error handling tests

## ⚙️ Requirements

### Desktop Consumer:
- Bun or Node.js
- MQTT client library
- QVAC SDK peer dependencies (see `qvac-test-consumer-desktop/package.json`)

### Mobile Consumer:
- Expo CLI
- Physical device (emulators not supported by llamacpp)
- MQTT WebSocket support (port 8080)

## 🤝 Contributing

When adding new tests:
1. Add test builder in `producer/index.ts`
2. Add test handler in `consumer/index.ts`
3. Update test rotation in `publish()` function
4. Document in `docs/TEST-BATCH-*.md`
5. Run and verify with `verify-tests.ts`

---

For detailed setup and usage, see `docs/RUN.md`
