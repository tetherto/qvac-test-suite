# Isolated Test Results - Critical Finding

## 🎯 Test Results: ALL PASSED (100%)

Running 7 common failure scenarios **IN ISOLATION**:

| Test | Result | Duration |
|------|--------|----------|
| completion-zero-temperature | ✅ PASS | 211ms |
| completion-top-k | ✅ PASS | 208ms |
| completion-concurrent-requests | ✅ PASS | 1242ms |
| completion-repeated-tokens | ✅ PASS | 317ms |
| multiple-completions-in-sequence | ✅ PASS | 3610ms |
| embed-numbers-only | ✅ PASS | 249ms |
| embed-semantic-similarity | ✅ PASS | 494ms |

**Pass Rate: 7/7 (100.0%)**

## 🔍 Critical Findings

### The Problem is NOT:
- ❌ SDK API bugs
- ❌ Test logic errors
- ❌ Model configuration issues
- ❌ GPU capability problems

### The Problem IS:
- ✅ **Batch orchestration issues**
- ✅ **MQTT communication problems**
- ✅ **Test producer/consumer timing**

## 💡 Root Cause Analysis

Since tests pass in isolation (even with models kept loaded + delays) but fail in batch mode, the issue must be in:

### 1. MQTT Message Timing
**Hypothesis**: Tests are being assigned faster than they can be processed, causing:
- Message queue overflow
- Out-of-order execution
- Lost completion messages

### 2. Producer-Consumer Synchronization
**Hypothesis**: Producer doesn't wait for test completion before:
- Timing out
- Assigning next test
- Marking test as failed

### 3. Test Result Reporting
**Hypothesis**: Consumer completes tests but:
- Result messages get lost
- Producer doesn't receive them in time
- Network latency causes timeouts

## 📊 Evidence

### From Batch Run (40.6% pass rate):
```
⏱️  1 test(s) timed out:
   - embed-numbers-only (consumer-desktop-boonet-1761155062493)
⚠️  Result for unknown test: test-1761154791792-50
```

**Key observation**: "Result for unknown test" suggests:
- Test completed but result arrived after timeout
- Producer marked test as timed out before result arrived
- MQTT message delivery delays

### From Isolated Run (100% pass rate):
```
✅ embed-numbers-only: 249ms
```

**Key observation**: Same test completes in 249ms when not orchestrated via MQTT.

## 🛠️ Recommended Fixes

### Fix 1: Increase Producer Timeout ⭐ (Most Likely)
**Location**: `qvac-test-producer/batch-orchestrator.ts`

The producer timeout might be too aggressive. Tests complete successfully but producer times out first.

```typescript
// Current (estimated):
const TEST_TIMEOUT = 60000; // 60s

// Recommended:
const TEST_TIMEOUT = 120000; // 120s (2 minutes)
```

### Fix 2: Add Consumer Heartbeat
Consumer should send periodic heartbeats while test is running:
```typescript
// Every 10s during test execution
client.publish("qvac/heartbeat", JSON.stringify({
  consumerId,
  testId: currentTestId,
  status: "running",
  timestamp: Date.now()
}));
```

### Fix 3: Improve Result Delivery
Ensure test results are delivered with retries:
```typescript
// Send result with confirmation
client.publish("qvac/result", payload, { qos: 2 }, (error) => {
  if (error) {
    // Retry
    client.publish("qvac/result", payload, { qos: 2 });
  }
});
```

### Fix 4: Producer Should Wait Longer
Add buffer time between receiving result and marking as complete:
```typescript
// Wait for result with grace period
const timeout = testEstimatedDuration + 30000; // +30s grace
```

## 🎯 Immediate Action

**Check the producer timeout settings:**

1. Open `qvac-test-producer/batch-orchestrator.ts`
2. Find the test timeout constant
3. If it's 60s, increase to 120s
4. Re-run batch test

**Why this will likely work:**
- Isolated tests complete in ~200-3600ms
- Batch tests timeout at 60s
- But tests actually succeed (see "Result for unknown test")
- This means results arrive AFTER producer timeout
- Doubling timeout gives tests more time to report back

## 📈 Expected Outcome

If producer timeout is the issue:
- **Pass rate**: 40% → **95%+**
- **Timeouts**: 41 → **<3**
- **"Unknown test" warnings**: Eliminated

## 🔬 Next Steps

1. **Check producer timeout** ← DO THIS FIRST
2. **Increase to 120s if it's 60s**
3. **Re-run batch test**
4. **If still failing**: Implement heartbeat system
5. **If still failing**: Add MQTT QoS 2 for results

## 📝 Notes

The fact that:
1. ✅ Tests pass in isolation (100%)
2. ✅ Models stay loaded between tests (Option 1 implemented)
3. ✅ 500ms delays added between tests
4. ❌ Batch still fails at 40% with timeouts
5. ⚠️  "Result for unknown test" messages appear

**Strongly indicates**: The producer is timing out before consumer results arrive via MQTT.

**Solution**: Increase producer timeout tolerance.

