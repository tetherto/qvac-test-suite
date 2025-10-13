# Code Organization & Maintainability

## 📊 Current State

### Producer (`qvac-test-producer/index.ts`) - 524 lines
**Structure:**
- Lines 1-33: Imports, config, counters
- Lines 35-413: Test builder functions (can be extracted)
- Lines 415-443: Simple publish logic
- Lines 445-524: MQTT handlers and result display

**Simplification Opportunity:**
All test builder functions (35-413) can be moved to `test-definitions.ts` → Would reduce to ~150 lines

### Consumer (`qvac-test-consumer-desktop/index.ts`) - 569 lines
**Structure:**
- Lines 1-16: Imports
- Lines 17-461: Test handler functions
- Lines 463-569: Main logic, MQTT handlers

**Already Well-Organized:**
- Each test type has its own handler function
- Clear separation of concerns
- Easy to add new tests

### Monitor (`verify-tests.ts`) - 238 lines
**Structure:**
- Lines 1-21: Setup, config
- Lines 22-94: MQTT message handling
- Lines 95-237: Reporting logic

**Well-Structured:**
- Configurable duration
- Clear reporting sections
- Easy to understand

## 💡 Simplification Strategy (Optional)

### Option 1: Extract Test Definitions (Recommended)
Move all `buildXxxTest()` functions from producer to `test-definitions.ts`:
- **Before**: 524 lines in producer
- **After**: ~150 lines in producer, ~400 lines in definitions
- **Benefit**: Cleaner main file, easier to add tests

### Option 2: Use Test Registry Pattern
Create a test registry with metadata:
```typescript
const TESTS = {
  "model-load-llm": {
    params: { ... },
    expectation: { ... },
  },
  // ...
};
```
- **Benefit**: JSON-like configuration
- **Drawback**: Less type-safe

### Option 3: Keep As-Is
Current code is:
- ✅ Working perfectly
- ✅ Well-commented
- ✅ Easy to understand each test
- ✅ Self-documenting (function names describe tests)

## 🎯 Recommendation

**For Now: Keep as-is** because:
1. It's working reliably
2. Each test is self-contained and clear
3. Easy to debug (find test by name)
4. Refactoring risk vs benefit is low

**Future: Extract when adding more tests**
- Once we hit 50+ test types
- When test definitions become unwieldy
- When we need to generate tests dynamically

## 📈 Maintainability Score

**Current Code: 8/10**
- ✅ Clear structure
- ✅ Good separation
- ✅ Well-documented
- ✅ Easy to add tests
- ⚠️ Some repetition (can be improved)

**With Refactoring: 9/10**
- Would reduce repetition
- Better separation of data vs logic
- Slightly more complex initially
- Better for scaling to 100+ tests

## 🔧 Quick Wins (No Refactoring Needed)

### 1. Add Comments
Mark sections clearly:
```typescript
// ============ MODEL LOADING TESTS ============
// ============ LLM COMPLETION TESTS ===========
// ============ TRANSCRIPTION TESTS ============
```

### 2. Group Related Functions
Keep all transcription builders together

### 3. Extract Constants
```typescript
const TIMEOUTS = {
  SHORT: 300000,  // 5 min
  LONG: 600000,   // 10 min
};

const KEYWORDS = {
  TRANSCRIPTION_SHORT: ["hope", "transcription", "working", "expected"],
  LONG_AUDIO: ["cursor", "favourite", ...],
};
```

These give 80% of the benefit with 20% of the effort!

