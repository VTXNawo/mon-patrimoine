// Pont minimal entre la page et Windows : seulement ouvrir un relevé PDF.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("patrimoineDesktop", {
  openPdf: (name, bytes) => ipcRenderer.invoke("open-pdf", String(name || ""), bytes),
});
