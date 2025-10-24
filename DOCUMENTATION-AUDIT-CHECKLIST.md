# Documentation Audit Checklist

## 🎯 How to Use This Checklist

For each API, visit the documentation page and fill in the findings below.

---

## 1. **Model Loading**

**URL:** https://tether-2.gitbook.io/qvac-by-tether-or-reference/y2AsIh94H9DJ1pIBCNj9/sdk/model-loading

### ✅ Parameters to Verify:

| Parameter | Documented? | Type Correct? | Notes |
|-----------|-------------|---------------|-------|
| `modelSrc` | ⏳ | ⏳ | Check if LLAMA_3_2_1B_INST_Q4_0 constant documented |
| `modelType` | ⏳ | ⏳ | Check: "llm", "whisper", "embedding" |
| `modelConfig.ctx_size` | ⏳ | ⏳ | Default value? Range? |
| `modelConfig.gpu_layers` | ⏳ | ⏳ | Default 99? |
| `modelConfig.device` | ⏳ | ⏳ | "gpu" \| "cpu" |
| `modelConfig.system_prompt` | ⏳ | ⏳ | For LLM only? |
| `modelConfig.n_discarded` | ⏳ | ⏳ | **WE USE THIS!** Is it documented? |
| `modelConfig.verbosity` | ⏳ | ⏳ | Values: -1, 0, 1? |

### 📝 Working Code (Our Tests):
```typescript
await loadModel({
  modelSrc: LLAMA_3_2_1B_INST_Q4_0,
  modelType: "llm",
  modelConfig: {
    ctx_size: 4096,
    gpu_layers: 99,
    device: "gpu",
    system_prompt: "You are a helpful assistant.",
    n_discarded: 256,  // ← CHECK IF DOCUMENTED
  },
});
```

### 🐛 **Issues Found:**
```
[Document issues here]
```

---

## 2. **Completion**

**URL:** https://tether-2.gitbook.io/qvac-by-tether-or-reference/y2AsIh94H9DJ1pIBCNj9/sdk/completion

### ✅ Parameters to Verify:

| Parameter | Documented? | Type Correct? | Range/Default | Notes |
|-----------|-------------|---------------|---------------|-------|
| `modelId` | ⏳ | ⏳ | string (required) | |
| `prompt` | ⏳ | ⏳ | string (required) | |
| `max_tokens` | ⏳ | ⏳ | number, 1-4096 | Default? |
| `temperature` | ⏳ | ⏳ | number, 0.0-2.0 | Default 1.0? |
| `top_p` | ⏳ | ⏳ | number, 0.0-1.0 | Default 1.0? |
| `stop` | ⏳ | ⏳ | string[], max 4 | Optional? |
| `stream` | ⏳ | ⏳ | boolean | Default false? |
| `seed` | ⏳ | ⏳ | number | For reproducibility |
| `frequency_penalty` | ⏳ | ⏳ | number, -2.0 to 2.0 | Default 0? |
| `presence_penalty` | ⏳ | ⏳ | number, -2.0 to 2.0 | Default 0? |

### 📝 Return Type to Verify:

Is this documented correctly?
```typescript
interface CompletionResult {
  tokenStream: ReadableStream;
  text: Promise<string>;
  stats: Promise<{ TTFT: number, TPS: number, ... }>;
}
```

### 🐛 **Issues Found:**
```
[Document issues here]
```

---

## 3. **Transcription**

**URL:** https://tether-2.gitbook.io/qvac-by-tether-or-reference/y2AsIh94H9DJ1pIBCNj9/sdk/transcription

### ✅ Parameters to Verify:

| Parameter | Documented? | Type Correct? | Notes |
|-----------|-------------|---------------|-------|
| `modelId` | ⏳ | ⏳ | string (required) |
| `audioPath` | ⏳ | ⏳ | string (required) |
| `language` | ⏳ | ⏳ | string (optional) - auto-detect if omitted |
| `translate` | ⏳ | ⏳ | **IMPORTANT:** boolean, translate to English |
| `mode` | ⏳ | ⏳ | "caption" \| "batch" |
| `max_seconds` | ⏳ | ⏳ | number (for caption mode) |
| `min_seconds` | ⏳ | ⏳ | number (for caption mode) |

### 📝 Working Code (Our Tests):
```typescript
await runTranscribe({
  modelId,
  audioPath: "../shared-test-data/audio/test.wav",
  // language: "en", ← IS THIS OPTIONAL DOCUMENTED?
  // translate: true, ← IS THIS DOCUMENTED?
});
```

### 🐛 **Issues Found:**
```
[Document issues here]
```

---

## 4. **Translation** ✅ KNOWN ISSUES

**URL:** https://tether-2.gitbook.io/qvac-by-tether-or-reference/y2AsIh94H9DJ1pIBCNj9/sdk/translation

### ❌ **CONFIRMED ISSUES:**

1. **Missing Parameter:** `modelType: "llm"` (REQUIRED)
2. **Missing Parameter:** `stream: false` (REQUIRED)
3. **Wrong Return Type:** Docs say `Promise<string>`, actually `{ text: Promise<string>, ... }`

### 📝 What Documentation Says:
```typescript
const result = await translate({
  modelId,
  text: engText,
  from: "en",
  to: "it",
});
```

### ✅ What Actually Works:
```typescript
const result = translate({
  modelId,
  text: engText,
  from: "en",
  to: "it",
  modelType: "llm",  // ❌ MISSING IN DOCS
  stream: false,     // ❌ MISSING IN DOCS
});

const translatedText = await result.text; // ❌ DOCS SAY: await translate()
```

### 🐛 **Status:** REPORTED, NEEDS DOCUMENTATION UPDATE

---

## 5. **Multimodal**

**URL:** https://tether-2.gitbook.io/qvac-by-tether-or-reference/y2AsIh94H9DJ1pIBCNj9/sdk/multimodal

### ✅ Parameters to Verify:

| Parameter | Documented? | Type Correct? | Notes |
|-----------|-------------|---------------|-------|
| `modelId` | ⏳ | ⏳ | string (required) |
| `imagePath` | ⏳ | ⏳ | string (required?) |
| `imageUrl` | ⏳ | ⏳ | string (alternative?) |
| `prompt` | ⏳ | ⏳ | string (required) |
| `max_tokens` | ⏳ | ⏳ | number (optional) |

### 📝 Questions:
- Supported image formats?
- Return type same as completion?
- Can it handle multiple images?

### 🐛 **Issues Found:**
```
[Document issues here]
```

---

## 6. **Text Embeddings**

**URL:** https://tether-2.gitbook.io/qvac-by-tether-or-reference/y2AsIh94H9DJ1pIBCNj9/sdk/text-embeddings

### ✅ Parameters to Verify:

| Parameter | Documented? | Type Correct? | Notes |
|-----------|-------------|---------------|-------|
| `modelId` | ⏳ | ⏳ | string (required) |
| `text` | ⏳ | ⏳ | string (required) |

### 📝 Return Type to Verify:

What does `embed()` return?
```typescript
const embedding = await runEmbed({ modelId, text });
// embedding is: number[]? Float32Array? object?
```

### 🐛 **Issues Found:**
```
[Document issues here]
```

---

## 7. **RAG**

**URL:** https://tether-2.gitbook.io/qvac-by-tether-or-reference/y2AsIh94H9DJ1pIBCNj9/sdk/rag

### ✅ Parameters to Verify:

| Parameter | Documented? | Type Correct? | Default | Notes |
|-----------|-------------|---------------|---------|-------|
| `modelId` | ⏳ | ⏳ | - | string (required) |
| `documentPath` | ⏳ | ⏳ | - | string (required?) |
| `documentContent` | ⏳ | ⏳ | - | string (alternative?) |
| `chunkSize` | ⏳ | ⏳ | 500? | number |
| `chunkOverlap` | ⏳ | ⏳ | 50? | number |
| `query` (for retrieval) | ⏳ | ⏳ | - | string |
| `topK` (for retrieval) | ⏳ | ⏳ | 5? | number |

### 📝 Working Code (Our Tests):
```typescript
await ragSaveEmbeddings({
  modelId,
  documentFile: "document.txt",
  chunkSize: 500,
  chunkOverlap: 50,
});
```

### 🐛 **Issues Found:**
```
[Document issues here]
```

---

## 8. **Delegated Inference**

**URL:** https://tether-2.gitbook.io/qvac-by-tether-or-reference/y2AsIh94H9DJ1pIBCNj9/sdk/delegated-inference

### ✅ Parameters to Verify:

| Parameter | Documented? | Type Correct? | Notes |
|-----------|-------------|---------------|-------|
| `delegate` | ⏳ | ⏳ | object? |
| `peerId` | ⏳ | ⏳ | string? |
| `timeout` | ⏳ | ⏳ | number? |

### 📝 Questions:
- How to discover peers?
- Fallback behavior?
- Configuration options?

### 🐛 **Issues Found:**
```
[Document issues here]
```

---

## 📋 **Summary Template**

After auditing all pages, create a summary:

### ✅ **Accurate Documentation:**
```
- [List APIs with complete, correct documentation]
```

### ⚠️ **Missing Parameters:**
```
- Translation: modelType, stream (CRITICAL)
- [Other missing params]
```

### ❌ **Incorrect Information:**
```
- Translation: Return type wrong
- [Other incorrect info]
```

### 📝 **Needs Clarification:**
```
- [Ambiguous or unclear documentation]
```

---

## 🎯 **Action Items**

Based on audit findings:

1. **Report to SDK Team:**
   - Create GitHub issues for each discrepancy
   - Reference this audit and our working code

2. **Update Our Tests:**
   - Ensure we use correct parameters everywhere
   - Add missing parameter tests

3. **Document Workarounds:**
   - If documentation is outdated, document what works
   - Add comments in our code

4. **Create Parameter Reference:**
   - Comprehensive parameter guide based on what actually works
   - Include ranges, defaults, and examples

---

## 📊 **Progress Tracking**

| API | Doc Reviewed | Issues Found | Issues Reported | Tests Updated |
|-----|--------------|--------------|-----------------|---------------|
| Model Loading | ⏳ | ⏳ | ⏳ | ⏳ |
| Completion | ⏳ | ⏳ | ⏳ | ⏳ |
| Transcription | ⏳ | ⏳ | ⏳ | ⏳ |
| Translation | ✅ | ✅ | ⏳ | ✅ |
| Multimodal | ⏳ | ⏳ | ⏳ | ⏳ |
| Embeddings | ⏳ | ⏳ | ⏳ | ⏳ |
| RAG | ⏳ | ⏳ | ⏳ | ⏳ |
| Delegated | ⏳ | ⏳ | ⏳ | ⏳ |

---

## 🔗 **Quick Reference**

- **Base Documentation:** https://tether-2.gitbook.io/qvac-by-tether-or-reference/y2AsIh94H9DJ1pIBCNj9/sdk
- **SDK Examples:** https://github.com/tetherto/qvac-sdk/tree/main/examples
- **Our Test Suite:** `qvac-test-producer/test-builders.ts`
- **Working Fixes:** Search commits for "fix:" tags

