/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { TempFileManager } from './TempFileManager';
import fs from 'fs';
import os from 'os';
import { PDFSigner } from './PDFSigner';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 825,
    height: 928,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);

ipcMain.on('sign-pdfs', async (event, { password, cert, pdfs }) => {
  try {
    const fileManager = new TempFileManager();
    const signedOutputDir = path.join(
      os.homedir(),
      `signed-pdfs-${Date.now()}`,
    );

    fileManager.savePDFs(pdfs);
    fileManager.saveCert(cert);

    const certPath = fileManager.getCertPath();
    const pdfDir = fileManager.getPdfDir();

    if (!fs.existsSync(signedOutputDir)) {
      fs.mkdirSync(signedOutputDir);
    }

    const total = pdfs.length;

    for (let i = 0; i < total; i++) {
      const pdf = pdfs[i];
      const inputFilePath = path.join(pdfDir, pdf.name);
      const outputFilePath = path.join(signedOutputDir, pdf.name);

      const signer = new PDFSigner(certPath!, password);
      await signer.sign(inputFilePath, outputFilePath);

      const progress = Math.round(((i + 1) / total) * 100);
      const message = `Assinado ${i + 1} de ${total} PDFs`;

      const sendMessage = (progress: number, message: string) =>
        JSON.stringify({ progress, message });

      event.reply('sign-progress', sendMessage(progress, message));
    }

    const sendMessage = (
      success: boolean,
      message: string,
      outputDir: string,
    ) => JSON.stringify({ success, message, outputDir });

    event.reply(
      'sign-complete',
      sendMessage(true, 'Assinatura concluída', signedOutputDir),
    );
  } catch (error: any) {
    console.error('Error signing PDFs:', error);

    event.sender.send('sign-complete', {
      success: false,
      message: 'Error signing PDFs',
      error: error.message,
    });
  }
});

ipcMain.handle('open-signed-dir-files', async (event, dirPath: string) => {
  try {
    shell.openPath(dirPath);
  } catch (error) {
    console.error('Error opening signed directory:', error);
  }
});
