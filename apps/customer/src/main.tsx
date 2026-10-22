import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { recentTable } from './features/session/orderMode';
import './styles/index.css';

// Opened from the home screen (or a notification) within a few hours of scanning a table: go back
// to that table. Otherwise this is the website. The server still checks the QR token is valid.
if (window.location.pathname === '/') {
  const last = recentTable();
  if (last) window.location.replace(`/t/${last}${window.location.search}`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
