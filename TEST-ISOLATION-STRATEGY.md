# Test Isolation Strategy

## 📋 **Problem**

The QVAC SDK has a bug where **context overflow errors corrupt the inference engine's internal state**, even when errors are properly caught. This causes subsequent tests to hang indefinitely.

### Evidence:
```
✅ completion-very-long-context success (445ms)  ← Error caught properly
   ⚠️  Context overflow caught (expected): process: context overflow

▶️  Executing: completion-zero-temperature (test #23)
❌ completion-zero-temperature failed: Test timeout after 90s  ← HUNG!
```

The SDK's `llamacpp` inference engine gets stuck after context overflow, requiring a full model reload to recover.

---

## ✅ **Solution: Test Reordering**

Move all "destructive" tests (context overflow) to the **END** of the test suite:

### **Before (❌ Bad Order):**
```
Test 10: completion-long-prompt          ← Context overflow
Test 11: completion-multi-turn           ← HANGS! (collateral damage)
Test 12: completion-top-k                ← HANGS! (collateral damage)
...
Test 22: completion-very-long-context    ← Context overflow again
Test 23: completion-zero-temperature     ← HANGS! (collateral damage)
```

### **After (✅ Good Order):**
```
Test 1-62: Normal tests                  ✅ All pass
Test 63-65: Destructive tests            ⚠️  Context overflow (but isolated!)
  - completion-long-prompt
  - completion-very-long-context
  - completion-extremely-long-prompt
```

---

## 🎯 **Benefits**

1. **Isolation:** Normal tests complete successfully before risky tests run
2. **Clear separation:** Destructive tests are clearly marked with warnings
3. **Minimal impact:** If destructive tests fail, only affects remaining destructive tests
4. **Easy debugging:** Known failures are isolated at the end

---

## 🔧 **Implementation**

### Modified: `qvac-test-producer/test-builders.ts`

```typescript
// ========== PHASE 5: REAL-WORLD SCENARIOS ==========
tests.push(this.buildCompletionConversationContextTest());
tests.push(this.buildCompletionSingleWordTest());
tests.push(this.buildCompletionListGenerationTest());
// ... more normal tests ...

// ========== DESTRUCTIVE TESTS (RUN LAST) ==========
// ⚠️  WARNING: These tests intentionally cause context overflow errors
// ⚠️  SDK BUG: Context overflow corrupts inference engine state
// ⚠️  Result: Subsequent tests hang/timeout even though error is caught
// ⚠️  Solution: Run these tests LAST to avoid affecting other tests
console.log("\n⚠️  NOTE: Context overflow tests run LAST (known SDK bug)");
tests.push(this.buildCompletionLongPromptTest());
tests.push(this.buildCompletionVeryLongContextTest());
tests.push(this.buildCompletionExtremelyLongPromptTest());
```

---

## 📊 **Expected Results**

### **Before Reordering:**
- ✅ Tests 1-9: Pass
- ❌ Test 10: Context overflow
- ⏱️ Tests 11-20: Timeout (hung after overflow)
- **Result:** 10/69 tests pass (14.5%)

### **After Reordering:**
- ✅ Tests 1-62: Pass
- ❌ Tests 63-65: Context overflow (expected)
- **Result:** 62/65 tests pass (95.4%)

---

## 🚀 **Future Improvements**

### **Option A: Model Reload After Error**
Add automatic model reload after context overflow:
```typescript
catch (error) {
  if (error.includes('context overflow')) {
    console.log('⚠️  Reloading model for clean state...');
    await unloadModel({ modelId });
    modelId = await loadModel({ ... });
  }
}
```

### **Option B: Separate Test Suites**
Split into multiple test runs:
- **Suite 1:** Functional tests (normal operations)
- **Suite 2:** Error handling (context overflow, invalid inputs)
- **Suite 3:** Stress tests (concurrent requests, very long contexts)

### **Option C: Reduce Context Size**
Make tests fit within model's context window:
```typescript
// Before (causes overflow):
const longContext = "Text ".repeat(100);  // ~5000 tokens

// After (fits in context):
const longContext = "Text ".repeat(30);   // ~1500 tokens
```

---

## 🐛 **Known SDK Bugs (Tracked)**

1. **Context Overflow Corruption** (Severity: High)
   - **Issue:** Inference engine state corrupted after context overflow
   - **Workaround:** Run overflow tests last, or reload model after error
   - **Documented in:** `SDK-CONTEXT-OVERFLOW-BUG.md`

---

## ✅ **Testing This Change**

1. **Stop any running processes**
2. **Start producer:**
   ```bash
   cd qvac-test-producer
   bun run batch
   ```
3. **Start consumer (separate terminal):**
   ```bash
   cd qvac-test-consumer-desktop
   bun run batch
   ```
4. **Verify:**
   - Tests 1-62 should complete successfully
   - Tests 63-65 may fail with context overflow (expected)
   - No tests should timeout/hang

---

## 📝 **Summary**

✅ **Test isolation implemented via reordering**  
✅ **Destructive tests run last**  
✅ **Clear warnings added**  
✅ **SDK bug documented**  
✅ **Future improvements identified**  

This ensures the test suite is resilient to SDK bugs and provides reliable results.

