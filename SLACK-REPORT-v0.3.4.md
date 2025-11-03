# Slack Report for SDK v0.3.4

## Copy/Paste This Message:

```
@here
❌ CRITICAL: SDK v0.3.4 has SEVERE BUGS - CONFIRMED WITH EXTENDED TIMEOUTS

SDK Version: "@tetherto/sdk": "0.3.4-tmp.runid-19032732680"
✅ Verified with 60s timeouts (2x longer) - Results consistent, bugs are GENUINE

Test Results: 90/116 passing (77.6%) - DOWN from 84.8% in v0.2.0

🔬 VERIFICATION RUN (60s timeouts):
• Previous run (30s timeout): 91/116 passed (78.4%)
• New run (60s timeout): 90/116 passed (77.6%)
• Difference: Only 1 test - proves timeouts are NOT the issue
• Conclusion: ✅ ALL FAILURES ARE GENUINE SDK BUGS

⚠️ FAIR COMPARISON (99 Common Tests):
• v0.2.0: 84 pass / 99 tests (84.8%)
• v0.3.4: 79 pass / 99 tests (79.8%)
• Bugs Fixed: 0 ❌
• New Regressions: 5 confirmed ❌
• Status: ALL v0.2.0 bugs STILL PRESENT + 5 new failures

📝 NOTE: v0.3.4 test run included +17 new tests (error handling + parameter validation) that weren't in v0.2.0. This analysis compares only the 99 common tests for fair apples-to-apples comparison. The 5 parameter validation test failures may have existed in v0.2.0 but weren't tested.

🔴 P0 CRITICAL - Still Broken from v0.2.0 (7 tests):
• Code embedding hangs (4 tests) - All hung for 10s each (SDK deadlock)
• RAG document processing BROKEN (3 tests) - 🚨 GGML CRASH CONFIRMED:
  Error: `GGML_ASSERT(i01 >= 0 && i01 < ne01) failed at ggml-cpu/ops.cpp:5358`
  Large doc (120s), medium (90s), small (60s) - All fail after initial crash

🟠 P1 HIGH - Still Broken from v0.2.0 (6 tests):
• Stop sequences ignored (2 tests) - Single & multiple stop sequences not working
• Max tokens not enforced (1 test) - Generates 140 tokens when max=15
• Seed reproducibility broken (1 test) - Same seed → different outputs each time
• M4A transcription hangs (1 test) - M4A format causes 60s timeout
• Long prompt timeout (1 test) - Legitimate long prompts timeout at 60s

🟡 P2 MEDIUM - Still Broken from v0.2.0 (2 tests):
• Long audio incomplete (1 test) - Only 66 words from 10-min audio (slightly worse: was 59)
• Corrupted RAG document hangs (1 test) - Should reject gracefully, hangs 10s

🆕 NEW REGRESSIONS in v0.3.4 (5 confirmed):
🔴 P0 - Conversation context lost (1 test) - Multi-turn conversations broken (WORKED in v0.2.0)
🟠 P1 - Very long context hang (1 test) - Context overflow handling broken (WORKED in v0.2.0)
🟠 P1 - Extremely long prompt hang (1 test) - 4000+ word prompts now hang (WORKED in v0.2.0)
🟡 P2 - Corrupted audio hangs (2 tests) - MP3/WAV error handling broken (WORKED in v0.2.0)

⚠️ ADDITIONAL FINDINGS (17 New Tests - Not in v0.2.0):
• Parameter validation tests (5 tests) - ALL FAIL with 60s hangs (SDK deadlock, not "too slow"):
  - param-temperature-min/max: Both hung 60s
  - param-topp-min/max: Both hung 60s
  - param-maxtokens-small: Hung 60s
• Error handling tests (10 tests) - ALL PASS: Good error handling coverage ✅
• Note: Can't determine if param bugs are new or existed in v0.2.0 (weren't tested)

🔬 KEY FINDINGS FROM 60s TIMEOUT VERIFICATION:
1. ✅ Results consistent (78.4% → 77.6%) - proves bugs are genuine, not timeout issues
2. 🚨 GGML C++ crash confirmed in RAG test: `GGML_ASSERT failed at ops.cpp:5358`
3. 🔴 Parameter validation causes SDK deadlocks (all hung full 60s)
4. 🔴 Cascade effect: GGML crash breaks all subsequent RAG tests
5. 🔴 Code embedding: All 4 tests hung 10s each (SDK deadlock)

📊 SUMMARY:
• Pass rate DECREASED: 84.8% → 79.8% (-5%)
• Zero bugs fixed from v0.2.0 (0/15 failures resolved)
• 5 confirmed new regressions (features that worked now broken)
• Critical blockers: GGML crash, conversation context broken, parameter validation deadlocks

📊 RECOMMENDATION:
❌ DO NOT MERGE/RELEASE v0.3.4 - Critical bugs confirmed with extended timeout testing
✅ REVERT to v0.2.0 (better stability: 84.8% vs 79.8%)
🔧 Fix GGML crash (C++ level assertion failure)
🔧 Fix parameter validation deadlocks (temperature/topP/maxTokens boundaries)
🔧 Fix conversation context handling (regression from v0.2.0)
🔧 Fix all 15 original bugs from v0.2.0 (0% fix rate currently)
✅ Request SDK team run this test suite before releasing (prevents regressions)

Verification: Extended timeouts to 60s (2x longer) - results consistent, all bugs genuine
Full report: reports/batch-report-2025-11-03T[timestamp].html
Detailed analysis: BUG-COMPARISON-FAIR-v0.2.0-vs-v0.3.4.md
Consumer log: Captured GGML crash at ops.cpp:5358 during rag-large-document-32kb test
```

---

## Shorter Version (If Character Limit):

```
@here
❌ SDK v0.3.4 REGRESSION - DO NOT USE

Comparison (99 common tests):
• v0.2.0: 84.8% pass rate
• v0.3.4: 79.8% pass rate (-5%)
• Bugs fixed: 0
• New regressions: 5 confirmed

🔴 All v0.2.0 bugs STILL PRESENT:
• Code embedding hangs (4 tests) - worse than v0.2.0
• RAG hangs (3 tests)
• Completion params broken (4 tests): maxTokens, stopSequences, seed
• M4A + long prompts timeout (2 tests)

🆕 NEW REGRESSIONS:
• 🔴 Conversation context broken (chatbots unusable)
• 🟠 Very/extremely long prompts now hang (2 tests)
• 🟡 Corrupted audio handling broken (2 tests)

⚠️ +17 new tests added (not in v0.2.0):
• 5 param validation tests fail (unknown if new or old bug)
• 10 error handling tests pass ✅

RECOMMENDATION: Revert to v0.2.0
Report: BUG-COMPARISON-FAIR-v0.2.0-vs-v0.3.4.md
```

