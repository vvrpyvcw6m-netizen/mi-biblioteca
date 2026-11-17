/* Mi Biblioteca: cachea la aplicación; las consultas ISBN siguen necesitando internet. */
const CACHE_NAME='mi-biblioteca-shell-v1-1';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('mi-biblioteca-shell-')&&name!==CACHE_NAME).map(name=>caches.delete(name)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{
   if(request.mode==='navigate'){
     try {const response=await fetch(request);if(response.ok){const cache=await caches.open(CACHE_NAME);cache.put('./index.html',response.clone());}return response;}
     catch{return (await caches.match('./index.html'))||Response.error();}
   }
   const cached=await caches.match(request);
   return cached||fetch(request);
 })());
});
