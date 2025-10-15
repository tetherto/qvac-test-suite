# QVAC SDK Test Suite

Batch test orchestration for QVAC SDK with parallel execution across multiple devices.

## 🚀 Quick Start

### Prerequisites
- MQTT broker on `localhost:1883`
- GitHub token in `.npmrc` (copy from `.npmrc.example`)

### Run Tests

**Terminal 1 - Producer:**
```powershell
cd qvac-test-producer
bun run batch
```

**Terminal 2 - Desktop Consumer:**
```powershell
cd qvac-test-consumer-desktop
bun run batch
```

**Terminal 2 (Alternative) - Mobile Consumer:**
```powershell
cd qvac-test-consumer-mobile
bun start
# Then open the app on your mobile device (Android/iOS)
# The batch consumer UI will start automatically
```

**Terminal 3 - Monitor (Optional):**
```powershell
bun run batch:monitor
```

The monitor generates an HTML report in `reports/` folder when the batch completes. If interrupted (Ctrl+C), no report is generated.

Add more consumers for parallel execution - each pulls unique tests from the queue.

## 📊 Test Coverage

**69 tests organized by dependency:**

- **Model Loading** (6 tests): LLM, Embeddings, Concurrent loading, Unload, Reload, Error handling
- **LLM Completion** (37 tests): 
  - Basic: Streaming, context sizes, temperatures, edge cases, invalid model error
  - Advanced Parameters: System messages, max tokens, special characters, stop sequences, top-p, repeat penalty, min-p, very long context, zero temperature, top-k, frequency penalty, presence penalty, negative temperature
  - Phase 4 Robustness: Concurrent requests, extremely long prompts, repeated tokens, whitespace handling, JSON format, code generation
  - Phase 5 Real-World: Conversation context, single-word responses, list generation, QA from context, yes/no questions, sentence completion
- **Model Management** (2 tests): Model switching, reload after error
- **Transcription** (12 tests): WAV, MP3, AAC, M4A, OGG, silence, music, long audio, streaming, very short audio, corrupted files
- **Embeddings** (12 tests): Simple, long text, empty text, similarity, batch, unicode, very short, code snippets, multilingual, special characters, numbers-only, semantic similarity
- **Translation** (3 tests): EN→ES, ES→EN, Error handling (SDK limitation)

## 🎯 Key Features

✅ Single batch cycle with automatic termination  
✅ Pull-based - consumers request tests from queue  
✅ Each test runs exactly once  
✅ Parallel execution across multiple consumers  
✅ **Cross-platform:** Desktop (Node.js) and Mobile (React Native/Expo)  
✅ Timeout enforcement (60 seconds max for all tests)  
✅ Real-time monitoring dashboard with HTML reports  
✅ Platform tracking and result grouping  
✅ Beautiful tabbed HTML reports with per-consumer breakdown  
✅ Mobile consumer with live UI showing progress and logs

## 📁 Structure

```
qvac-test-producer/
  ├── batch-orchestrator.ts    # Queue manager
  └── test-builders.ts         # Test definitions (69 tests)

qvac-test-consumer-desktop/
  ├── batch-consumer.ts        # Pull-based desktop consumer
  └── test-executor.ts         # Desktop test handlers

qvac-test-consumer-mobile/
  ├── batch-consumer.tsx       # Pull-based mobile consumer (React Native)
  ├── test-executor.ts         # Mobile test handlers
  └── app/(tabs)/index.tsx     # Mobile app entry point

batch-monitor.ts               # Real-time dashboard with HTML reports
shared-test-data/audio/        # Test audio files
```

## ⚙️ Configuration

Update `env.ts` in producer/consumer for custom MQTT settings.

### Mobile Consumer Setup

1. **Install dependencies:**
   ```powershell
   cd qvac-test-consumer-mobile
   bun install
   ```

2. **Configure MQTT broker:**
   - Update `env.ts` with your MQTT broker URL (must be accessible from mobile device)
   - For Android: Use `ws://10.0.2.2:1883` if broker is on `localhost`
   - For iOS: Use your computer's local IP (e.g., `ws://192.168.1.100:1883`)

3. **Run on Android:**
   ```powershell
   bun run android
   ```

4. **Run on iOS:**
   ```powershell
   bun run ios
   ```

The mobile app will automatically:
- Load all three models (LLM, Whisper, Embedding)
- Connect to MQTT broker
- Register with the producer
- Display real-time progress with a beautiful UI
- Show test results and logs as they execute

## ⚠️ Known SDK Issues

The following tests expose SDK bugs and will timeout (60s limit):

**Transcription Issues:**
- `transcription-corrupted` / `transcription-corrupted-wav` - SDK hangs on corrupted files instead of throwing errors
- `transcription-only-music` - SDK hangs on music-only audio
- `transcription-long-audio` - May timeout on very long audio files

**Embedding Issues:**
- `embed-batch` - SDK hangs when processing batch embeddings with Promise.all

**Model Management Issues:**
- `model-unload` - Unload functionality not fully implemented
- `completion-invalid-model` - SDK doesn't validate model IDs before attempting completion

**Translation Issues:**
- `translation-en-to-es` / `translation-es-to-en` - Translation API not yet available in SDK

**Advanced Parameter Support** (Phase 2 - May vary):
- Stop sequences, top-p, repeat penalty, min-p parameters may not be fully supported yet

**Current Success Rate:** ~65% (45-47/69 tests expected)  
**Expected Without SDK Bugs:** ~96% (66/69 tests - only translation missing)

### ⏱️ About Test Timeouts

**Test Timeout = 60 seconds** (per test). This is NOT a performance issue:
- ✅ **Healthy tests complete in < 5 seconds** (most in < 1 second)
- ❌ **Timeout failures indicate SDK hangs** - the SDK never responds, it's not just slow
- 🐛 **All timeout failures are SDK bugs** where the SDK enters an unrecoverable state

Examples from latest run:
- `completion-basic`: 0.34s ✅
- `transcription-wav`: 12.5s ✅  
- `embed-simple-text`: **60s timeout** ❌ (SDK hung, never responded)

**If a test times out, the SDK is broken for that use case - it's not a test configuration issue.**
