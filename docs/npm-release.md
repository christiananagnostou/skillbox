# NPM Release Guide

This repo publishes the CLI to npm using GitHub Actions.

## One-time setup

1) Create an npm access token with publish permissions.
2) Add it to GitHub Actions secrets as `NPM_TOKEN`.
3) Confirm the package name `skillbox` is available in npm.

## Release flow

1) Update version in `package.json`.
2) Build locally and run checks:

```bash
npm run lint:ci
npm run format:check
npm run build
```

3) Tag and push:

```bash
git tag v0.1.0
git push origin v0.1.0
```

4) GitHub Actions publishes to npm.

## Dry run

Trigger the `Release Preview` workflow and verify the publish output.

TODO: Add a release checklist and changelog workflow.
