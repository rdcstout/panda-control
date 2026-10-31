// Run against an installed release package in a disposable CI profile.
// Discovery is controlled; packaged rendering, IPC, reconciliation and storage are real.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require(process.env.PANDA_PLAYWRIGHT_MODULE || 'playwright-core');

async function main() {
  const executablePath = process.argv[2];
  if (!executablePath) throw new Error('Pass the installed Panda Control executable.');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'panda-scan-profile-'));
  const status = { id: 'status@mac:02:00:00:00:00:01', hardwareId: 'mac:02:00:00:00:00:01', ip: '192.0.2.1', name: 'Panda Status', product: 'status' };
  const vent = { id: 'control-vent@mac:02:00:00:00:00:02', hardwareId: 'mac:02:00:00:00:00:02', ip: '192.0.2.2', name: 'Panda C Vent', product: 'control-vent' };
  let instance;
  async function launch() {
    instance = await _electron.launch({ executablePath, args: [`--user-data-dir=${profile}`, '--disable-gpu', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], timeout: 60000 });
    await instance.evaluate(({ ipcMain }, discoveries) => {
      ipcMain.removeHandler('panda:scan');
      ipcMain.handle('panda:scan', () => discoveries);
      ipcMain.removeHandler('panda:state');
      ipcMain.handle('panda:state', () => ({ product: 'status', firmware: 'test', mode: 1, modes: [{ brightness: 50 }, { brightness: 50, colors: ['#FFFFFFFF', '#FFFFFFFF', '#FF0000FF'] }] }));
    }, [status, vent]);
    return instance.firstWindow();
  }
  try {
    let page = await launch();
    await page.waitForFunction(() => localStorage.getItem('panda-control-devices-v1') !== null);
    await page.evaluate(({ status, vent }) => {
      localStorage.setItem('panda-control-devices-v1', JSON.stringify([status]));
      localStorage.setItem('panda-control-removed-devices-v1', JSON.stringify([vent.id, vent.hardwareId]));
      localStorage.setItem('panda-control-auto-updates-v1', 'false');
    }, { status, vent });
    await page.reload();
    assert.equal(await page.getByRole('button', { name: 'Panda C Vent', exact: true }).count(), 0);
    for (let scan = 0; scan < 2; scan++) {
      await page.getByRole('button', { name: 'Scan for devices', exact: true }).click();
      await page.getByRole('button', { name: 'Panda C Vent', exact: true }).waitFor();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('panda-control-devices-v1')).length === 2);
      assert.equal(await page.getByRole('button', { name: 'Panda C Vent', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Panda Status', exact: true }).count(), 1);
    }
    await instance.close(); instance = null;
    page = await launch();
    await page.getByRole('button', { name: 'Panda C Vent', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Panda Status', exact: true }).count(), 1);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('panda-control-devices-v1')));
    assert.equal(saved.length, 2);
    const screenshot = process.env.PANDA_SCAN_SCREENSHOT;
    if (screenshot) await page.screenshot({ path: screenshot });
    console.log('PASS: installed package restores a previously removed Vent via toolbar Scan, avoids duplicates, and retains both devices after quit/relaunch. Discovery responses are synthetic.');
  } finally {
    if (instance) await instance.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
