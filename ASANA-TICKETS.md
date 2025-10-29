# Asana Tickets - Concise Format
## 12 SDK v0.2.0 Bugs - Ready to Copy/Paste
**(Consolidated from 15 test failures)**

---

## TICKET 1: [SDK] Code Embedding Causes GGML Crash (All File Types)

**Priority:** 🔴 P0 Critical  
**Labels:** `bug`, `sdk`, `p0`, `embedding`, `crash`, `ggml`  
**Tests:** `embed-python-code`, `embed-javascript-code`, `embed-json-data`, `embed-html-content`

**Description:**
Embedding code files (Python, JavaScript, JSON, HTML) triggers unrecoverable C++ crash: `GGML_ASSERT(i01 >= 0 && i01 < ne01) failed at ggml-cpu/ops.cpp:5358`

**Reproduce:**
```javascript
// All these crash:
embed({ modelId: "GTE_LARGE_FP16", text: pythonCode })
embed({ modelId: "GTE_LARGE_FP16", text: jsCode })
embed({ modelId: "GTE_LARGE_FP16", text: jsonData })
embed({ modelId: "GTE_LARGE_FP16", text: htmlContent })
```

**Expected:** Return embedding vector for all code types  
**Actual:** SDK crashes with GGML assertion failure, no error handling

**Impact:** Blocks all code embedding features (4 tests failing)

**Test Files:**
- `shared-test-data/code/data_analysis.py`
- `shared-test-data/code/interactive_gallery.js`
- `shared-test-data/code/api_response.json`
- `shared-test-data/code/portfolio_website.html`

**SDK:** @qvac/sdk@0.2.0  
**Reproducible:** 100%  
**Root Cause:** Array index out-of-bounds in GGML tensor operations

---

## TICKET 2: [SDK] RAG Small Document Processing Hangs (60s timeout)

**Priority:** 🔴 P0 Critical  
**Labels:** `bug`, `sdk`, `p0`, `rag`, `timeout`  
**Test:** `rag-small-document-poem`

**Description:**
RAG processing hangs even for tiny 400-char documents. Times out after 60s with no response.

**Reproduce:**
```javascript
ragSaveEmbeddings({
  modelId: "GTE_LARGE_FP16",
  documentPath: "ocean_waves_poem.txt", // 400 chars
  chunkSize: 200,
  chunkOverlap: 50
})
// Hangs for 60s, then times out
```

**Expected:** Generate 1-2 chunks in <5s  
**Actual:** Timeout at 60s

**Impact:** RAG completely unusable - even 400-char poem can't complete

**Files:** `shared-test-data/documents/ocean_waves_poem.txt` (400 chars)  
**SDK:** @qvac/sdk@0.2.0

---

## TICKET 3: [SDK] RAG Medium Document Processing Hangs (90s timeout)

**Priority:** 🔴 P0 Critical  
**Labels:** `bug`, `sdk`, `p0`, `rag`, `timeout`  
**Test:** `rag-medium-document-10kb`

**Description:**
RAG hangs on medium documents (~10KB), times out at 90s

**Expected:** Generate 10+ chunks in <20s  
**Actual:** Timeout at 90s

**Impact:** Cannot process typical documentation

**Files:** `shared-test-data/documents/mountain_hiking_guide.txt` (10KB)  
**SDK:** @qvac/sdk@0.2.0  
**Note:** Same issue as Ticket #2

---

## TICKET 4: [SDK] RAG Large Document Processing Hangs (120s timeout)

**Priority:** 🔴 P0 Critical  
**Labels:** `bug`, `sdk`, `p0`, `rag`, `timeout`  
**Test:** `rag-large-document-32kb`

**Description:**
RAG hangs on large documents (~32KB), times out at 120s

**Expected:** Generate 15+ chunks in <60s  
**Actual:** Timeout at 120s

**Impact:** Cannot process large documents

**Files:** `shared-test-data/documents/desert_adventure_large.txt` (32KB)  
**SDK:** @qvac/sdk@0.2.0  
**Note:** Fix all RAG issues (Tickets #2-4) together

---

## TICKET 5: [SDK] Stop Sequences Parameter Ignored

**Priority:** 🟠 P1 High  
**Labels:** `bug`, `sdk`, `p1`, `completion`, `api`  
**Test:** `completion-stop-sequences`

**Description:**
`stopSequences` parameter is completely ignored by completion API

**Reproduce:**
```javascript
completion({
  prompt: "Count from 1 to 10",
  stopSequences: ["5"]
})
// Output: "4, 5, 6, 7, 8, 9, 10." - doesn't stop at "5"
```

**Expected:** Stop before "5"  
**Actual:** Continues generating past "5"

**Impact:** Cannot control LLM output boundaries

**SDK:** @qvac/sdk@0.2.0

---

## TICKET 6: [SDK] Multiple Stop Sequences Not Working

**Priority:** 🟠 P1 High  
**Labels:** `bug`, `sdk`, `p1`, `completion`, `api`  
**Test:** `completion-stop-sequences-multiple`

**Description:**
Multiple stop sequences in array are all ignored

**Reproduce:**
```javascript
stopSequences: ["5", "10"]
// Output: "1, 2, 3, 4, 5, 6, 7, 8, 9, 10"
```

**Impact:** Cannot use multiple stop conditions

**SDK:** @qvac/sdk@0.2.0  
**Note:** Related to Ticket #5

---

## TICKET 7: [SDK] maxTokens Parameter Not Enforced

**Priority:** 🟠 P1 High  
**Labels:** `bug`, `sdk`, `p1`, `completion`, `api`  
**Test:** `completion-max-tokens`

**Description:**
`maxTokens` parameter ignored - generates 10x more tokens than specified

**Reproduce:**
```javascript
completion({
  prompt: "Count from 1 to 100",
  maxTokens: 15
})
// Generates 153 tokens (10x more!)
```

**Expected:** ~15 tokens  
**Actual:** 153 tokens

**Impact:** Cannot control response length or token budgets

**SDK:** @qvac/sdk@0.2.0

---

## TICKET 8: [SDK] Seed Parameter Not Reproducible

**Priority:** 🟠 P1 High  
**Labels:** `bug`, `sdk`, `p1`, `completion`, `api`  
**Test:** `completion-seed-reproducibility`

**Description:**
Same `seed` produces different outputs each time

**Reproduce:**
```javascript
completion({
  prompt: "Pick a random number 1-100",
  seed: 12345
})
// Run 1: "67"
// Run 2: "53"  
// Run 3: Different again
```

**Impact:** Cannot reproduce results for testing/debugging

**SDK:** @qvac/sdk@0.2.0  
**Note:** Likely same root cause as Tickets #5-7

---

## TICKET 9: [SDK] M4A Audio Transcription Hangs

**Priority:** 🟠 P1 High  
**Labels:** `bug`, `sdk`, `p1`, `transcription`, `timeout`  
**Test:** `transcription-m4a`

**Description:**
M4A audio files hang for 60s with no response

**Expected:** Transcribe 5-second audio in <10s  
**Actual:** Timeout at 60s

**Impact:** M4A format (iOS) completely unusable

**Files:** `shared-test-data/audio/transcription-short.m4a`  
**SDK:** @qvac/sdk@0.2.0

---

## TICKET 10: [SDK] Long Prompts Timeout

**Priority:** 🟠 P1 High  
**Labels:** `bug`, `sdk`, `p1`, `completion`, `timeout`  
**Test:** `completion-long-prompt`

**Description:**
Long prompts (~2000 words) timeout after 60s

**Expected:** Process and respond within 30-60s  
**Actual:** Timeout at 60s

**Impact:** Cannot use long-context prompts for document Q&A

**SDK:** @qvac/sdk@0.2.0

---

## TICKET 11: [SDK] Long Audio Only Transcribes First Minute

**Priority:** 🟡 P2 Medium  
**Labels:** `bug`, `sdk`, `p2`, `transcription`, `known-issue`  
**Test:** `transcription-long-audio`

**Description:**
10-minute audio only transcribes first ~60 seconds

**Expected:** ~1500 words (full 10 min)  
**Actual:** ~59 words (1 minute)

**Impact:** Long-form transcription unusable

**Files:** `shared-test-data/audio/10min-mp3-320kbps.mp3`  
**SDK:** @qvac/sdk@0.2.0  
**Note:** Known issue across SDK versions

---

## TICKET 12: [SDK] Corrupted RAG Documents Hang (10s)

**Priority:** 🟡 P2 Medium  
**Labels:** `bug`, `sdk`, `p2`, `rag`, `error-handling`  
**Test:** `rag-corrupted-document`

**Description:**
Corrupted documents hang for 10s instead of immediate error

**Expected:** Reject with error in <1s  
**Actual:** Timeout at 10s

**Impact:** Poor error handling, no graceful degradation

**Files:** `shared-test-data/documents/sunset_beach_corrupted.txt`  
**SDK:** @qvac/sdk@0.2.0

---

## SUMMARY

**Total:** 12 bugs (consolidated from 15 test failures)  
**By Priority:** 4 P0 | 6 P1 | 2 P2  
**By Feature:** Code Embedding (1) | RAG (4) | Completion API (4) | Transcription (2) | Error Handling (1)

**Quick Wins:** Tickets #5-8 (API parameters - likely same root cause)  
**Critical Blockers:** 
- Ticket #1 (Code embedding GGML crashes - 4 tests failing)
- Tickets #2-4 (RAG completely unusable - 3 tests failing)

**Test Reports:** `reports/batch-report-2025-10-28T18-49-48-409Z.html`  
**SDK:** @qvac/sdk@0.2.0  
**Pass Rate:** 77/99 (77.8%)

**Note:** Ticket #1 represents 4 separate test failures (Python, JavaScript, JSON, HTML) - all same GGML root cause

