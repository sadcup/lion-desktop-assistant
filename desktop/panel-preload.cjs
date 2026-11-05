const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('assistant', {
  request: (action, data) => ipcRenderer.invoke('assistant:request', action, data),
  onHold: callback => ipcRenderer.on('assistant:hold-state',(_event,state) => callback(state)),
  voiceAvailable: available => ipcRenderer.send('assistant:voice-available',available),
  close: () => ipcRenderer.send('assistant:close')
});
