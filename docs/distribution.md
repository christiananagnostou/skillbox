# Distribution Plan (v1)

Skillbox v1 uses npm as the primary distribution channel, with a Homebrew tap that installs from npm. This keeps the release process simple and avoids cross-platform binary builds in the first release.

## npm (primary)

Publish to npm under the user account:

- https://www.npmjs.com/~canagnostou

Install:

```
npm i -g skillbox
```

## Homebrew (secondary)

Create a personal tap repository under your GitHub account:

- https://github.com/christiananagnostou/homebrew-skillbox

Formula strategy:

- Use Node as a dependency
- Install via npm inside the formula

Example outline:

```
class Skillbox < Formula
  desc "Local-first, agent-agnostic skills manager"
  homepage "https://github.com/christiananagnostou/skillbox"
  url "https://registry.npmjs.org/skillbox/-/skillbox-<version>.tgz"
  sha256 "<sha256>"

  depends_on "node"

  def install
    command "npm", "install", "-g", "skillbox"
  end
end
```

Note:

- This can be replaced with native binaries later.

## Windows

- v1 uses npm only.
- Optional future support: winget or scoop.

## Release Flow (v1)

1. Update version in package.json
2. Publish to npm
3. Update Homebrew tap formula

## Future Options

- Native binaries via pkg or Rust/Go core
- GitHub Releases + brew formula pointing to binaries
- Windows installer integration
