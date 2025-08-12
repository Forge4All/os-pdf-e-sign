import fs from 'fs';
import path from 'path';
import os from 'os';
import { FilePayload } from './main';

export class TempFileManager {
  private baseDir: string;
  private pdfsDir: string;
  private certDir: string;

  constructor() {
    this.baseDir = path.join(os.tmpdir(), 'os-pdf-signer');
    this.pdfsDir = path.join(this.baseDir, 'pdfs');
    this.certDir = path.join(this.baseDir, 'certs');

    this.setupDirectories();
  }

  private setupDirectories() {
    this.ensureDir(this.baseDir);
    this.ensureDir(this.pdfsDir);
    this.ensureDir(this.certDir);
    this.clearDir(this.pdfsDir);
    this.clearDir(this.certDir);
  }

  private ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  public clearDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;

    fs.rmSync(dirPath, { recursive: true, force: true });
    fs.mkdirSync(dirPath, { recursive: true });
  }

  public savePDFs(files: FilePayload[]) {
    files.forEach((file, i) => {
      const target = path.join(this.pdfsDir, file.name);
      fs.writeFileSync(target, file.buffer as Buffer);
    });
  }

  public saveCert(cert: {
    name: string;
    buffer: Buffer | ArrayBuffer | string;
  }) {
    const certDir = this.getCertDir();
    if (!fs.existsSync(certDir)) {
      fs.mkdirSync(certDir, { recursive: true });
    }

    const certPath = path.join(certDir, cert.name);

    let certBuffer: Buffer;

    if (typeof cert.buffer === 'string') {
      if (cert.buffer.startsWith('data:')) {
        const base64 = cert.buffer.split(',')[1];
        certBuffer = Buffer.from(base64, 'base64');
      } else {
        certBuffer = Buffer.from(cert.buffer);
      }
    } else if (cert.buffer instanceof ArrayBuffer) {
      certBuffer = Buffer.from(cert.buffer);
    } else {
      certBuffer = cert.buffer as Buffer;
    }

    fs.writeFileSync(certPath, certBuffer);
  }

  public getPdfDir() {
    return this.pdfsDir;
  }

  public getCertDir() {
    return this.certDir;
  }

  public getCertPath(): string | null {
    const files = fs.readdirSync(this.certDir);
    if (files.length === 0) return null;

    return path.join(this.certDir, files[0]);
  }

  public deleteZipFile(zipFilePath: string) {
    if (fs.existsSync(zipFilePath)) {
      fs.rmSync(zipFilePath, { force: true });
    }
  }

  public cleanup() {
    this.clearDir(this.pdfsDir);
    this.clearDir(this.certDir);
  }
}
