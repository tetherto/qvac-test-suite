# QVAC SDK - Bug Report for Dev Team
**Date:** October 22, 2025  
**SDK Version:** `0.2.6-dev.1761136954.37a3ab8`  
**Reporter:** QA Automation Team  
**Confidence:** 100% (All bugs reproduced consistently)

---

## 🚨 **5 CONFIRMED BUGS - Ready to Fix**

---

## 🔴 **CRITICAL BUG #1: Corrupted Audio Causes SDK Hang**

**Test:** `transcription-corrupted`, `transcription-corrupted-wav`

### Issue:
SDK hangs indefinitely when processing corrupted audio files instead of failing fast with an error.

### Evidence:
- **Input:** Corrupted MP3 and WAV files
- **Expected:** Fast-fail with error (<5 seconds)
- **Actual:** **90-second hang** (test timeout, no error returned)
- **Reproducibility:** 100% (both MP3 and WAV)

### Impact:
- **Severity:** CRITICAL ⚠️
- **Production Risk:** HIGH - One bad file freezes entire application
- **User Experience:** App becomes unresponsive

### Expected Behavior:
```javascript
try {
  const result = await transcribe({ modelId, audioFile: "corrupted.mp3" });
} catch (error) {
  // Should throw within 2-3 seconds
  console.error("Invalid audio format:", error.message);
}
```

### Reproduction:
1. Load Whisper model
2. Call `transcribe()` with corrupted audio file
3. Observe: SDK hangs, no error thrown
4. After 90 seconds: Test timeout

### Suggested Fix:
- Add audio file validation before processing
- Return error immediately if file is invalid
- Error: `"Invalid audio format"` or `"Corrupted audio file"`

---

## 🔴 **CRITICAL BUG #2: Long Audio Transcription Incomplete**

**Test:** `transcription-long-audio`

### Issue:
Only ~60 seconds of a 10-minute audio file is transcribed. SDK completes quickly but returns incomplete result.

### Evidence:
- **Input:** 10-minute MP3 (600 seconds)
- **Expected:** Full transcription (~1000+ words)
- **Actual:** **53 words** (only ~1 minute transcribed)
- **Duration:** 15.54s (SDK returns quickly)
- **Model Config:** `mode: "batch"` (correct for long audio)

### Impact:
- **Severity:** CRITICAL ⚠️
- **Data Loss:** 90% of audio content lost
- **Use Case Blocked:** Long-form transcription unusable

### Expected Behavior:
```javascript
const result = await transcribe({
  modelId,
  audioFile: "10-minute.mp3",
  mode: "batch"  // For long files
});

// Should return full transcription
// Expected: ~1000+ words
// Actual: 53 words (incomplete)
```

### Reproduction:
1. Load Whisper model with `mode: "batch"`
2. Transcribe 10-minute audio file
3. Observe: Only first ~60 seconds transcribed
4. SDK returns quickly without error

### Suggested Fix:
- Check Whisper model chunking logic
- Ensure all audio chunks are processed
- May be related to `max_seconds` limit

---

## 🟠 **HIGH PRIORITY BUG #3: Max Tokens Limit Ignored**

**Test:** `completion-max-tokens`

### Issue:
SDK completely ignores the `max_tokens` parameter in completion API.

### Evidence:
- **Parameter:** `max_tokens: 15`
- **Expected:** ≤15 tokens
- **Actual:** **141 tokens** (108 words)
- **Reproducibility:** 100%

### Response Example:
```
"Here's the count:

1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18"
```
*(Continues far beyond 15 tokens)*

### Impact:
- **Severity:** HIGH
- **API Control:** Applications cannot limit response length
- **Cost/Performance:** Cannot control token usage
- **UX:** Cannot guarantee short responses

### Expected Behavior:
```javascript
const result = await completion({
  modelId,
  history: [{ role: "user", content: "Count to 100" }],
  max_tokens: 15  // Should stop at ~15 tokens
});

await result.text;  // Should be ≤15 tokens
```

### Suggested Fix:
- Implement `max_tokens` in LLM inference config
- Stop generation when limit reached
- Respect this parameter alongside `stop` sequences

---

## 🟠 **HIGH PRIORITY BUG #4: Stop Sequences Not Working**

**Test:** `completion-stop-sequences`

### Issue:
SDK ignores the `stop` parameter - generation continues past stop sequence.

### Evidence:
- **Parameter:** `stop: ["5"]`
- **Expected:** Output "4," (stop when "5" detected)
- **Actual:** **"4, 5, 6, 7, 8, 9, 10."** (continued past stop)
- **Reproducibility:** 100%

### Impact:
- **Severity:** HIGH
- **Control Loss:** Cannot stop generation at specific tokens
- **Use Case:** Structured output generation broken
- **Format Control:** Cannot enforce output format

### Expected Behavior:
```javascript
const result = await completion({
  modelId,
  history: [{ role: "user", content: "Count from 4 to 10" }],
  stop: ["5"]  // Should stop when "5" appears
});

const text = await result.text;
// Expected: "4,"
// Actual: "4, 5, 6, 7, 8, 9, 10."
```

### Suggested Fix:
- Implement stop sequence detection in token generation
- Halt immediately when stop string is detected
- Return text up to (but not including) stop sequence

---

## 🟡 **MEDIUM PRIORITY BUG #5: System Message Ignored**

**Test:** `completion-system-message`

### Issue:
Model ignores system message instructions and generates verbose responses.

### Evidence:
- **System Message:** "You are a brief math assistant. Answer ONLY with the number."
- **Prompt:** "What is 15 + 27?"
- **Expected:** "42"
- **Actual:** **486-character verbose explanation** starting with "To calculate the sum of 15 and 27, we need to follow the order of operations..."

### Impact:
- **Severity:** MEDIUM
- **Behavior Control:** Cannot control model personality/behavior
- **Use Case:** Chatbot customization doesn't work
- **Prompt Length:** Wastes context window

### Expected Behavior:
```javascript
const result = await completion({
  modelId,
  system_prompt: "You are a brief math assistant. Answer ONLY with the number.",
  history: [{ role: "user", content: "What is 15 + 27?" }]
});

const text = await result.text;
// Expected: "42"
// Actual: Long explanation ignoring system prompt
```

### Possible Causes:
- System message not properly injected into model context
- Model-specific issue (Llama-3.2-1B may not follow instructions well)
- System prompt formatting issue

### Suggested Fix:
- Verify system message is passed to llama.cpp correctly
- Check if model supports system prompts
- Consider adding system message to every request

---

## 📊 **Testing Methodology**

### Test Environment:
- **Platform:** Windows 11 + WSL2
- **GPU:** NVIDIA (CUDA enabled)
- **Test Suite:** 76 automated tests
- **Test Coverage:** LLM, Whisper, Embeddings, RAG
- **Duration:** ~7 minutes per full run

### Validation:
- ✅ All bugs reproduced multiple times
- ✅ Test code reviewed and validated
- ✅ Expected behavior clearly defined
- ✅ No test framework issues involved

---

## 📁 **Additional Resources**

1. **Full Test Failure Analysis:** `TEST-FAILURE-ANALYSIS.md`
2. **Transcription Bug Details:** `SDK-TRANSCRIPTION-BUG-REPORT.md`
3. **Test Suite Report:** `reports/batch-report-2025-10-22T22-44-20-666Z.html`
4. **Test Code:** 
   - Producer: `qvac-test-producer/test-builders.ts`
   - Consumer: `qvac-test-consumer-desktop/test-executor.ts`

---

## ✅ **Action Items for Dev Team**

| Bug | Priority | Estimated Effort | Impact |
|-----|----------|------------------|--------|
| Corrupted audio hang | 🔴 CRITICAL | Medium | Production-blocking |
| Long audio incomplete | 🔴 CRITICAL | High | Feature-blocking |
| Max tokens ignored | 🟠 HIGH | Low | API compliance |
| Stop sequences ignored | 🟠 HIGH | Medium | API compliance |
| System message ignored | 🟡 MEDIUM | Medium | UX impact |

---

## 📞 **Contact**

**Questions or need more details?**
- All tests are automated and reproducible
- Can provide step-by-step reproduction
- Test code available in GitHub repo

**Ready to assist with:**
- Additional test runs
- Specific reproduction scenarios
- Validation after fixes

---

**Report Status:** ✅ **FINAL - Ready for Dev Team**  
**Confidence Level:** 100%  
**Date Generated:** October 22, 2025

