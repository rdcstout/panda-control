const { applyCommands, collectFrames, probeDevice, scanDevices } = require('../electron/network.cjs');

const expected = [
  process.env.PANDA_STATUS_IP && { ip: process.env.PANDA_STATUS_IP, product: 'status' },
  process.env.PANDA_BREATH_IP && { ip: process.env.PANDA_BREATH_IP, product: 'breath' },
].filter(Boolean);

async function main() {
  if (!expected.length) {
    throw new Error('Set PANDA_STATUS_IP and/or PANDA_BREATH_IP before running the hardware smoke test.');
  }
  const discovered = await scanDevices();
  console.log('Discovered:', discovered.map(device => `${device.name}@${device.ip}`).join(', '));

  for (const device of expected) {
    const identity = await probeDevice(device.ip);
    if (identity.product !== device.product) throw new Error(`Unexpected product at ${device.ip}`);
    const before = await collectFrames(device.ip, device.product);

    if (device.product === 'status') {
      const brightness = before.modes[before.mode]?.brightness;
      const alternate = brightness === 45 ? 50 : 45;
      await applyCommands(device.ip, device.product, [{ settings: { rgb_info_brightness: alternate } }]);
      const changed = await collectFrames(device.ip, device.product);
      if (changed.modes[before.mode]?.brightness !== alternate) throw new Error('Status brightness did not change.');
      await applyCommands(device.ip, device.product, [{ settings: { rgb_info_brightness: brightness } }]);
    } else {
      const alternate = before.targetTemp === 55 ? 60 : 55;
      await applyCommands(device.ip, device.product, [{ settings: { set_temp: alternate } }]);
      const changed = await collectFrames(device.ip, device.product);
      if (changed.targetTemp !== alternate) throw new Error('Breath target temperature did not change.');
      await applyCommands(device.ip, device.product, [{ settings: { set_temp: before.targetTemp } }]);
    }

    const restored = await collectFrames(device.ip, device.product);
    const field = device.product === 'status'
      ? restored.modes[before.mode]?.brightness === before.modes[before.mode]?.brightness
      : restored.targetTemp === before.targetTemp;
    if (!field) throw new Error(`${identity.name} did not restore cleanly.`);
    console.log(`${identity.name}: direct command passed and original value restored.`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
