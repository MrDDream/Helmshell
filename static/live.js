// État en direct reçu du serveur (Server-Sent Events) : sessions Claude, tâches, santé du serveur.
//
// En HTTP, le navigateur n'ouvre que 6 connexions par serveur : avec une connexion permanente par
// onglet, quelques onglets de Helmshell suffiraient à tout bloquer. Un seul onglet (le « meneur ») garde
// donc la connexion et relaie l'état aux autres par BroadcastChannel ; si cet onglet se ferme ou
// s'endort, un autre prend le relais.

const KEY = 'helmshell.live.meneur';
const BEAT = 2000;
const STALE = 15000;
const me = Math.random().toString(36).slice(2);
const subs = new Set();
let state = null;
let es = null;
let bc = null;
let timer = null;
let running = false;

function apply(s) {
  state = s;
  for (const fn of [...subs]) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}

function openStream() {
  if (es) return;
  es = new EventSource('/api/events');
  es.onmessage = (e) => {
    let s;
    try { s = JSON.parse(e.data); } catch (_) { return; }
    apply(s);
    bc?.postMessage({ type: 'state', state: s });
  };
  // En cas de coupure, EventSource se reconnecte tout seul.
}

function closeStream() {
  if (es) es.close();
  es = null;
}

function readLeader() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { return null; }
}

function tick() {
  const lead = readLeader();
  const now = Date.now();
  if (lead && lead.id === me) {
    localStorage.setItem(KEY, JSON.stringify({ id: me, t: now }));
    openStream();
  } else if (!lead || now - lead.t > STALE) {
    localStorage.setItem(KEY, JSON.stringify({ id: me, t: now }));
    // Un autre onglet a pu écrire en même temps : on relit avant de se considérer meneur.
    setTimeout(() => { if (running && readLeader()?.id === me) openStream(); }, 300);
  } else {
    closeStream();
  }
}

export function connectLive() {
  if (running) return;
  running = true;
  let shared = typeof BroadcastChannel !== 'undefined';
  try { localStorage.setItem('helmshell.live.test', '1'); localStorage.removeItem('helmshell.live.test'); } catch (_) { shared = false; }
  if (!shared) { openStream(); return; }
  bc = new BroadcastChannel('helmshell-direct');
  bc.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === 'state' && !es) apply(m.state);
    else if (m.type === 'hello' && es && state) bc.postMessage({ type: 'state', state });
  };
  bc.postMessage({ type: 'hello' }); // le meneur renvoie l'état courant
  tick();
  timer = setInterval(tick, BEAT);
  window.addEventListener('pagehide', release);
}

function release() {
  if (readLeader()?.id === me) {
    try { localStorage.removeItem(KEY); } catch (_) { /* rien */ }
  }
}

export function disconnectLive() {
  running = false;
  clearInterval(timer);
  timer = null;
  closeStream();
  release();
  bc?.close();
  bc = null;
  state = null;
  window.removeEventListener('pagehide', release);
}

/** Abonne `fn` aux mises à jour ; l'appelle tout de suite si un état est déjà connu. Renvoie le désabonnement. */
export function onLive(fn) {
  subs.add(fn);
  if (state) fn(state);
  return () => subs.delete(fn);
}

export const liveState = () => state;
