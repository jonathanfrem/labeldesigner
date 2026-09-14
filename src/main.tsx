import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { handleOAuthCallbackWindow } from './cloud/github/auth';
import './index.css';

// The GitHub sign-in popup lands back on our own origin at /auth/github/callback, which the
// SPA fallback serves as index.html. That window only needs to hand the code to its opener
// and close, so it must not boot the editor — check before mounting anything.
if (!handleOAuthCallbackWindow()) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
