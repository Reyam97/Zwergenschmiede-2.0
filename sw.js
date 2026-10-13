/* Zwergenschmiede – Network-first HTML, Offline-Fallback, app-eigene Caches. */
const CACHE_NAME = 'zwergenschmiede-shell-11.0.0';
const CACHE_PREFIX = 'zwergenschmiede-shell-';
const SHELL = ['./','./index.html','./boot.js','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png'];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cache.addAll(SHELL);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(n=>n.startsWith(CACHE_PREFIX)&&n!==CACHE_NAME).map(n=>caches.delete(n)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{
  if(event.data && event.data.type==='SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  // Always fetch version.json from the server, never a stale offline copy.
  if(url.pathname.endsWith('/version.json'))return;
  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const res=await fetch(req,{cache:'no-store'});
        if(res.ok){
          const cache=await caches.open(CACHE_NAME);
          await cache.put(new URL('./index.html',self.registration.scope).toString(),res.clone());
        }
        return res;
      }catch(err){
        const cache=await caches.open(CACHE_NAME);
        return (await cache.match(new URL('./index.html',self.registration.scope).toString())) ||
          Response.error();
      }
    })());
    return;
  }
  // Cache-first for same-origin static assets; new SW cache version replaces them on release.
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const cached=await cache.match(req);
    if(cached)return cached;
    const res=await fetch(req);
    if(res.ok)await cache.put(req,res.clone());
    return res;
  })());
});
