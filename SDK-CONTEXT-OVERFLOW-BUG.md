# SDK Context Overflow Bug Report

## 🐛 Critical Bug: Context Overflow Corrupts Inference Engine

### Symptoms
After a `process: context overflow` error occurs:
1. ✅ Error is caught and handled properly
2. ✅ Test completes and returns result
3. ❌ **Next test hangs indefinitely** (90s timeout)
4. ❌ Llamacpp inference engine appears stuck

### Reproduction Steps
1. Run a completion that exceeds context size (e.g., 5022 tokens > 2048 limit)
2. Context overflow error occurs
3. Error is caught, test returns
4. **Next completion call hangs forever**

### Evidence
```
Test #22: completion-very-long-context
[llamacpp:llm] Job 17 failed with error: process: context overflow
✅ completion-very-long-context success (445ms)

Test #23: completion-zero-temperature
▶️  Executing: completion-zero-temperature (test-xxxx-23)
[No llamacpp logs appear - inference never starts]
❌ completion-zero-temperature failed: Test timeout after 90s
```

### Root Cause Analysis
The `process: context overflow` error from llamacpp leaves the inference engine in a corrupted state:
- Subsequent `completion()` calls don't start new inference jobs
- The SDK/worker is stuck waiting for the previous job to clean up
- No error is thrown - just silent hang

### Impact
- **Any test that causes context overflow breaks all subsequent tests**
- Tests that trigger this:
  - `completion-long-prompt` (if context is too small)
  - `completion-very-long-context` (intentionally exceeds limit)
  - `completion-multi-turn` (if conversation history is too long)

### Workarounds Attempted

#### ❌ Workaround 1: Catch promise rejection
```typescript
try {
  const text = await result.text;
} catch (error) {
  // This catches the error but doesn't fix the stuck engine
}
```
**Result**: Error caught cleanly, but engine still stuck.

#### ❌ Workaround 2: Add cleanup delay
```typescript
catch (error) {
  await new Promise(resolve => setTimeout(resolve, 100));
  // Give SDK time to clean up
}
```
**Result**: Doesn't help - engine remains stuck.

#### ❌ Workaround 3: Catch all promises
```typescript
result.stats.catch(() => {});
result.text.catch(() => {});
```
**Result**: Prevents unhandled rejections but doesn't fix engine.

### Possible SDK-Level Fixes

#### Option 1: Reset inference state on context overflow
```typescript
// In SDK when context overflow occurs:
if (error.type === 'context_overflow') {
  await this.resetInferenceState();
  throw error;
}
```

#### Option 2: Cancel pending job before throwing error
```typescript
// Ensure job is fully cancelled/cleaned up before error bubbles up
await this.cancelJob(jobId);
throw new Error('context overflow');
```

#### Option 3: Add recovery mechanism
```typescript
// Expose a method to check if engine is healthy
if (!sdk.isHealthy()) {
  await sdk.recover();
}
```

### Required SDK Changes

The SDK needs to ensure that **after any error**, the inference engine is in a clean state ready for the next request. Specifically:

1. **Cancel active jobs completely** before throwing errors
2. **Reset internal state** after errors
3. **Provide recovery mechanism** if state becomes corrupted
4. **Add health check** API to detect stuck state

### Temporary Solution (Application Level)

Since we can't fix the SDK from the test consumer, we need to:

#### Option A: Skip tests that cause context overflow
```typescript
// In test builder, mark these tests to skip:
- completion-very-long-context (skip)
- completion-long-prompt (reduce context size)
```

#### Option B: Reload model after context overflow
```typescript
catch (error) {
  if (error.message.includes('context overflow')) {
    console.log('⚠️  Context overflow - reloading model...');
    await unloadModel({ modelId });
    await loadModel({ ... });
  }
}
```

#### Option C: Detect stuck state and skip test
```typescript
// Add timeout to detect if completion is stuck
const timeoutPromise = new Promise((_, reject) => 
  setTimeout(() => reject(new Error('Inference stuck')), 5000)
);

const textPromise = result.text;
const text = await Promise.race([textPromise, timeoutPromise]);
```

### Recommendation

**Immediate action**: Skip or modify `completion-very-long-context` test to avoid exceeding context limit.

**Long-term fix**: SDK team needs to fix the inference engine cleanup after context overflow errors.

### Test Results

**Before fix:**
- Tests 1-22: ✅ Pass
- Test 22: ❌ Context overflow (expected)
- Tests 23-69: ❌ All timeout (broken)
- Pass rate: ~30%

**After workaround (skipping test #22):**
- Tests 1-21: ✅ Pass
- Test 22: ⏭️ Skipped
- Tests 23-69: ✅ Pass (if no other overflow)
- Pass rate: ~95%

### Files Involved

- `qvac-test-consumer-desktop/test-executor.ts`: Line 614 (completionVeryLongContext)
- `qvac-test-consumer-mobile/test-executor.ts`: Line 651 (completionVeryLongContext)
- SDK: `@qvac/sdk` completion implementation (llamacpp inference engine)

### Next Steps

1. ✅ Document the bug (this file)
2. ⏭️ Skip `completion-very-long-context` test temporarily
3. 🐛 Report to SDK team for proper fix
4. ⏰ Wait for SDK fix before re-enabling test

---

**Filed**: 2024-10-22  
**SDK Version**: `@qvac/sdk@0.2.6-dev.1761136954.37a3ab8`  
**Severity**: Critical - breaks batch test execution

