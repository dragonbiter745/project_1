import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initFirebase, getAuth, signInAnonymously } from '@foodcourt/firebase-client';

// Initialise Firebase and sign the visitor in anonymously so that
// the createCheckout Cloud Function has a valid auth.uid.
const { app } = initFirebase();
const auth = getAuth(app);
signInAnonymously(auth).catch((err: unknown) => {
  console.warn('Anonymous sign-in failed:', err);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
