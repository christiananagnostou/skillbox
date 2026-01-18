# NPM Release Guide

This repo publishes the CLI to npm using GitHub Actions.

## One-time setup

1) Create an npm access token with publish permissions.
2) Add it to GitHub Actions secrets as `NPM_TOKEN`.
3) Confirm the package name `skillbox` is available in npm.

## Release flow

Note: npm release is live for `skillbox` via GitHub Releases.

1) Update version in `package.json`.
2) Build locally and run checks:

```bash
npm run lint:ci
npm run format:check
npm run build
```

3) Create a GitHub Release (recommended):

- Tag must match `v<version>` (e.g., `v0.1.2`).
- Publish a release with notes.
- GitHub Actions publishes to npm from the release event.

4) If you prefer the CLI:

```bash
git tag v0.1.2
git push origin v0.1.2
# Then draft/publish the release in GitHub.
```

5) GitHub Actions publishes to npm after release is published.

## Dry run

Trigger the `Release Preview` workflow and verify the publish output.

## Release notes

Use GitHub Releases to publish human-friendly notes. The repo includes `.github/release.yml` categories to auto-generate sections.
