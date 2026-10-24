# Panda Control development

Follow `/Users/rstout/.codex/skills/application-development/SKILL.md` for audits, changes, testing, and releases.

## Locked product behavior

- Preserve top-tab navigation, the square proportional window, the selected Apple-esque graphite/red visual system, and the approved Panda Control icon on every platform.
- Panda Control is an operational manager for devices that are already configured. Do not add device provisioning, printer binding, factory reset, or firmware flashing.
- Supported profiles are Panda Status, Panda Breath, stock Panda Vent, and Panda Control Vent. Unknown devices use the unsupported-device fallback.
- Keep `Panda Vent` for stock firmware and `Panda C Vent` in the compact tab for Panda Control Vent firmware.
- Persist devices, reconcile changed addresses by hardware identity, and run full discovery only after an explicit Scan/Add action.
- Keep Panda Control Vent copy, ranges, effects, and Basic/Advanced visibility synchronized with the versioned firmware contract in `src/controlVentContract.js` and its canonical-source test.
- Never start an ad hoc server to transfer artifacts. Use the mounted Dev share for cross-machine handoff.

## Verification and release

- CI and clean release validation use Node 24: `npm ci`, `npm run build`, `npm test`, `npm run test:sites`, and `npm audit --audit-level=high`.
- macOS: `npm run dist:mac`; require Developer ID signing, hardened runtime, notarization, stapling, Gatekeeper acceptance, and an installed-app smoke test.
- Windows: `npm run dist:win`; the x64 NSIS installer is intentionally unsigned and requires a real Windows smoke test.
- Linux: `npm run dist:linux`; publish x86-64 AppImage and amd64 DEB, verify zero AppleDouble files, and smoke test both on Linux.
- Stage versioned artifacts plus byte-identical stable-name copies with `scripts/stage-release-assets.sh`, publish `SHA256SUMS.txt`, and verify updater eligibility and permanent URLs.
- Public downloads go to GitHub Releases and the Extrusion Therapy Panda Control page. Copy final Windows/Linux packages and checksums to the mounted file-server Dev folder and hash-verify them.
- Website changes use the connected Base44 sandbox only, never the Base44 CLI.
