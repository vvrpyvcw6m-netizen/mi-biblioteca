/* Mi Biblioteca: cachea la app; la consulta ISBN y el escáner requieren Internet. */
const CACHE_NAME='mi-biblioteca-shell-v1-2';
const ASSETS=['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('mi-biblioteca-shell-')&&name!==CACHE_NAME).map(name=>caches.delete(name)))).then(()=>self.clients.claim()));});
// Prioriza red para obtener actualizaciones y utiliza caché si el iPhone está sin conexión.
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{
   const cache=await caches.open(CACHE_NAME);
   try{
     const response=await fetch(request);
     if(response.ok)await cache.put(request,response.clone());
     return response;
   }catch(error){
     return (await caches.match(request))||Response.error();
   }
 })());
});
