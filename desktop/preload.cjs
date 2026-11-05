const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('buddy', {
  track: callback => ipcRenderer.on('cursor', (_event, ...data) => callback(...data)),
  onVoice: callback => ipcRenderer.on('assistant:hold-state',(_event,state) => callback(state)),
  onDance: callback => ipcRenderer.on('dance', (_event,selection) => callback(selection)),
  hit: value => ipcRenderer.send('hit', value),
  drag: (x, y) => ipcRenderer.send('drag', x, y),
  holdVoice: pressed => ipcRenderer.send('assistant:hold-voice',pressed),
  assistant: () => ipcRenderer.send('assistant:open'),
  menu: () => ipcRenderer.send('menu')
});
