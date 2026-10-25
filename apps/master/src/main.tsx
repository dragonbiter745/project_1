import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { enablePersistentCache } from '@foodcourt/firebase-client/db';
import App from './App';
import './styles/index.css';

// Reloads reuse the browser's copy of what was read instead of downloading every document again.
enablePersistentCache();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
