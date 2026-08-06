const CACHE_VERSION="training-v13";
const CORE_CACHE=`${CACHE_VERSION}-core`;
const RUNTIME_CACHE=`${CACHE_VERSION}-runtime`;
const CORE_ASSETS=[
  "./","./index.html","./styles.css","./manifest.webmanifest","./logobicep.png","./apple-touch-icon.png","./IconeCoureur.svg",
  "./js/app.js","./js/config.js","./js/audio-engine.js","./js/timer-engine.js","./js/program-engine.js","./js/session-controller.js",
  "./storage/storage-manager.js","./storage/indexeddb-repository.js","./storage/backup-repository.js",
  "./data/exercices.json","./data/lexique-audio.json","./data/programme-defaut.json",
  "./images/exercices/pompes.svg","./images/exercices/accroupissements.svg","./images/exercices/extensions-dorsales.svg","./images/exercices/fentes.svg",
  "./images/exercices/repulsions.svg","./images/exercices/ponts-fessiers.svg","./images/exercices/planche.svg","./images/exercices/tractions-supination.svg","./images/exercices/tractions-pronation.svg"
];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CORE_CACHE).then(cache=>cache.addAll(CORE_ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>!key.startsWith(CACHE_VERSION)).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  const isAudio=/\.(mp3|wav)$/i.test(url.pathname),isStatic=/\.(png|svg|jpg|jpeg|webp)$/i.test(url.pathname);
  if(event.request.mode==="navigate"||/\.(html|js|css|json|webmanifest)$/i.test(url.pathname)){
    event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(RUNTIME_CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(hit=>hit||caches.match("./index.html"))));
    return;
  }
  if(isAudio||isStatic){
    event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{if(response.ok)caches.open(RUNTIME_CACHE).then(cache=>cache.put(event.request,response.clone()));return response})));
  }
});
