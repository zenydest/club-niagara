/**
 * Proceso principal de Electron para la app web Club Niágara Admin.
 * Carga la build de Vite como una app de escritorio en Windows.
 */

import { app, BrowserWindow, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env["NODE_ENV"] === "development";

let ventanaPrincipal: BrowserWindow | null = null;

function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#08080F",
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    icon: path.join(__dirname, "../public/icon.png"),
    title: "Club Niágara Admin",
  });

  // En desarrollo carga el servidor de Vite, en producción la build
  if (isDev) {
    void ventanaPrincipal.loadURL("http://localhost:5173");
    ventanaPrincipal.webContents.openDevTools();
  } else {
    void ventanaPrincipal.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Abrir links externos en el navegador, no en Electron
  ventanaPrincipal.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  ventanaPrincipal.on("closed", () => {
    ventanaPrincipal = null;
  });
}

void app.whenReady().then(() => {
  crearVentana();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      crearVentana();
    }
  });
});

app.on("window-all-closed", () => {
  // En Windows y Linux, cerrar la app cuando se cierran todas las ventanas
  if (process.platform !== "darwin") {
    app.quit();
  }
});
