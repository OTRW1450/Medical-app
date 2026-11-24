import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { StateProvider } from './state';
import { LockGate } from './views/LockScreen';
import { registerServiceWorker } from './pwa';

// Ask the browser not to evict this origin's data under storage pressure.
navigator.storage?.persist?.().catch(() => {});
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LockGate>
      <StateProvider>
        <App />
      </StateProvider>
    </LockGate>
  </StrictMode>,
);
