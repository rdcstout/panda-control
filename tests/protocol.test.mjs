import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  detectProductFromHtml,
  normalizeTarget,
  sanitizeControlVentState,
  sanitizeState,
  validateControlVentFilamentRules,
  validateControlVentLighting,
  validateControlVentSettings,
  validateCommand,
} = require('../electron/protocol.cjs');
const { parseNeighborMac } = require('../electron/network.cjs');

test('normalizes macOS, Linux, and Windows neighbor MAC formats', () => {
  assert.equal(parseNeighborMac('? (192.168.1.34) at 02:00:00:00:0:f on en0'), '02:00:00:00:00:0f');
  assert.equal(parseNeighborMac('192.168.1.34 dev wlan0 lladdr 02:00:00:00:00:0f REACHABLE'), '02:00:00:00:00:0f');
  assert.equal(parseNeighborMac('  192.168.1.34          02-00-00-00-00-0f     dynamic'), '02:00:00:00:00:0f');
});

test('recognizes only mapped Panda control surfaces', () => {
  assert.deepEqual(detectProductFromHtml('<title>Panda Status</title>'), {
    product: 'status', name: 'Panda Status',
  });
  assert.deepEqual(detectProductFromHtml('<title>Panda Breath</title>'), {
    product: 'breath', name: 'Panda Breath',
  });
  assert.deepEqual(detectProductFromHtml('<title>Panda Vent</title>'), {
    product: 'vent', name: 'Panda Vent',
  });
  assert.deepEqual(detectProductFromHtml('<title>Panda Control Vent</title>'), {
    product: 'control-vent', name: 'Panda C Vent',
  });
  assert.equal(detectProductFromHtml('<title>Printer</title>'), null);
});

test('sanitizes Panda Control Vent operational state without setup data', () => {
  const result = sanitizeControlVentState({
    api_version: 2, firmware: '0.1.0-rc.6', mode: 'auto',
    vent: { target: 'closed', running: false, calibrating: true },
    printer: { connected: true, connection: 'live', state: 'idle', source: 'bambu', material: 'PLA', chamber_light_on: true, bed_temperature_c: 32, bed_target_c: 0 },
    wifi: { state: 'station', ssid: 'WORKSHOP', ip: '192.168.1.94' },
    policy: { bed_seal_c: 85, bed_close_c: 35 },
  }, {
    zones: {
      vent: { enabled: true, brightness: 128 },
      chamber: { enabled: true, brightness: 255, dim_idle: true, follow_printer_light: true },
    },
  }, { automation_mode: 'advanced', bed_seal_c: 85, bed_open_c: 45, bed_close_c: 35 }, {
    rules: [{ name: 'PLA', seal: false }, { name: 'ABS', seal: true }],
  });
  assert.equal(result.product, 'control-vent');
  assert.equal(result.firmware, '0.1.0-rc.6');
  assert.equal(result.ventTarget, 'closed');
  assert.equal(result.ventCalibrating, true);
  assert.equal(result.printerConnection, 'live');
  assert.equal(result.printerSource, 'bambu');
  assert.equal(result.material, 'PLA');
  assert.equal(result.chamberLightOn, true);
  assert.deepEqual(result.policy, { automationMode: 'advanced', bedSeal: 85, bedOpen: 45, bedClose: 35 });
  assert.deepEqual(result.filamentRules, [{ name: 'PLA', seal: false }, { name: 'ABS', seal: true }]);
  assert.equal(result.lighting.vent.brightness, 128);
  assert.equal(result.lighting.chamber.dimIdle, true);
  assert.equal(result.lighting.chamber.followPrinterLight, true);
  assert.equal(result.wifiState, 'Connected · WORKSHOP');
  assert.equal(result.wifiIp, '192.168.1.94');
});

test('validates Panda Control Vent operational settings and two-zone lighting', () => {
  assert.deepEqual(validateControlVentSettings({ automationMode: 'simple', bedSeal: 85, bedOpen: 45, bedClose: 35 }), {
    automation_mode: 'simple', bed_seal_c: 85, bed_open_c: 45, bed_close_c: 35,
  });
  const profile = {
    enabled: true, brightness: 128, mode: 1, effect: 0, speed: 128,
    useError: true, useTemp: false, tempMin: 25, tempMax: 60,
    open: [1, 2, 3], closed: [4, 5, 6], printing: [7, 8, 9], error: [255, 0, 0],
    idle: [10, 11, 12], prep: [13, 14, 15], paused: [16, 17, 18], complete: [0, 255, 42],
    dimIdle: false, followPrinterLight: false,
  };
  const validated = validateControlVentLighting({ linked: false, reverse: [false, true], vent: profile, chamber: { ...profile, dimIdle: true, followPrinterLight: true } });
  assert.deepEqual(validated.rev_strip, [false, true]);
  assert.equal(validated.zones.vent.brightness, 128);
  assert.equal(validated.zones.chamber.dim_idle, true);
  assert.equal(validated.zones.chamber.follow_printer_light, true);
  assert.throws(() => validateControlVentSettings({ automationMode: 'simple', bedSeal: 85, bedOpen: 30, bedClose: 35 }), /higher than close/);
  assert.throws(() => validateControlVentSettings({ automationMode: 'simple', bedSeal: 39, bedOpen: 45, bedClose: 35 }), /between 40 and 120/);
  assert.throws(() => validateControlVentSettings({ automationMode: 'simple', bedSeal: 85, bedOpen: 19, bedClose: 10 }), /between 20 and 120/);
  assert.throws(() => validateControlVentSettings({ automationMode: 'simple', bedSeal: 85, bedOpen: 120, bedClose: 111 }), /between 0 and 110/);
});

test('validates Panda Control Vent advanced material rules', () => {
  assert.deepEqual(validateControlVentFilamentRules({ rules: [
    { name: ' pla ', seal: false },
    { name: 'petg-cf', seal: true },
  ] }), { rules: [
    { name: 'PLA', seal: false },
    { name: 'PETG-CF', seal: true },
  ] });
  assert.throws(() => validateControlVentFilamentRules({ rules: [{ name: '', seal: true }] }), /between 1 and 11/);
  assert.throws(() => validateControlVentFilamentRules({ rules: [{ name: 'POLYCARBONATE', seal: true }] }), /between 1 and 11/);
  assert.throws(() => validateControlVentFilamentRules({ rules: [{ name: 'PLA®', seal: false }] }), /only letters/);
  assert.throws(() => validateControlVentFilamentRules({ rules: Array.from({ length: 21 }, (_, index) => ({ name: `M${index}`, seal: false })) }), /No more than 20/);
});

test('restricts connections to private IPv4 and local hostnames', () => {
  assert.equal(normalizeTarget('http://192.168.5.28/'), '192.168.5.28');
  assert.equal(normalizeTarget('panda-status.local'), 'panda-status.local');
  assert.throws(() => normalizeTarget('8.8.8.8'), /local-network/);
  assert.throws(() => normalizeTarget('example.com'), /private IP/);
});

test('normalizes Status brightness to the device-required JSON string', () => {
  assert.deepEqual(validateCommand('status', {
    settings: { rgb_info_brightness: 35 },
  }), { settings: { rgb_info_brightness: '35' } });
  assert.throws(() => validateCommand('status', {
    settings: { rgb_info_brightness: 37 },
  }), /5% increments/);
});

test('blocks provisioning and unsupported settings', () => {
  assert.throws(() => validateCommand('status', {
    settings: { wifi_ssid: 'nope' },
  }), /Blocked non-operational/);
  assert.throws(() => validateCommand('breath', {
    settings: { factory_reset: 1 },
  }), /Blocked non-operational/);
  assert.throws(() => validateCommand('unknown', {
    settings: { work_on: 1 },
  }), /validated control profile/);
  assert.throws(() => validateCommand('vent', {
    settings: { factory_reset: 1 },
  }), /validated Panda Vent lighting controls/);
});

test('validates Panda Vent operational lighting commands', () => {
  assert.deepEqual(validateCommand('vent', {
    rgb_switch: { current_light_mode: 2 },
  }), { rgb_switch: { current_light_mode: 2 } });
  assert.deepEqual(validateCommand('vent', {
    rgb_mode: { h2d_mode: { mode: 2, effect: 4, bg: 55, speed: 40, rgb: 'ff3700' } },
  }), { rgb_mode: { h2d_mode: { mode: 2, effect: 4, bg: 55, speed: 40, rgb: 'FF3700' } } });
  assert.throws(() => validateCommand('vent', {
    rgb_switch: { wifi_reset: 1 },
  }), /Blocked non-operational/);
});

test('sanitizes mapped Status and Breath state frames', () => {
  assert.deepEqual(sanitizeState('status', [{ settings: {
    fw_version: 'V1.0.0', current_mode: '1',
    list2: [
      { brightness: '60', rgb_rgba: ['#FFFFFFFF'] },
      { brightness: '50', rgb_rgba: ['#FFFFFFFF', '#FFFFFFFF', '#FF0000FF'] },
    ],
  } }]), {
    product: 'status', firmware: 'V1.0.0', mode: 1,
    modes: [
      { brightness: 60, colors: ['#FFFFFFFF'] },
      { brightness: 50, colors: ['#FFFFFFFF', '#FFFFFFFF', '#FF0000FF'] },
    ],
  });

  assert.deepEqual(sanitizeState('breath', [
    { settings: {
      fw_version: 'V1.0.3', work_on: 1, work_mode: 1, set_temp: 60,
      filtertemp: 30, hotbedtemp: 80, custom_temp: 60, custom_timer: 12,
      isrunning: 0, remaining_seconds: 0,
    } },
    { settings: { warehouse_temper: 24 } },
  ]), {
    product: 'breath', firmware: 'V1.0.3', enabled: true, mode: 1,
    targetTemp: 60, filterTemp: 30, heaterTemp: 80,
    dryingTemp: 60, dryingHours: 12, drying: false,
    remainingSeconds: 0, chamberTemp: 24,
  });
});

test('sanitizes Panda Vent state without setup credentials', () => {
  const result = sanitizeState('vent', [{
    settings: { fw_version: 'V1.0.0', wifi_ssid: 'secret' },
    rgb_mode: {
      light_on_off: true, rgb_light_mode: 0, warning_sw: true,
      is_follow_printer: false, is_follow_vent: true, is_reverse: false,
      current_simple_effect: 1,
      effects: [{ id: 1, brightness: 50, speed: 40, color: 'FF3700' }],
      h2d_mode: { device_states: [{ device_state_id: 2, active_effect_id: 4, effects: [{ effect_id: 4, brightness: 60, speed: 45, color: 'FFFFFF' }] }] },
      warning_hot_mode: {
        safe: { current_effect: 0, params: [{ index: 0, bg: 50, speed: 50 }] },
        warn: { current_effect: 1, params: [{ index: 1, bg: 80, speed: 70 }] },
      },
    },
  }]);
  assert.equal(result.product, 'vent');
  assert.equal(result.firmware, 'V1.0.0');
  assert.equal(result.followVent, true);
  assert.equal(result.simple.activeEffect, 1);
  assert.equal(result.advanced.states[0].activeEffect, 4);
  assert.equal(result.warning.warn.effects[0].brightness, 80);
  assert.equal('wifi_ssid' in result, false);
});
