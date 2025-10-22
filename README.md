# QVAC SDK Test Suite

Comprehensive automated testing for the QVAC SDK across desktop and mobile platforms.

## Overview

- **84 tests** covering LLM, Whisper, Embeddings, RAG, and Translation APIs
- **Desktop consumer** (Bare runtime)
- **Mobile consumer** (React Native/Expo)
- **Producer** orchestrates tests via MQTT
- **HTML reports** with detailed results

## Quick Start

### Prerequisites

- Bun runtime
- MQTT broker (e.g., Mosquitto)
- QVAC SDK version: `@qvac/sdk@0.2.6-dev.1761136954.37a3ab8`
- NPM token in environment: `NPM_TOKEN=npm_...`

### Running Tests

**1. Start Producer:**
```bash
cd qvac-test-producer
bun run batch-orchestrator.ts
```

**2. Start Desktop Consumer:**
```bash
cd qvac-test-consumer-desktop
bun run batch-consumer.ts
```
To run one or more specific tests by their testID, use:
```powershell
cd qvac-test-consumer-desktop
bun run batch testID1 testID2
```

**3. Start Mobile Consumer (optional):**
```bash
cd qvac-test-consumer-mobile
npm start
# Then run on Android/iOS
```

**4. Monitor & Generate Report:**
```bash
bun run batch:monitor
```

## Test Categories

| Category | Tests | Description |
|----------|-------|-------------|
| **Model Loading** | 5 | Load/unload/reload models |
| **LLM Completion** | 37 | Text generation, streaming, parameters |
| **Whisper** | 12 | Audio transcription, formats |
| **Embeddings** | 27 | Text/code embeddings, RAG |
| **Translation** | 3 | Language translation |

## Test Execution Order

Tests are ordered to run stable tests first, destructive tests last:

1. **Tests 1-76**: Normal tests (expected: 90%+ pass)
2. **Tests 77-79**: Context overflow tests
3. **Tests 80-81**: Corrupted audio tests (known SDK hang)
4. **Tests 82-85**: Code embedding tests (known GGML assertion)

## Known SDK Issues

### Critical: GGML Assertion Failure (P0)

**Error:** `GGML_ASSERT(i01 >= 0 && i01 < ne01) failed` at `ggml-cpu/ops.cpp:5358`

**Triggers:**
- Processing ~852 tokens through embedding model
- Context overflow in LLM model
- Corrupted audio files in Whisper model

**Impact:**
- SDK crashes at C++ level
- No recovery possible
- Subsequent tests timeout (cascade effect)

**Workaround:**
Tests that trigger this are moved to the end of the suite to prevent contamination.

## Test Framework Features

### Resilience
- ✅ Strict 30s timeout per test
- ✅ try-catch error handling
- ✅ SDK crash detection
- ✅ Graceful continuation (never stops suite)
- ✅ Complete reporting even with crashes

### Optimizations
- ✅ Models loaded once at startup
- ✅ No reload between tests (faster)
- ✅ `n_discarded: 256` to prevent generation overflow
- ✅ Expected runtime: 4-6 minutes (84 tests)

## Configuration

### Environment Variables

**Required:**
- `NPM_TOKEN` - npm registry authentication

**Optional:**
- `MQTT_BROKER` - MQTT broker URL (default: `mqtt://localhost:1883`)

### Model Configuration

**LLM:**
```typescript
{
  modelSrc: LLAMA_3_2_1B_INST_Q4_0,
  modelType: "llm",
  modelConfig: {
    verbosity: 0,
    ctx_size: 2048,
    n_discarded: 256
  }
}
```

**Whisper:**
```typescript
{
  modelSrc: WHISPER_TINY,
  modelType: "whisper",
  vadModelSrc: VAD_SILERO_5_1_2,
  modelConfig: {
    mode: "caption",
    output_format: "plaintext",
    audio_format: "f32le"
  }
}
```

**Embeddings:**
```typescript
{
  modelSrc: GTE_LARGE_FP16,
  modelType: "embeddings"
}
```

## Reports

HTML reports are generated in `reports/` directory:
- Test results (pass/fail)
- Execution time
- Error details
- Consumer breakdown
- Success rate

## Project Structure

```
qvac-sdk-tests/
├── qvac-test-producer/         # Test orchestrator
│   ├── batch-orchestrator.ts   # Main producer
│   └── test-builders.ts         # Test definitions
├── qvac-test-consumer-desktop/ # Desktop consumer
│   ├── batch-consumer.ts        # Main consumer
│   └── test-executor.ts         # Test implementations
├── qvac-test-consumer-mobile/  # Mobile consumer
│   ├── batch-consumer.tsx       # Main consumer
│   └── test-executor.ts         # Test implementations
├── shared-test-data/           # Test assets
│   ├── audio/                   # Audio files
│   ├── code/                    # Code files
│   └── documents/               # Documents
├── reports/                     # HTML test reports
├── batch-monitor.ts            # Monitor & report generator
└── README.md                   # This file
```

## Expected Results

### After SDK Fixes

**Current:** 76/84 tests pass (90.5%)
- 76 normal tests: ✅ PASS
- 8 destructive tests: ❌ FAIL (known SDK bugs)

**After SDK team fixes GGML assertion:**
- Expected: 84/84 tests pass (100%)

## Contributing

### Adding New Tests

1. Add test builder in `qvac-test-producer/test-builders.ts`
2. Add test handler in `test-executor.ts` (both consumers)
3. Add test data in `shared-test-data/` if needed
4. Run test suite to verify

### Test Naming Convention

- `{api}-{scenario}-{variant}` (e.g., `completion-streaming-long`)
- `model-{action}-{type}` (e.g., `model-load-llm`)
- `{api}-{format}-{condition}` (e.g., `transcription-mp3-short`)

## Troubleshooting

**Tests hanging:**
- Check if MQTT broker is running
- Verify SDK models are downloaded
- Check for SDK crashes in logs

**Low pass rate:**
- Check SDK version matches expected
- Verify destructive tests are at end
- Review HTML report for patterns

**Consumer not connecting:**
- Verify MQTT broker URL
- Check network connectivity
- Ensure consumer registered before tests start

## License

Proprietary - Tether/QVAC

## Contact

For issues or questions, contact the QVAC SDK development team.
