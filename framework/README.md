# @tetherto/qvac-test-suite

Distributed MQTT-based test orchestration for desktop and mobile consumers.

## Features

- Desktop consumers for `macos`, `windows`, and `linux`
- Mobile consumers for `ios` and `android`
- Typed config and message contracts with Zod
- Producer/consumer lifecycle, reporting, and CI-friendly result comparison

## Installation

Requires:

- Node `22.18+`
- access to GitHub Packages for the `@tetherto` scope
- an `.npmrc` that points `@tetherto` to `https://npm.pkg.github.com/`

Example `.npmrc`:

```text
@tetherto:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
npm install @tetherto/qvac-test-suite
```

## Minimal desktop flow

### 1. Define tests

```ts
// tests/test-definitions.ts
import type { TestDefinition } from '@tetherto/qvac-test-suite';

export const tests: TestDefinition[] = [
  {
    testId: 'api-create-user',
    params: { name: 'John', email: 'john@example.com' },
    expectation: { validation: 'type', expectedType: 'string' },
    metadata: { category: 'api', estimatedDurationMs: 5000 },
  },
];
```

### 2. Create a desktop consumer entry

```ts
// tests/desktop/consumer.ts
import { createExecutor } from '@tetherto/qvac-test-suite';
import { ApiExecutor } from './executors/api-executor.js';

export const executor = createExecutor({
  handlers: [new ApiExecutor()],
});
```

### 3. Configure the framework

```js
// qvac-test.config.js
/** @type {import('@tetherto/qvac-test-suite').QvacTestConfig} */
export default {
  mqtt: {
    broker: {
      protocol: { env: 'MQTT_PROTOCOL' },
      host: { env: 'MQTT_HOST' },
      port: { env: 'MQTT_PORT' },
    },
    username: { env: 'MQTT_USERNAME' },
    password: { env: 'MQTT_PASSWORD' },
  },
  testDir: './tests',
  consumers: {
    desktop: {
      platforms: ['macos'],
      entry: './tests/desktop/consumer.js',
      include: ['./src/**', './tests/**'],
      dependencies: 'auto',
    },
  },
};
```

The desktop `entry` should point to compiled JavaScript or another module format that plain Node can import in your repository setup.

### 4. Run locally

```bash
qvac-test run:local:desktop
```

This starts an embedded broker, runs the consumer and producer, and prints results. No external MQTT broker needed.

<details>
<summary>Advanced: separate producer and consumer</summary>

If you need to run the producer and consumer in separate terminals (e.g. for debugging or remote broker setups):

```bash
# Terminal 1
qvac-test run:consumer:desktop --runId=test-123 --config=.

# Terminal 2
qvac-test run:producer --runId=test-123 --config=.
```

</details>

## CLI commands

```bash
# Local orchestration (recommended)
qvac-test run:local:desktop
qvac-test run:local:android
qvac-test run:local:ios

# Separate producer / consumer (advanced)
qvac-test run:producer
qvac-test run:consumer:desktop --runId=<id>
qvac-test run:bootstrap:desktop

# Mobile builds
qvac-test build:consumer:android
qvac-test build:consumer:ios

# Result comparison
qvac-test report:compare --baseline baseline.json --current current.json --output comparison.json
qvac-test report:format --input comparison.json --format markdown --output comment.md
```

## Config notes

- `testDir` points to the directory containing `test-definitions.{js,ts}`
- Desktop consumers run their configured `entry` in place
- Mobile consumers use the `@tetherto/qvac-test-suite/mobile` runtime and generated Expo scaffolding
- `.env` files are loaded automatically before config resolution

## CI integration

CI orchestration is consumer-repository specific. This package provides the CLI and runtime pieces; downstream repositories own their workflow definitions, cache strategy, secrets wiring, and platform-specific rollout.

## License

Proprietary - Tether

