# Implementation Roadmap

## 🎯 Goal: Comprehensive Test Coverage Enhancement

Based on TEST-COVERAGE-ENHANCEMENT-PLAN.md, here's the step-by-step implementation roadmap.

---

## 📅 Sprint 1: Audit & Fix Existing Tests (1-2 days)

### Task 1.1: Review SDK Examples
**Action:** Manually review each example file from https://github.com/tetherto/qvac-sdk/tree/main/examples

| Example File | Parameters to Extract | Status |
|-------------|----------------------|--------|
| `completion/completion-basic.ts` | prompt, max_tokens, temperature | ⏳ TODO |
| `completion/completion-streaming.ts` | stream, temperature | ⏳ TODO |
| `transcription/transcription-basic.ts` | audioPath, language, mode | ⏳ TODO |
| `translation/translation-llm.ts` | text, from, to, modelType, stream | ✅ DONE |
| `embeddings/embeddings-basic.ts` | text, modelId | ⏳ TODO |
| `rag/rag-basic.ts` | documentPath, chunkSize, chunkOverlap | ⏳ TODO |
| `multimodal/multimodal-basic.ts` | imagePath, prompt | ⏳ TODO |

### Task 1.2: Create Parameter Matrix
**Action:** Document all valid parameter ranges

```typescript
// completion.ts parameters
interface CompletionParams {
  prompt: string;              // required, min 1 char
  max_tokens?: number;         // optional, default 100, range 1-4096
  temperature?: number;        // optional, default 1.0, range 0.0-2.0
  top_p?: number;              // optional, default 1.0, range 0.0-1.0
  stop?: string[];             // optional, max 4 sequences
  stream?: boolean;            // optional, default false
  seed?: number;               // optional, for reproducibility
  frequency_penalty?: number;  // optional, range -2.0 to 2.0
  presence_penalty?: number;   // optional, range -2.0 to 2.0
}
```

### Task 1.3: Audit Current Tests Against Examples
**Action:** Compare our tests with SDK examples

**Files to check:**
- `qvac-test-producer/test-builders.ts` (all build methods)
- `qvac-test-consumer-desktop/test-executor.ts` (all handlers)
- `qvac-test-consumer-mobile/test-executor.ts` (all handlers)

**Checklist:**
- [ ] Completion tests use all documented parameters?
- [ ] Transcription tests use correct mode/language parameters?
- [ ] Translation tests use modelType + stream? ✅ FIXED
- [ ] RAG tests use correct chunkSize/chunkOverlap?
- [ ] Embedding tests cover all text types?

### Task 1.4: Fix Parameter Mismatches
**Action:** Update any tests not matching SDK examples

---

## 📅 Sprint 2: Completion Parameter Coverage (2-3 days)

### Task 2.1: Add top_p Tests
```typescript
// In test-builders.ts:
buildCompletionTopP00Test(): TestDefinition {
  return {
    testId: "completion-top-p-00",
    payload: JSON.stringify({
      testId: "completion-top-p-00",
      params: {
        prompt: "Count to 5",
        max_tokens: 50,
        temperature: 1.0,
        top_p: 0.0,  // Most deterministic
      },
      expectation: {
        validation: "contains-numbers",
        keywords: ["1", "2", "3", "4", "5"],
      },
    }),
    dependency: "completion",
    estimatedDurationMs: 8000,
  };
}

buildCompletionTopP05Test(): TestDefinition { /* top_p: 0.5 */ }
buildCompletionTopP10Test(): TestDefinition { /* top_p: 1.0 */ }
```

### Task 2.2: Add Penalty Tests
```typescript
buildCompletionFrequencyPenaltyTest(penalty: number): TestDefinition {
  return {
    testId: `completion-frequency-penalty-${penalty.toFixed(1).replace('.', '')}`,
    payload: JSON.stringify({
      params: {
        prompt: "Repeat the word 'test' five times",
        frequency_penalty: penalty,  // -2.0, 0.0, 2.0
      },
      expectation: {
        validation: "frequency-check",
        // With high penalty, should avoid repetition
      },
    }),
  };
}
```

### Task 2.3: Add Seed Test (Reproducibility)
```typescript
buildCompletionSeedTest(): TestDefinition {
  return {
    testId: "completion-seed-reproducibility",
    payload: JSON.stringify({
      params: {
        prompt: "Generate a random number",
        seed: 42,  // Fixed seed for reproducibility
        temperature: 1.0,
      },
      expectation: {
        validation: "reproducible",
        // Run twice, expect same output
      },
    }),
  };
}
```

---

## 📅 Sprint 3: Transcription Parameter Coverage (2 days)

### Task 3.1: Add Language Hint Tests
```typescript
buildTranscriptionWithLanguageTest(langCode: string): TestDefinition {
  return {
    testId: `transcription-language-${langCode}`,
    payload: JSON.stringify({
      params: {
        audioPath: "../shared-test-data/audio/english.wav",
        language: langCode,  // "en", "es", "fr", etc.
      },
      expectation: {
        validation: "contains-keywords",
        keywords: ["test", "audio"],
      },
    }),
  };
}
```

### Task 3.2: Add Translation Test
```typescript
buildTranscriptionWithTranslationTest(): TestDefinition {
  return {
    testId: "transcription-translate-to-english",
    payload: JSON.stringify({
      params: {
        audioPath: "../shared-test-data/audio/spanish.wav",
        translate: true,  // Translate to English
      },
      expectation: {
        validation: "contains-keywords",
        keywords: ["hello", "test"],  // English words
      },
    }),
  };
}
```

### Task 3.3: Add Mode Comparison Test
```typescript
buildTranscriptionModeComparisonTest(): TestDefinition {
  // Test same audio with "caption" vs "batch" mode
  // Verify different behaviors
}
```

---

## 📅 Sprint 4: RAG Parameter Coverage (2 days)

### Task 4.1: Add Chunk Size Variations
```typescript
buildRagChunkSizeTest(chunkSize: number, chunkOverlap: number): TestDefinition {
  return {
    testId: `rag-chunk-${chunkSize}-overlap-${chunkOverlap}`,
    payload: JSON.stringify({
      params: {
        documentFile: "large-document.txt",
        chunkSize,      // 100, 500, 1000, 5000
        chunkOverlap,   // 0, 50, 100, 500
        query: "What is the main topic?",
      },
      expectation: {
        validation: "has-embeddings",
      },
    }),
  };
}
```

### Task 4.2: Add topK Tests
```typescript
buildRagTopKTest(topK: number): TestDefinition {
  return {
    testId: `rag-top-k-${topK}`,
    payload: JSON.stringify({
      params: {
        documentFile: "knowledge-base.txt",
        query: "Tell me about QVAC",
        topK,  // 1, 5, 10, 20
      },
      expectation: {
        validation: "result-count",
        expectedCount: topK,
      },
    }),
  };
}
```

---

## 📅 Sprint 5: Translation Parameter Coverage (1 day)

### Task 5.1: Add Auto-Detect Test
```typescript
buildTranslationAutoDetectTest(): TestDefinition {
  return {
    testId: "translation-auto-detect",
    payload: JSON.stringify({
      params: {
        text: "Bonjour, comment ça va?",
        // from: omitted for auto-detect
        to: "en",
        modelType: "llm",
        stream: false,
      },
      expectation: {
        validation: "contains-keywords",
        keywords: ["hello", "how"],
      },
    }),
  };
}
```

### Task 5.2: Add Multiple Language Pairs
```typescript
buildTranslationLanguagePairTest(from: string, to: string, text: string): TestDefinition {
  // Test: en→fr, en→de, en→ja, es→en, fr→en, etc.
}
```

### Task 5.3: Add Long Text Test
```typescript
buildTranslationLongTextTest(): TestDefinition {
  return {
    testId: "translation-long-text",
    payload: JSON.stringify({
      params: {
        text: longParagraph,  // 1000+ words
        from: "en",
        to: "es",
        modelType: "llm",
        stream: false,
      },
    }),
  };
}
```

---

## 📅 Sprint 6: Multimodal Tests (NEW) (3 days)

### Task 6.1: Implement Multimodal Test Executor
```typescript
// In test-executor.ts:
private async multimodal(modelId: string | null, params: any, expectation: any): Promise<TestResult> {
  if (!modelId) {
    return { output: "No multimodal model loaded", passed: false };
  }

  try {
    const { imagePath, prompt, max_tokens } = params;
    
    // Need to import multimodal function from SDK
    const result = runMultimodal({
      modelId,
      imagePath,
      prompt,
      max_tokens,
    });

    const output = await result.text;
    
    // Validate output against expectation
    return {
      output: `Multimodal output: ${output}`,
      passed: validateExpectation(output, expectation),
    };
  } catch (error: any) {
    return { output: `Error: ${error.message}`, passed: false };
  }
}
```

### Task 6.2: Add Test Data
```bash
# Create test images:
shared-test-data/images/
  - simple-text.png (OCR test)
  - document.jpg (document analysis)
  - diagram.png (diagram understanding)
  - photo.jpg (image description)
  - corrupted.png (error handling)
```

### Task 6.3: Build Multimodal Tests
```typescript
buildMultimodalBasicTest(): TestDefinition
buildMultimodalOcrTest(): TestDefinition
buildMultimodalImageDescriptionTest(): TestDefinition
buildMultimodalDiagramTest(): TestDefinition
buildMultimodalInvalidImageTest(): TestDefinition
```

---

## 📅 Sprint 7: Error Handling Tests (2-3 days)

### Task 7.1: Missing Parameter Tests
```typescript
// For each API:
buildCompletionMissingPromptTest(): TestDefinition {
  return {
    testId: "completion-missing-prompt",
    payload: JSON.stringify({
      params: {
        // prompt: omitted
        max_tokens: 50,
      },
      expectation: {
        validation: "expects-error",
        errorType: "MISSING_REQUIRED_PARAMETER",
      },
    }),
  };
}
```

### Task 7.2: Invalid Type Tests
```typescript
buildCompletionInvalidTypeTest(): TestDefinition {
  return {
    testId: "completion-invalid-temperature-type",
    payload: JSON.stringify({
      params: {
        prompt: "Test",
        temperature: "hot",  // Should be number
      },
      expectation: {
        validation: "expects-error",
        errorType: "INVALID_PARAMETER_TYPE",
      },
    }),
  };
}
```

### Task 7.3: Out-of-Range Tests
```typescript
buildCompletionOutOfRangeTest(): TestDefinition {
  return {
    testId: "completion-temperature-out-of-range",
    payload: JSON.stringify({
      params: {
        prompt: "Test",
        temperature: 5.0,  // Max is 2.0
      },
      expectation: {
        validation: "expects-error",
        errorType: "VALUE_OUT_OF_RANGE",
      },
    }),
  };
}
```

---

## 📅 Sprint 8: Validation & Documentation (1 day)

### Task 8.1: Run Full Test Suite
```bash
# Terminal 1:
bun run qvac-test-producer/batch-orchestrator.ts

# Terminal 2:
bun run qvac-test-consumer-desktop/batch-consumer.ts
```

### Task 8.2: Generate Comprehensive Report
```bash
# Should see:
Total Tests: ~170
Passed: ~145 (85%+)
Failed: ~25 (mostly expected errors)
```

### Task 8.3: Update Documentation
- Update README.md with new test count
- Document all parameter ranges tested
- Create parameter reference guide
- Document known SDK limitations

---

## 🎯 Success Metrics

After all sprints completed:

✅ **Coverage:**
- Completion: 100% parameter coverage (15+ params tested)
- Transcription: 100% parameter coverage (8+ params tested)
- Translation: 100% parameter coverage (5+ params tested)
- RAG: 100% parameter coverage (6+ params tested)
- Embedding: 100% coverage
- Multimodal: 100% coverage (NEW)
- Error Handling: 30+ error scenarios covered

✅ **Quality:**
- Pass rate: >85%
- All SDK examples validated
- Comprehensive HTML reports
- Clear documentation

✅ **Robustness:**
- Every API has error handling tests
- Edge cases covered
- Real-world scenarios tested

---

## 📝 Next Immediate Actions

1. **YOU:** Review SDK examples on GitHub manually
2. **YOU:** Provide any parameter details I'm missing
3. **ME:** Start Sprint 1 (audit existing tests)
4. **ME:** Implement Sprint 2 (completion parameters)
5. **BOTH:** Iterate and validate

Ready to start? 🚀

