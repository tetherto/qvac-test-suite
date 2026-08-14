# qvac-test-suite

This repository maintains and publishes the qvac test-suite framework.

The framework is published to two registries from the same source:

- **public npm** as [`@qvac/qvac-test-suite`](https://www.npmjs.com/package/@qvac/qvac-test-suite) — released from `release-*` branches via npm Trusted Publishing (OIDC).
- **GitHub Packages** as `@tetherto/qvac-test-suite` — published from `main`/`feature/**`/`fix/**`.

## What lives here

- `framework/` — the publishable package (`@qvac/qvac-test-suite` on npm, rewritten to `@tetherto/qvac-test-suite` for GitHub Packages)
- `.github/workflows/publish-framework.yml` — build and publish workflow

## Local development

```bash
cd framework
npm install
npm run build
```

Package-level documentation and usage examples live in `framework/README.md`.

## License

Apache-2.0. See [LICENSE](./LICENSE).
