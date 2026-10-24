import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { CONTROL_VENT_CONTRACT, controlVentDecision, controlVentPolicySummary } from '../src/controlVentContract.js';

const fixture = JSON.parse(await readFile(new URL('./fixtures/panda-control-vent-ui-contract.json', import.meta.url), 'utf8'));

test('desktop Panda Control Vent copy and bounds match the versioned firmware contract', () => {
  assert.deepEqual(CONTROL_VENT_CONTRACT, fixture);
});

test('versioned desktop contract matches the canonical firmware source when both repositories are present', async t => {
  const firmwareUrl = new URL('../../panda-control-vent/firmware/components/dc_ui/www/app.html', import.meta.url);
  if (!existsSync(firmwareUrl)) return t.skip('Panda Control Vent firmware repository is not adjacent to the desktop checkout.');
  const firmware = await readFile(firmwareUrl, 'utf8');
  const exactStrings = [
    ...Object.entries(fixture.automation).filter(([, value]) => typeof value === 'string').map(([, value]) => value),
    ...Object.entries(fixture.lighting).filter(([, value]) => typeof value === 'string').map(([, value]) => value),
    ...fixture.lighting.effects,
  ];
  for (const value of exactStrings) assert.ok(firmware.includes(value), `Firmware source is missing contract text: ${value}`);
  assert.match(firmware, /id="seal-temp" type="range" min="40" max="120"/);
  assert.match(firmware, /id="open-temp" type="range" min="20" max="120"/);
  assert.match(firmware, /id="close-temp" type="range" min="0" max="110"/);
});

test('desktop Panda Control Vent decision copy matches firmware behavior', () => {
  const simple = { automationMode: 'simple', bedSeal: 85, bedOpen: 45, bedClose: 35 };
  assert.deepEqual(controlVentDecision({ mode: 'auto', printerConnected: false, ventTarget: 'closed' }, simple), [
    'Chamber sealed', 'Automatic control is waiting for printer data.',
  ]);
  assert.deepEqual(controlVentDecision({ mode: 'auto', printerConnected: true, bedTarget: 60, ventTarget: 'open' }, simple), [
    'Vents open', 'Commanded bed target: 60°C · seal threshold: 85°C.',
  ]);
  assert.deepEqual(controlVentDecision({ mode: 'manual', printerConnected: true, bedTarget: 100, ventTarget: 'closed' }, simple), [
    'Chamber sealed', 'Manual vent control is active.',
  ]);
  assert.deepEqual(controlVentDecision({ mode: 'auto', printerConnected: true, bedTarget: 0, bedTemperature: 42.6, ventTarget: 'open' }, simple), [
    'Vents open', 'Cooldown bed temperature: 43°C · opens at 45°C and closes below 35°C.',
  ]);
  assert.deepEqual(controlVentDecision(
    { mode: 'auto', printerConnected: true, bedTarget: 100, ventTarget: 'closed', material: 'abs' },
    { ...simple, automationMode: 'advanced' },
    [{ name: 'ABS', seal: true }],
  ), [
    'Chamber sealed', 'ABS rule: keep the chamber sealed while printing.',
  ]);
  assert.deepEqual(controlVentPolicySummary(simple), [
    'Printing: bed targets below 85 °C open the vents; targets at or above it keep them sealed.',
    'Cooldown: closes the vents when the bed reaches 35 °C.',
  ]);
});
