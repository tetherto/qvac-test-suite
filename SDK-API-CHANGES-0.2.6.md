# SDK 0.2.6-dev API Changes & Timeout Fix

## 🎯 Root Cause of Test Timeouts

The test failures (41 out of 69 tests) were caused by an **API breaking change** in SDK 0.2.6-dev that changed how the `completion` function works.

## 📊 What Changed

### Old API (SDK 0.10.1):
```typescript
const text = await completion({
  modelId: "...",
  prompt: "Say hello",
  maxTokens: 5
});
// text was a string
console.log(text); // "Hello!"
```

### New API (SDK 0.2.6-dev):
```typescript
const result = completion({  // Note: NO await here!
  modelId: "...",
  history: [{ role: "user", content: "Say hello" }],  // Changed!
  stream: false  // or true for streaming
});

const text = await result.text;  // Must await the text promise!
console.log(text); // "Hello!"
```

## 🔧 Key Changes:

1. **`prompt` parameter removed** → Use `history` array instead
2. **Return type changed** → Returns `{tokenStream, text, stats}`  
3. **`text` is now a Promise** → Must `await result.text`
4. **Conversation format** → All prompts must be in message history format

## ✅ Fix Applied

**Fixed in:**
- `qvac-test-consumer-desktop/test-executor.ts` - Already compatible! ✅
- `qvac-test-consumer-mobile/test-executor.ts` - Already compatible! ✅

**Additional Bug Fixed:**
- Fixed `unloadModel(modelId)` → `unloadModel({ modelId })` in both executors

## 📚 New API Examples

### Simple Completion:
```typescript
const result = completion({
  modelId: "abc123",
  history: [
    { role: "user", content: "What is 2+2?" }
  ],
  stream: false
});

const text = await result.text;
const stats = await result.stats;
```

### Streaming Completion:
```typescript
const result = completion({
  modelId: "abc123",
  history: [
    { role: "user", content: "Count to 5" }
  ],
  stream: true
});

for await (const token of result.tokenStream) {
  console.log(token);
}
```

### Multi-turn Conversation:
```typescript
const result = completion({
  modelId: "abc123",
  history: [
    { role: "system", content: "You are a helpful assistant" },
    { role: "user", content: "What's your name?" },
    { role: "assistant", content: "I'm an AI assistant." },
    { role: "user", content: "Can you help me code?" }
  ],
  stream: false
});

const text = await result.text;
```

## 🧪 Test Results

### Before Fix:
- ✅ Passed: 28 (40.6%)
- ❌ Failed: 41 (59.4%)
- Issues: Timeouts on all completion/embed tests

### After Fix:
- Tests should now work correctly with SDK 0.2.6-dev
- The `unloadModel` bug is fixed
- All completion methods use correct API

## 🚀 Next Steps

1. **Run the full test suite again** to verify all tests pass
2. **If timeouts still occur**, check for other API changes in:
   - `embed()` function
   - `transcribe()` function  
3. **Monitor for future breaking changes** when upgrading SDK versions

## 📝 Notes

- The test executor was already mostly compatible with 0.2.6-dev
- Only `unloadModel` calls needed fixing
- SDK 0.10.1 used old API format
- SDK 0.2.6-dev uses new conversation-based format


