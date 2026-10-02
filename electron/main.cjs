const { app, BrowserWindow, ipcMain, net, screen, shell } = require('electron');
const path = require('node:path');
const {
  applyCommands,
  collectFrames,
  probeDevice,
  scanDevices,
} = require('./network.cjs');
const { normalizeTarget } = require('./protocol.cjs');
const { compareVersions } = require('./update.cjs');
const { installLinuxSquareResizeCorrection } = require('./windowGeometry.cjs');

const WEBSITE = 'https://extrusiontherapy.com/';
const RELEASES_API = 'https://api.github.com/repos/rdcstout/panda-control/releases/latest';
const RELEASES_PAGE = 'https://github.com/rdcstout/panda-control/releases/';

function createWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const availableSize = Math.min(workArea.width - 80, workArea.height - 80);
  const windowSize = Math.min(1200, Math.max(560, availableSize));
  const window = new BrowserWindow({
    width: windowSize,
    height: windowSize,
    minWidth: 560,
    minHeight: 560,
    useContentSize: true,
    backgroundColor: '#101216',
    title: 'Panda Control',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 20, y: 21 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setAspectRatio(1);
  installLinuxSquareResizeCorrection(window, screen);
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url === WEBSITE) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.loadFile(path.join(__dirname, '..', 'dist', 'client', 'index.html'));
}

ipcMain.handle('panda:scan', () => scanDevices());
ipcMain.handle('panda:probe', (_event, target) => probeDevice(target));
ipcMain.handle('panda:state', (_event, device) => collectFrames(normalizeTarget(device.ip), device.product));
ipcMain.handle('panda:apply', (_event, payload) => applyCommands(payload.ip, payload.product, payload.commands));
ipcMain.handle('panda:open-device', (_event, target) => shell.openExternal(`http://${normalizeTarget(target)}/`));
ipcMain.handle('panda:open-website', () => shell.openExternal(WEBSITE));
ipcMain.handle('panda:open-privacy-settings', async () => {
  if (process.platform !== 'darwin') return false;
  await shell.openExternal('x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension');
  return true;
});
ipcMain.handle('panda:update-check', async () => {
  const response = await net.fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
  const release = await response.json();
  const current = app.getVersion();
  const latest = String(release.tag_name || '').replace(/^v/i, '');
  const releaseUrl = String(release.html_url || '');
  if (!releaseUrl.startsWith(RELEASES_PAGE)) throw new Error('GitHub returned an unexpected release address.');
  return { current, latest, releaseUrl, updateAvailable: compareVersions(latest, current) > 0 };
});
ipcMain.handle('panda:update-open', (_event, url) => {
  const target = String(url || '');
  if (!target.startsWith(RELEASES_PAGE)) throw new Error('That update address is not allowed.');
  return shell.openExternal(target);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
