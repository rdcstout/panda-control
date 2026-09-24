const STATUS_KEYS = new Set([
  'rgb_info_mode',
  'rgb_info_brightness',
  'rgb_rgba',
  'rgb_state_index',
  'rgb_reset',
]);

const BREATH_KEYS = new Set([
  'work_on',
  'work_mode',
  'set_temp',
  'filtertemp',
  'hotbedtemp',
  'filament_temp',
  'filament_timer',
  'filament_drying_mode',
  'isrunning',
]);

const VENT_SWITCH_KEYS = new Set([
  'total_switch',
  'warning_overide',
  'follow_printer',
  'follow_vent',
  'reverse_light',
  'current_light_mode',
]);

function detectProductFromHtml(html) {
  const title = html.match(/<title>\s*([^<]+)\s*<\/title>/i)?.[1]?.trim() || '';
  if (/^Panda Status$/i.test(title)) return { product: 'status', name: 'Panda Status' };
  if (/^Panda Breath$/i.test(title)) return { product: 'breath', name: 'Panda Breath' };
  if (/^Panda Control Vent$/i.test(title)) return { product: 'control-vent', name: 'Panda C Vent' };
  if (/^Panda Vent$/i.test(title)) return { product: 'vent', name: 'Panda Vent' };
  if (/^Panda\b/i.test(title) || /Bifröst Engine/i.test(html)) {
    return { product: 'unknown', name: title || 'Unsupported Panda Device' };
  }
  return null;
}

function sanitizeControlVentState(state, lighting, settings) {
  if (!state || state.api_version !== 2 || !state.vent || !state.printer) {
    throw new Error('The Panda Control Vent did not return a recognized operational state.');
  }
  const zones = lighting?.zones || {};
  const profile = source => ({
    enabled: Boolean(source?.enabled),
    brightness: Number(source?.brightness ?? 0),
    mode: Number(source?.mode ?? 0),
    effect: Number(source?.effect ?? 0),
    speed: Number(source?.speed ?? 128),
    useError: Boolean(source?.use_error),
    useTemp: Boolean(source?.use_temp),
    tempMin: Number(source?.temp_min_c ?? 25),
    tempMax: Number(source?.temp_max_c ?? 60),
    open: Array.isArray(source?.open) ? source.open.slice(0, 3) : [255, 255, 255],
    closed: Array.isArray(source?.closed) ? source.closed.slice(0, 3) : [255, 255, 255],
    printing: Array.isArray(source?.printing) ? source.printing.slice(0, 3) : [255, 255, 255],
    error: Array.isArray(source?.error) ? source.error.slice(0, 3) : [255, 0, 0],
    idle: Array.isArray(source?.idle) ? source.idle.slice(0, 3) : [255, 255, 255],
    prep: Array.isArray(source?.prep) ? source.prep.slice(0, 3) : [248, 163, 35],
    paused: Array.isArray(source?.paused) ? source.paused.slice(0, 3) : [255, 255, 0],
    complete: Array.isArray(source?.complete) ? source.complete.slice(0, 3) : [0, 255, 42],
    dimIdle: Boolean(source?.dim_idle),
    followPrinterLight: Boolean(source?.follow_printer_light),
  });
  const ventProfile = profile(zones.vent || lighting);
  const chamberProfile = profile(zones.chamber || zones.vent || lighting);
  return {
    product: 'control-vent',
    firmware: state.firmware || null,
    mode: state.mode === 'manual' ? 'manual' : 'auto',
    ventTarget: state.vent.target || 'unknown',
    ventRunning: Boolean(state.vent.running),
    bedTemperature: state.printer.bed_temperature_c ?? null,
    bedTarget: state.printer.bed_target_c ?? null,
    printerConnected: Boolean(state.printer.connected),
    printerState: state.printer.state || 'unknown',
    policy: {
      automationMode: settings?.automation_mode === 'advanced' ? 'advanced' : 'simple',
      bedSeal: Number(settings?.bed_seal_c ?? state.policy?.bed_seal_c ?? 85),
      bedOpen: Number(settings?.bed_open_c ?? state.policy?.bed_open_c ?? 45),
      bedClose: Number(settings?.bed_close_c ?? state.policy?.bed_close_c ?? 35),
    },
    lighting: {
      linked: Boolean(zones.linked),
      reverse: Array.isArray(lighting?.rev_strip) ? lighting.rev_strip.slice(0, 2).map(Boolean) : [false, false],
      vent: ventProfile,
      chamber: chamberProfile,
    },
  };
}

const CONTROL_VENT_PROFILE_KEYS = new Set([
  'enabled', 'brightness', 'mode', 'effect', 'speed', 'useError', 'useTemp',
  'tempMin', 'tempMax', 'open', 'closed', 'printing', 'error', 'idle', 'prep',
  'paused', 'complete', 'dimIdle', 'followPrinterLight',
]);

function validateRgbTriplet(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(`${label} must be an RGB color.`);
  return value.map(channel => assertNumber(channel, 0, 255, `${label} channel`));
}

function validateControlVentProfile(input, label, chamber) {
  const profile = assertObject(input, label);
  rejectUnknownKeys(profile, CONTROL_VENT_PROFILE_KEYS, `${label} field`);
  const result = {
    enabled: Boolean(profile.enabled),
    brightness: assertNumber(profile.brightness, 0, 255, `${label} brightness`),
    mode: assertNumber(profile.mode, 0, 1, `${label} color source`),
    effect: assertNumber(profile.effect, 0, 7, `${label} effect`),
    speed: assertNumber(profile.speed, 0, 255, `${label} effect speed`),
    use_error: Boolean(profile.useError),
    use_temp: Boolean(profile.useTemp),
    temp_min_c: assertNumber(profile.tempMin, 0, 120, `${label} minimum temperature`),
    temp_max_c: assertNumber(profile.tempMax, 0, 120, `${label} maximum temperature`),
    open: validateRgbTriplet(profile.open, `${label} open color`),
    closed: validateRgbTriplet(profile.closed, `${label} closed color`),
    printing: validateRgbTriplet(profile.printing, `${label} printing color`),
    error: validateRgbTriplet(profile.error, `${label} error color`),
    idle: validateRgbTriplet(profile.idle, `${label} idle color`),
    prep: validateRgbTriplet(profile.prep, `${label} preparing color`),
    paused: validateRgbTriplet(profile.paused, `${label} paused color`),
    complete: validateRgbTriplet(profile.complete, `${label} completed color`),
  };
  if (chamber) {
    result.dim_idle = Boolean(profile.dimIdle);
    result.follow_printer_light = Boolean(profile.followPrinterLight);
  }
  return result;
}

function validateControlVentLighting(input) {
  const lighting = assertObject(input, 'Panda Control Vent lighting');
  rejectUnknownKeys(lighting, new Set(['linked', 'reverse', 'vent', 'chamber']), 'Panda Control Vent lighting field');
  if (!Array.isArray(lighting.reverse) || lighting.reverse.length !== 2) throw new Error('Lighting direction must contain left and right values.');
  return {
    rev_strip: lighting.reverse.map(Boolean),
    zones: {
      linked: Boolean(lighting.linked),
      vent: validateControlVentProfile(lighting.vent, 'Vent lights', false),
      chamber: validateControlVentProfile(lighting.chamber, 'Chamber lights', true),
    },
  };
}

function validateControlVentSettings(input) {
  const settings = assertObject(input, 'Panda Control Vent automation');
  rejectUnknownKeys(settings, new Set(['automationMode', 'bedSeal', 'bedOpen', 'bedClose']), 'automation field');
  const bedOpen = assertNumber(settings.bedOpen, 0, 120, 'Open temperature');
  const bedClose = assertNumber(settings.bedClose, 0, 120, 'Close temperature');
  if (bedOpen <= bedClose) throw new Error('Open temperature must be higher than close temperature.');
  return {
    automation_mode: settings.automationMode === 'advanced' ? 'advanced' : 'simple',
    bed_seal_c: assertNumber(settings.bedSeal, 0, 120, 'Seal temperature'),
    bed_open_c: bedOpen,
    bed_close_c: bedClose,
  };
}

function normalizeTarget(value) {
  const target = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(target)) {
    const parts = target.split('.').map(Number);
    if (parts.some(part => part < 0 || part > 255)) throw new Error('Enter a valid local IP address.');
    const local = parts[0] === 10 || parts[0] === 127 || parts[0] === 169 && parts[1] === 254
      || parts[0] === 192 && parts[1] === 168
      || parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
    if (!local) throw new Error('Panda Control only connects to local-network addresses.');
    return target;
  }
  if (/^[a-z0-9][a-z0-9-]{0,62}\.local$/i.test(target)) return target;
  throw new Error('Enter a private IP address or a .local hostname.');
}

function assertNumber(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`);
  }
  return number;
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Blocked non-operational ${label}: ${key}`);
  }
}

function validateVentCommand(command) {
  const roots = Object.keys(command);
  if (roots.length !== 1 || !['rgb_switch', 'rgb_mode'].includes(roots[0])) throw new Error('Only validated Panda Vent lighting controls are supported.');
  if (command.rgb_switch) {
    const switches = assertObject(command.rgb_switch, 'Lighting switch');
    rejectUnknownKeys(switches, VENT_SWITCH_KEYS, 'lighting switch');
    for (const key of Object.keys(switches)) {
      switches[key] = key === 'current_light_mode'
        ? assertNumber(switches[key], 0, 2, 'Lighting mode')
        : assertNumber(switches[key], 0, 1, 'Lighting switch');
    }
    return { rgb_switch: switches };
  }

  const mode = assertObject(command.rgb_mode, 'Lighting effect');
  const modeKeys = Object.keys(mode);
  if (modeKeys.length !== 1 || !['simple_mode', 'h2d_mode', 'warning_hot_mode'].includes(modeKeys[0])) throw new Error('Unsupported Panda Vent lighting mode.');
  if (mode.simple_mode) {
    const simple = assertObject(mode.simple_mode, 'Simple effect');
    rejectUnknownKeys(simple, new Set(['effect', 'bg', 'speed', 'rgb']), 'simple effect field');
    if ('effect' in simple) simple.effect = assertNumber(simple.effect, 0, 6, 'Effect');
    if ('bg' in simple) simple.bg = assertNumber(simple.bg, 0, 100, 'Brightness');
    if ('speed' in simple) simple.speed = assertNumber(simple.speed, 0, 100, 'Animation speed');
    if ('rgb' in simple && !/^[0-9a-f]{6}$/i.test(simple.rgb)) throw new Error('Color must be a 6-digit RGB value.');
    if ('rgb' in simple) simple.rgb = simple.rgb.toUpperCase();
    return { rgb_mode: { simple_mode: simple } };
  }
  if (mode.h2d_mode) {
    const h2d = assertObject(mode.h2d_mode, 'Printer-state effect');
    rejectUnknownKeys(h2d, new Set(['mode', 'effect', 'bg', 'speed', 'rgb']), 'printer-state effect field');
    if ('mode' in h2d) h2d.mode = assertNumber(h2d.mode, 0, 5, 'Printer state');
    if ('effect' in h2d) h2d.effect = assertNumber(h2d.effect, 0, 6, 'Effect');
    if ('bg' in h2d) h2d.bg = assertNumber(h2d.bg, 0, 100, 'Brightness');
    if ('speed' in h2d) h2d.speed = assertNumber(h2d.speed, 0, 100, 'Animation speed');
    if ('rgb' in h2d && !/^[0-9a-f]{6}$/i.test(h2d.rgb)) throw new Error('Color must be a 6-digit RGB value.');
    if ('rgb' in h2d) h2d.rgb = h2d.rgb.toUpperCase();
    return { rgb_mode: { h2d_mode: h2d } };
  }
  const warning = assertObject(mode.warning_hot_mode, 'Warning effect');
  const warningKeys = Object.keys(warning);
  if (warningKeys.length !== 1 || !['safe', 'warn'].includes(warningKeys[0])) throw new Error('Unsupported temperature-warning state.');
  const stateKey = warningKeys[0];
  const state = assertObject(warning[stateKey], 'Warning-state effect');
  rejectUnknownKeys(state, new Set(['effect', 'bg', 'speed']), 'warning effect field');
  if ('effect' in state) state.effect = assertNumber(state.effect, 0, 1, 'Warning effect');
  if ('bg' in state) state.bg = assertNumber(state.bg, 0, 100, 'Brightness');
  if ('speed' in state) state.speed = assertNumber(state.speed, 0, 100, 'Animation speed');
  return { rgb_mode: { warning_hot_mode: { [stateKey]: state } } };
}

function validateCommand(product, command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('Invalid device command.');
  if (product === 'vent') return validateVentCommand(command);
  const settings = command.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Only operational settings are supported.');
  const allowed = product === 'status' ? STATUS_KEYS : product === 'breath' ? BREATH_KEYS : null;
  if (!allowed) throw new Error('This Panda product does not have a validated control profile yet.');
  for (const key of Object.keys(settings)) {
    if (!allowed.has(key)) throw new Error(`Blocked non-operational setting: ${key}`);
  }

  if (product === 'status') {
    if ('rgb_info_mode' in settings) settings.rgb_info_mode = assertNumber(settings.rgb_info_mode, 0, 1, 'Lighting mode');
    if ('rgb_info_brightness' in settings) {
      const brightness = assertNumber(settings.rgb_info_brightness, 0, 100, 'Brightness');
      if (brightness % 5 !== 0) throw new Error('Brightness must use 5% increments.');
      settings.rgb_info_brightness = String(brightness);
    }
    if ('rgb_state_index' in settings) settings.rgb_state_index = assertNumber(settings.rgb_state_index, 0, 2, 'State index');
    if ('rgb_rgba' in settings && !/^#[0-9a-f]{8}$/i.test(settings.rgb_rgba)) throw new Error('Color must be an 8-digit RGBA value.');
    if ('rgb_reset' in settings) settings.rgb_reset = 1;
  }

  if (product === 'breath') {
    if ('work_on' in settings) settings.work_on = Boolean(settings.work_on);
    if ('work_mode' in settings) settings.work_mode = assertNumber(settings.work_mode, 1, 3, 'Work mode');
    if ('set_temp' in settings) settings.set_temp = assertNumber(settings.set_temp, 0, 60, 'Target chamber temperature');
    if ('filtertemp' in settings) settings.filtertemp = assertNumber(settings.filtertemp, 0, 120, 'Filter threshold');
    if ('hotbedtemp' in settings) settings.hotbedtemp = assertNumber(settings.hotbedtemp, 40, 120, 'Heater threshold');
    if ('filament_temp' in settings) settings.filament_temp = assertNumber(settings.filament_temp, 40, 60, 'Drying temperature');
    if ('filament_timer' in settings) settings.filament_timer = assertNumber(settings.filament_timer, 1, 99, 'Drying duration');
    if ('filament_drying_mode' in settings) settings.filament_drying_mode = assertNumber(settings.filament_drying_mode, 1, 3, 'Drying preset');
    if ('isrunning' in settings) settings.isrunning = assertNumber(settings.isrunning, 0, 1, 'Drying state');
  }
  return { settings };
}

function sanitizeState(product, frames) {
  const initial = frames.find(frame => product === 'vent' ? frame?.rgb_mode : frame?.settings && (
    product === 'status' ? Array.isArray(frame.settings.list2) : frame.settings.work_mode !== undefined
  ));
  if (!initial) throw new Error('The device did not return a recognized operational state.');
  if (product === 'status') {
    return {
      product,
      firmware: initial.settings.fw_version || null,
      mode: Number(initial.settings.current_mode),
      modes: initial.settings.list2.map(item => ({
        brightness: Number(item.brightness),
        colors: Array.isArray(item.rgb_rgba) ? item.rgb_rgba.slice(0, 3) : [],
      })),
    };
  }
  if (product === 'vent') {
    const rgb = initial.rgb_mode;
    const firmware = frames.find(frame => frame?.settings?.fw_version)?.settings?.fw_version;
    return {
      product,
      firmware: firmware || 'V1.0.0',
      enabled: Boolean(rgb.light_on_off),
      mode: Number(rgb.rgb_light_mode),
      warningOverride: Boolean(rgb.warning_sw),
      followPrinter: Boolean(rgb.is_follow_printer),
      followVent: Boolean(rgb.is_follow_vent),
      reverse: Boolean(rgb.is_reverse),
      simple: {
        activeEffect: Number(rgb.current_simple_effect),
        effects: (rgb.effects || []).map(item => ({ id: Number(item.id), brightness: Number(item.brightness), speed: Number(item.speed), color: String(item.color || 'FFFFFF').replace('#', '').toUpperCase() })),
      },
      advanced: {
        states: (rgb.h2d_mode?.device_states || []).map(item => ({ stateId: Number(item.device_state_id), activeEffect: Number(item.active_effect_id), effects: (item.effects || []).map(effect => ({ id: Number(effect.effect_id), brightness: Number(effect.brightness), speed: Number(effect.speed), color: String(effect.color || 'FFFFFF').replace('#', '').toUpperCase() })) })),
      },
      warning: Object.fromEntries(['safe', 'warn'].map(key => {
        const source = rgb.warning_hot_mode?.[key] || {};
        return [key, { activeEffect: Number(source.current_effect || 0), effects: (source.params || []).map(item => ({ id: Number(item.index), brightness: Number(item.bg), speed: Number(item.speed) })) }];
      })),
    };
  }
  const telemetry = [...frames].reverse().find(frame => frame?.settings?.warehouse_temper !== undefined);
  const settings = initial.settings;
  return {
    product,
    firmware: settings.fw_version || null,
    enabled: Boolean(Number(settings.work_on)),
    mode: Number(settings.work_mode),
    targetTemp: Number(settings.set_temp),
    filterTemp: Number(settings.filtertemp),
    heaterTemp: Number(settings.hotbedtemp),
    dryingTemp: Number(settings.custom_temp),
    dryingHours: Number(settings.custom_timer),
    drying: Boolean(Number(settings.isrunning)),
    remainingSeconds: Number(settings.remaining_seconds),
    chamberTemp: telemetry ? Number(telemetry.settings.warehouse_temper) : null,
  };
}

module.exports = {
  BREATH_KEYS,
  STATUS_KEYS,
  VENT_SWITCH_KEYS,
  detectProductFromHtml,
  normalizeTarget,
  sanitizeControlVentState,
  sanitizeState,
  validateControlVentLighting,
  validateControlVentSettings,
  validateCommand,
};
