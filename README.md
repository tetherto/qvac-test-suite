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

**Terminal 2 - Consumer:**
```powershell
cd qvac-test-consumer-desktop
bun run batch
```

**Terminal 3 - Monitor (Optional):**
```powershell
bun run batch:monitor
```

The monitor generates an HTML report in `reports/` folder when the batch completes. If interrupted (Ctrl+C), no report is generated.

Add more consumers for parallel execution - each pulls unique tests from the queue.

## 📊 Test Coverage

**25 tests organized by dependency:**

- **Model Loading** (3 tests): LLM, Embeddings, Error handling
- **LLM Completion** (8 tests): Streaming, context sizes, temperatures, edge cases
- **Transcription** (10 tests): WAV, MP3, AAC, M4A, OGG, silence, music, long audio, errors
- **Embeddings** (4 tests): Simple, long text, empty text, similarity

## 🎯 Key Features

✅ Single batch cycle with automatic termination  
✅ Pull-based - consumers request tests from queue  
✅ Each test runs exactly once  
✅ Parallel execution across multiple consumers  
✅ Timeout enforcement (2min standard, 10min long audio)  
✅ Real-time monitoring dashboard  
✅ Platform tracking and result grouping

## 📁 Structure

```
qvac-test-producer/
  ├── batch-orchestrator.ts    # Queue manager
  ├── test-builders.ts         # Test definitions
  └── index.ts                 # Original continuous mode

qvac-test-consumer-desktop/
  ├── batch-consumer.ts        # Pull-based consumer
  ├── test-executor.ts         # Test handlers
  └── index.ts                 # Original continuous mode

batch-monitor.ts               # Real-time dashboard
verify-tests.ts                # Original monitor
shared-test-data/audio/        # Test audio files
```

## ⚙️ Configuration

Update `env.ts` in producer/consumer for custom MQTT settings.

## 🔄 Legacy Mode

Original continuous testing still available:
```powershell
cd qvac-test-producer && bun run index.ts    # Loops every 3s
cd qvac-test-consumer-desktop && bun run index.ts
bun run verify-tests.ts
```
