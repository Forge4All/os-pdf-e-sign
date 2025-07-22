import { useEffect, useMemo, useRef, useState } from 'react';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';

import icon from '../../assets/logo.png';
import './App.css';

function Index() {
  const [eSignText, setESignText] = useState('');
  const [rememberESignText, setRememberESignText] = useState(true);

  const [certName, setCertName] = useState('');

  const [password, setPassword] = useState('');
  const [rememberPassword, setRememberPassword] = useState(true);

  const [outputDir, setOutputDir] = useState('');

  const [cert, setCert] = useState<File | null>(null);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);

  const [signing, setSigning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const [showRestartButton, setShowRestartButton] = useState(false);

  const [showProgress, setShowProgress] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleInputsValidation = async () => {
    if (!eSignText) {
      return 'Assinatura/Texto é obrigatório.';
    }

    if (!password) {
      return 'Senha do certificado é obrigatória.';
    }

    if (!cert) {
      return 'Certificado é obrigatório.';
    }

    if (pdfFiles.length === 0) {
      return 'Arquivos PDF são obrigatórios.';
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
      alert(result);
      return;
    }

    if (rememberESignText) {
      localStorage.setItem('eSignText', eSignText);
    }

    if (rememberPassword) {
      localStorage.setItem('password', password);
    }

    setSigning(true);
    setShowProgress(true);
    setProgress(0);
    setProgressMessage('Assinando arquivos...');

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

    window.electron.ipcRenderer.sendMessage('sign-pdfs', {
      eSignText,
      password,
      cert: certBuffer,
      pdfs: pdfBuffers,
    });
  };

  window.electron.ipcRenderer.on('sign-progress', (args) => {
    if (!args) return;
    const { progress, message } = JSON.parse(args as string);

    setProgress(progress);
    setProgressMessage(message);
  });

  window.electron.ipcRenderer.on('sign-complete', (args: any) => {
    const parsedArgs = JSON.parse(args as string);

    if (parsedArgs.success) {
      setProgress(100);
      setProgressMessage('Arquivos assinados com sucesso!');
      setOutputDir(parsedArgs.outputDir);
    } else {
      setProgress(0);
      setProgressMessage('Erro ao assinar arquivos.');
      setShowRestartButton(true);
    }
  });

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

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleRestart = () => {
    setCert(null);
    setCertName('');
    setPdfFiles([]);
    setSigning(false);
    setShowProgress(false);
    setShowRestartButton(false);
    setProgress(0);
    setProgressMessage('');
    setShowProgress(false);
  };

  useEffect(() => {
    if (outputDir !== '') {
      setProgressMessage('Abrindo pasta com arquivos assinados...');

      setTimeout(() => {
        window.electron.api.openSignedDirFiles(outputDir);
        setProgressMessage('Diretório aberto com sucesso!');
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

  const ESignTextComponent = useMemo(
    () => (
      <div className="input-group">
        <label>Assinatura/Texto</label>
        <input
          type="text"
          placeholder="Digite o texto da assinatura aqui"
          value={eSignText}
          onChange={(e) => setESignText(e.target.value)}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={rememberESignText}
            onChange={() => setRememberESignText(!rememberESignText)}
          />
          Lembrar assinatura
        </label>
      </div>
    ),
    [eSignText, rememberESignText],
  );

  const PasswordComponent = useMemo(
    () => (
      <div className="input-group">
        <label>Senha</label>
        <input
          type="password"
          placeholder="Digite a senha do certificado"
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
          Lembrar senha
        </label>
      </div>
    ),
    [password, rememberPassword],
  );

  const CertificateComponent = useMemo(
    () => (
      <div className="input-group">
        <label>Certificado (.p12 or .pfx)</label>
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
            Selecionado: <strong>{certName.substring(0, 35)}</strong>
          </div>
        )}
      </div>
    ),
    [cert],
  );

  const PDFsComponent = useMemo(
    () => (
      <div className="input-group">
        <label>Arquivos PDF</label>
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
              Arraste e solte arquivos PDF ou clique{' '}
              <span
                onClick={() => fileInputRef.current?.click()}
                className="underline cursor-pointer"
              >
                aqui
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

      {!signing && (
        <div className="form-container">
          {ESignTextComponent}

          {CertificateComponent}

          {PasswordComponent}

          {PDFsComponent}

          <button className="sign-button" onClick={handleSign}>
            Assinar
          </button>
        </div>
      )}

      {showRestartButton && (
        <div className="actions">
          <button className="restart-button" onClick={handleRestart}>
            Reiniciar
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
