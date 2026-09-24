const { WebSocket } = require('ws');

const TARGET = process.argv[2] || process.env.PANDA_VENT_IP;

if (!TARGET) {
  console.error('Pass a Panda Vent IP address or set PANDA_VENT_IP.');
  process.exit(2);
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clone = value => JSON.parse(JSON.stringify(value));

function readRgbState() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${TARGET}/ws`, { handshakeTimeout: 3000 });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out reading Panda Vent state.'));
    }, 4000);
    socket.on('message', value => {
      try {
        const frame = JSON.parse(value.toString());
        if (!frame.rgb_mode) return;
        clearTimeout(timer);
        socket.close();
        resolve(clone(frame.rgb_mode));
      } catch (_) {}
    });
    socket.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function send(command) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${TARGET}/ws`, { handshakeTimeout: 3000 });
    let sent = false;
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timed out sending ${Object.keys(command)[0]}.`));
    }, 4000);
    socket.on('message', value => {
      if (sent) return;
      try {
        const frame = JSON.parse(value.toString());
        if (!frame.rgb_mode) return;
        sent = true;
        socket.send(JSON.stringify(command));
        setTimeout(() => {
          clearTimeout(timer);
          socket.close();
          resolve();
        }, 240);
      } catch (_) {}
    });
    socket.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function valueDifferent(value, min = 0, max = 100, step = 5) {
  return value + step <= max ? value + step : Math.max(min, value - step);
}

function colorDifferent(value) {
  const normalized = String(value).toUpperCase();
  return normalized === 'FEFFFF' ? 'FDFFFF' : 'FEFFFF';
}

async function expectState(label, command, predicate) {
  await send(command);
  await sleep(90);
  const state = await readRgbState();
  if (!predicate(state)) throw new Error(`${label} was not confirmed by the device.`);
  console.log(`PASS  ${label}`);
  return state;
}

async function restore(original) {
  const switchFields = [
    ['total_switch', original.light_on_off],
    ['warning_overide', original.warning_sw],
    ['follow_printer', original.is_follow_printer],
    ['follow_vent', original.is_follow_vent],
    ['reverse_light', original.is_reverse],
  ];
  for (const [key, value] of switchFields) {
    await send({ rgb_switch: { [key]: Number(Boolean(value)) } });
  }

  const simpleTouched = new Set([original.current_simple_effect, 1]);
  for (const effectId of simpleTouched) {
    const effect = original.effects.find(item => item.id === effectId);
    if (!effect) continue;
    await send({ rgb_mode: { simple_mode: {
      effect: effect.id,
      bg: effect.brightness,
      speed: effect.speed,
      rgb: effect.color,
    } } });
  }
  const currentSimple = original.effects.find(item => item.id === original.current_simple_effect);
  await send({ rgb_mode: { simple_mode: {
    effect: original.current_simple_effect,
    bg: currentSimple.brightness,
    speed: currentSimple.speed,
    rgb: currentSimple.color,
  } } });

  for (const deviceState of original.h2d_mode.device_states) {
    const active = deviceState.effects.find(item => item.effect_id === deviceState.active_effect_id);
    await send({ rgb_mode: { h2d_mode: {
      mode: deviceState.device_state_id,
      effect: deviceState.active_effect_id,
      bg: active.brightness,
      speed: active.speed,
      rgb: active.color,
    } } });
  }

  for (const type of ['safe', 'warn']) {
    const warning = original.warning_hot_mode[type];
    const active = warning.params.find(item => item.index === warning.current_effect);
    await send({ rgb_mode: { warning_hot_mode: { [type]: {
      effect: warning.current_effect,
      bg: active.bg,
      speed: active.speed,
    } } } });
  }

  await send({ rgb_switch: { current_light_mode: original.rgb_light_mode } });
  await sleep(150);
}

async function main() {
  const original = await readRgbState();
  console.log(`Panda Vent RGB audit at ${TARGET}`);
  console.log(`Original mode ${original.rgb_light_mode}; light ${original.light_on_off ? 'on' : 'off'}`);

  try {
    const switches = [
      ['Master light switch', 'total_switch', 'light_on_off'],
      ['Warning override', 'warning_overide', 'warning_sw'],
      ['Reverse direction', 'reverse_light', 'is_reverse'],
    ];
    for (const [label, commandKey, stateKey] of switches) {
      const changed = !original[stateKey];
      await expectState(label, { rgb_switch: { [commandKey]: Number(changed) } }, state => state[stateKey] === changed);
      await expectState(`${label} restore`, { rgb_switch: { [commandKey]: Number(original[stateKey]) } }, state => state[stateKey] === original[stateKey]);
    }

    await expectState('Follow printer lighting', { rgb_switch: { follow_printer: 1 } }, state => state.is_follow_printer === true && state.is_follow_vent === false);
    await expectState('Follow printer restore', { rgb_switch: { follow_printer: Number(original.is_follow_printer) } }, state => state.is_follow_printer === original.is_follow_printer);
    await expectState('Follow Vent lighting', { rgb_switch: { follow_vent: 1 } }, state => state.is_follow_vent === true && state.is_follow_printer === false);
    await expectState('Follow Vent restore', { rgb_switch: { follow_vent: Number(original.is_follow_vent) } }, state => state.is_follow_vent === original.is_follow_vent);

    for (const mode of [1, 2, original.rgb_light_mode]) {
      await expectState(`Light mode ${mode}`, { rgb_switch: { current_light_mode: mode } }, state => state.rgb_light_mode === mode);
    }

    for (let effectId = 0; effectId < 7; effectId += 1) {
      const effect = original.effects.find(item => item.id === effectId);
      await expectState(`Simple effect ${effectId}`, { rgb_mode: { simple_mode: {
        effect: effectId, bg: effect.brightness, speed: effect.speed, rgb: effect.color,
      } } }, state => state.current_simple_effect === effectId);
    }
    const simple = original.effects.find(item => item.id === 1);
    const simpleBg = valueDifferent(simple.brightness);
    const simpleSpeed = valueDifferent(simple.speed);
    const simpleColor = colorDifferent(simple.color);
    await expectState('Simple brightness', { rgb_mode: { simple_mode: { effect: 1, bg: simpleBg } } }, state => state.effects.find(item => item.id === 1)?.brightness === simpleBg);
    await expectState('Simple brightness restore', { rgb_mode: { simple_mode: { effect: 1, bg: simple.brightness } } }, state => state.effects.find(item => item.id === 1)?.brightness === simple.brightness);
    await expectState('Simple speed', { rgb_mode: { simple_mode: { effect: 1, speed: simpleSpeed } } }, state => state.effects.find(item => item.id === 1)?.speed === simpleSpeed);
    await expectState('Simple speed restore', { rgb_mode: { simple_mode: { effect: 1, speed: simple.speed } } }, state => state.effects.find(item => item.id === 1)?.speed === simple.speed);
    await expectState('Simple color', { rgb_mode: { simple_mode: { effect: 1, rgb: simpleColor } } }, state => state.effects.find(item => item.id === 1)?.color.toUpperCase() === simpleColor);
    await expectState('Simple color restore', { rgb_mode: { simple_mode: { effect: 1, rgb: simple.color } } }, state => state.effects.find(item => item.id === 1)?.color.toUpperCase() === simple.color.toUpperCase());

    for (const deviceState of original.h2d_mode.device_states) {
      const alternateId = (deviceState.active_effect_id + 1) % 7;
      const alternate = deviceState.effects.find(item => item.effect_id === alternateId);
      const active = deviceState.effects.find(item => item.effect_id === deviceState.active_effect_id);
      await expectState(`Advanced state ${deviceState.device_state_id} effect`, { rgb_mode: { h2d_mode: {
        mode: deviceState.device_state_id, effect: alternateId, bg: alternate.brightness, speed: alternate.speed, rgb: alternate.color,
      } } }, state => state.h2d_mode.device_states.find(item => item.device_state_id === deviceState.device_state_id)?.active_effect_id === alternateId);
      await expectState(`Advanced state ${deviceState.device_state_id} restore`, { rgb_mode: { h2d_mode: {
        mode: deviceState.device_state_id, effect: deviceState.active_effect_id, bg: active.brightness, speed: active.speed, rgb: active.color,
      } } }, state => state.h2d_mode.device_states.find(item => item.device_state_id === deviceState.device_state_id)?.active_effect_id === deviceState.active_effect_id);
    }

    const advancedState = original.h2d_mode.device_states[0];
    const advanced = advancedState.effects.find(item => item.effect_id === advancedState.active_effect_id);
    const advancedBg = valueDifferent(advanced.brightness);
    const advancedSpeed = valueDifferent(advanced.speed);
    const advancedColor = colorDifferent(advanced.color);
    const advancedCommand = values => ({ rgb_mode: { h2d_mode: { mode: 0, effect: advanced.effect_id, ...values } } });
    const advancedRead = state => state.h2d_mode.device_states[0].effects.find(item => item.effect_id === advanced.effect_id);
    await expectState('Advanced brightness', advancedCommand({ bg: advancedBg }), state => advancedRead(state).brightness === advancedBg);
    await expectState('Advanced brightness restore', advancedCommand({ bg: advanced.brightness }), state => advancedRead(state).brightness === advanced.brightness);
    await expectState('Advanced speed', advancedCommand({ speed: advancedSpeed }), state => advancedRead(state).speed === advancedSpeed);
    await expectState('Advanced speed restore', advancedCommand({ speed: advanced.speed }), state => advancedRead(state).speed === advanced.speed);
    await expectState('Advanced color', advancedCommand({ rgb: advancedColor }), state => advancedRead(state).color.toUpperCase() === advancedColor);
    await expectState('Advanced color restore', advancedCommand({ rgb: advanced.color }), state => advancedRead(state).color.toUpperCase() === advanced.color.toUpperCase());

    for (const type of ['safe', 'warn']) {
      const warning = original.warning_hot_mode[type];
      const alternateId = warning.current_effect === 0 ? 1 : 0;
      const alternate = warning.params.find(item => item.index === alternateId);
      const active = warning.params.find(item => item.index === warning.current_effect);
      const command = values => ({ rgb_mode: { warning_hot_mode: { [type]: values } } });
      await expectState(`${type} warning effect`, command({ effect: alternateId, bg: alternate.bg, speed: alternate.speed }), state => state.warning_hot_mode[type].current_effect === alternateId);
      const bg = valueDifferent(alternate.bg);
      const speed = valueDifferent(alternate.speed);
      await expectState(`${type} warning brightness`, command({ effect: alternateId, bg }), state => state.warning_hot_mode[type].params.find(item => item.index === alternateId)?.bg === bg);
      await expectState(`${type} warning brightness restore`, command({ effect: alternateId, bg: alternate.bg }), state => state.warning_hot_mode[type].params.find(item => item.index === alternateId)?.bg === alternate.bg);
      await expectState(`${type} warning speed`, command({ effect: alternateId, speed }), state => state.warning_hot_mode[type].params.find(item => item.index === alternateId)?.speed === speed);
      await expectState(`${type} warning speed restore`, command({ effect: alternateId, speed: alternate.speed }), state => state.warning_hot_mode[type].params.find(item => item.index === alternateId)?.speed === alternate.speed);
      await expectState(`${type} warning effect restore`, command({ effect: warning.current_effect, bg: active.bg, speed: active.speed }), state => state.warning_hot_mode[type].current_effect === warning.current_effect);
    }
  } finally {
    await restore(original);
    const restored = await readRgbState();
    if (JSON.stringify(restored) !== JSON.stringify(original)) {
      throw new Error('Audit finished, but the RGB state did not restore byte-for-byte.');
    }
    console.log('RESTORED  Exact original RGB state confirmed.');
  }
}

main().catch(error => {
  console.error(`FAIL  ${error.message}`);
  process.exitCode = 1;
});
