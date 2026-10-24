const DEVICE_PRODUCTS = new Set(['status', 'breath', 'vent', 'control-vent', 'unknown']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseSavedDevices(rawValue) {
  let parsed;
  try { parsed = JSON.parse(rawValue || '[]'); } catch (_) { return []; }
  if (!Array.isArray(parsed)) return [];

  const ids = new Set();
  return parsed.filter(device => {
    if (!isRecord(device)
      || typeof device.id !== 'string' || !device.id
      || typeof device.ip !== 'string' || !device.ip
      || typeof device.name !== 'string' || !device.name
      || !DEVICE_PRODUCTS.has(device.product)
      || !(device.hardwareId == null || typeof device.hardwareId === 'string')
      || ids.has(device.id)) return false;
    ids.add(device.id);
    return true;
  });
}

export function parseRemovedDeviceIds(rawValue) {
  let parsed;
  try { parsed = JSON.parse(rawValue || '[]'); } catch (_) { return new Set(); }
  if (!Array.isArray(parsed)) return new Set();
  return new Set(parsed.filter(value => typeof value === 'string' && value));
}

export function deviceSessionKey(device) {
  if (!device) return '';
  return `${device.id}\u0000${device.product}\u0000${device.ip}`;
}

export function ipcErrorMessage(problem) {
  return String(problem?.message || problem || 'Unknown error')
    .replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}

function normalizeComparable(value, key = '') {
  if (Array.isArray(value)) return value.map(item => normalizeComparable(item));
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map(name => [name, normalizeComparable(value[name], name)]));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
    if (key === 'name') return trimmed.toUpperCase();
    return trimmed;
  }
  return value;
}

export function normalizeDraftForComparison(draft) {
  if (!isRecord(draft)) return draft;
  const comparable = structuredClone(draft);
  if (comparable.product === 'control-vent' && Array.isArray(comparable.filamentRules)) {
    comparable.filamentRules = comparable.filamentRules
      .filter(rule => typeof rule?.name === 'string' && rule.name.trim())
      .map(rule => ({ ...rule, name: rule.name.trim().toUpperCase() }));
  }
  return normalizeComparable(comparable);
}

export function draftsEquivalent(requested, returned) {
  return JSON.stringify(normalizeDraftForComparison(requested))
    === JSON.stringify(normalizeDraftForComparison(returned));
}

export function isLatestDeviceRequest(requestId, latestRequestId) {
  return requestId === latestRequestId;
}

export function ownsActiveDraft(requestKey, activeKey) {
  return Boolean(requestKey) && requestKey === activeKey;
}

export function shouldReplaceDraftAfterSave({ operationKey, activeKey, currentDraft, requestedDraft, returnedDraft }) {
  return ownsActiveDraft(operationKey, activeKey)
    && draftsEquivalent(currentDraft, requestedDraft)
    && draftsEquivalent(requestedDraft, returnedDraft);
}

export function shouldReplaceDraftAfterCommand({ operationKey, activeKey, currentDraft, baseline }) {
  return ownsActiveDraft(operationKey, activeKey) && draftsEquivalent(currentDraft, baseline);
}

export function controlVentCommandSatisfied(command, state) {
  if (!isRecord(command) || !isRecord(state)) return false;
  if (command.name === 'auto') return state.mode === 'auto';
  if (command.name === 'manual' && (command.target === 'open' || command.target === 'closed')) {
    return state.mode === 'manual' && state.ventTarget === command.target;
  }
  return false;
}
