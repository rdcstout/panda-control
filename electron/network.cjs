const http = require('node:http');
const os = require('node:os');
const zlib = require('node:zlib');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { WebSocket } = require('ws');
const {
  detectProductFromHtml,
  normalizeTarget,
  sanitizeControlVentState,
  sanitizeState,
  validateControlVentLighting,
  validateControlVentSettings,
  validateCommand,
} = require('./protocol.cjs');

const execFileAsync = promisify(execFile);

function parseNeighborMac(output) {
  const match = String(output || '').match(/\b([0-9a-f]{1,2}(?::|-)){5}[0-9a-f]{1,2}\b/i);
  if (!match) return null;
  return match[0].split(/[:-]/).map(part => part.padStart(2, '0')).join(':').toLowerCase();
}

async function resolveHardwareId(target) {
  const attempts = process.platform === 'win32'
    ? [['arp.exe', ['-a', target]]]
    : process.platform === 'darwin'
      ? [['/usr/sbin/arp', ['-n', target]]]
      : [['ip', ['neigh', 'show', target]], ['arp', ['-n', target]]];
  for (const [command, args] of attempts) {
    try {
      const { stdout } = await execFileAsync(command, args, { timeout: 1200, windowsHide: true });
      const mac = parseNeighborMac(stdout);
      if (mac) return `mac:${mac}`;
    } catch (_) {}
  }
  return null;
}

function discoveredDevice(identity, target, hardwareId) {
  return {
    id: hardwareId ? `${identity.product}@${hardwareId}` : `${identity.product}@${target}`,
    hardwareId,
    ip: target,
    ...identity,
  };
}

function readableNetworkError(target, error) {
  if (process.platform === 'darwin' && ['EHOSTUNREACH', 'EACCES', 'EPERM'].includes(error?.code)) {
    return new Error(`macOS blocked Panda Control from reaching ${target}. Allow Panda Control in System Settings → Privacy & Security → Local Network.`);
  }
  return error;
}

function httpPage(target, timeout = 900) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: target, port: 80, path: '/', timeout }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size <= 512 * 1024) chunks.push(chunk);
      });
      response.on('end', () => {
        try {
          const body = Buffer.concat(chunks);
          const encoding = String(response.headers['content-encoding'] || '').toLowerCase();
          const decoded = encoding === 'gzip' ? zlib.gunzipSync(body)
            : encoding === 'deflate' ? zlib.inflateSync(body)
              : encoding === 'br' ? zlib.brotliDecompressSync(body)
                : body;
          resolve(decoded.toString('utf8'));
        } catch (error) { reject(new Error(`Could not decode the device interface: ${error.message}`)); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Connection timed out.')));
    request.on('error', error => reject(readableNetworkError(target, error)));
  });
}

function httpJson(target, path, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const headers = payload ? {
      'Content-Type': 'application/json',
      'Content-Length': payload.length,
      'X-Dragon-Auth': 'web',
      'X-DragonBreath-Auth': 'web',
    } : {};
    const request = http.request({
      host: target,
      port: 80,
      path,
      method,
      timeout: 2500,
      headers,
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size <= 256 * 1024) chunks.push(chunk);
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Panda Control Vent returned HTTP ${response.statusCode}.`));
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (error) { reject(new Error(`Could not read Panda Control Vent data: ${error.message}`)); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Connection timed out.')));
    request.on('error', error => reject(readableNetworkError(target, error)));
    if (payload) request.write(payload);
    request.end();
  });
}

async function collectControlVentState(target) {
  const [state, lighting, settings] = await Promise.all([
    httpJson(target, '/api/v2/state'),
    httpJson(target, '/api/v2/lighting'),
    httpJson(target, '/api/v2/settings'),
  ]);
  return sanitizeControlVentState(state, lighting, settings);
}

async function applyControlVentCommands(target, commands) {
  if (!Array.isArray(commands) || commands.length === 0 || commands.length > 3) {
    throw new Error('No valid Panda Control Vent command was supplied.');
  }
  for (const item of commands) {
    const roots = item && typeof item === 'object' && !Array.isArray(item) ? Object.keys(item) : [];
    if (roots.length !== 1) throw new Error('Only one Panda Control Vent operation may be sent at a time.');
    if (item.command) {
      const command = item.command;
      const isAuto = command?.name === 'auto' && command.target === undefined;
      const isManual = command?.name === 'manual' && ['open', 'closed'].includes(command.target);
      if (!isAuto && !isManual) throw new Error('Only normal vent open, close, and automatic controls are allowed.');
      await httpJson(target, '/api/v2/command', { method: 'POST', body: { api_version: 2, command } });
    } else if (item.settings) {
      await httpJson(target, '/api/v2/settings', { method: 'POST', body: validateControlVentSettings(item.settings) });
    } else if (item.lighting) {
      await httpJson(target, '/api/v2/lighting', { method: 'POST', body: validateControlVentLighting(item.lighting) });
    } else {
      throw new Error('Unsupported Panda Control Vent operation.');
    }
  }
  return collectControlVentState(target);
}

async function probeDevice(input) {
  const target = normalizeTarget(input);
  const html = await httpPage(target, 1500);
  const identity = detectProductFromHtml(html);
  if (!identity) throw new Error('That address is not a recognized Panda device.');
  return discoveredDevice(identity, target, await resolveHardwareId(target));
}

function ipv4ToInt(address) {
  return address.split('.').reduce((result, part) => (result << 8) + Number(part), 0) >>> 0;
}

function intToIpv4(value) {
  return [24, 16, 8, 0].map(shift => value >>> shift & 255).join('.');
}

function candidateAddresses() {
  const candidates = new Set();
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      const address = ipv4ToInt(entry.address);
      let mask = ipv4ToInt(entry.netmask);
      let network = address & mask;
      let broadcast = network | (~mask >>> 0);
      if (broadcast - network > 1023) {
        mask = ipv4ToInt('255.255.255.0');
        network = address & mask;
        broadcast = network | 255;
      }
      for (let value = network + 1; value < broadcast; value += 1) {
        if (value !== address) candidates.add(intToIpv4(value));
      }
    }
  }
  return [...candidates];
}

async function scanDevices() {
  const queue = candidateAddresses();
  const found = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const target = queue[cursor++];
      try {
        const html = await httpPage(target, 700);
        const identity = detectProductFromHtml(html);
        if (identity) found.push(discoveredDevice(identity, target, await resolveHardwareId(target)));
      } catch (_) {}
    }
  };
  await Promise.all(Array.from({ length: Math.min(96, queue.length) }, worker));
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function collectFrames(target, product, duration = 1200) {
  if (product === 'control-vent') return collectControlVentState(target);
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${target}/ws`, { handshakeTimeout: 3000 });
    const frames = [];
    let initialSeen = false;
    let finished = false;
    let timer;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      socket.close();
      try { resolve(sanitizeState(product, frames)); } catch (error) { reject(error); }
    };
    timer = setTimeout(finish, product === 'breath' ? duration : 700);
    socket.on('message', value => {
      try {
        const frame = JSON.parse(value.toString());
        frames.push(frame);
        const settings = frame.settings || {};
        if (product === 'status' && Array.isArray(settings.list2)) {
          initialSeen = true;
          setTimeout(finish, 30);
        }
        if (product === 'breath' && settings.work_mode !== undefined) initialSeen = true;
        if (product === 'breath' && initialSeen && settings.warehouse_temper !== undefined) finish();
        if (product === 'vent' && frame.rgb_mode) setTimeout(finish, 30);
      } catch (_) {}
    });
    socket.on('error', error => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const readable = readableNetworkError(target, error);
      reject(readable === error ? new Error(`Could not reach ${target}: ${error.message}`) : readable);
    });
  });
}

function sendOne(target, product, input) {
  const command = validateCommand(product, JSON.parse(JSON.stringify(input)));
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://${normalizeTarget(target)}/ws`, { handshakeTimeout: 3000 });
    let sent = false;
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('The device did not become ready for the command.'));
    }, 5000);
    socket.on('message', value => {
      if (sent) return;
      try {
        const frame = JSON.parse(value.toString());
        if (frame.settings || product === 'vent' && frame.rgb_mode) {
          sent = true;
          socket.send(JSON.stringify(command));
          setTimeout(() => {
            clearTimeout(timer);
            socket.close();
            resolve();
          }, 280);
        }
      } catch (_) {}
    });
    socket.on('error', error => {
      clearTimeout(timer);
      const readable = readableNetworkError(target, error);
      reject(readable === error ? new Error(`Command failed: ${error.message}`) : readable);
    });
  });
}

async function applyCommands(target, product, commands) {
  if (product === 'control-vent') return applyControlVentCommands(normalizeTarget(target), commands);
  const maximumCommands = product === 'vent' ? 20 : 12;
  if (!Array.isArray(commands) || commands.length === 0 || commands.length > maximumCommands) throw new Error('No valid operational changes were supplied.');
  const safeTarget = normalizeTarget(target);
  for (const command of commands) await sendOne(safeTarget, product, command);
  return collectFrames(safeTarget, product);
}

module.exports = {
  applyCommands,
  candidateAddresses,
  collectFrames,
  parseNeighborMac,
  probeDevice,
  resolveHardwareId,
  scanDevices,
};
