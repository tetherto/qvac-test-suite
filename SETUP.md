# Quick Setup Guide

## Prerequisites

1. **MQTT Broker** (Mosquitto) running on `localhost:1883`
2. **GitHub Personal Access Token** with `read:packages` scope
3. **Bun** or **Node.js** installed

## Installation

### 1. Clone & Setup

```bash
git clone https://github.com/boonet/qvac-sdk-tests.git
cd qvac-sdk-tests
```

### 2. Authentication

Create `.npmrc` in project root and each subproject:
```
@tetherto:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=your_github_token_here
```

### 3. Install Dependencies

```powershell
cd qvac-test-producer && bun install
cd ../qvac-test-consumer-desktop && bun install
```

## Run Tests

**Terminal 1:**
```powershell
cd qvac-test-producer && bun run index.ts
```

**Terminal 2:**
```powershell
cd qvac-test-consumer-desktop && bun run index.ts
```

**Terminal 3:**
```powershell
bun run verify-tests.ts 10
```

## Coverage

✅ 23 test types | ✅ 26% coverage | ✅ 0 SDK bugs found

See `README.md` for details.

