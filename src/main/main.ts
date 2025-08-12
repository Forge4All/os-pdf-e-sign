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
import { app, BrowserWindow, shell, ipcMain, IpcMainEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { TempFileManager } from './TempFileManager';
import fs from 'fs';
import os from 'os';
import { PDFSigner } from './PDFSigner';
import { FilePayload, SignPdfsArgs } from './types';
const unzip = require('unzipper');

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
    width: 725,
    height: 828,
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

ipcMain.handle('language-change', (_, lang) => {
  mainWindow?.webContents.send('language-change', lang);
});

/**
 * ############### PDF Signing Logic ###############
 * This section handles the signing of PDF files, both standalone and within ZIP archives.
 * It includes functions to walk through directories, process PDF files in batches,
 * and sign them using a provided certificate and password.
 * It also manages temporary files and directories for the signing process.
 * #################################################
 */
const failedFiles: string[] = [];

async function* walkPdfFiles(dir: string): AsyncGenerator<string> {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walkPdfFiles(res);
    } else if (
      dirent.isFile() &&
      path.extname(dirent.name).toLowerCase() === '.pdf'
    ) {
      yield res;
    }
  }
}

async function processPdfChunks(
  pdfGenerator: AsyncGenerator<string>,
  extractDir: string,
  signedOutputDir: string,
  signer: PDFSigner,
  event: IpcMainEvent,
  totalPdfCount: number,
  processedCountStart: number = 0,
  batchSize: number = 20,
) {
  let chunk: string[] = [];
  let processedCount = processedCountStart;

  for await (const pdfPath of pdfGenerator) {
    chunk.push(pdfPath);
    if (chunk.length >= batchSize) {
      await signAndCleanupBatch(
        chunk,
        extractDir,
        signedOutputDir,
        signer,
        event,
        processedCount,
        totalPdfCount,
      );
      processedCount += chunk.length;
      chunk = [];
    }
  }

  if (chunk.length > 0) {
    await signAndCleanupBatch(
      chunk,
      extractDir,
      signedOutputDir,
      signer,
      event,
      processedCount,
      totalPdfCount,
    );
  }
}

async function signAndCleanupBatch(
  pdfPaths: string[],
  extractDir: string,
  signedOutputDir: string,
  signer: PDFSigner,
  event: IpcMainEvent,
  processedCount: number,
  totalPdfCount: number,
) {
  for (let i = 0; i < pdfPaths.length; i++) {
    const pdfPath = pdfPaths[i];
    const relativePath = path.relative(extractDir, pdfPath);
    const outputPath = path.join(signedOutputDir, relativePath);

    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    try {
      await signer.sign(pdfPath, outputPath);
    } catch (error) {
      failedFiles.push(pdfPath.split(path.sep).pop() || pdfPath);
    }

    await fs.promises.unlink(pdfPath);

    const totalProcessed = processedCount + i + 1;
    const progress = Math.round((totalProcessed / totalPdfCount) * 100);
    event.reply(
      'sign-progress',
      JSON.stringify({
        progress,
        messageKey: 'signZipProgress',
        messageData: { totalProcessed, totalPdfCount },
      }),
    );
  }
}

ipcMain.on(
  'sign-pdfs',
  async (event, { cert, files, options }: SignPdfsArgs) => {
    const { password, eSignText } = options;

    try {
      const tempFileManager = new TempFileManager();

      tempFileManager.saveCert(cert);
      const certPath = tempFileManager.getCertPath();
      const pdfDir = tempFileManager.getPdfDir();

      const pdfFiles = files.filter(
        (file: FilePayload) => path.extname(file.name).toLowerCase() === '.pdf',
      );
      const zipFile = files.find(
        (file: FilePayload) => path.extname(file.name).toLowerCase() === '.zip',
      );

      const signedOutputDir = path.join(
        os.homedir(),
        `signed-pdfs-${Date.now()}`,
      );

      if (!fs.existsSync(signedOutputDir)) {
        fs.mkdirSync(signedOutputDir);
      }

      if (pdfFiles.length > 0) {
        tempFileManager.savePDFs(pdfFiles);

        const signer = new PDFSigner(eSignText, certPath!, password);
        for (let i = 0; i < pdfFiles.length; i++) {
          const pdf = pdfFiles[i];
          const inputFilePath = path.join(pdfDir, pdf.name);
          const outputFilePath = path.join(signedOutputDir, pdf.name);

          try {
            await signer.sign(inputFilePath, outputFilePath);
          } catch (error) {
            failedFiles.push(pdf.name.split(path.sep).pop() || pdf.name);
          }

          const progress = Math.round(((i + 1) / pdfFiles.length) * 100);
          event.reply(
            'sign-progress',
            JSON.stringify({
              progress,
              messageKey: 'signPdfProgress',
              messageData: { i: i + 1, pdfFiles: pdfFiles.length },
            }),
          );
        }
      }

      if (zipFile) {
        event.reply(
          'sign-progress',
          JSON.stringify({
            progress: 0,
            messageKey: 'processingZipFile',
            messageData: { zipName: zipFile.name },
          }),
        );

        const zipFilePath = path.join(pdfDir, zipFile.name);
        fs.writeFileSync(zipFilePath, zipFile.buffer as Buffer);

        const extractDir = path.join(pdfDir, path.parse(zipFile.name).name);
        if (!fs.existsSync(extractDir)) {
          fs.mkdirSync(extractDir, { recursive: true });
        }

        await new Promise((resolve, reject) => {
          fs.createReadStream(zipFilePath)
            .pipe(unzip.Extract({ path: extractDir }))
            .on('close', resolve)
            .on('error', reject);
        });

        fs.unlinkSync(zipFilePath);

        async function countPdfs(dir: string): Promise<number> {
          let count = 0;
          const entries = await fs.promises.readdir(dir, {
            withFileTypes: true,
          });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              count += await countPdfs(fullPath);
            } else if (
              entry.isFile() &&
              path.extname(entry.name).toLowerCase() === '.pdf'
            ) {
              count++;
            }
          }
          return count;
        }

        const totalZippedPdfs = await countPdfs(extractDir);

        const signer = new PDFSigner(eSignText, certPath!, password);
        const pdfGenerator = walkPdfFiles(extractDir);

        await processPdfChunks(
          pdfGenerator,
          extractDir,
          signedOutputDir,
          signer,
          event,
          totalZippedPdfs,
        );
      }

      const sendMessage = (
        success: boolean,
        message: string,
        outputDir: string,
        failedFiles: string[],
      ) => JSON.stringify({ success, message, outputDir, failedFiles });

      event.reply(
        'sign-complete',
        sendMessage(
          true,
          'PDFs signed successfully!',
          signedOutputDir,
          failedFiles,
        ),
      );

      tempFileManager.cleanup();
    } catch (error: any) {
      console.error('Error signing PDFs:', error);

      event.sender.send('sign-complete', {
        success: false,
        message: 'Error signing PDFs',
        error: error.message,
        failedFiles: failedFiles,
      });
    }
  },
);

ipcMain.handle('open-signed-dir-files', async (event, dirPath: string) => {
  try {
    shell.openPath(dirPath);
  } catch (error) {
    console.error('Error opening signed directory:', error);
  }
});
