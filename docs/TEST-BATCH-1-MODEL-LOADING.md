# Test Batch 1: Model Loading Tests

## ✅ Implemented Tests

### 1. **model-load-llm** - Load LLM Model Successfully
- **Action**: Load LLAMA_3_2_1B_INST_Q4_0 model
- **Expected**: Returns valid model ID (non-empty string)
- **Validation**: Model loads without errors, ID is returned
- **Maps to Excel**: General model loading functionality

### 2. **model-load-embedding** - Load Embedding Model Successfully  
- **Action**: Load EMBEDDINGGEMMA_300M_Q4_0 model
- **Expected**: Returns valid model ID (non-empty string)
- **Validation**: Embedding model loads without errors
- **Maps to Excel**: Embedding model loading tests

### 3. **model-load-invalid** - Load with Invalid Path (Error Handling)
- **Action**: Attempt to load model from invalid path `/invalid/path/model.gguf`
- **Expected**: Throws error containing "not found"
- **Validation**: Error is thrown and contains expected message
- **Maps to Excel**: Error handling tests (ID 2075, 2101-2104)

### 4. **model-unload** - Unload Model Successfully
- **Action**: Unload a previously loaded model
- **Expected**: Model unloads without error
- **Validation**: unloadModel() completes successfully
- **Maps to Excel**: Resource lifecycle tests (ID 2077)

## Test Flow

Producer publishes tests in rotation (every 3 seconds):
1. model-load-llm
2. completion (existing)
3. completion
4. completion
5. transcription (existing)
6. model-load-embedding
7. completion
8. model-load-invalid
9. completion
10. transcription

## Files Modified

- ✅ `qvac-test-producer/index.ts` - Added 4 new test builders
- ✅ `qvac-test-consumer-desktop/index.ts` - Added 4 new test handlers
- ✅ `qvac-test-consumer-mobile/app/(tabs)/index.tsx` - Added 4 new test handlers

## NO Mocks or Simulations

All tests use **real SDK API calls**:
- ✅ Real `loadModel()` calls
- ✅ Real `unloadModel()` calls
- ✅ Real model downloads from hyperdrive
- ✅ Real error handling with invalid paths

## Test Data Required

✅ **None needed** - All model loading tests use SDK's built-in model constants

## Ready to Test

Run the following commands in separate terminals:

**Terminal 1:**
```powershell
cd C:\Tether\qvac-sdk-testing\qvac-test\qvac-test-producer
bun run index.ts
```

**Terminal 2:**
```powershell
cd C:\Tether\qvac-sdk-testing\qvac-test\qvac-test-consumer-desktop
bun run index.ts
```

## Expected Behavior

- Producer will publish mixed tests (completion, transcription, and new model-loading tests)
- Consumer will execute each test type
- Results will show:
  - ✅ SUCCESS for: model-load-llm, model-load-embedding
  - ✅ SUCCESS for: model-load-invalid (because it correctly throws error)
  - ✅ SUCCESS for: model-unload (if a model was previously loaded)

## Next Steps

After you verify these work:
- Add more model loading tests (concurrent loading, multiple models, etc.)
- Move to LLM Completion tests (streaming, context sizes)
- Then Transcription, Embedding, Translation

