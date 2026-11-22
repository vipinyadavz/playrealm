/* PlayRealm as an installable, offline app: registers the service worker, tells it which
   files to keep, and shows an Install button when the browser offers one. Loaded last. */
(function () {
  'use strict';

  const toast = (title, text, icon) => window.Profile && Profile.toast(title, text, icon);
  const installButtons = [...document.querySelectorAll('[data-install]')];
  const hint = document.getElementById('install-hint');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  /* ---------- Offline ---------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          const attr = (sel, name) => [...document.querySelectorAll(sel)].map((n) => n.getAttribute(name));
          const urls = ['./', 'index.html', 'privacy.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png']
            .concat(attr('script[src]', 'src'), attr('link[rel="stylesheet"]', 'href'), attr('link[rel="preload"][as="font"]', 'href'))
            .concat(['fonts/jetbrains-mono-latin.woff2'])
            .filter(Boolean);
          if (reg.active) reg.active.postMessage({ type: 'precache', urls: [...new Set(urls)] });
        })
        .catch(() => { /* offline support is a bonus, never an error */ });
    });
  }

  window.addEventListener('offline', () => toast('You are offline', 'Games keep working. Scores save on this device.', 'moon'));
  window.addEventListener('online', () => toast('Back online', '', 'sun'));

  /* ---------- Install ---------- */
  let offer = null;
  function sync() {
    installButtons.forEach((b) => { b.hidden = !offer; });
    if (!hint) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (standalone) hint.textContent = 'PlayRealm is installed on this device.';
    else if (offer) hint.textContent = 'Opens in its own window and works offline.';
    else if (ios) hint.textContent = 'To install on iPhone or iPad: Share, then “Add to Home Screen”.';
    else hint.textContent = '';
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    offer = e;
    sync();
  });
  installButtons.forEach((b) => b.addEventListener('click', () => {
    if (!offer) return;
    offer.prompt();
    const done = offer.userChoice;
    offer = null;
    sync();
    if (done && done.catch) done.catch(() => {});
  }));
  window.addEventListener('appinstalled', () => {
    offer = null;
    sync();
    toast('PlayRealm installed', 'Find it with your other apps. It works offline.', 'screen');
  });
  sync();
})();
