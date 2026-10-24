import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scanAddressPool } = require('../electron/network.cjs');

test('network discovery retries hosts that miss the fast first pass', async () => {
  const calls = [];
  const result = await scanAddressPool(
    ['192.168.1.10', '192.168.1.11'],
    async (address, timeout) => {
      calls.push([address, timeout]);
      if (address.endsWith('.10')) return { id: 'fast', ip: address };
      if (timeout < 1000) throw new Error('device still booting');
      return { id: 'slow', ip: address };
    },
    [{ concurrency: 2, timeout: 700 }, { concurrency: 1, timeout: 1400 }],
  );

  assert.deepEqual(result.map(device => device.id).sort(), ['fast', 'slow']);
  assert.deepEqual(calls.filter(([address]) => address.endsWith('.10')), [['192.168.1.10', 700]]);
  assert.deepEqual(calls.filter(([address]) => address.endsWith('.11')), [
    ['192.168.1.11', 700],
    ['192.168.1.11', 1400],
  ]);
});

test('network discovery remains bounded when a host never responds', async () => {
  let calls = 0;
  const result = await scanAddressPool(
    ['192.168.1.20'],
    async () => { calls += 1; throw new Error('offline'); },
    [{ concurrency: 1, timeout: 10 }, { concurrency: 1, timeout: 20 }],
  );

  assert.deepEqual(result, []);
  assert.equal(calls, 2);
});
