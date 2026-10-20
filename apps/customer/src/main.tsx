import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Opened from the home screen (or a notification) without a table link: go back to the last
// table this phone scanned. The server still checks the QR token is valid.
if (window.location.pathname === '/') {
  try {
    const last = localStorage.getItem('fc_last_table');
    if (last && /^[A-Za-z0-9_-]{16,64}$/.test(last)) window.location.replace(`/t/${last}${window.location.search}`);
  } catch {
    // storage blocked: the app explains how to scan a table
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
