# Developing Panda Control

Use Node.js 24 and npm from the repository root. The lockfile pins dependencies. For source validation without running Electron:

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run test:sites
npm audit --audit-level=high
```

The build prepares the client and Sites-compatible output; it does not authorize website deployment. After an installation with ignored lifecycle scripts, provision the pinned Electron runtime before launching or packaging. Use authorized test devices for device behavior checks, preserve saved connections and credentials, and do not trigger factory setup, flashing, or unrelated printer actions.

## Automated checks

The [source-check workflow](.github/workflows/source-checks.yml) runs on pushes to `main`, pull requests, or manual dispatch. It uses Node.js 24 on Ubuntu, Windows, and macOS and runs the build, `npm test`, and the high-severity advisory gate. `npm run test:sites` is an additional documented local release check. Source checks do not prove device behavior or signed installer acceptance.

The [Windows/Linux packaging workflow](.github/workflows/package-desktop.yml) is manually dispatched. It creates build artifacts and performs launch smoke tests; it does not publish a GitHub Release.

## Packaging and release

The existing package scripts are `npm run dist:mac`, `npm run dist:win`, and `npm run dist:linux`; outputs are under `release/`. macOS release preparation needs the authorized Developer ID signing/notarization configuration and Gatekeeper verification. Windows x64 NSIS packages are intentionally unsigned and need a real Windows smoke test. Linux AppImage and DEB packages need Linux smoke tests. Do not substitute a successful source build for these platform checks.

Use the existing staging script `scripts/stage-release-assets.sh` and the installation/third-party guidance linked in the [README](README.md). Preserve versioned assets, stable-name copies, and checksums. The maintainer separately authorizes merging, release tags, publication, and website updates; an ordinary source merge does not grant deployment permission. No new automation is enabled by this guide.
