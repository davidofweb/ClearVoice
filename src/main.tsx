import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register Service Worker safely for offline caching and PWA installation
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
      .then((reg) => {
        console.log('ClearVoice Service Worker active:', reg.scope);
      })
      .catch((err) => {
        console.warn('Service Worker registration skipped:', err);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
