import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker with autoUpdate
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('New ClearVoice version available');
  },
  onOfflineReady() {
    console.log('ClearVoice is ready to work offline');
  },
});

createRoot(document.getElementById('root')!).render(<App />);
