# Test Coverage Enhancement Plan

## Current Status (as of 2025-10-23)

**Test Results:** 62/84 tests passing (73.8%) → Expected 65/84 (77.4%) after translation fix

---

## 🎯 Enhancement Goals

1. ✅ **Add tests for all supported parameters** for each API
2. ✅ **Validate against SDK examples** (https://github.com/tetherto/qvac-sdk/tree/main/examples)
3. ✅ **Ensure existing tests use correct parameters**
4. ✅ **Add comprehensive error handling tests** (missing/wrong/invalid parameters)

---

## 📚 SDK Examples to Review

Based on SDK repository structure:

### 1. **Completion Examples**
- `examples/completion/` - Basic completion
- `examples/completion-streaming/` - Streaming completion
- Parameters to test:
  - `prompt` (string, required)
  - `max_tokens` (number, optional)
  - `temperature` (number, 0.0-2.0)
  - `top_p` (number, 0.0-1.0)
  - `stop` (string[], optional)
  - `stream` (boolean)
  - `seed` (number, optional)
  - `frequency_penalty` (number, optional)
  - `presence_penalty` (number, optional)

### 2. **Transcription Examples**
- `examples/transcription/` - Audio transcription
- Parameters to test:
  - `audioPath` (string, required)
  - `language` (string, optional - auto-detect)
  - `mode` ("caption" | "batch")
  - `max_seconds` (number, for caption mode)
  - `min_seconds` (number, for caption mode)
  - `translate` (boolean, optional)

### 3. **Embedding Examples**
- `examples/embeddings/` - Text embeddings
- Parameters to test:
  - `text` (string, required)
  - `modelId` (string, required)

### 4. **Translation Examples** ✅ RECENTLY FIXED
- `examples/translation/translation-llm.ts` ✅
- Parameters to test:
  - `text` (string, required)
  - `from` (string, optional - auto-detect)
  - `to` (string, required)
  - `modelType` ("llm", required)
  - `stream` (boolean, required)

### 5. **RAG Examples**
- `examples/rag/` - Retrieval-Augmented Generation
- Parameters to test:
  - `documentPath` (string, required)
  - `chunkSize` (number, default 500)
  - `chunkOverlap` (number, default 50)
  - `query` (string, required)
  - `topK` (number, optional)

### 6. **Multimodal Examples**
- `examples/multimodal/` - Vision + Text
- Parameters to test:
  - `imagePath` (string, required)
  - `prompt` (string, required)
  - `max_tokens` (number, optional)

### 7. **Delegated Inference Examples**
- `examples/delegated-inference/` - P2P inference
- Parameters to test:
  - `delegate` (object, optional)
  - `timeout` (number, optional)

---

## 🔍 Current Test Coverage Audit

### ✅ **Well-Covered APIs:**

**Embedding (13/13 = 100%)**
- ✅ Basic text embedding
- ✅ Long text
- ✅ Empty text (error)
- ✅ Special characters
- ✅ Numbers only
- ✅ Python code
- ✅ JavaScript code
- ✅ JSON data
- ✅ HTML content

**Completion (25/30 = 83%)**
- ✅ Simple completion
- ✅ Long prompt
- ✅ Empty prompt (error)
- ✅ Streaming
- ✅ Yes/No questions
- ✅ JSON format
- ✅ Code generation
- ⚠️ Missing: `top_p`, `frequency_penalty`, `presence_penalty`, `seed`
- ⚠️ Missing: Stop sequences edge cases
- ⚠️ Missing: Context size variations

### ⚠️ **Partially Covered APIs:**

**Transcription (6/11 = 55%)**
- ✅ Short audio (WAV, MP3, AAC, M4A, OGG)
- ✅ Long audio
- ❌ Missing: `translate` parameter
- ❌ Missing: Language detection edge cases
- ❌ Missing: Silent audio
- ❌ Missing: Multi-language audio
- ❌ Missing: Various sample rates
- ❌ Missing: Various bit rates

**RAG (3/7 = 43%)**
- ✅ Basic embeddings
- ⚠️ ChunkSize variations (only 3 tested)
- ❌ Missing: Query with topK variations
- ❌ Missing: Empty document (error)
- ❌ Missing: Large documents (>10MB)
- ❌ Missing: Multiple document formats

**Translation (1/3 = 33%)** → Expected 3/3 after fix
- ✅ EN → ES ✅ (after fix)
- ✅ ES → EN ✅ (after fix)
- ✅ Error handling ✅
- ❌ Missing: Auto-detect source language
- ❌ Missing: Multiple language pairs
- ❌ Missing: Long text translation
- ❌ Missing: Special characters in translation

### ❌ **Not Covered:**

**Multimodal (0/0)**
- ❌ No tests yet
- Need to add:
  - Basic image + text
  - Multiple images
  - Invalid image formats
  - Large images
  - OCR scenarios

**Delegated Inference (0/0)**
- ❌ No tests yet
- Need to add:
  - Basic delegation
  - Timeout scenarios
  - Peer unavailable
  - Fallback to local

---

## 📋 Enhancement Priorities

### **PHASE 1: Parameter Validation (High Priority)**

Add comprehensive parameter validation tests for ALL APIs:

#### **1.1 Completion Parameter Tests**
```typescript
// New tests needed:
- completion-top-p-0
- completion-top-p-05
- completion-top-p-1
- completion-frequency-penalty-neg2
- completion-frequency-penalty-0
- completion-frequency-penalty-pos2
- completion-presence-penalty-neg2
- completion-presence-penalty-0
- completion-presence-penalty-pos2
- completion-seed-fixed (reproducibility)
- completion-seed-random
- completion-invalid-temperature (3.0) → error
- completion-invalid-max-tokens (-1) → error
- completion-invalid-stop-sequences (empty array) → should work
```

#### **1.2 Transcription Parameter Tests**
```typescript
// New tests needed:
- transcription-with-language-hint (language: "en")
- transcription-auto-detect (no language)
- transcription-translate-to-english (translate: true)
- transcription-batch-vs-caption-mode
- transcription-invalid-language-code → error
- transcription-invalid-audio-path → error
- transcription-missing-audio-file → error
```

#### **1.3 Translation Parameter Tests**
```typescript
// New tests needed:
- translation-auto-detect-source (no 'from')
- translation-long-text (>1000 words)
- translation-special-chars ("¿Cómo estás?")
- translation-multiple-languages (en→fr, en→de, en→ja)
- translation-invalid-language-code → error
- translation-empty-text → error
- translation-missing-model-id → error
```

#### **1.4 RAG Parameter Tests**
```typescript
// New tests needed:
- rag-chunk-size-100
- rag-chunk-size-1000
- rag-chunk-size-5000
- rag-chunk-overlap-0
- rag-chunk-overlap-100
- rag-chunk-overlap-500
- rag-top-k-1
- rag-top-k-5
- rag-top-k-10
- rag-invalid-chunk-size (-1) → error
- rag-chunk-overlap-greater-than-size → error
- rag-empty-document → error
- rag-missing-document-path → error
```

#### **1.5 Embedding Parameter Tests**
```typescript
// Already well-covered, but add:
- embed-very-long-text (>10K chars)
- embed-unicode-characters
- embed-multiple-languages
- embed-missing-text → error
- embed-null-text → error
```

---

### **PHASE 2: New API Coverage (Medium Priority)**

#### **2.1 Multimodal Tests** (NEW)
```typescript
// Implementation needed:
- multimodal-basic-image-text
- multimodal-image-description
- multimodal-image-question-answer
- multimodal-ocr-text-extraction
- multimodal-multiple-images
- multimodal-invalid-image-format → error
- multimodal-missing-image-path → error
- multimodal-corrupted-image → error
- multimodal-large-image (>10MB)
```

#### **2.2 Delegated Inference Tests** (NEW)
```typescript
// Implementation needed:
- delegate-basic-inference
- delegate-with-timeout
- delegate-peer-unavailable → fallback
- delegate-invalid-peer-id → error
- delegate-timeout-exceeded → error
```

---

### **PHASE 3: Error Handling & Edge Cases (High Priority)**

For EVERY API, add tests for:

```typescript
// Generic error patterns:
1. Missing required parameters
   - Test: Call API without modelId
   - Expected: Error with clear message

2. Invalid parameter types
   - Test: Pass string where number expected
   - Expected: Zod validation error

3. Out-of-range values
   - Test: temperature = 5.0 (max is 2.0)
   - Expected: Error with valid range

4. Null/undefined values
   - Test: Pass null for required params
   - Expected: Error

5. Extreme values
   - Test: max_tokens = 1000000
   - Expected: Error or clamp to max

6. Concurrent operations
   - Test: Multiple API calls simultaneously
   - Expected: All succeed or queue properly

7. Resource cleanup
   - Test: Unload model while inference running
   - Expected: Graceful error, no crash
```

---

### **PHASE 4: Real-World Scenarios (Low Priority)**

```typescript
// Complex integration tests:
- rag-multimodal-combined (extract text from image → RAG)
- completion-with-rag-context (use RAG results in completion)
- translation-then-completion (translate → use in completion)
- streaming-transcription-with-translation
- delegated-inference-with-fallback
- multi-model-orchestration
```

---

## 🛠️ Implementation Plan

### **Step 1: Create Test Builder Methods**

Update `qvac-test-producer/test-builders.ts`:

```typescript
// Example new methods:
buildCompletionTopPTest(topP: number): TestDefinition
buildCompletionFrequencyPenaltyTest(penalty: number): TestDefinition
buildTranscriptionWithLanguageTest(language: string): TestDefinition
buildTranslationAutoDetectTest(): TestDefinition
buildRagChunkSizeTest(chunkSize: number): TestDefinition
buildMultimodalBasicTest(): TestDefinition
buildDelegatedInferenceTest(): TestDefinition

// Error handling methods:
buildCompletionInvalidTempTest(): TestDefinition
buildTranscriptionMissingFileTest(): TestDefinition
buildTranslationEmptyTextTest(): TestDefinition
buildRagInvalidChunkSizeTest(): TestDefinition
```

### **Step 2: Create Test Executor Methods**

Update `test-executor.ts` (desktop & mobile):

```typescript
// New handlers:
private async completionTopP(modelId, params, expectation): Promise<TestResult>
private async completionFrequencyPenalty(modelId, params, expectation): Promise<TestResult>
private async transcriptionWithLanguage(modelId, params, expectation): Promise<TestResult>
private async translationAutoDetect(modelId, params, expectation): Promise<TestResult>
private async ragChunkSize(modelId, params, expectation): Promise<TestResult>
private async multimodalBasic(modelId, params, expectation): Promise<TestResult>
private async delegatedInference(modelId, params, expectation): Promise<TestResult>

// Register all handlers in registerHandlers()
```

### **Step 3: Add Tests to Test Suite**

Update `buildAllTests()` in `test-builders.ts`:

```typescript
// Add to existing phases:
tests.push(this.buildCompletionTopPTest(0.0));
tests.push(this.buildCompletionTopPTest(0.5));
tests.push(this.buildCompletionTopPTest(1.0));

tests.push(this.buildTranscriptionWithLanguageTest("en"));
tests.push(this.buildTranslationAutoDetectTest());

// Add new phases:
// PHASE 7: Multimodal Tests
tests.push(this.buildMultimodalBasicTest());
tests.push(this.buildMultimodalImageDescriptionTest());

// PHASE 8: Delegated Inference Tests
tests.push(this.buildDelegatedInferenceTest());

// PHASE 9: Error Handling Tests
tests.push(this.buildCompletionInvalidTempTest());
tests.push(this.buildTranscriptionMissingFileTest());
```

### **Step 4: Verify Against SDK Examples**

For each API:
1. Download/review SDK example from GitHub
2. Compare our test parameters with example parameters
3. Update test if parameters missing or incorrect
4. Document any discrepancies

### **Step 5: Run and Iterate**

1. Run full test suite
2. Analyze failures
3. Fix test expectations or report SDK bugs
4. Generate comprehensive HTML report
5. Document coverage metrics

---

## 📊 Expected Outcomes

### **After Phase 1 (Parameter Validation):**
- Completion: 30/45 tests (67% → 100% parameter coverage)
- Transcription: 11/18 tests (61% → 100% parameter coverage)
- Translation: 3/9 tests (33% → 100% parameter coverage)
- RAG: 7/15 tests (47% → 100% parameter coverage)
- Embedding: 13/18 tests (72% → 100% parameter coverage)

### **After Phase 2 (New APIs):**
- Multimodal: 0/9 tests → 9/9 (100%)
- Delegated Inference: 0/5 tests → 5/5 (100%)

### **After Phase 3 (Error Handling):**
- Error tests: 0/30 → 30/30 (100%)

### **Total Expected:**
- Current: 84 tests
- After enhancements: ~170 tests
- Target pass rate: >85%

---

## 🎯 Success Criteria

✅ All SDK example parameters covered
✅ Every API has at least 3 error handling tests
✅ Pass rate >85% with comprehensive coverage
✅ HTML report shows detailed parameter variations
✅ Documentation updated with test coverage metrics
✅ All tests use correct parameters per SDK examples

---

## 📝 Next Steps

1. **Review SDK examples** (you do this manually or I scrape GitHub)
2. **Prioritize enhancements** (start with Phase 1)
3. **Implement in batches** (10-20 tests at a time)
4. **Test and validate** after each batch
5. **Generate reports** and iterate

---

## 🔗 References

- SDK Examples: https://github.com/tetherto/qvac-sdk/tree/main/examples
- Current Test Suite: `qvac-test-producer/test-builders.ts`
- Test Executors: `qvac-test-consumer-*/test-executor.ts`
- Latest Report: `reports/batch-report-2025-10-23T17-18-24-807Z.html`

