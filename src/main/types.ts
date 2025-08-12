export type FilePayload = {
  name: string;
  buffer: Buffer | ArrayBuffer | string;
};

export type CertPayload = {
  name: string;
  buffer: Buffer | ArrayBuffer | string;
};

export type OptionsPayload = {
  password: string;
  eSignText: string;
  rememberCert: boolean;
};

export type SignPdfsArgs = {
  cert: CertPayload;
  files: FilePayload[];
  options: OptionsPayload;
};
