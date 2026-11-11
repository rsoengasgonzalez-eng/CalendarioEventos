const CACHE='planes-con-alma-v7-d1-live';
const ASSETS=['/','/index.html','/styles.css','/app.js','/manifest.webmanifest','/icon.svg','/images/hero_xmadrid.jpg','/images/hero_dinner.jpg','/images/hero_rooftop.jpg','/images/hero_escape.jpg'];

self.addEventListener('install',event=>
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))
);

self.addEventListener('activate',event=>
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  )
);

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);

  // D1 es la fuente de verdad. Las respuestas API nunca se guardan en caché.
  if(url.pathname.startsWith('/api/')){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached=>
      cached||fetch(event.request).then(response=>{
        if(response.ok&&url.origin===self.location.origin){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      }).catch(()=>event.request.mode==='navigate'?caches.match('/index.html'):Response.error())
    )
  );
});
