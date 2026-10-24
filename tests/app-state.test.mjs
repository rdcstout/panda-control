import assert from 'node:assert/strict';
import test from 'node:test';
import {
  controlVentCommandSatisfied,
  deviceSessionKey,
  draftsEquivalent,
  ipcErrorMessage,
  isLatestDeviceRequest,
  ownsActiveDraft,
  parseRemovedDeviceIds,
  parseSavedDevices,
  shouldReplaceDraftAfterCommand,
  shouldReplaceDraftAfterSave,
} from '../src/appState.js';

test('persisted devices reject malformed records and duplicate identities', () => {
  const parsed = parseSavedDevices(JSON.stringify([
    { id: 'status-1', ip: '192.168.1.20', name: 'Panda Status', product: 'status', hardwareId: 'AA' },
    { id: 'status-1', ip: '192.168.1.21', name: 'Duplicate', product: 'status' },
    { id: 'bad-product', ip: '192.168.1.22', name: 'Bad', product: 'coffee-maker' },
    { id: 'missing-ip', name: 'Bad', product: 'status' },
    null,
  ]));
  assert.deepEqual(parsed, [
    { id: 'status-1', ip: '192.168.1.20', name: 'Panda Status', product: 'status', hardwareId: 'AA' },
  ]);
  assert.deepEqual(parseSavedDevices('{broken'), []);
  assert.deepEqual(parseSavedDevices(JSON.stringify({ id: 'not-an-array' })), []);
});

test('persisted removed-device identities retain only non-empty strings', () => {
  assert.deepEqual([...parseRemovedDeviceIds(JSON.stringify(['one', '', 2, null, 'two', 'one']))], ['one', 'two']);
  assert.deepEqual([...parseRemovedDeviceIds('{broken')], []);
});

test('device sessions change when a reconciled address or product changes', () => {
  const original = deviceSessionKey({ id: 'device-1', product: 'vent', ip: '192.168.1.20' });
  assert.notEqual(original, deviceSessionKey({ id: 'device-1', product: 'vent', ip: '192.168.1.21' }));
  assert.notEqual(original, deviceSessionKey({ id: 'device-1', product: 'control-vent', ip: '192.168.1.20' }));
});

test('only the latest request may publish and only the active session owns its draft', () => {
  assert.equal(isLatestDeviceRequest(5, 5), true);
  assert.equal(isLatestDeviceRequest(4, 5), false);
  assert.equal(ownsActiveDraft('same\u0000vent\u000010.0.0.2', 'same\u0000vent\u000010.0.0.2'), true);
  assert.equal(ownsActiveDraft('same\u0000vent\u000010.0.0.2', 'same\u0000vent\u000010.0.0.3'), false);
});

test('save verification normalizes harmless firmware formatting but detects material differences', () => {
  const requested = {
    product: 'control-vent',
    policy: { automationMode: 'advanced', bedSeal: 85, bedOpen: 45, bedClose: 35 },
    filamentRules: [{ name: ' abs ', seal: true }, { name: '', seal: false }],
    lighting: { vent: { idle: '#aabbcc' } },
  };
  const returned = {
    product: 'control-vent',
    policy: { bedClose: 35, bedOpen: 45, bedSeal: 85, automationMode: 'advanced' },
    filamentRules: [{ name: 'ABS', seal: true }],
    lighting: { vent: { idle: '#AABBCC' } },
  };
  assert.equal(draftsEquivalent(requested, returned), true);
  assert.equal(draftsEquivalent(requested, { ...returned, policy: { ...returned.policy, bedSeal: 90 } }), false);
});

test('save completion cannot replace a newer edit or a different device draft', () => {
  const requested = { product: 'breath', targetTemp: 50 };
  const returned = { product: 'breath', targetTemp: 50 };
  const args = { operationKey: 'breath-a', activeKey: 'breath-a', currentDraft: requested, requestedDraft: requested, returnedDraft: returned };
  assert.equal(shouldReplaceDraftAfterSave(args), true);
  assert.equal(shouldReplaceDraftAfterSave({ ...args, currentDraft: { ...requested, targetTemp: 55 } }), false);
  assert.equal(shouldReplaceDraftAfterSave({ ...args, activeKey: 'breath-b' }), false);
  assert.equal(shouldReplaceDraftAfterSave({ ...args, returnedDraft: { ...returned, targetTemp: 45 } }), false);
});

test('immediate vent commands preserve unsaved configuration', () => {
  const baseline = { product: 'control-vent', policy: { bedSeal: 85 } };
  const args = { operationKey: 'vent-a', activeKey: 'vent-a', currentDraft: baseline, baseline };
  assert.equal(shouldReplaceDraftAfterCommand(args), true);
  assert.equal(shouldReplaceDraftAfterCommand({ ...args, currentDraft: { product: 'control-vent', policy: { bedSeal: 90 } } }), false);
  assert.equal(shouldReplaceDraftAfterCommand({ ...args, activeKey: 'vent-b' }), false);
});

test('vent control commands require the returned operating mode and target', () => {
  assert.equal(controlVentCommandSatisfied({ name: 'auto' }, { mode: 'auto', ventTarget: 'closed' }), true);
  assert.equal(controlVentCommandSatisfied({ name: 'auto' }, { mode: 'manual', ventTarget: 'closed' }), false);
  assert.equal(controlVentCommandSatisfied({ name: 'manual', target: 'open' }, { mode: 'manual', ventTarget: 'open' }), true);
  assert.equal(controlVentCommandSatisfied({ name: 'manual', target: 'open' }, { mode: 'manual', ventTarget: 'closed' }), false);
});

test('IPC errors are presented without Electron transport boilerplate', () => {
  assert.equal(
    ipcErrorMessage(new Error("Error invoking remote method 'panda:scan': Error: Local Network access denied")),
    'Local Network access denied',
  );
});
