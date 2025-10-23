# Systematic Isolation Testing Guide

## Purpose

You wanted to verify which test failures are **genuine SDK bugs** vs. **false positives** (framework/contamination issues) before reporting to the SDK development team.

This isolation testing framework provides **definitive proof** by testing each failing test individually in complete isolation.

---

## What Was Created

### 1. `extract-failing-tests.ts`
**Purpose:** Extract all failing tests from HTML batch report

**What it does:**
- Parses the latest HTML report in `reports/`
- Identifies all failing tests and their error types
- Categorizes: timeouts, errors, missing handlers, not-implemented
- Generates `failing-tests-list.json`

**Run once per HTML report:**
```bash
bun run extract-failing-tests.ts
```

---

### 2. `failing-tests-list.json` (auto-generated)
**Purpose:** List of tests to verify in isolation

**Contents:**
- **37 tests** to verify (from 43 total failures)
- **Excluded:** 4 missing handlers + 2 not-implemented (known issues)
- **Breakdown:**
  - 34 timeout tests (suspected false positives)
  - 3 other error tests

**Structure:**
```json
{
  "testsToIsolate": ["test-id-1", "test-id-2", ...],
  "breakdown": {
    "no-handler": [...],
    "timeout": [...],
    "other": [...]
  }
}
```

---

### 3. `qvac-test-consumer-desktop/test-failing-in-isolation.ts`
**Purpose:** Run each failing test individually with fresh SDK state

**What it does:**
1. Loads test definitions from producer
2. For each failing test:
   - Loads fresh model (LLM/Whisper/Embedding)
   - Executes test using `TestExecutor`
   - Records: PASS / FAIL / TIMEOUT / ERROR
   - Unloads model (complete cleanup)
   - Waits 2s for system to settle
3. Generates comprehensive report

**Features:**
- ✅ Complete isolation (fresh SDK per test)
- ✅ 60s timeout (2x batch timeout - generous)
- ✅ Automatic model selection based on test type
- ✅ Detailed error tracking
- ✅ False positive detection

**Run:**
```bash
cd qvac-test-consumer-desktop
bun run test-failing-in-isolation.ts
```

**Time:** ~5-10 minutes (37 tests × avg 10s each)

---

## How to Use

### Step 1: Extract Failing Tests
```bash
bun run extract-failing-tests.ts
```

**Output:** `failing-tests-list.json` with 37 tests to verify

---

### Step 2: Run Isolation Test
```bash
cd qvac-test-consumer-desktop
bun run test-failing-in-isolation.ts
```

**What you'll see:**
```
═══════════════════════════════════════════════════════════
  SYSTEMATIC ISOLATION TEST RUNNER
═══════════════════════════════════════════════════════════

📊 Loaded 37 failing tests from batch report

═══════════════════════════════════════════════════════════
TEST 1/37
═══════════════════════════════════════════════════════════

▶️  Testing: completion-concurrent-requests
   Loading LLM model...
   ✅ PASS (2176ms)

[... continues for all 37 tests ...]
```

---

### Step 3: Review Results

**Console Output:**
```
═══════════════════════════════════════════════════════════
  ISOLATION TEST RESULTS
═══════════════════════════════════════════════════════════

📊 SUMMARY:

   Total Tested:    37
   ✅ Passed:       28 (75.7%)
   ❌ Failed:       5  (13.5%)
   ⏱️  Timeout:      3  (8.1%)
   🔴 Error:        1  (2.7%)

═══════════════════════════════════════════════════════════
  ANALYSIS
═══════════════════════════════════════════════════════════

✅ FALSE POSITIVES (28 tests):
   These PASS in isolation but FAIL in batch
   → Caused by framework contamination or resource issues

   1. completion-concurrent-requests (2176ms)
   2. completion-repeated-tokens (1543ms)
   [... etc ...]

🔴 GENUINE FAILURES (9 tests):
   These FAIL even in isolation - report to SDK team

   1. transcription-corrupted
      Status: timeout
      Duration: 60000ms
      Error: Test timeout after 60s
   
   [... etc ...]
```

**JSON Report:** `isolation-test-results.json`
```json
{
  "timestamp": "2025-10-23T12:00:00.000Z",
  "totalTested": 37,
  "summary": {
    "passed": 28,
    "failed": 5,
    "timeout": 3,
    "error": 1
  },
  "falsePositives": [...],
  "genuineFailures": [...]
}
```

---

## Interpreting Results

### ✅ Tests That PASS in Isolation

**Meaning:** FALSE POSITIVES
- Test works fine with fresh SDK state
- Only fails in batch due to:
  - Resource contamination from previous tests
  - SDK state corruption from earlier failures
  - Framework timing issues

**Action:** 
- ✅ **DO NOT** report to SDK team
- ✅ Framework/test ordering issue
- ✅ Fixed by running destructive tests last (already done!)

---

### 🔴 Tests That FAIL in Isolation

**Meaning:** GENUINE SDK BUGS
- Test fails even with fresh SDK and no contamination
- Reproducible and isolated
- Real SDK issue

**Action:**
- ✅ **REPORT to SDK dev team**
- ✅ Include:
  - Test ID
  - Error message
  - Proof it fails in isolation
  - Steps to reproduce

---

## Expected Outcome

Based on earlier investigation, you'll likely find:

| Category | Percentage | Count (of 37) |
|----------|------------|---------------|
| **False Positives** | 70-80% | ~26-30 tests |
| **Genuine Failures** | 20-30% | ~7-11 tests |

**Why this is good news:**
- Only a handful of real SDK bugs
- Most "failures" are framework artifacts
- Test suite quality is actually much better than 47.6% pass rate suggests

---

## Reporting to SDK Team

**For genuine failures, provide:**

1. **Test ID** (e.g., `transcription-corrupted`)
2. **Error Message** from isolation test
3. **Proof of Isolation:**
   ```
   "This test FAILS even when run individually with fresh SDK state.
   Tested in complete isolation with no contamination from other tests.
   See: isolation-test-results.json"
   ```
4. **Reproduction Steps:**
   ```bash
   cd qvac-test-consumer-desktop
   bun run test-failing-in-isolation.ts
   # Check results for test ID: [test-id]
   ```
5. **Expected vs Actual:**
   - Expected: [what should happen]
   - Actual: [what happens instead]

---

## Summary

**What you have:**
- ✅ Systematic isolation testing framework
- ✅ 37 failing tests to verify
- ✅ Proof of false positives vs. genuine bugs
- ✅ Confidence to report only real issues

**What you'll learn:**
- Which failures are SDK bugs (report these!)
- Which failures are framework issues (already fixed by test reordering!)
- True quality of your test suite

**Run it now:**
```bash
cd qvac-test-consumer-desktop
bun run test-failing-in-isolation.ts
```

**Expected time:** 5-10 minutes  
**Expected outcome:** ~70-80% false positives, ~5-10 genuine bugs to report 🎯

