import { useEffect, useRef, useState } from 'react';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import './App.css';

function Index() {
  const { t, i18n } = useTranslation();

  const [eSignText, setESignText] = useState('');
  const [rememberESignText, setRememberESignText] = useState(true);

  const [certName, setCertName] = useState('');
  const [cert, setCert] = useState<File | null>(null);
  const [rememberCert, setRememberCert] = useState(true);

  const [password, setPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(true);

  const [outputDir, setOutputDir] = useState('');

  const [filesToSign, setFilesToSign] = useState<File[]>([]);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);

  const [signing, setSigning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string>('');

  const [showRestartButton, setShowRestartButton] = useState(false);

  const [showProgress, setShowProgress] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  window.electron.ipcRenderer.on('sign-progress', (args) => {
    if (!args) return;
    const { progress, messageKey, messageData } = JSON.parse(args as string);

    setProgress(progress);

    if (messageKey === 'signZipProgress') {
      const { totalProcessed, totalPdfCount } = messageData;
      setProgressMessage(
        t('signZipProgress', { totalProcessed, totalPdfCount }),
      );
    }

    if (messageKey === 'signPdfProgress') {
      const { i, pdfFiles } = messageData;
      setProgressMessage(t('signPdfProgress', { i, pdfFiles }));
    }

    if (messageKey === 'processingZipFile') {
      const { zipName } = messageData;
      setProgressMessage(t('processingZipFile', { zipName }));
    }
  });

  window.electron.ipcRenderer.on('sign-complete', (args: any) => {
    const parsedArgs = JSON.parse(args as string);

    if (parsedArgs.failedFiles) {
      setFailedFiles(parsedArgs.failedFiles);
    }

    if (parsedArgs.success) {
      setProgress(100);
      setOutputDir(parsedArgs.outputDir);
    }

    setProgressMessage(t(parsedArgs.message));
    setShowRestartButton(true);
  });

  const handleInputsValidation = async () => {
    if (!eSignText) {
      return 'Signature text is required.';
    }

    if (!password) {
      return 'Certificate password is required.';
    }

    if (filesToSign.length === 0) {
      return 'At least one PDF file or a ZIP file is required.';
    }

    if (!certName || !cert) {
      return 'Please select a certificate file.';
    }

    return null;
  };

  const convertFileToBuffer = (file: File): Promise<Uint8Array> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        resolve(new Uint8Array(arrayBuffer));
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const handleSign = async () => {
    const result = await handleInputsValidation();

    if (result) {
      alert(t(result));
      return;
    }

    if (rememberESignText) {
      localStorage.setItem('eSignText', eSignText);
    }

    if (rememberPassword) {
      localStorage.setItem('password', password);
    }

    if (!rememberCert) {
      handleCleanupRememberCert();
    } else {
      localStorage.setItem('certName', certName);
    }

    setSigning(true);
    setShowProgress(true);
    setProgress(0);
    setProgressMessage(t('Signing PDFs...'));

    if (!cert) return;
    const certBuffer = await convertFileToBuffer(cert).then((buffer) => ({
      name: certName,
      buffer,
    }));

    const filesToSignBuffered = [];
    if (filesToSign.length > 0) {
      filesToSignBuffered.push(
        ...(await Promise.all(
          filesToSign.map(async (file) => ({
            name: file.name,
            buffer: await convertFileToBuffer(file),
          })),
        )),
      );
    }

    window.electron.ipcRenderer.sendMessage('sign-pdfs', {
      cert: certBuffer,
      files: filesToSignBuffered,
      options: {
        password,
        eSignText,
      },
    });
  };

  const handleChangeInputCertFile = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCert(file);
    setCertName(file.name);
  };

  const handleChangeRememberCert = () => {
    setRememberCert(!rememberCert);

    if (cert) {
      setCertName(cert.name);
      localStorage.setItem('certName', cert.name);
    }
  };

  const handleOnChangeESignText = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setESignText(event.target.value);

    if (rememberESignText) {
      localStorage.setItem('eSignText', event.target.value);
    }
  };

  const handleFilesDrop = (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    if (fileArray.length === 0) return;
    const pdfFiles = fileArray.filter(
      (file) => file.type === 'application/pdf',
    );
    const zipFiles = fileArray.filter(
      (file) => file.type === 'application/zip',
    );

    if (pdfFiles.length > 0) {
      setFilesToSign((prev) => [...prev, ...pdfFiles]);
    }

    if (zipFiles.length > 0) {
      if (zipFiles.length > 1) {
        alert(t('Only one ZIP file can be selected at a time.'));
        return;
      }

      setFilesToSign((prev) => [...prev, ...zipFiles]);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer.files) {
      handleFilesDrop(event.dataTransfer.files);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleCleanupRememberCert = () => {
    setRememberCert(false);
    setCert(null);
    setCertName('');
    localStorage.removeItem('certName');
  };

  const handleChangeInputFiles = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (event.target.files) {
      handleFilesDrop(event.target.files);
    }
  };

  const handleRestart = () => {
    setFilesToSign([]);
    setSigning(false);
    setShowProgress(false);
    setShowRestartButton(false);
    setProgress(0);
    setProgressMessage('');
    setShowProgress(false);
    setFailedFiles([]);

    if (!rememberCert) {
      handleCleanupRememberCert();
    }
  };

  const ESignTextComponent = () => (
    <div className="input-group">
      <label>{t('Signature to show on the PDF')}:</label>
      <input
        type="text"
        placeholder={t('Type here the certificate password')}
        value={eSignText}
        onChange={handleOnChangeESignText}
      />
      <label className="checkbox">
        <input
          type="checkbox"
          checked={rememberESignText}
          onChange={() => setRememberESignText(!rememberESignText)}
        />
        {t('Remember signature text')}
      </label>
    </div>
  );

  const CertificateComponent = () => (
    <div className="input-group">
      <label>{t('Certificate (.p12 or .pfx)')}:</label>
      <input
        type="file"
        accept=".p12,.pfx"
        onChange={handleChangeInputCertFile}
      />
      {certName && (
        <div className="file-info">
          {t('Selected certificate:')}{' '}
          <strong>{certName.substring(0, 35)}</strong>
        </div>
      )}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={rememberCert}
          onChange={handleChangeRememberCert}
        />
        {t('Remember certificate')}
      </label>
    </div>
  );

  const PasswordComponent = () => (
    <div className="input-group">
      <label>{t('Password')}:</label>
      <input
        type="password"
        placeholder={t('Type here the certificate password')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={rememberPassword ? 'remembered' : ''}
      />
      <label className="checkbox">
        <input
          type="checkbox"
          checked={rememberPassword}
          onChange={() => setRememberPassword(!rememberPassword)}
        />
        {t('Remember password')}
      </label>
    </div>
  );

  const PDFsComponent = () => (
    <div className="input-group">
      <label>{t('PDF files to sign')}:</label>
      <div
        className="drop-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {filesToSign.length > 0 ? (
          <ul className="file-list">
            {filesToSign.length > 0 &&
              filesToSign.map((file, index) => (
                <li key={index} className="file-item">
                  {file.name}
                  <span
                    className="remove-pdf-button"
                    onClick={() => {
                      setFilesToSign((prev) =>
                        prev.filter((_, i) => i !== index),
                      );
                    }}
                  >
                    x
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <div className="drop-zone-text">
            {t('Drag and drop PDF files')} {t('or click')}{' '}
            <span
              onClick={() => fileInputRef.current?.click()}
              className="underline cursor-pointer"
            >
              {t('here')}
            </span>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf, .zip"
        multiple
        className="hidden"
        onChange={handleChangeInputFiles}
      />
    </div>
  );

  const ErrorPDFsLogComponent = () => (
    <div className="error-log">
      <div className="error-log-header">
        <svg
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01M21 12A9
             9 0 113 12a9 9 0 0118 0z"
          />
        </svg>
        <h4>{t('Some files failed to sign')}</h4>
      </div>

      <div className="error-log-list">
        <ul>
          {failedFiles.map((file, i) => (
            <li key={i} title={file}>
              {file}
            </li>
          ))}
        </ul>
      </div>

      <div className="error-log-footer">
        {t('Please check the files and try again.')}
      </div>
    </div>
  );

  useEffect(() => {
    if (outputDir !== '') {
      setProgressMessage(t('Opening signed files directory...'));

      setTimeout(() => {
        window.electron.api.openSignedDirFiles(outputDir);
        setProgressMessage(t('Signed PDFs is now available!'));
        setShowRestartButton(true);
      }, 1000);
    }
  }, [outputDir]);

  useEffect(() => {
    const savedPassword = localStorage.getItem('password');

    if (savedPassword) {
      setPassword(savedPassword);
    }
  }, [rememberPassword]);

  useEffect(() => {
    const savedESignText = localStorage.getItem('eSignText');

    if (savedESignText) {
      setESignText(savedESignText);
    }
  }, [rememberESignText]);

  useEffect(() => {
    if (!rememberPassword) {
      localStorage.removeItem('password');
    }
  }, [rememberPassword]);

  useEffect(() => {
    if (rememberCert) {
      const savedCertName = localStorage.getItem('certName');

      if (savedCertName) {
        setCertName(savedCertName);
      }
    }
  }, [rememberCert]);

  useEffect(() => {
    if (!cert) {
      handleCleanupRememberCert();
    }
  }, [cert]);

  useEffect(() => {
    window.electron.api.onLanguageChange((lang: string) => {
      i18n.changeLanguage(lang);
    });

    return () => {
      window.electron.api.removeLanguageChangeListener();
    };
  }, []);

  return (
    <div className="app-container">
      <div className="logo">
        <h3>Forge4All</h3>
      </div>

      {showProgress && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <div className="progress-message">{progressMessage}</div>

          {failedFiles.length > 0 && <ErrorPDFsLogComponent />}
        </div>
      )}

      {!signing && (
        <div className="form-container">
          {ESignTextComponent()}

          {CertificateComponent()}

          {PasswordComponent()}

          {PDFsComponent()}

          <button className="sign-button" onClick={handleSign}>
            {t('Sign PDFs')}
          </button>
        </div>
      )}

      {showRestartButton && (
        <div className="actions">
          <button className="restart-button" onClick={handleRestart}>
            {t('Restart')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Index />} />
      </Routes>
    </Router>
  );
}
