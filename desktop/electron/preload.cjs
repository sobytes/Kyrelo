const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
});
