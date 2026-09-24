const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const path = require('node:path');
const {
  applyCommands,
  collectFrames,
  probeDevice,
  scanDevices,
} = require('./network.cjs');
const { normalizeTarget } = require('./protocol.cjs');

const WEBSITE = 'https://extrusiontherapy.com/';

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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
