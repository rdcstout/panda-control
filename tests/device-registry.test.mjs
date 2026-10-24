import assert from 'node:assert/strict';
import test from 'node:test';
import { isKnownDevice, reconcileDevices } from '../src/deviceRegistry.js';

const device = (product, ip, hardwareId = null) => ({
  id: hardwareId ? `${product}@${hardwareId}` : `${product}@${ip}`,
  product,
  ip,
  hardwareId,
  name: product,
});

test('a stable hardware identity updates its address without creating a duplicate', () => {
  const saved = device('status', '192.168.1.28', 'mac:02:00:00:00:00:40');
  const found = device('status', '192.168.1.34', 'mac:02:00:00:00:00:40');
  const result = reconcileDevices([saved], [found]);
  assert.equal(result.devices.length, 1);
  assert.equal(result.devices[0].ip, '192.168.1.34');
  assert.equal(result.devices[0].id, saved.id);
});

test('two devices of the same product remain separate when their MAC addresses differ', () => {
  const first = device('status', '192.168.1.34', 'mac:02:00:00:00:00:40');
  const second = device('status', '192.168.1.35', 'mac:02:00:00:00:00:41');
  const result = reconcileDevices([first], [second]);
  assert.deepEqual(result.devices.map(item => item.id), [first.id, second.id]);
});

test('one unambiguous legacy record migrates to the discovered hardware identity', () => {
  const legacy = device('breath', '192.168.1.93');
  const found = device('breath', '192.168.1.27', 'mac:02:00:00:00:00:27');
  const result = reconcileDevices([legacy], [found]);
  assert.equal(result.devices.length, 1);
  assert.equal(result.devices[0].id, legacy.id);
  assert.equal(result.devices[0].hardwareId, found.hardwareId);
  assert.equal(result.devices[0].ip, found.ip);
});

test('ambiguous legacy records are not silently collapsed', () => {
  const legacyA = device('status', '192.168.1.28');
  const legacyB = device('status', '192.168.1.29');
  const found = device('status', '192.168.1.34', 'mac:02:00:00:00:00:40');
  const result = reconcileDevices([legacyA, legacyB], [found]);
  assert.equal(result.devices.length, 3);
});

test('the add-device view recognizes a known MAC after its IP changes', () => {
  const saved = device('control-vent', '192.168.1.94', 'mac:02:00:00:00:00:50');
  const found = device('control-vent', '192.168.1.70', 'mac:02:00:00:00:00:50');
  assert.equal(isKnownDevice([saved], found), true);
});
