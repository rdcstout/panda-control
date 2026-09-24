<div align="center">

# Panda Control

### One desktop app for everyday control of installed BIQU Panda accessories

[![Latest private build](https://img.shields.io/badge/build-0.1.2-d52b1e?style=for-the-badge)](../../releases/tag/v0.1.2)
[![Extrusion Therapy](https://img.shields.io/badge/Extrusion%20Therapy-website-d52b1e?style=flat-square)](https://extrusiontherapy.com/)

</div>

Panda Control is a free Extrusion Therapy workshop tool for managing Panda accessories after their normal factory setup is complete. It provides a consistent desktop interface for Panda Status, Panda Breath, stock Panda Vent, and Panda Control Vent firmware.

## What it does

- Finds supported Panda devices on the current local network when you press **Scan**
- Remembers added devices between launches
- Recognizes the same physical device after its DHCP address changes
- Keeps multiple units of the same product separate by hardware identity
- Provides normal operational controls without exposing Wi-Fi, printer binding, factory reset, or firmware-update setup
- Distinguishes stock Panda Vent from Panda Control Vent firmware

All device communication stays on the local network. Panda Control does not require a cloud account.

## Supported devices

| Device | Operational controls |
| --- | --- |
| Panda Status | Music/H2D mode, brightness, idle/printing/error colors |
| Panda Breath | Power, operating mode, temperature thresholds, filament drying |
| Panda Vent | Lighting modes, effects, state colors, brightness, speed, follow behavior |
| Panda Control Vent | Vent position, automatic policy, vent lighting, chamber lighting |

## Installation

### macOS

1. Download the Apple-silicon DMG from the [v0.1.2 release](../../releases/tag/v0.1.2).
2. Open the DMG and drag **Panda Control** to **Applications**.
3. Launch Panda Control and allow Local Network access when macOS asks.

The macOS build is signed with a Developer ID certificate and notarized by Apple.

Windows packaging and hardware validation remain in progress and are not part of this private test release.

## Using Panda Control

1. Complete the accessory's normal factory setup first so it is already joined to your network and bound to its printer.
2. Open Panda Control and press **Scan**.
3. Select the device tab, adjust its operational settings, and press **Save**.

Scanning is always user-initiated. The app does not rescan the network automatically at startup.

## Troubleshooting

### No devices are found on macOS

Open **System Settings → Privacy & Security → Local Network** and make sure Panda Control is enabled. Then return to the app and press **Scan**.

### A device moved to a new IP address

Press **Scan**. Version 0.1.2 and later match supported devices by hardware identity and update the saved address instead of adding a duplicate.

### A device is still unavailable

Confirm the Mac and the accessory are on the same local network, verify the accessory is powered on, and try its IP address through **Add**.

## Support future tools

Panda Control is free. If it helps in your shop, you can optionally [support future Extrusion Therapy tools](https://buy.stripe.com/fZu3cw2Mnfr0d7N3ws1kA00). Downloads are never gated behind payment.

## Independent utility

Panda Control is an independent community utility created by Extrusion Therapy. It is not affiliated with or endorsed by BIQU or BIGTREETECH.
