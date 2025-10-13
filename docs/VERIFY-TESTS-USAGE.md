# Test Monitor Usage Guide

## 🔧 Running the Monitor

### Basic Usage

```powershell
# Default: 10 minutes
bun run verify-tests.ts

# Custom duration (in minutes)
bun run verify-tests.ts 5    # 5 minutes
bun run verify-tests.ts 20   # 20 minutes
bun run verify-tests.ts 30   # 30 minutes
```

## 📊 What It Shows

### Real-time Updates
- 📤 When tests are published
- 📥 When results are received
- ✅ PASS / ❌ FAIL status
- Expected vs Actual for failures

### Final Summary

**Test Statistics:**
- Total tests published
- Total results received
- Pass/fail counts
- Average duration
- Pass rate by test type

**Pending/Stuck Tests:**
- ⏳ PENDING: Waiting < 1 minute
- ⚠️  SLOW: Waiting 1-5 minutes
- 🔴 STUCK: Waiting > 5 minutes

**Failed Test Details:**
- Expected vs Actual comparison
- Full error messages
- Test parameters

## ⏱️ Timeout Rules

**In Consumer:**
- Short tests: 5 minutes max
- Long audio tests: 10 minutes max
- Tests that exceed timeout fail with TIMEOUT error

**In Monitor:**
- Configurable duration (default 10 min)
- Can run longer to catch slow tests
- Shows which tests are stuck/slow

## 💡 Recommendations

**For quick checks:**
```powershell
bun run verify-tests.ts 5   # 5 minutes
```

**For complete validation:**
```powershell
bun run verify-tests.ts 15  # 15 minutes - catches long-audio
```

**For stress testing:**
```powershell
bun run verify-tests.ts 30  # 30 minutes - multiple full cycles
```

## 🎯 Expected Behavior

### Short Tests (< 10 seconds)
- Model loading: ~1s
- Completion: ~200-500ms
- Context/temperature tests: ~200-400ms

### Medium Tests (2-15 seconds)
- Short audio transcription: ~5-15s
- Streaming completion: ~300-500ms

### Long Tests (minutes)
- Long audio (10-min MP3): ~5-10 minutes
- First-time model downloads: ~2-5 minutes

### Designed Failures
- Wrong number tests: Correctly fail
- Invalid path tests: Correctly fail
- Corrupted audio: Correctly fail

## 🔍 Interpreting Results

**High Pass Rate (>90%)**:
- System working well
- Only designed fails failing

**Medium Pass Rate (70-90%)**:
- Check designed fails
- Verify test expectations match actual output

**Low Pass Rate (<70%)**:
- Investigate test configuration
- Check consumer logs for errors
- Verify test data is correct

**Stuck Tests:**
- Check consumer is running
- Look for error logs in consumer
- Verify audio files exist and are accessible
- Check for memory/resource issues

