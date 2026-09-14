# qvac-test-suite — moved

> **This repository is archived and read-only.** The test-suite framework now lives in the
> QVAC monorepo at
> [**tetherto/qvac → `packages/test-suite`**](https://github.com/tetherto/qvac/tree/main/packages/test-suite).
> Open issues and pull requests against
> [tetherto/qvac](https://github.com/tetherto/qvac) instead.

The framework moved in [tetherto/qvac#4082](https://github.com/tetherto/qvac/pull/4082) and has
published from the monorepo since `0.11.0`. The runtime API did not change in the move — only the
package name and its home.

## Where things are now

| | Before (this repository) | Now (monorepo) |
| --- | --- | --- |
| Source | `framework/` | [`packages/test-suite`](https://github.com/tetherto/qvac/tree/main/packages/test-suite) |
| public npm | [`@qvac/qvac-test-suite`](https://www.npmjs.com/package/@qvac/qvac-test-suite) | [`@qvac/test-suite`](https://www.npmjs.com/package/@qvac/test-suite) |
| GitHub Packages | `@tetherto/qvac-test-suite` | `@tetherto/test-suite-mono` |
| Changelog | — | [`packages/test-suite/CHANGELOG.md`](https://github.com/tetherto/qvac/blob/main/packages/test-suite/CHANGELOG.md) |

## Migrating

Update the dependency and any import specifiers:

```diff
-"@qvac/qvac-test-suite": "^0.10.3"
+"@qvac/test-suite": "^0.11.0"
```

```diff
-import type { TestDefinition } from '@qvac/qvac-test-suite'
-import { createExecutor } from '@qvac/qvac-test-suite/mobile'
+import type { TestDefinition } from '@qvac/test-suite'
+import { createExecutor } from '@qvac/test-suite/mobile'
```

React Native consumers that redirect the bare specifier to the `/mobile` entry point in
`metro.config.js` need the same rename there.

`@qvac/qvac-test-suite` is deprecated on npm but stays installable — anything pinned to a released
`0.10.x` keeps resolving. Nothing was unpublished.

The last release cut here was `@qvac/qvac-test-suite@0.10.3`, from the `release-0.10` branch.
Everything from `@qvac/test-suite@0.11.0` onwards is released from the monorepo. The full history of
this repository is preserved and stays browsable.

## License

Apache-2.0. See [LICENSE](./LICENSE).
