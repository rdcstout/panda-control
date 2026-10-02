const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pandaControl', {
  platform: process.platform,
  scanDevices: () => ipcRenderer.invoke('panda:scan'),
  probeDevice: target => ipcRenderer.invoke('panda:probe', target),
  readDeviceState: device => ipcRenderer.invoke('panda:state', device),
  applyDeviceCommands: payload => ipcRenderer.invoke('panda:apply', payload),
  openDevicePage: target => ipcRenderer.invoke('panda:open-device', target),
  openWebsite: () => ipcRenderer.invoke('panda:open-website'),
  openPrivacySettings: () => ipcRenderer.invoke('panda:open-privacy-settings'),
  checkForUpdates: () => ipcRenderer.invoke('panda:update-check'),
  openRelease: url => ipcRenderer.invoke('panda:update-open', url),
});
