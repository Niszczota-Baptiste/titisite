import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import { ConfirmProvider } from '../ui/ConfirmProvider';
import { ToastProvider } from '../ui/ToastProvider';
import '../components/author/author.css';
import './mobile.css';
import { MobileRoot } from './MobileRoot';

// Point d'entrée de l'application « Mon Atelier » (bundle dist-atelier,
// embarqué dans l'APK). L'atelier d'auteur du site y est repris tel quel sous
// /auteur/* ; ce dossier n'ajoute que l'accueil téléphone, la capture locale et
// les ponts natifs. Cf. docs/atelier-mobile.md.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <ConfirmProvider>
            <MobileRoot />
          </ConfirmProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
