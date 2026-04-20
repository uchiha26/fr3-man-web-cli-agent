const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fr3manAPI', {
  executeAutomatedTask: (params) => ipcRenderer.send('agent:executeAutomatedTask', params),
  onTaskResult: (callback) => ipcRenderer.on('agent:taskResult', (_event, value) => callback(value))
});
