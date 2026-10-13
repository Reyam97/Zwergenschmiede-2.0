/* Zwergenschmiede Gruppen-PWA – verpflichtende Versionenkontrolle beim Start. */
(() => {
  'use strict';
  const APP_VERSION = '11.0.0';
  const ROOT = './';
  const gate = document.getElementById('pwa-start');
  const title = document.getElementById('pwa-start-title');
  const message = document.getElementById('pwa-start-text');
  const retry = document.getElementById('pwa-start-retry');
  const meta = document.getElementById('pwa-start-meta');
  let busy = false;
  let lastCheck = 0;
  let desiredVersion = null;
  let reg = null;
  const RETRY_KEY = 'zwergenschmiede-pwa-update-attempts';

  function show(txt, heading='Die Zwergenschmiede', button=false) {
    title.textContent = heading;
    message.textContent = txt;
    meta.textContent = desiredVersion
      ? `Installiert: ${APP_VERSION} · Verfügbar: ${desiredVersion}`
      : `Gruppen-Edition · Version ${APP_VERSION}`;
    retry.hidden = !button;
    gate.hidden = false;
    document.documentElement.classList.add('pwa-gating');
  }
  function enter() {
    document.documentElement.classList.remove('pwa-gating');
    gate.hidden = true;
    retry.hidden = true;
    if (!desiredVersion || desiredVersion === APP_VERSION) {
      try {sessionStorage.removeItem(RETRY_KEY);} catch (_) {}
    }
  }
  function timeoutFetch(url, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(),ms);
    return fetch(url,{cache:'no-store',signal:ctrl.signal,headers:{Accept:'application/json'}})
      .finally(() => clearTimeout(timer));
  }
  async function getLatest() {
    const url = new URL('./version.json',location.href);
    url.searchParams.set('ts',String(Date.now()));
    const response = await timeoutFetch(url.toString(),5500);
    if(!response.ok) throw new Error(`Update-Server: HTTP ${response.status}`);
    const data = await response.json();
    if(!data || typeof data.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(data.version))
      throw new Error('Ungültige Versionsdatei');
    return data.version;
  }
  async function serviceWorkerReady() {
    if(!('serviceWorker' in navigator)) return null;
    try {
      reg = await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
      return reg;
    }catch(err){
      console.warn('Service Worker nicht verfügbar:',err);
      return null;
    }
  }
  function waitControllerChange(ms=4200) {
    return new Promise(resolve => {
      if(!('serviceWorker' in navigator)) return resolve(false);
      let finished=false;
      const finish = result => {
        if(finished) return;
        finished=true;
        navigator.serviceWorker.removeEventListener('controllerchange',changed);
        clearTimeout(timer);
        resolve(result);
      };
      const changed=()=>finish(true);
      const timer=setTimeout(()=>finish(false),ms);
      navigator.serviceWorker.addEventListener('controllerchange',changed);
    });
  }
  async function updateRequired(version, manual=false) {
    desiredVersion=version;
    const attempts = Number(sessionStorage.getItem(RETRY_KEY)||'0');
    if(attempts>=2 && !manual){
      show('Eine neuere Version wurde gefunden, aber das automatische Update konnte nicht abgeschlossen werden. Verbinde dich mit dem Internet und tippe auf „Erneut versuchen“. Die ältere Version ist online gesperrt.',
           'Aktualisierung erforderlich',true);
      return;
    }
    show('Neue Version gefunden. Sie wird installiert. Bitte geöffnet lassen …','Aktualisierung erforderlich');
    try {
      sessionStorage.setItem(RETRY_KEY,String(manual?1:attempts+1));
      if(!reg) reg=await serviceWorkerReady();
      if(reg) {
        const wait = waitControllerChange();
        await reg.update();
        if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
        await wait;
      }
      // Network-first Service Worker ensures a freshly deployed HTML on navigation.
      // The version file is uploaded last by the maintainer.
      location.replace(new URL('./?aktualisiert='+encodeURIComponent(version)+'&t='+Date.now(),location.href).href);
    } catch (err) {
      console.error('PWA-Update fehlgeschlagen:',err);
      show('Das Update konnte nicht installiert werden. Prüfe deine Internetverbindung und versuche es erneut. Deine Daten bleiben erhalten.',
           'Update fehlgeschlagen',true);
    }
  }
  async function check(options={}) {
    if(busy || document.visibilityState === 'hidden') return;
    busy=true;
    lastCheck=Date.now();
    if(options.block) show('Prüfe, ob eine neue Version verfügbar ist …');
    try {
      if(location.protocol === 'file:') {
        // Standalone HTML opened from Downloads; install/updates need HTTPS.
        desiredVersion=null;
        enter();
        return;
      }
      // Parallel: keep the gate fast, but ensure the SW is initialized for offline mode.
      const registering=serviceWorkerReady();
      const version = await getLatest();
      await registering;
      if(version !== APP_VERSION){
        await updateRequired(version,!!options.manual);
        return;
      }
      desiredVersion=null;
      enter();
    } catch (err) {
      // Browser can be offline while navigator.onLine is still true.
      // Fail open only when version server is unreachable; app remains functional.
      console.warn('Keine Online-Updateprüfung möglich; Offline-Nutzung erlaubt:',err);
      desiredVersion=null;
      enter();
    } finally {busy=false;}
  }
  retry.addEventListener('click',()=>{
    if(busy)return;
    try{sessionStorage.removeItem(RETRY_KEY);}catch(_){}
    if(desiredVersion) updateRequired(desiredVersion,true);
    else check({block:true,manual:true});
  });

  // First visit / every new launch.
  check({block:true});
  // Existing installed PWA may resume without reloading. Check then, too.
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') check({block:true});
  });
  window.addEventListener('pageshow',event=>{
    if(event.persisted) check({block:true});
  });
})();
