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
  const saved = device('status', '192.168.5.28', 'mac:10:51:db:b4:0f:40');
  const found = device('status', '192.168.4.34', 'mac:10:51:db:b4:0f:40');
  const result = reconcileDevices([saved], [found]);
  assert.equal(result.devices.length, 1);
  assert.equal(result.devices[0].ip, '192.168.4.34');
  assert.equal(result.devices[0].id, saved.id);
});

test('two devices of the same product remain separate when their MAC addresses differ', () => {
  const first = device('status', '192.168.4.34', 'mac:10:51:db:b4:0f:40');
  const second = device('status', '192.168.4.35', 'mac:10:51:db:b4:0f:41');
  const result = reconcileDevices([first], [second]);
  assert.deepEqual(result.devices.map(item => item.id), [first.id, second.id]);
});

test('one unambiguous legacy record migrates to the discovered hardware identity', () => {
  const legacy = device('breath', '192.168.5.93');
  const found = device('breath', '192.168.4.27', 'mac:ac:eb:e6:95:9b:2c');
  const result = reconcileDevices([legacy], [found]);
  assert.equal(result.devices.length, 1);
  assert.equal(result.devices[0].id, legacy.id);
  assert.equal(result.devices[0].hardwareId, found.hardwareId);
  assert.equal(result.devices[0].ip, found.ip);
});

test('ambiguous legacy records are not silently collapsed', () => {
  const legacyA = device('status', '192.168.5.28');
  const legacyB = device('status', '192.168.5.29');
  const found = device('status', '192.168.4.34', 'mac:10:51:db:b4:0f:40');
  const result = reconcileDevices([legacyA, legacyB], [found]);
  assert.equal(result.devices.length, 3);
});

test('the add-device view recognizes a known MAC after its IP changes', () => {
  const saved = device('control-vent', '192.168.5.94', 'mac:84:1f:e8:ea:c9:50');
  const found = device('control-vent', '192.168.4.70', 'mac:84:1f:e8:ea:c9:50');
  assert.equal(isKnownDevice([saved], found), true);
});
