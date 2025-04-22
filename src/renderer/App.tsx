import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import icon from '../../assets/logo.png';
import './App.css';
import { useState } from 'react';

function Index() {
  const [rememberPassword, setRememberPassword] = useState(true);
  const [rememberCert, setRememberCert] = useState(true);

  return (
    <div className="app-container">
      <div className="logo">
        <img width="200" alt="icon" src={icon} />
      </div>

      <div className="form-container">
        <div className="input-group">
          <label>Password</label>
          <input type="password" placeholder="Enter certificate password" />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={rememberPassword}
              onChange={() => setRememberPassword(!rememberPassword)}
            />
            Remember password
          </label>
        </div>

        <div className="input-group">
          <label>Certificate (.p12)</label>
          <input type="file" accept=".p12" />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={rememberCert}
              onChange={() => setRememberCert(!rememberCert)}
            />
            Remember certificate
          </label>
        </div>

        <div className="input-group">
          <label>PDF Files</label>
          <div className="drop-zone">
            Drag and drop PDF files here or click to upload
          </div>
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
          />
        </div>

        <button className="sign-button">Sign it all</button>
      </div>
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
