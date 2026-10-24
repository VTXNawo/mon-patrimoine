const { app, BrowserWindow, shell, Menu, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 420,
    minHeight: 600,
    title: "Mon patrimoine",
    icon: path.join(__dirname, "app", "icons", "icon-512.png"),
    backgroundColor: "#f5f6f8",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: path.join(__dirname, "preload.js") },
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => win.show());
  // links to websites open in the normal browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.loadFile(path.join(__dirname, "app", "index.html"));
}

// « Ouvrir le PDF » d'un relevé : copie temporaire, ouverte avec le lecteur PDF de Windows
ipcMain.handle("open-pdf", async (_e, name, bytes) => {
  const data = Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []));
  if (data.subarray(0, 5).toString("latin1") !== "%PDF-") return "pas-un-pdf";
  const base = String(name || "releve").replace(/\.pdf$/i, "").replace(/[^\w\- ]+/g, "_").slice(0, 100) || "releve";
  const dir = path.join(app.getPath("temp"), "mon-patrimoine");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, base + ".pdf");
  fs.writeFileSync(file, data);
  return shell.openPath(file);
});

app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
