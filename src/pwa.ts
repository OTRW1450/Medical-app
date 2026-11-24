// Offline support & install prompts. The service worker (generated at build
// time, see vite.config.ts) caches the whole app so it runs with no network.
import { useEffect, useState } from 'react';

let waiting: ServiceWorker | null = null;
let updateRequested = false;
let reloading = false;
let deferredPrompt: (Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            waiting = w;
            emit();
          }
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) {
        waiting = reg.waiting;
        emit();
      }
      reg.addEventListener('updatefound', () => track(reg.installing));
    } catch (e) {
      console.warn('Offline mode unavailable', e);
    }
  });
  // Only reload when the user asked for an update – not when the very first
  // service worker takes control (that would wipe whatever they were typing).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateRequested && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as typeof deferredPrompt;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
}

export function applyUpdate() {
  updateRequested = true;
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export async function promptInstall() {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  deferredPrompt = null;
  emit();
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function usePwa() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return {
    updateReady: !!waiting,
    canInstall: !!deferredPrompt,
    installed: isStandalone(),
    offlineReady: !!navigator.serviceWorker?.controller,
  };
}
