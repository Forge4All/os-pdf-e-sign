import { useEffect, useMemo, useRef, useState } from 'react';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';

import icon from '../../assets/logo.png';
import './App.css';

function Index() {
  const [rememberPassword, setRememberPassword] = useState(true);
  const [rememberCert, setRememberCert] = useState(true);

  const [password, setPassword] = useState('');
  const [cert, setCert] = useState<File | null>(null);
  const [certName, setCertName] = useState('');
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [signing, setSigning] = useState(false);
  const [signedFiles, setSignedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [showProgress, setShowProgress] = useState(false);
  const [showError, setShowError] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleInputsValidation = async () => {
    if (!password) {
      return 'Please enter the certificate password.';
    }

    if (!cert) {
      return 'Please select a certificate file.';
    }

    if (pdfFiles.length === 0) {
      return 'Please select at least one PDF file.';
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
      setError(result);
      setShowError(true);
      return;
    }

    if (rememberPassword) {
      localStorage.setItem('password', password);
    }

    setSigning(true);
    setShowProgress(true);
    setProgress(0);
    setProgressMessage('Signing files...');
    setError(null);
    setSuccess(false);
    setShowError(false);
    setSignedFiles([]);

    if (!cert) return;
    const certBuffer = await convertFileToBuffer(cert).then((buffer) => ({
      name: certName,
      buffer,
    }));

    if (!pdfFiles || pdfFiles.length === 0) return;
    const pdfBuffers = await Promise.all(
      pdfFiles.map((file) =>
        convertFileToBuffer(file).then((buffer) => ({
          name: file.name,
          buffer,
        })),
      ),
    );

    const response = await window.electron.ipcRenderer.invoke('sign-pdfs', {
      password,
      cert: certBuffer,
      pdfs: pdfBuffers,
    });

    console.log('Response from main process:', response);
  };

  const handleFilesDrop = (files: FileList | File[]) => {
    const pdfFilesArray = Array.from(files).filter(
      (file) => file.type === 'application/pdf',
    );
    setPdfFiles(pdfFilesArray);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer.files) {
      handleFilesDrop(event.dataTransfer.files);
    }
  };

  const handleClickDropZone = (event: React.MouseEvent<HTMLDivElement>) => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => {
    const savedPassword = localStorage.getItem('password');

    if (savedPassword) {
      setPassword(savedPassword);
    }
  }, [rememberPassword]);

  useEffect(() => {
    if (!rememberPassword) {
      localStorage.removeItem('password');
    }
  }, [rememberPassword]);

  const PasswordComponent = useMemo(
    () => (
      <div className="input-group">
        <label>Password</label>
        <input
          type="password"
          placeholder="Enter certificate password"
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
          Remember password
        </label>
      </div>
    ),
    [password, rememberPassword],
  );

  const CertificateComponent = useMemo(
    () => (
      <div className="input-group">
        <label>Certificate (.p12 or .pfx)</label>
        <input
          type="file"
          accept=".p12,.pfx"
          onChange={(e) => {
            setCert(e.target.files?.[0] || null);
            setCertName(e.target.files?.[0]?.name || '');
          }}
        />
        {cert && (
          <div className="file-info">
            Selected: <strong>{certName.substring(0, 35)}</strong>
          </div>
        )}
        {/* <label className="checkbox">
          <input
            type="checkbox"
            checked={rememberCert}
            onChange={() => setRememberCert(!rememberCert)}
          />
          Remember certificate
        </label> */}
      </div>
    ),
    [cert, rememberCert],
  );

  const PDFsComponent = useMemo(
    () => (
      <div className="input-group">
        <label>PDF Files</label>
        <div
          className="drop-zone"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {pdfFiles.length > 0 ? (
            <ul className="file-list">
              {pdfFiles.map((file, index) => (
                <li key={index} className="file-item">
                  {file.name}
                  <span
                    className="remove-pdf-button"
                    onClick={() => {
                      setPdfFiles((prev) => prev.filter((_, i) => i !== index));
                    }}
                  >
                    x
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="drop-zone-text">
              Drag and drop PDF files or click{' '}
              <span
                onClick={handleClickDropZone}
                className="underline cursor-pointer"
              >
                here
              </span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              handleFilesDrop(e.target.files);
            }
          }}
        />
      </div>
    ),
    [pdfFiles],
  );

  return (
    <div className="app-container">
      <div className="logo">
        <img width="200" alt="icon" src={icon} />
      </div>

      {showProgress && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <div className="progress-message">{progressMessage}</div>
        </div>
      )}

      {showError && <div className="error-message">{error}</div>}

      {!signing && (
        <div className="form-container">
          {PasswordComponent}

          {CertificateComponent}

          {PDFsComponent}

          <button className="sign-button" onClick={handleSign}>
            Sign it all
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
