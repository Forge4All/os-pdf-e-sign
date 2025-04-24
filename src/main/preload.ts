// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

export type Channels =
  | 'ipc-example'
  | 'sign-pdfs'
  | 'copy-file-to-temp-dir'
  | 'clean-pdfs-temp-dir'
  | 'clean-cert-temp-dir'
  | 'clean-all-temp-dir';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    invoke(channel: Channels, ...args: unknown[]) {
      return ipcRenderer.invoke(channel, ...args);
    },
  },
  api: {
    copyFileToTempDir: (filePath: string, type: string) => {
      ipcRenderer.invoke('copy-file-to-temp-dir', filePath, type);
    },
    cleanPdfsTempDir: () => {
      ipcRenderer.invoke('clean-pdfs-temp-dir');
    },
    cleanCertTempDir: () => {
      ipcRenderer.invoke('clean-cert-temp-dir');
    },
    cleanAllTempDir: () => {
      ipcRenderer.invoke('clean-all-temp-dir');
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
