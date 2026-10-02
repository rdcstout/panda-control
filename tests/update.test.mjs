import test from 'node:test';
import assert from 'node:assert/strict';
import updateModule from '../electron/update.cjs';
import { automaticUpdateCheckDue, shouldNotifyForUpdate, UPDATE_INTERVAL_MS } from '../src/updatePolicy.js';

const { compareVersions, versionParts } = updateModule;

test('release versions compare numerically rather than lexically', () => {
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('v0.1.3', '0.1.3'), 0);
  assert.equal(compareVersions('0.1.2', '0.1.3'), -1);
});

test('malformed releases are rejected instead of reported as updates', () => {
  assert.equal(versionParts('latest'), null);
  assert.throws(() => compareVersions('latest', '0.1.3'), /Invalid release version/);
});

test('stable releases outrank prereleases and prerelease identifiers compare correctly', () => {
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.2'), 1);
  assert.equal(compareVersions('1.0.0-rc.10', '1.0.0-rc.2'), 1);
  assert.equal(compareVersions('1.0.0-2', '1.0.0-beta'), -1);
});

test('automatic checks honor persisted schedule and disabled preference', () => {
  const now = 2_000_000_000_000;
  assert.equal(automaticUpdateCheckDue({ enabled: false, lastAttempt: 0, now }), false);
  assert.equal(automaticUpdateCheckDue({ enabled: true, lastAttempt: 0, now }), true);
  assert.equal(automaticUpdateCheckDue({ enabled: true, lastAttempt: now - UPDATE_INTERVAL_MS + 1, now }), false);
  assert.equal(automaticUpdateCheckDue({ enabled: true, lastAttempt: now - UPDATE_INTERVAL_MS, now }), true);
});

test('automatic notifications are deduplicated by release version', () => {
  assert.equal(shouldNotifyForUpdate('0.1.4', ''), true);
  assert.equal(shouldNotifyForUpdate('0.1.4', '0.1.4'), false);
  assert.equal(shouldNotifyForUpdate('0.1.5', '0.1.4'), true);
});
