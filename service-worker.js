const CACHE_VERSION = "training-v13.0.1";

const CORE_CACHE = `${CACHE_VERSION}-core`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./logobicep.png",
  "./apple-touch-icon.png",

  "./js/app.js",
  "./js/config.js",
  "./js/audio-engine.js",
  "./js/timer-engine.js",
  "./js/program-engine.js",
  "./js/session-controller.js",

  "./storage/storage-manager.js",
  "./storage/indexeddb-repository.js",
  "./storage/backup-repository.js",

  "./data/exercices.json",
  "./data/lexique-audio.json",
  "./data/programme-defaut.json",

  "./images/exercices/pompes.svg",
  "./images/exercices/accroupissements.svg",
  "./images/exercices/extensions-dorsales.svg",
  "./images/exercices/fentes.svg",
  "./images/exercices/repulsions.svg",
  "./images/exercices/ponts-fessiers.svg",
  "./images/exercices/planche.svg",
  "./images/exercices/tractions-supination.svg",
  "./images/exercices/tractions-pronation.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => {
        const obsoleteCaches = keys.filter(
          key => !key.startsWith(CACHE_VERSION)
        );

        return Promise.all(
          obsoleteCaches.map(key => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  const isAudio = /\.(mp3|wav)$/i.test(url.pathname);

  const isStaticImage =
    /\.(png|svg|jpg|jpeg|webp)$/i.test(url.pathname);

  const isApplicationFile =
    event.request.mode === "navigate" ||
    /\.(html|js|css|json|webmanifest)$/i.test(url.pathname);

  /*
   * Pour l’interface et le code :
   * on essaie toujours le réseau en premier.
   * En cas d’échec, on utilise la copie en cache.
   */
  if (isApplicationFile) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();

            caches
              .open(RUNTIME_CACHE)
              .then(cache => cache.put(event.request, copy));
          }

          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);

          if (cachedResponse) {
            return cachedResponse;
          }

          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }

          throw new Error(
            `Ressource hors ligne introuvable : ${event.request.url}`
          );
        })
    );

    return;
  }

  /*
   * Pour les images et les sons :
   * on utilise d’abord le cache.
   * Les nouveaux fichiers sont ajoutés au cache après leur premier chargement.
   */
  if (isAudio || isStaticImage) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request).then(response => {
          if (response.ok) {
            const copy = response.clone();

            caches
              .open(RUNTIME_CACHE)
              .then(cache => cache.put(event.request, copy));
          }

          return response;
        });
      })
    );
  }
});
