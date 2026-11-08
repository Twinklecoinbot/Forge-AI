const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('forgeAPI', {
  isElectron: true,
  writeFiles: (files, root) => ipcRenderer.invoke('write-project-files', files, root),
  runCommand: (cmd, cwd) => ipcRenderer.invoke('run-terminal-command', cmd, cwd),
  selectWorkspace: () => ipcRenderer.invoke('select-workspace'),
  selectFolder: (opts) => ipcRenderer.invoke('select-folder', opts),
  createProjectFolder: (opts) => ipcRenderer.invoke('create-project-folder', opts),
  readFolderFiles: (folderPath) => ipcRenderer.invoke('read-folder-files', folderPath),
  createPath: (payload) => ipcRenderer.invoke('create-path', payload),
  readTree: () => ipcRenderer.invoke('read-workspace-tree'),
  readFile: (rel, root) => ipcRenderer.invoke('read-file', rel, root),
  writeFile: (rel, content, root) => ipcRenderer.invoke('write-file', rel, content, root),
  deleteFile: (rel, root) => ipcRenderer.invoke('delete-file', rel, root),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  machineCapacity: () => ipcRenderer.invoke('machine-capacity'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  logTrainingPair: (payload) => ipcRenderer.invoke('log-training-pair', payload),
  readTrainingDataset: (opts) => ipcRenderer.invoke('read-training-dataset', opts),
  onTerminalStream: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('terminal-stream', listener);
    return () => ipcRenderer.removeListener('terminal-stream', listener);
  }
});
