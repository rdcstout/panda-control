# Panda Control Release Timeline

## 1. RC10 field testing — in progress

- Run Panda Control Vent RC10 through normal prints for several days.
- Verify automatic opening, cooldown closing, completed-to-idle lighting, delayed 20% idle dimming, printer-light following, and saved settings across restarts.
- Resolve any motor-calibration or hardware behavior found during the soak test.

## 2. Complete Panda Control integration

- Keep stock firmware identified as **Panda Vent**.
- Keep Panda Control Vent firmware identified as **Panda C Vent** in the top device tabs.
- Finish mapping the Panda Control Vent operational settings into the desktop app.
- Preserve the post-setup-only boundary: no Wi-Fi setup, printer binding, factory reset, or firmware flashing in Panda Control.

## 3. Cross-device hardware validation

- Re-test Panda Status, Panda Breath, stock Panda Vent, and Panda Control Vent independently.
- Verify discovery, manual IP entry, polling, saving, device switching, and failure recovery.
- Test window scaling and interaction at the available desktop resolutions.

## 4. macOS and Windows release builds — deferred

- Do not package either platform until the integration and hardware tests above are accepted.
- Compile and test the macOS application package.
- Compile and test the Windows application package on a real Windows PC.
- Verify discovery and local-network permissions on both platforms.

## 5. Community release

- Use `rdcstout/lp5-live-telemetry` as the exact presentation model.
- Publish a small public distribution repository with a polished Panda Control
  hero screenshot linked to the Extrusion Therapy software page.
- Put large direct **Download for macOS** and **Download for Windows** buttons
  above the fold, followed by a plain download table with version-pinned URLs.
- Attach the macOS installer, Windows installer, Panda Control Vent OTA `.bin`,
  and `SHA256SUMS.txt` to the versioned GitHub Release.
- Keep every download free and ungated. Include the same optional
  **Support future Extrusion Therapy tools** donation link used by LP5:
  `https://buy.stripe.com/fZu3cw2Mnfr0d7N3ws1kA00`.
- Keep the README concise: what the app does, supported devices, post-setup-only
  boundary, Panda Control Vent compatibility, installation notes, and the
  independent/unofficial BIGTREETECH disclaimer.
- Put release-specific changes, platform support, firmware compatibility, the
  checksum note, donation link, and disclaimer in the GitHub Release body.
- Keep issues, projects, and wiki disabled unless a deliberate support plan is
  adopted later.
- Preserve DragonVent lineage, MIT attribution, source/license obligations, and
  a clear link to the public Panda Control Vent firmware source when released.
- Publish only after final hardware acceptance and real macOS and Windows tests.
