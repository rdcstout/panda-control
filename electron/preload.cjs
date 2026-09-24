const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pandaControl', {
  platform: process.platform,
  scanDevices: () => ipcRenderer.invoke('panda:scan'),
  probeDevice: target => ipcRenderer.invoke('panda:probe', target),
  readDeviceState: device => ipcRenderer.invoke('panda:state', device),
  applyDeviceCommands: payload => ipcRenderer.invoke('panda:apply', payload),
  openDevicePage: target => ipcRenderer.invoke('panda:open-device', target),
  openWebsite: () => ipcRenderer.invoke('panda:open-website'),
});
