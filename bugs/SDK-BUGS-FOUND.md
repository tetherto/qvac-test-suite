# SDK Bugs & Issues Found During Testing

## 🐛 Active Bugs

### None - All Issues Resolved!
- **Steps to Reproduce**:
  ```typescript
  const modelId = await loadModel({
    modelSrc: WHISPER_TINY,
    modelType: "whisper",
    vadModelSrc: VAD_SILERO_5_1_2,
    modelConfig: { mode: "caption", output_format: "plaintext" }
  });
  
  await transcribe({ 
    modelId, 
    audioChunk: "/path/to/sample.mp3" 
  });
  // Error: Transcription failed: prompt.map is not a function
  ```
- **Expected Behavior**: Should transcribe MP3/M4A files like it does WAV files
- **Actual Behavior**: Throws "prompt.map is not a function" error
- **Error Message**: `Transcription failed: prompt.map is not a function`
- **SDK Version**: 0.10.1
- **Environment**: Windows 11, Bun 1.2.21
- **Date Found**: 2025-10-13
- **Severity**: Medium - Affects specific audio formats
- **Workaround**: Convert MP3/M4A to WAV before transcription (investigating)
- **Test Cases**: `transcription-mp3`, `transcription-m4a`
- **Evidence from Logs**:
  ```
  [consumer] received test: transcription-short-wav
  Detected encoded format: .wav, decoding before transcription...
  [llamacpp:llm] Starting inference with prompt: <ref *1> Readable {  ← WRONG! Should be [whispercpp]
  Error during transcription: TypeError: prompt.map is not a function
  ```
- **Why It Fails**: 
  - LLM addon expects `prompt` to be an array of messages
  - Gets audio stream (Readable) instead
  - Calls `prompt.map()` on a Readable stream → error
- **Note**: Original transcription test works because it uses old audio files, new files from `shared-test-data` trigger the bug

---

## ✅ Resolved Issues

### 1. Missing error.js File (FALSE ALARM - RESOLVED)
- **Status**: ✅ Not a bug - was transient issue
- **Initial Report**: error.js missing from npm package
- **Resolution**: Fresh install verification shows file exists
- **Tested**: Both Node.js and Bun can import SDK successfully
- **Date Verified**: 2025-10-13
- **Conclusion**: No bug to report

### 2. Transcription Routing Issue (FALSE ALARM - OUR BUG)
- **Status**: ✅ Not an SDK bug - was our test code bug
- **Initial Report**: transcribe() routes to wrong addon
- **Actual Issue**: Test code used wrong logic: `testId === "transcription"` instead of `testId.startsWith("transcription")`
- **Fix**: Changed model selection logic in consumer
- **Date Fixed**: 2025-10-13
- **Conclusion**: SDK is working correctly, no bug to report

### 3. Cache Corruption with v0.10.1 (RESOLVED)
- **Status**: ✅ Resolved - was cache issue, not SDK bug
- **Issue**: `getRPC is not a function` error
- **Root Cause**: Corrupted npm cache
- **Resolution**: Fresh install after clearing cache
- **Date Found**: 2025-10-13
- **Severity**: N/A (not an SDK bug)

### 2. Missing Peer Dependencies Documentation (POTENTIAL)
- **Status**: ⚠️ Minor - workaround available
- **Issue**: SDK requires explicit peer dependency installation for Node.js/Desktop
- **Workaround**: Add to package.json:
  ```json
  {
    "dependencies": {
      "bare-process": "^4.2.1",
      "bare-rpc": "^0.2.11",
      "bare-runtime": "^1.22.1-0",
      "corestore": "^7.5.0",
      "hyperdrive": "^13.0.2",
      "hyperswarm": "^4.14.2"
    },
    "overrides": {
      "@tetherto/qvac-lib-logging": "2.0.3"
    }
  }
  ```
- **Date Found**: 2025-10-13
- **Severity**: Low - documentation improvement needed

---

## 📋 Bug Report Template

When we find a bug, I'll add it here with:

```markdown
### Bug Title
- **Status**: 🐛 Active / ✅ Resolved / ⚠️ Workaround Available
- **Issue**: Clear description of what's broken
- **Steps to Reproduce**: Minimal code to reproduce
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Error Message**: Full error stack
- **SDK Version**: 0.10.1
- **Environment**: Windows 11, Bun 1.2.21, Node.js 22.18.0
- **Date Found**: YYYY-MM-DD
- **Severity**: Critical / High / Medium / Low
- **Workaround**: If available
- **Test Case**: Link to test that found it
```

---

## 🚨 How to Report

When we find a bug:
1. I'll document it here immediately
2. Create a minimal reproduction case
3. Format for Slack/GitHub issue
4. You can review and decide if/when to report to the team

---

## 📊 Statistics

- **Total Bugs Found**: 0
- **Critical Bugs**: 0
- **Resolved**: 0
- **With Workarounds**: 0

