import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { LANG_KEY } from './lib/i18n.jsx';

document.documentElement.lang = localStorage.getItem(LANG_KEY) || 'en';

// "/dasara-utsav" → "/dasara-utsav/" (the app lives in that folder on GitHub Pages)
const BASE = import.meta.env.BASE_URL;
if (BASE !== '/' && window.location.pathname + '/' === BASE) {
  window.history.replaceState(null, '', BASE + window.location.search + window.location.hash);
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {}); });
}
