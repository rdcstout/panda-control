# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Locked Panda Control direction

- Preserve the selected top-tab device navigation; do not introduce a left sidebar.
- Preserve the exact desktop arrangement at every window size. Fit the interface proportionally as the Electron window changes; do not reflow, stack, reorder, or allow horizontal scrolling. Use a restrained vertical scrollbar when expanded controls exceed the available height.
- Keep the Electron window locked to a square aspect ratio so width and height resize together and the scaled interface fills the window without side gutters.
- Default to a dimensional Apple-esque dark mode with layered graphite surfaces, lighter input panels, restrained red accents, and native-feeling controls.
- Use the approved graphite, white, and red mechanical-panda app icon from `build/panda-control-icon-source.png` on every platform. macOS uses `build/icon.icns`; Windows uses `build/icon.ico`. Never ship the default Electron icon.
- Keep the subtitle `An Extrusion Therapy workshop tool`, with `Extrusion Therapy` linking to `https://extrusiontherapy.com/`.
- This is a post-setup management app only. Never add Wi-Fi/AP provisioning, hostname changes, printer bind/unbind, factory reset, or firmware flashing.
- Known adapters are Panda Status, Panda Breath, and Panda Vent. Unknown Panda devices get an unsupported-device fallback and a button to open their factory web interface.
- Distinguish stock Panda Vent from Panda Control Vent firmware during discovery. Keep the stock tab label `Panda Vent`; use the compact tab label `Panda C Vent` for our firmware while retaining `Panda Control Vent` in the detailed device view.
- Remember added devices between launches. Never run full-network discovery automatically at startup; scan only after an explicit user action such as pressing `Scan` or opening the Add-device discovery surface.
- Panda Vent exposes only post-setup operational lighting management: Simple, Printer States, and Hot Warning modes; follow-printer/follow-vent behavior; warning override; reverse direction; effects; brightness; speed; and contextual colors.
- Panda Status firmware V1.0.0 has no functional Speed control; omit it.
- Use only the validated operational protocol fields and preserve exact firmware serialization, including string brightness values for Panda Status.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
