const DEFAULT_DEVICES = [];

const frameText = async data => typeof data === 'string' ? data : await data.text();

function sanitize(product, frames) {
  const initial = frames.find(frame => product === 'status'
    ? Array.isArray(frame?.settings?.list2)
    : product === 'breath'
      ? frame?.settings?.work_mode !== undefined
      : frame?.rgb_mode);
  if (!initial) throw new Error('No recognized operational state was returned.');
  if (product === 'status') {
    return {
      product,
      firmware: initial.settings.fw_version || 'V1.0.0',
      mode: Number(initial.settings.current_mode),
      modes: initial.settings.list2.map(item => ({
        brightness: Number(item.brightness),
        colors: item.rgb_rgba?.slice(0, 3) || [],
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
    firmware: settings.fw_version,
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

function browserRead(device, duration = 1400) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${device.ip}/ws`);
    const frames = [];
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.close();
      try { resolve(sanitize(device.product, frames)); } catch (error) { reject(error); }
    };
    const timer = setTimeout(finish, duration);
    socket.onerror = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(new Error(`Could not reach ${device.name}.`));
    };
    socket.onmessage = async event => {
      try {
        const frame = JSON.parse(await frameText(event.data));
        frames.push(frame);
        if (device.product === 'status' && frame.settings?.list2) setTimeout(finish, 20);
        if (device.product === 'breath' && frame.settings?.warehouse_temper !== undefined) finish();
        if (device.product === 'vent' && frame.rgb_mode) setTimeout(finish, 20);
      } catch (_) {}
    };
  });
}

function browserSend(device, command) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${device.ip}/ws`);
    let sent = false;
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('The device did not become ready.'));
    }, 5000);
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Could not write to ${device.name}.`));
    };
    socket.onmessage = async event => {
      if (sent) return;
      try {
        const frame = JSON.parse(await frameText(event.data));
        if (frame.settings || frame.rgb_mode) {
          sent = true;
          socket.send(JSON.stringify(command));
          setTimeout(() => {
            clearTimeout(timer);
            socket.close();
            resolve();
          }, 300);
        }
      } catch (_) {}
    };
  });
}

const browserApi = {
  platform: 'browser',
  async scanDevices() {
    const results = await Promise.all(DEFAULT_DEVICES.map(async device => {
      try { await browserRead(device, 900); return device; } catch (_) { return null; }
    }));
    return results.filter(Boolean);
  },
  async probeDevice(input) {
    const ip = String(input).trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    for (const product of ['status', 'breath', 'vent']) {
      const device = { id: `${product}@${ip}`, ip, product, name: product === 'status' ? 'Panda Status' : product === 'breath' ? 'Panda Breath' : 'Panda Vent' };
      try { await browserRead(device, 1000); return device; } catch (_) {}
    }
    throw new Error('That address did not return a supported Panda device.');
  },
  readDeviceState: browserRead,
  async applyDeviceCommands({ ip, product, commands }) {
    const device = { ip, product, name: product === 'status' ? 'Panda Status' : product === 'breath' ? 'Panda Breath' : 'Panda Vent' };
    for (const command of commands) await browserSend(device, command);
    return browserRead(device);
  },
  openDevicePage(ip) { window.open(`http://${ip}/`, '_blank', 'noopener,noreferrer'); },
  openWebsite() { window.open('https://extrusiontherapy.com/', '_blank', 'noopener,noreferrer'); },
};

export const deviceApi = window.pandaControl || browserApi;
