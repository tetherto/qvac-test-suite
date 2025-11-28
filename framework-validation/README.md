# Framework Validation Scripts

This directory contains validation scripts for each implementation step.

## Usage

Each step has a corresponding validation script:

```bash
# Step 1: Config and test loading
node step-1-config-loading.js

# Step 2: Producer orchestration
# node step-2-producer.js (after Step 2 complete)

# Step 3: E2E flow
# node step-3-e2e.js (after Step 3 complete)
```

## Structure

- `qvac-test.config.js` - Test configuration
- `tests/` - Sample test definitions
- `step-N-*.js` - Validation scripts per step

## Cleanup

This directory can be deleted after MVP is complete. It's only for validating framework development.

