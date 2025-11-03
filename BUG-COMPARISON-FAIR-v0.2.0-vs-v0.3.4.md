# Fair Bug Comparison: SDK v0.2.0 vs v0.3.4
## (Comparing Only the 99 Common Tests)

## Executive Summary

**Important Note:** This comparison focuses on the **99 common tests** that existed in both versions. SDK v0.3.4 test run included **17 additional new tests** (error handling + parameter validation) that were not present in v0.2.0 testing.

### Test Pack Breakdown

| SDK Version | Total Tests | Common Tests (Comparable) | New Tests |
|-------------|-------------|---------------------------|-----------|
| v0.2.0 | 99 | 99 (100%) | 0 |
| v0.3.4 | 116 | 99 (85%) | 17 (15%) |

**New Tests Added in v0.3.4 Test Run:**
- 10 error handling tests (`error-*`)
- 5 parameter validation tests (`param-*`)
- 2 TODO placeholder tests

---

## Apples-to-Apples Comparison (99 Common Tests Only)

### Results Summary

| Metric | v0.2.0 | v0.3.4 | Change |
|--------|---------|---------|--------|
| **Total Common Tests** | 99 | 99 | - |
| **Passed** | 84 | 79 | -5 ❌ |
| **Failed** | 15 | 20 | +5 ❌ |
| **Pass Rate** | 84.8% | 79.8% | -5% ❌ |

**Result:** ❌ **SDK v0.3.4 is WORSE on common tests** - 5 additional tests now failing that passed in v0.2.0

---

## PART 1: Status of Original 15 Bugs from v0.2.0

### ✅ Still Broken - 15/15 Original Bugs Remain (100%)

All 12 unique bugs documented in ASANA-TICKETS.md (representing 15 test failures) are **STILL PRESENT** in v0.3.4:

| Ticket | Bug | Tests | v0.2.0 | v0.3.4 | Fixed? |
|--------|-----|-------|--------|--------|--------|
| #1 | Code Embedding GGML | 4 tests | ❌ Crash | ❌ Hangs | ❌ NO - **Worse** |
| #2-4 | RAG Document Hangs | 3 tests | ❌ Timeout | ❌ Timeout | ❌ NO |
| #5-6 | Stop Sequences | 2 tests | ❌ Ignored | ❌ Ignored | ❌ NO |
| #7 | maxTokens Not Enforced | 1 test | ❌ 153 tokens | ❌ 140 tokens | ❌ NO |
| #8 | Seed Not Reproducible | 1 test | ❌ Different | ❌ Different | ❌ NO |
| #9 | M4A Transcription | 1 test | ❌ Timeout | ❌ Timeout | ❌ NO |
| #10 | Long Prompts Timeout | 1 test | ❌ Timeout | ❌ Timeout | ❌ NO |
| #11 | Long Audio Partial | 1 test | ❌ 59 words | ❌ 66 words | ❌ NO |
| #12 | Corrupted RAG | 1 test | ❌ Timeout | ❌ Timeout | ❌ NO |

**Summary:** ❌ **ZERO original bugs fixed** (0/12 fixed = 0% fix rate)

---

## PART 2: New Regressions in Common Tests (v0.3.4)

### 🆕 5 Tests That PASSED in v0.2.0 Now FAIL in v0.3.4

These are **genuine regressions** - functionality that worked in v0.2.0 is now broken:

| # | Test ID | Description | Impact | Priority |
|---|---------|-------------|--------|----------|
| 1 | `completion-conversation-context` | Multi-turn conversation context lost | Cannot maintain conversation state | 🔴 P0 |
| 2 | `completion-very-long-context` | Context overflow now hangs | Edge case handling broken | 🟠 P1 |
| 3 | `completion-extremely-long-prompt` | 4000+ word prompts now hang | Large context worse | 🟠 P1 |
| 4 | `transcription-corrupted` | Corrupted MP3 now hangs | Error handling broken | 🟡 P2 |
| 5 | `transcription-corrupted-wav` | Corrupted WAV now hangs | Error handling broken | 🟡 P2 |

#### Details on New Regressions

**🆕 REGRESSION #1: Conversation Context Not Maintained**
- **Test:** `completion-conversation-context`
- **v0.2.0:** ✅ Passed - Context maintained across turns
- **v0.3.4:** ❌ Failed - Context lost, cannot remember previous turns
- **Impact:** 🔴 **Critical** - Blocks all chatbot/assistant use cases
- **Priority:** P0

```javascript
// Call 1: "My name is Alice"
// Call 2: "What is my name?"
// v0.2.0: "Alice" ✅
// v0.3.4: Fails to remember ❌
```

**🆕 REGRESSION #2: Very Long Context Handling**
- **Test:** `completion-very-long-context`
- **v0.2.0:** ✅ Passed - Gracefully handled context overflow
- **v0.3.4:** ❌ Failed - Hangs for 10s on overflow
- **Impact:** 🟠 Edge case handling degraded
- **Priority:** P1

**🆕 REGRESSION #3: Extremely Long Prompts**
- **Test:** `completion-extremely-long-prompt`
- **v0.2.0:** ✅ Passed - Handled 4000+ word prompts
- **v0.3.4:** ❌ Failed - Hangs for 10s
- **Impact:** 🟠 Large context support degraded
- **Priority:** P1

**🆕 REGRESSION #4-5: Corrupted Audio Handling**
- **Tests:** `transcription-corrupted`, `transcription-corrupted-wav`
- **v0.2.0:** ✅ Passed - Rejected gracefully or handled
- **v0.3.4:** ❌ Failed - Hangs for 10s each
- **Impact:** 🟡 Error handling degraded
- **Priority:** P2

---

## PART 3: New Tests Results (Not Comparable)

### Results from 17 New Tests Added in v0.3.4 Run

**Note:** These tests did NOT exist in v0.2.0, so we **cannot determine** if these bugs are new or existed all along.

| Test Category | Total | Passed | Failed | Pass Rate |
|---------------|-------|--------|--------|-----------|
| Parameter Validation (`param-*`) | 5 | 0 | 5 | 0% ❌ |
| Error Handling (`error-*`) | 10 | 10 | 0 | 100% ✅ |
| TODO Placeholders | 2 | 2 | 0 | 100% ✅ |
| **Total New Tests** | **17** | **12** | **5** | **70.6%** |

#### Failed New Tests (Unknown if Existed in v0.2.0)

| Test ID | Issue | Could Exist in v0.2.0? |
|---------|-------|------------------------|
| `param-temperature-min` | Hangs on `temperature: 0.1` | ⚠️ Unknown - not tested |
| `param-temperature-max` | Hangs on `temperature: 2.0` | ⚠️ Unknown - not tested |
| `param-topp-min` | Hangs on `topP: 0.1` | ⚠️ Unknown - not tested |
| `param-topp-max` | Hangs on `topP: 1.0` | ⚠️ Unknown - not tested |
| `param-maxtokens-small` | Hangs on `maxTokens: 5` | ⚠️ Unknown - not tested |

**Important:** These 5 parameter validation bugs **may have existed in v0.2.0** since these specific edge cases were not tested. We would need to run v0.2.0 with the expanded test suite to confirm if these are regressions or pre-existing issues.

---

## PART 4: Overall Results (All 116 Tests in v0.3.4)

For completeness, here are the full v0.3.4 results including new tests:

| Metric | Result |
|--------|--------|
| Total Tests | 116 |
| Passed | 91 (78.4%) |
| Failed | 25 (21.6%) |
| Common Test Failures | 20 (from 99 common tests) |
| New Test Failures | 5 (from 17 new tests) |

---

## PART 5: Summary & Recommendations

### Key Findings (99 Common Tests)

1. ❌ **Zero original bugs fixed** (0/15 test failures resolved)
2. ❌ **5 new regressions** introduced (tests that passed in v0.2.0 now fail)
3. ❌ **Pass rate decreased** from 84.8% → 79.8% (-5%)
4. ❌ **1 bug behavior changed for worse** (code embedding: crash → hang)

### Key Findings (17 New Tests)

5. ⚠️ **5 parameter validation tests fail** - Unknown if these bugs existed in v0.2.0
6. ✅ **All 10 error handling tests pass** - Good error handling coverage
7. ⚠️ **Cannot determine** if param bugs are regressions without testing v0.2.0 with same suite

### Critical Regressions Confirmed

**New in v0.3.4 (Definitely Regressions):**
1. 🔴 **P0 - Conversation context broken** - Blocks chatbot use cases
2. 🟠 **P1 - Very long context handling broken** - Edge cases worse
3. 🟠 **P1 - Extremely long prompts broken** - Large context worse
4. 🟡 **P2 - Corrupted audio error handling broken** (2 tests)

**Possibly New in v0.3.4 (Need Verification):**
5. 🔴 **P0 - Parameter boundary validation hangs** (5 tests) - Needs v0.2.0 retest to confirm

---

## PART 6: Verdict

### Based on 99 Common Tests (Fair Comparison):

❌ **SDK v0.3.4 is objectively WORSE than v0.2.0**

**Evidence:**
- **5% pass rate decrease** (84.8% → 79.8%)
- **Zero bugs fixed** from v0.2.0
- **5 genuine new regressions** confirmed
- **Critical feature broken:** Conversation context (P0 blocker)

### Recommendations

**Immediate Actions:**
1. ❌ **DO NOT release SDK v0.3.4** - Has confirmed regressions
2. ✅ **Revert to v0.2.0** - It has better stability (84.8% vs 79.8%)
3. 🔍 **Optional: Run v0.2.0 with 116-test suite** - To determine if param bugs are new or old

**For SDK Team:**
1. 🔧 **Fix 5 confirmed regressions** before next release
2. 🔧 **Address all 15 original bugs** (0% fix rate is concerning)
3. ✅ **Run this test suite** before releasing (prevents regressions)
4. 🧪 **Investigate parameter validation hangs** (may be critical new bug)

---

## PART 7: Updated Asana Tickets Needed

### Update All Existing 12 Tickets
Add this note to Ticket #1-12:
> **Status Update (v0.3.4):** Still present in SDK v0.3.4 - NOT FIXED

### Create 5 New Tickets for Confirmed Regressions

**NEW TICKET 13:** [SDK v0.3.4 Regression] Conversation Context Not Maintained  
**Priority:** 🔴 P0 Critical  
**Description:** Multi-turn conversation context lost between calls. Worked in v0.2.0, broken in v0.3.4.

**NEW TICKET 14:** [SDK v0.3.4 Regression] Very Long Context Causes Hang  
**Priority:** 🟠 P1 High  
**Description:** Context overflow now hangs 10s. Worked in v0.2.0, broken in v0.3.4.

**NEW TICKET 15:** [SDK v0.3.4 Regression] Extremely Long Prompts Hang  
**Priority:** 🟠 P1 High  
**Description:** 4000+ word prompts hang 10s. Worked in v0.2.0, broken in v0.3.4.

**NEW TICKET 16:** [SDK v0.3.4 Regression] Corrupted Audio Error Handling Broken  
**Priority:** 🟡 P2 Medium  
**Description:** Corrupted MP3/WAV files hang 10s. Worked in v0.2.0, broken in v0.3.4.  
**Tests:** `transcription-corrupted`, `transcription-corrupted-wav`

### Optional: Create Tickets for Parameter Validation (If Team Wants Visibility)

**TICKET 17:** [SDK] Parameter Validation Boundary Testing Hangs (5 tests)  
**Priority:** 🔴 P0 Critical (if new) OR 🟠 P1 High (if pre-existing)  
**Description:** Testing `temperature`, `topP`, `maxTokens` boundary values causes 30s hangs.  
**Note:** Unknown if this existed in v0.2.0 - requires retest to confirm if regression.

---

## Appendix: Test Results Detail

### v0.2.0 Results (99 tests)
- **Pass Rate:** 84.8% (84/99)
- **Failures:** 15 tests → 12 unique bugs
- **Report:** Previous test run

### v0.3.4 Results (99 common tests only)
- **Pass Rate:** 79.8% (79/99)
- **Failures:** 20 tests (15 old + 5 new regressions)
- **Report:** batch-report-2025-11-03T11-57-21-965Z.html

### v0.3.4 Results (All 116 tests)
- **Pass Rate:** 78.4% (91/116)
- **Failures:** 25 tests (20 from common + 5 from new tests)
- **Report:** batch-report-2025-11-03T11-57-21-965Z.html

