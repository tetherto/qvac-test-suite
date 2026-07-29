# @tetherto/qvac-test-suite

Distributed MQTT-based test orchestration for desktop, Electron, Snap, and mobile consumers.

## Features

- Desktop consumers for `macos`, `windows`, and `linux`
- Electron packaged app consumers for `macos`, `windows`, and `linux`
- Strict-confined Snap consumers for Linux
- Mobile consumers for `ios` and `android`
- Typed config and message contracts with Zod
- Producer/consumer lifecycle, reporting, and CI-friendly result comparison

## Execution model

The producer filters the test catalog and sends one ordered queue in
`qvac/register-ack/{consumerId}`. The consumer resolves each queue item against
its bundled local test definitions and executes the queue sequentially. Test
start, result, heartbeat, profiling, memory, and batch-complete events continue
to use MQTT; there is no per-test request/assignment handshake. Registration
acknowledgments and lifecycle events may be replayed idempotently after an MQTT
reconnect.

One consumer owns a run queue. Additional consumers receive an explicit
registration rejection without displacing the active consumer. Every launcher
uses a process-unique consumer and MQTT client ID. MQTT reconnects keep that
process's local queue in progress, and session IDs prevent stale lifecycle
events from being applied to a different process session.

Final profiling waits up to 30 seconds for a producer acknowledgment before the
consumer shuts down. Override this in milliseconds with
`QVAC_PROFILING_ACK_TIMEOUT_MS`, or
`EXPO_PUBLIC_QVAC_PROFILING_ACK_TIMEOUT_MS` in generated mobile consumers.

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
import type { TestDefinition } from '@tetherto/qvac-test-suite'

export const tests: TestDefinition[] = [
  {
    testId: 'api-create-user',
    params: { name: 'John', email: 'john@example.com' },
    expectation: { validation: 'type', expectedType: 'string' },
    metadata: { category: 'api', estimatedDurationMs: 5000 }
  }
]
```

### 2. Create a desktop consumer entry

```ts
// tests/desktop/consumer.ts
import { createExecutor } from '@tetherto/qvac-test-suite'
import { ApiExecutor } from './executors/api-executor.js'

export const executor = createExecutor({
  handlers: [new ApiExecutor()]
})
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
      port: { env: 'MQTT_PORT' }
    },
    username: { env: 'MQTT_USERNAME' },
    password: { env: 'MQTT_PASSWORD' }
  },
  testDir: './tests',
  consumers: {
    desktop: {
      platforms: ['macos'],
      entry: './tests/desktop/consumer.js',
      include: ['./src/**', './tests/**'],
      dependencies: 'auto'
    }
  }
}
```

The desktop `entry` should point to compiled JavaScript or another module format that plain Node can import in your repository setup.

### 4. Run locally

```bash
qvac-test run:local:desktop
```

This starts an embedded broker, runs the consumer and producer, and prints results. No external MQTT broker needed.

## Electron packaged app flow

Electron consumers run as packaged Electron Forge apps. The framework packages the configured app, launches the
packaged executable, and passes the test run context through `QVAC_TEST_*` environment variables.

The Electron app's main process owns the actual consumer bootstrap. It should read:

- `QVAC_TEST_RUN_ID` — run identifier shared with the producer
- `QVAC_TEST_CONFIG_DIR` — directory containing `qvac-test.config.js`
- `QVAC_TEST_CONSUMER_ENTRY` — absolute path to the configured Electron consumer entry
- `QVAC_TEST_MQTT_BROKER` — optional broker override from local orchestration

```js
// qvac-test.config.js
export default {
  testDir: './dist/tests',
  consumers: {
    electron: {
      platforms: ['macos'],
      entry: './dist/tests/electron/consumer.js',
      appDir: '.',
      appName: 'MyElectronConsumer',
      packageManager: 'npm',
      packageScript: 'package:electron'
    }
  }
}
```

```bash
qvac-test run:local:electron --filter completion-
```

Use `--skip-build` to relaunch an existing packaged app when only producer-side filters changed. With
`--skip-build`, the launcher requires an exact packaged output for the requested platform and architecture.

## Snap packaged app flow

Snap consumers package an Electron application in a strict Snap, install or refresh it from a local
artifact, and launch its configured app command. The consumer entry and config directory must be included
in the Snap because strict confinement cannot import arbitrary files from the host checkout. Electron is
the only supported Snap runtime in the current framework contract.

```js
export default {
  testDir: './dist/tests',
  consumers: {
    snap: {
      runtime: 'electron',
      entry: './app/resources/app/dist/tests/electron/consumer.js',
      appDir: '.',
      snapName: 'my-sdk-e2e',
      appCommand: 'my-sdk-e2e',
      artifactPath: './snap/dist/my-sdk-e2e.snap',
      snapConfigDir: './app/resources/app',
      packageManager: 'npm',
      packageScript: 'package:snap'
    }
  }
}
```

The package script owns Snapcraft configuration and must create the exact `artifactPath`. The framework
sets mounted `QVAC_TEST_CONFIG_DIR` and `QVAC_TEST_CONSUMER_ENTRY` paths under
`/snap/<snapName>/current`, strips host `QVAC_CONFIG_PATH`, and forwards the run ID and MQTT broker.

`run:local:snap` installs the artifact before starting the producer and removes it after the run. To avoid
replacing or purging user data, it refuses to install when the same Snap name is already present. Use
`--skip-snap-install` only when you intentionally want to run that existing installation.

The packaged Electron main process must import `QVAC_TEST_CONSUMER_ENTRY`. In normal mode it starts the
consumer; when `QVAC_TEST_MODE=bootstrap`, it calls the entry's exported `bootstrap()` function and exits
with its result. The framework launches through Xvfb when available and otherwise supplies Electron
headless flags.

```bash
qvac-test run:local:snap --filter snap-
qvac-test run:bootstrap:snap --skip-build --skip-snap-install
```

Snap build and execution require Linux, Snapcraft with a working LXD provider, snapd, and permission to
run `snap install`. Set `QVAC_TEST_SNAP_SUDO=0` when the current user can administer snaps without `sudo`.

<details>
<summary>Advanced: separate producer and consumer</summary>

If you need to run the producer and consumer in separate terminals (e.g. for debugging or remote broker setups):

```bash
# Terminal 1
qvac-test run:consumer:desktop --runId=test-123 --config=.

# Terminal 2
qvac-test run:producer --runId=test-123 --config=.
```

For Electron, package and launch the Electron app as the consumer:

```bash
# Terminal 1
qvac-test run:consumer:electron --runId=test-123 --config=.

# Terminal 2
qvac-test run:producer --runId=test-123 --config=.
```

</details>

## CLI commands

```bash
# Local orchestration (recommended)
qvac-test run:local:desktop
qvac-test run:local:electron
qvac-test run:local:snap
qvac-test run:local:android
qvac-test run:local:ios

# Separate producer / consumer (advanced)
qvac-test run:producer
qvac-test run:consumer:desktop --runId=<id>
qvac-test run:consumer:electron --runId=<id>
qvac-test run:consumer:snap --runId=<id>
qvac-test run:bootstrap:desktop
qvac-test run:bootstrap:electron
qvac-test run:bootstrap:snap

# Consumer builds
qvac-test build:consumer:electron
qvac-test build:consumer:snap
qvac-test build:consumer:android
qvac-test build:consumer:ios

# Result comparison
qvac-test report:compare --baseline baseline.json --current current.json --output comparison.json
qvac-test report:format --input comparison.json --format markdown --output comment.md
```

## Config notes

- `testDir` points to the directory containing `test-definitions.{js,ts}`
- Desktop consumers run their configured `entry` in place
- Electron consumers package and launch the configured Electron Forge app. The packaged app receives
  `QVAC_TEST_*` environment variables and should import/start the configured `entry` from its main process.
- Snap consumers build, install, and launch a Linux Snap whose packaged entry receives mounted
  `QVAC_TEST_*` paths.
- Mobile consumers use the `@tetherto/qvac-test-suite/mobile` runtime and generated Expo scaffolding
- `.env` files are loaded automatically before config resolution

## CI integration

CI orchestration is consumer-repository specific. This package provides the CLI and runtime pieces; downstream repositories own their workflow definitions, cache strategy, secrets wiring, and platform-specific rollout.

## License

Proprietary - Tether
