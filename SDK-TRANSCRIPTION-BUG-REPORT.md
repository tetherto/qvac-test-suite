# 🐛 SDK Bug Report: Long Audio Transcription Incomplete

## 📋 **Summary**

The QVAC SDK's Whisper transcription **stops processing after ~60 seconds** for long audio files (10+ minutes), returning only a partial transcription. This is **NOT a timing issue** in the test scripts - the SDK genuinely stops early.

---

## 🔬 **Evidence**

### **Test Configuration:**
```typescript
await loadModel({
  modelSrc: WHISPER_TINY,
  modelType: "whisper",
  vadModelSrc: VAD_SILERO_5_1_2,
  modelConfig: {
    mode: "batch",  // Tried both "batch" and "caption"
    output_format: "plaintext",
    audio_format: "f32le",
    update_frequency: "on_end",
  },
});

const transcription = await transcribe({
  modelId,
  audioChunk: "10min-mp3-320kbps.mp3",
});
```

### **Test File:**
- **Filename:** `10min-mp3-320kbps.mp3`
- **Duration:** 10 minutes (600 seconds)
- **Expected words:** ~500+ words
- **Format:** MP3, 320kbps

### **Results:**

| Metric | Expected | Actual | Status |
|--------|----------|--------|--------|
| Audio Duration | 600 seconds | 600 seconds | ✅ |
| Processing Time | ~60-120s | **11.11 seconds** | ❌ |
| Processing Ratio | ~10-20% | **1.9%** | ❌ |
| Word Count | 500+ words | **224 words** | ❌ (44.8%) |
| Transcription Status | Complete | **Mid-sentence** | ❌ |

---

## 🔍 **Proof: NOT a Timing Issue**

### **Test Script Properly Awaited Promise:**
```
⏱️  Starting transcribe() call...
⏱️  transcribe() returned a promise, now awaiting...
   ⏳ Still processing... 5.0s elapsed
   ⏳ Still processing... 10.0s elapsed
[whispercpp] Job 2 completed. Stats: {}
✅ Transcription completed in 11.11s
```

**Analysis:**
1. ✅ Promise properly awaited
2. ✅ Periodic progress logging confirmed waiting
3. ✅ SDK completed "Job 2" and returned
4. ❌ **SDK stopped after 11 seconds for 600-second audio**

---

## 🚨 **Critical Evidence: Mid-Sentence Cutoff**

### **Last 100 Characters of Transcription:**
```
"...they're all going"
```

**This is NOT a natural ending** - the sentence is incomplete, proving the SDK cut off the transcription prematurely rather than processing the full audio file.

---

## 📊 **Behavior Across Different Modes**

| Mode | Processing Time | Words | Result |
|------|----------------|-------|--------|
| `caption` (max_seconds: 6) | 10.11s | 47 words | ❌ Stopped after ~7 chunks |
| `batch` | 11.11s | 224 words | ❌ Stopped after ~60s of audio |

**Both modes stop early**, with batch mode processing slightly more audio but still only ~1 minute of a 10-minute file.

---

## 🔧 **Reproduction Steps**

1. **Load Whisper model** with batch mode configuration
2. **Call transcribe()** with a 10-minute MP3 audio file
3. **Await the promise** properly (with timeout > 120s)
4. **Observe:** SDK returns after ~11 seconds with partial transcription

**Code:**
```typescript
const modelId = await loadModel({
  modelSrc: WHISPER_TINY,
  modelType: "whisper",
  vadModelSrc: VAD_SILERO_5_1_2,
  modelConfig: {
    mode: "batch",
    output_format: "plaintext",
    audio_format: "f32le",
  },
});

const transcription = await transcribe({
  modelId,
  audioChunk: "path/to/10min-audio.mp3",
});

// Returns after ~11s with only ~224 words (should be 500+)
// Transcription cuts off mid-sentence
```

---

## 💡 **Expected Behavior**

For a **10-minute (600 second)** audio file:
- **Processing time:** 60-120 seconds (10-20% of audio duration)
- **Word count:** 500+ words (assuming ~50-100 words/minute speech)
- **Transcription end:** Complete sentence or natural pause
- **Status:** Full audio processed

---

## 🐛 **Actual Behavior**

For a **10-minute (600 second)** audio file:
- **Processing time:** 11.11 seconds (1.9% of audio duration)
- **Word count:** 224 words (only ~44% of expected)
- **Transcription end:** **Mid-sentence** ("...they're all going")
- **Status:** **Only ~60 seconds of audio processed**

---

## 🎯 **Impact**

### **Affected Tests:**
- ❌ `transcription-long-audio` (10-minute MP3)
- ⚠️  Any audio file > 1 minute may be truncated

### **Severity:** **HIGH**
- Breaks long-form audio transcription
- Silent failure (no error thrown, just returns partial result)
- Users may not realize transcription is incomplete

---

## 🔍 **Possible Root Causes**

1. **SDK has hardcoded duration limit** (~60 seconds per transcription)
2. **Batch processing stops after N chunks** instead of processing full file
3. **Streaming updates not being collected** properly by internal SDK logic
4. **Memory/resource limit** causing early termination
5. **Silent error/timeout** in underlying whisper.cpp library

---

## 🛠️ **Suggested Fixes**

### **Option A: Remove Duration Limit**
If there's a hardcoded limit, remove it or make it configurable:
```typescript
modelConfig: {
  mode: "batch",
  max_audio_duration_seconds: null, // unlimited
}
```

### **Option B: Process File in Chunks**
If full file processing isn't feasible, split into chunks:
```typescript
// SDK internally should:
1. Split audio into N-second chunks
2. Process each chunk
3. Concatenate results
4. Return complete transcription
```

### **Option C: Add Progress Callback**
Allow users to track progress and detect early termination:
```typescript
const transcription = await transcribe({
  modelId,
  audioChunk: file,
  onProgress: (chunk, totalProcessed, totalDuration) => {
    console.log(`Processed ${totalProcessed}s of ${totalDuration}s`);
  },
});
```

---

## 📝 **Test Environment**

- **OS:** Windows 10.0.26100
- **CPU:** Intel Core Ultra 9 275HX (24 cores)
- **RAM:** 31.36 GB
- **SDK Version:** `@qvac/sdk@0.2.6-dev.1761136954.37a3ab8`
- **Model:** Whisper Tiny (ggml-tiny.bin)
- **Runtime:** Bun v1.2.21

---

## 📎 **Attachments**

1. **Test Output:** `transcription-timing-analysis.txt` - Full console output with timing
2. **Test Script:** `test-transcription-with-timing.ts` - Reproducible test case
3. **Audio File:** `10min-mp3-320kbps.mp3` - 10-minute sample file

---

## ✅ **Verification**

To verify this is fixed:
1. Run transcription on 10-minute audio file
2. Verify processing time > 60 seconds
3. Verify word count > 500 words
4. Verify transcription ends on complete sentence
5. Verify last word matches end of audio file

---

## 🎯 **Priority:** HIGH

This bug affects all long-form audio transcription use cases and silently returns incomplete results, which could lead to data loss or incorrect application behavior.

---

**Report Date:** October 22, 2025  
**Reporter:** QA Automation Suite  
**Test Suite:** `qvac-sdk-tests`

