# qvac-test-suite

This repository contains the `@tetherto/qvac-test-suite` framework and the repository assets needed to maintain and publish it.

## What lives here

- `framework/` - the publishable `@tetherto/qvac-test-suite` package
- `.github/workflows/publish-framework.yml` - framework build and publish workflow

The old SDK-specific producer/consumer harness has been removed from this repository. New test suites should live in their own consumer repositories and depend on the published framework package.

Maintainers should start with the sections below. Consumers integrating the package into another repository should start with `framework/README.md` and `.npmrc.example`.

## Local development

```bash
cd framework
npm install
npm run build
```

Useful package-level documentation lives in `framework/README.md`.

## External usage

- Configure GitHub Packages access for the `@tetherto` scope before installation
- Use Node `22.18+`
- Install the package with `npm install @tetherto/qvac-test-suite`
- Add a `qvac-test.config.js` file and consumer entrypoints to your repo
- Configure CI in your consumer repository according to your own platform and artifact requirements

## License

Proprietary - Tether
