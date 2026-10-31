// Exercise the shipped renderer, IPC and saved profile with controlled discovery.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PANDA_PLAYWRIGHT_MODULE || 'playwright-core');

async function main() {
  const executablePath = process.argv[2];
  if (!executablePath) throw new Error('Pass the Panda Control executable.');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'panda-recovery-profile-'));
  const saved = { id: 'control-vent@mac:02:00:00:00:00:02', hardwareId: 'mac:02:00:00:00:00:02', ip: '192.0.2.2', name: 'Panda C Vent', product: 'control-vent' };
  const found = { ...saved, ip: '192.0.2.22' };
  let instance;
  try {
    instance = await _electron.launch({ executablePath, args: [...(process.argv[3] ? [process.argv[3]] : []), `--user-data-dir=${profile}`, '--disable-gpu'], timeout: 60000 });
    await instance.evaluate(({ ipcMain }, discovered) => {
      ipcMain.removeHandler('panda:scan');
      ipcMain.handle('panda:scan', () => [discovered]);
      ipcMain.removeHandler('panda:state');
      ipcMain.handle('panda:state', () => { throw new Error('Synthetic disconnected state'); });
    }, found);
    const page = await instance.firstWindow();
    await page.evaluate(device => {
      localStorage.setItem('panda-control-devices-v1', JSON.stringify([device]));
      localStorage.setItem('panda-control-auto-updates-v1', 'false');
    }, saved);
    await page.reload();
    await page.getByRole('button', { name: 'Add a device', exact: true }).click();
    const action = page.getByRole('button', { name: 'Open Panda C Vent', exact: true });
    await action.waitFor({ timeout: 5000 });
    assert.equal(await action.isEnabled(), true, 'A known device must remain actionable');
    await action.click();
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 5000 });
    await page.waitForFunction(ip => JSON.parse(localStorage.getItem('panda-control-devices-v1'))[0].ip === ip, found.ip);
    assert.equal(await page.getByRole('button', { name: 'Panda C Vent', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Panda C Vent', exact: true }).getAttribute('aria-pressed'), 'true');
    const devices = await page.evaluate(() => JSON.parse(localStorage.getItem('panda-control-devices-v1')));
    assert.deepEqual(devices, [found]);
    // A genuinely missing tab must still be addable, then selectable on a rescan.
    await page.evaluate(() => localStorage.setItem('panda-control-devices-v1', '[]'));
    await page.reload();
    await page.getByRole('button', { name: 'Add a device', exact: true }).click();
    await page.getByRole('button', { name: 'Add Panda C Vent', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Add a device', exact: true }).click();
    await page.getByRole('button', { name: 'Open Panda C Vent', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.getByRole('button', { name: 'Panda C Vent', exact: true }).count(), 1);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('panda-control-devices-v1')).length === 1);
    console.log('PASS: known Vent refreshes its address and opens; missing Vent adds; repeated discovery opens its sole tab and closes Add. Controlled discovery; no hardware commands.');
  } finally {
    if (instance) await instance.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
