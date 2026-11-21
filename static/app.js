// Helmshell — interface web (JS natif, sans étape de build)
import { CDN, esc, loadScript, loadStyle } from './load.js';
import { createEditor, goToLine } from './editor.js';
import { renderMarkdown, isMarkdown } from './md.js';
import { renderDiff } from './diff.js';
import { areaChart } from './chart.js';
import { connectLive, disconnectLive, onLive, liveState } from './live.js';
import { ICONSETS } from './icons.js';
import { t, tp, LANG, LOCALE, setLang, syncLang, fmtNum, fmtPct, fmtBytes as i18nBytes, ago as i18nAgo, fmtDate, cmp } from './i18n.js';

/* ------------------------------------------------------------------ outils */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const enc = encodeURIComponent;

const ICONS = {
  logo: '<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>',
  grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderOpen: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H7.5a2 2 0 0 0-1.9 1.4L3 19z"/><path d="M3 19l2.6-7.6A2 2 0 0 1 7.5 10H21l-2.6 7.6A2 2 0 0 1 16.5 19z"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  filePlus: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>',
  broom: '<path d="M20 4l-7.5 7.5"/><path d="M10.4 10.6l3 3a1.5 1.5 0 0 1 0 2.1L12 17.1c-1.6 1.6-3.6 2.9-5.8 3.6L3 21.6l.9-3.2c.7-2.2 2-4.2 3.6-5.8l1.4-1.4a1.5 1.5 0 0 1 2.1 0z"/><path d="M6.5 17.5l2-2M9 19.5l1.5-1.5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
  upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 20h16"/>',
  download: '<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10"/><path d="M18 9c0 5-6 4-11 8"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  term: '<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 17l5-5-5-5M15 12H4"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  dotsV: '<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  chevronUp: '<path d="M6 15l6-6 6 6"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z"/>',
  code: '<path d="M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
  db: '<path d="M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 9.8C22 6 17.5 3 12 3zM7.5 12h.01M9 7.5h.01M15 7.5h.01"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  task: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
};
/* Icônes : une famille par style d'apparence (icons.js, généré par tools/fetch_icons.py), ICONS en secours.
   Les familles « fill » sont des formes pleines ; les autres sont des traits dont l'épaisseur suit `sw`. */
const STYLE_ICONS = { material: 'material', epure: 'lucide', verre: 'phosphor', doux: 'fluent', contraste: 'tabler' };
const FAMSPEC = { material: { fill: true }, lucide: { k: 0.8, min: 1.25, max: 2 }, phosphor: { fill: true }, fluent: { fill: true },
  tabler: { k: 1.3, min: 2, max: 3, cap: 'square', join: 'miter' } };
let iconFam = 'material';
function ic(name, size = 18, sw = 1.8) {
  const e = Object.hasOwn(ICONSETS[iconFam] || {}, name) ? ICONSETS[iconFam][name] : null;
  const sz = Number(size) || 18, w0 = Number(sw) || 1.8;
  const head = `<svg class="i" data-i="${esc(name)}" data-sw="${w0}" width="${sz}" height="${sz}"`;
  if (!e) return `${head} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w0}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Object.hasOwn(ICONS, name) ? ICONS[name] : ''}</svg>`;
  const sp = FAMSPEC[iconFam];
  const w = sp.fill ? 0 : Math.min(sp.max, Math.max(sp.min, w0 * sp.k));
  const paint = sp.fill ? 'fill="currentColor"' : `fill="none" stroke="currentColor" stroke-width="${w.toFixed(2)}" stroke-linecap="${sp.cap || 'round'}" stroke-linejoin="${sp.join || 'round'}"`;
  return `${head} viewBox="${e.v}" ${paint} aria-hidden="true">${e.f ? `<g class="io">${e.d}</g><g class="if">${e.f}</g>` : e.d}</svg>`;
}
// Changement de style : les icônes déjà affichées prennent la nouvelle famille sans recharger la page
function swapIcons() {
  // Seulement nos icônes (nom connu, hors contenu Markdown d'un projet) : jamais un SVG venu d'un README
  for (const svg of document.querySelectorAll('svg.i[data-i]')) {
    const n = svg.dataset.i;
    if (svg.closest('.md') || !Object.hasOwn(ICONS, n)) continue;
    svg.outerHTML = ic(n, svg.getAttribute('width'), svg.dataset.sw);
  }
}

// Formats selon la langue (i18n.js) : mêmes noms qu'avant pour le reste de l'interface
const fmtBytes = (n) => i18nBytes(n);
// Gigaoctets sans l'unité (ex. « 3,2 » / « 3.2 ») : l'unité vient avec le texte traduit
const fmtGo = (n) => { const d = n < 10 * 1024 ** 3 ? 1 : 0; return fmtNum(n / 1024 ** 3, { minimumFractionDigits: d, maximumFractionDigits: d }); };
function ago(ts) { return i18nAgo(ts); }
// Heures et minutes : « 2 h 05 » / « 2h 05m »
const fmtHM = (s) => t('{h} h {m}', { h: Math.floor(s / 3600), m: String(Math.round((s % 3600) / 60)).padStart(2, '0') });
const since = (ts) => {
  const s = Date.now() / 1000 - ts;
  if (s < 3600) return t('{n} min', { n: Math.max(1, Math.round(s / 60)) });
  return fmtHM(s);
};

/* Message temporaire. `actions` : { label, run } ou liste (ex. Annuler, Oui / Non). */
function toast(msg, isErr = false, actions = null) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  const text = document.createElement('span');
  text.className = 'grow';
  text.textContent = msg;
  el.append(text);
  const list = [].concat(actions || []);
  if (list.length) {
    el.classList.add('has-act');
    const row = document.createElement('div');
    row.className = 'row nowrap';
    row.style.gap = '6px';
    for (const a of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn sm';
      b.textContent = a.label;
      b.onclick = () => { el.remove(); a.run(); };
      row.append(b);
    }
    el.append(row);
  }
  $('#toasts').append(el);
  setTimeout(() => el.remove(), list.length ? 12000 : isErr ? 8000 : 3500);
}

class HttpError extends Error { constructor(msg, status, data = {}) { super(msg); this.status = status; this.data = data; } }

async function api(method, path, body, raw = false) {
  const opts = { method, headers: { 'X-Helmshell': '1' } };
  if (body instanceof Blob || body instanceof ArrayBuffer) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(path, opts);
  if (r.status === 401 && path !== '/api/login') {
    renderLogin();
    throw new HttpError(t('Connexion requise'), 401);
  }
  const data = raw ? r : await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(data.error || t('Erreur {status}', { status: r.status }), r.status, data);
  // Langue choisie sur le serveur (réglage du compte) : appliquée au démarrage
  if (path === '/api/me' && method === 'GET' && data?.language) syncLang(data.language);
  return data;
}
const fail = (e) => { if (e.status !== 401 && !e.quiet) toast(e.message, true); };


/* --- boîtes de dialogue ---------------------------------------------------- */
function ask({ title, label, value = '', placeholder = '', okLabel = t('Valider'), danger = false, text = '', type = 'text', inputmode = '' }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog">
      <h2>${esc(title)}</h2>
      ${text ? `<p class="muted">${esc(text)}</p>` : ''}
      ${label ? `<label class="field"><span>${esc(label)}</span><input name="v" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="${type === 'password' ? 'current-password' : 'off'}"${inputmode ? ` inputmode="${inputmode}"` : ''}></label>` : ''}
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn ghost" data-close>${t('Annuler')}</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(okLabel)}</button>
      </div></form>`;
    document.body.append(d);
    $('[data-close]', d).onclick = () => d.close('cancel');
    d.addEventListener('close', () => {
      const v = d.returnValue === 'ok' ? (label ? $('input', d).value.trim() : true) : null;
      d.remove();
      resolve(v || null);
    });
    d.showModal();
    const inp = $('input', d);
    if (inp) { inp.focus(); inp.select(); }
  });
}
const confirmBox = (title, text, okLabel = t('Confirmer')) => ask({ title, text, okLabel, danger: true });

/* ------------------------------------------------------------- état global */
/* Couleur source : dix palettes, en clair et en sombre (app.css pour les trois premières, palettes.css pour les autres). */
const SEEDS = [['sarcelle', t('Sarcelle'), ['#006A60', '#9EF2E4', '#CCE5FF']], ['ambre', t('Ambre'), ['#8B5000', '#FFDCBE', '#D9E7C0']], ['bleu', t('Bleu'), ['#0061A4', '#D1E4FF', '#F2DAFF']],
  ['violet', t('Violet'), ['#6750A4', '#E9DDFF', '#FFD8E5']], ['indigo', t('Indigo'), ['#2D5CAE', '#DCE1FF', '#AEECFF']], ['rose', t('Rose'), ['#A0366E', '#FED8E8', '#FFDAD6']],
  ['corail', t('Corail'), ['#A23D32', '#FFDAD4', '#F1E2B3']], ['citron', t('Citron'), ['#5F6208', '#E9E78C', '#B5EFD6']], ['foret', t('Forêt'), ['#366A35', '#B9F1B3', '#A4EFF1']],
  ['ardoise', t('Ardoise'), ['#4F616D', '#D2E5F4', '#DFE0FF']]];
/* Style : Material 3 de base, ou un autre habillage (app.css, fin du fichier). Police chargée à la demande. */
const STYLES = [['material', 'Material 3', t('Rail, icônes Material Symbols')], ['epure', t('Épuré'), t('Barre latérale, Inter, icônes Lucide')],
  ['verre', t('Verre'), t('Rail flottant translucide, icônes Phosphor')], ['doux', t('Doux'), t('Tuiles pastel, Nunito, icônes Fluent')], ['contraste', t('Contrasté'), t('Noir et blanc, icônes Tabler')]];
const STYLE_FONTS = { epure: 'Inter:wght@400;500;600;700', doux: 'Nunito:wght@400;500;600;700;800' };
let stylePref = 'material';
try { stylePref = localStorage.getItem('helmshell.style') || 'material'; } catch (_) { /* défaut */ }
function applyStyle(st) {
  stylePref = STYLES.some((x) => x[0] === st) ? st : 'material';
  if (stylePref === 'material') delete document.documentElement.dataset.style;
  else document.documentElement.dataset.style = stylePref;
  const fam = STYLE_ICONS[stylePref] || 'material';
  if (fam !== iconFam) { iconFam = fam; swapIcons(); }
  const font = STYLE_FONTS[stylePref];
  if (font && !document.querySelector(`link[data-font="${stylePref}"]`)) {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.dataset.font = stylePref;
    l.href = `https://fonts.googleapis.com/css2?family=${font}&display=swap`;
    document.head.appendChild(l);
  }
  try { localStorage.setItem('helmshell.style', stylePref); } catch (_) { /* rien */ }
  requestAnimationFrame(() => $('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--m-surface').trim() || '#0E1513'));
}
applyStyle(stylePref);
let seedPref = 'sarcelle';
try { seedPref = localStorage.getItem('helmshell.seed') || 'sarcelle'; localStorage.removeItem('helmshell.accent'); } catch (_) { /* défaut */ }
function applySeed(seed) {
  seedPref = SEEDS.some((x) => x[0] === seed) ? seed : 'sarcelle';
  document.documentElement.dataset.seed = seedPref;
  try { localStorage.setItem('helmshell.seed', seedPref); } catch (_) { /* rien */ }
}
applySeed(seedPref);

const THEMES = [['auto', t('Automatique')], ['dark', t('Sombre')], ['light', t('Clair')]];
let themePref = 'auto';
try { themePref = localStorage.getItem('helmshell.theme') || 'auto'; } catch (_) { /* défaut */ }
const lightQuery = window.matchMedia('(prefers-color-scheme: light)');
function applyTheme(pref = themePref) {
  themePref = pref;
  const mode = pref === 'auto' ? (lightQuery.matches ? 'light' : 'dark') : pref;
  document.documentElement.dataset.theme = mode;
  requestAnimationFrame(() => $('meta[name=theme-color]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--m-surface').trim() || '#0E1513'));
  try { localStorage.setItem('helmshell.theme', pref); } catch (_) { /* rien */ }
}
lightQuery.addEventListener?.('change', () => { if (themePref === 'auto') applyTheme('auto'); });
applyTheme();

let cleanups = [];
let routeGen = 0;
const isStale = (g) => g !== routeGen;
const setHTML = (el, h) => { if (el && el._h !== h) { el.innerHTML = h; el._h = h; } };
const onLeave = (fn) => cleanups.push(fn);
function every(ms, fn) {
  const id = setInterval(() => { if (!document.hidden) fn(); }, ms);
  onLeave(() => clearInterval(id));
}
let overview = null;
// Outil de déploiement (Coolify, Dokploy ou aucun) : mémorisé pour dessiner le menu sans attendre le serveur
let DEPLOY = { provider: '', name: '', url: '', configured: false, features: {} };
const DN = () => esc(DEPLOY.name || t('l’outil de déploiement'));
function applyDeployNav() {
  const a = $('.nav a[href="#/deploiements"]');
  if (a) a.hidden = !DEPLOY.provider;
}
// Lien web seulement pour http(s) (une valeur venue d'une API tierce pourrait être « javascript:… »)
const webUrl = (u) => { const s = String(u || '').trim(); return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : ''; };
const domainChip = (f) => (webUrl(f) ? `<a class="chip sm" href="${esc(webUrl(f))}" target="_blank" rel="noopener">${ic('globe', 14, 2)}${esc(f.trim().replace(/^https?:\/\//, ''))}</a>` : `<span class="chip sm">${esc(f)}</span>`);
// Nom et adresse de l'outil : seulement des valeurs connues (le cache du navigateur pourrait être modifié)
const DEPLOY_NAMES = { coolify: 'Coolify', dokploy: 'Dokploy' };
function cleanDeploy(d) {
  const provider = Object.hasOwn(DEPLOY_NAMES, d?.provider) ? d.provider : '';
  return { provider, name: DEPLOY_NAMES[provider] || '', url: webUrl(d?.url), configured: !!d?.configured, features: { ...(d?.features || {}) } };
}
function setDeploy(d) {
  if (!d) return;
  d = cleanDeploy(d);
  const changed = d.provider !== DEPLOY.provider || d.configured !== DEPLOY.configured || d.name !== DEPLOY.name;
  DEPLOY = { ...DEPLOY, ...d, features: d.features || {} };
  try { localStorage.setItem('helmshell.deploy', JSON.stringify(DEPLOY)); } catch (_) { /* rien */ }
  applyDeployNav();
  return changed;
}
try { DEPLOY = cleanDeploy(JSON.parse(localStorage.getItem('helmshell.deploy') || '{}')); } catch (_) { /* défaut */ }

/* -------------------------------------------------------------- terminal */
const TERM_FONT = () => { try { return Math.min(22, Math.max(10, +localStorage.getItem('helmshell.termFont') || 13)); } catch (_) { return 13; } };
async function mountTerminal(box, target, slug, { name = null, onOpen = null, branch = null, agent = null } = {}) {
  loadStyle(CDN + '@xterm/xterm@5.5.0/css/xterm.css');
  await loadScript(CDN + '@xterm/xterm@5.5.0/lib/xterm.js');
  await loadScript(CDN + '@xterm/addon-fit@0.10.0/lib/addon-fit.js');
  // Police chargée avant de mesurer les cellules (au plus 1,5 s d'attente)
  try {
    await Promise.race([Promise.all([document.fonts.load("13px 'Roboto Mono'"), document.fonts.load("13px 'Symbols Nerd Font Mono'", '\ue0b0')]),
      new Promise((r) => setTimeout(r, 2500))]);
  } catch (_) { /* police de secours */ }
  box.innerHTML = '';
  const term = new window.Terminal({
    // Symboles Powerline / Nerd Font (thèmes zsh agnoster, powerlevel10k, starship…) en secours de Roboto Mono
    fontFamily: "'Roboto Mono', 'Symbols Nerd Font Mono', ui-monospace, monospace", fontSize: TERM_FONT(), cursorBlink: true, scrollback: 5000,
    // Liens OSC 8 du terminal : seulement http(s), dans un nouvel onglet (jamais d'autre schéma)
    linkHandler: { activate: (e, uri) => { if (/^https?:\/\//i.test(uri)) window.open(uri, '_blank', 'noopener'); }, allowNonHttpProtocols: false },
    theme: { background: '#0E1513', foreground: '#DDE4E1', cursor: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8AA4FF', selectionBackground: '#2F3647',
      green: '#7BE3A3', yellow: '#F2B84B', red: '#F07A6A', blue: '#8AA4FF', magenta: '#C79BFF', cyan: '#5BD6B0' },
  });
  const fit = new window.FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(box);
  try { fit.fit(); } catch (_) { /* boîte encore cachée */ }
  let dead = false;
  let id;
  try {
    const r = await api('POST', '/api/term', { target, slug, name, branch, ...(agent ? { agent } : {}), cols: term.cols, rows: term.rows });
    id = r.id;
    if (onOpen) onOpen(r);
  } catch (e) {
    term.write(`\x1b[31m${e.message}\x1b[0m\r\n`);
    return () => term.dispose();
  }
  const es = new EventSource(`/api/term/${id}/stream`);
  es.onmessage = (ev) => term.write(Uint8Array.from(atob(ev.data), (c) => c.charCodeAt(0)));
  es.addEventListener('exit', () => { es.close(); dead = true; term.write(`\r\n\x1b[90m${t('[terminal fermé]')}\x1b[0m\r\n`); });
  let queue = Promise.resolve(), buf = '', timer = null;
  term.onData((d) => {
    if (dead) return;
    buf += d;
    if (!timer) timer = setTimeout(() => {
      const data = buf; buf = ''; timer = null;
      queue = queue.then(() => api('POST', `/api/term/${id}/input`, { data }).catch(() => {}));
    }, 4);
  });
  let lastSize = '';
  const ro = new ResizeObserver(() => {
    try { fit.fit(); } catch (_) { return; }
    const s = `${term.cols}x${term.rows}`;
    if (s !== lastSize && !dead) { lastSize = s; api('POST', `/api/term/${id}/resize`, { cols: term.cols, rows: term.rows }).catch(() => {}); }
  });
  ro.observe(box);
  // La police (Roboto Mono) peut arriver après l'ouverture : on recalcule la taille quand elle est là,
  // sinon la dernière ligne (barre de tmux) déborde du cadre.
  const refit = () => { if (dead) return; try { fit.fit(); } catch (_) { return; } const sz = `${term.cols}x${term.rows}`; if (sz !== lastSize) { lastSize = sz; api('POST', `/api/term/${id}/resize`, { cols: term.cols, rows: term.rows }).catch(() => {}); } };
  setTimeout(refit, 400);
  term.focus();
  const cleanup = () => {
    ro.disconnect(); es.close(); term.dispose();
    api('DELETE', `/api/term/${id}`).catch(() => {});
  };
  // Réglages à chaud depuis la page Terminal
  cleanup.setFont = (n) => { term.options.fontSize = n; refit(); };
  cleanup.focus = () => term.focus();
  return cleanup;
}

/* ---------------------------------------------------------- statuts communs */
function sessionStatus(c) {
  if (!c || !c.running) return { label: t('Arrêtée'), cls: '', dot: '' };
  switch (c.phase) {
    case 'ready': return { label: t('Lien prêt · à ouvrir depuis claude.ai'), short: t('Lien prêt'), cls: 'ok', dot: 'ok' };
    case 'running': return { label: t('Active · visible dans claude.ai/code'), short: t('Active'), cls: 'ok', dot: 'ok' };
    case 'question': return { label: t('Confirmation demandée'), short: t('Question'), cls: 'warn', dot: 'warn' };
    case 'exited': return { label: t('Claude s’est arrêté (code {code})', { code: c.exit_code }), short: t('Arrêtée'), cls: 'err', dot: 'err' };
    default: return { label: t('Démarrage…'), short: t('Démarrage'), cls: 'warn', dot: 'warn' };
  }
}
const MODES = [
  { id: 'default', label: t('Demander à chaque action'), hint: t('Tu valides chaque modification et commande') },
  { id: 'acceptEdits', label: t('Accepter les modifications'), hint: t('Fichiers modifiés librement, commandes validées') },
  { id: 'plan', label: t('Plan d’abord'), hint: t('Claude propose un plan avant de toucher au code') },
  { id: 'auto', label: t('Automatique'), hint: t('Claude avance seul, avec des garde-fous de sécurité') },
  { id: 'dontAsk', label: t('Ne rien demander'), hint: t('Refuse ce qui n’est pas déjà autorisé, sans poser de question') },
];
const modeLabel = (m, a = 'claude') => (agentModes(a).find((x) => x.id === m) || MODES.find((x) => x.id === m) || {}).label || m || '';

/* ---------------------------------------------------------- agents de code */
// Claude Code et Codex côte à côte : /api/agents dit lesquels sont installés, et leurs modes de permission.
let agentsInfo = null;
async function loadAgents(force = false) {
  if (!agentsInfo || force) {
    try { agentsInfo = await api('GET', '/api/agents'); } catch (_) { agentsInfo = agentsInfo || { default_agent: 'claude', setting: '', agents: [] }; }
  }
  return agentsInfo;
}
const AGENT_LABELS = { claude: 'Claude Code', codex: 'Codex' };
const agentId = (a) => (a === 'codex' ? 'codex' : 'claude');
const agentShort = (a) => (agentId(a) === 'codex' ? 'Codex' : 'Claude');
// Logo d'un agent ; celui de Codex est noir : inversé en thème sombre (et sur les fonds de terminal, par le CSS)
const agentLogo = (a, size = 18, cls = '') => `<img class="alogo${agentId(a) === 'codex' ? ' alogo-codex inv-dark' : ''}${cls ? ` ${cls}` : ''}" src="/logos/${agentId(a)}.svg" alt="" width="${size}" height="${size}">`;
const agentDef = (a) => (agentsInfo?.agents || []).find((x) => x.id === agentId(a)) || null;
const codexOn = () => !!agentDef('codex')?.available;
const availableAgents = () => (agentsInfo?.agents || []).filter((x) => x.available).map((x) => x.id);
function agentModes(a) {
  const d = agentDef(a);
  if (d?.modes?.length) return d.modes.map((m) => ({ id: m.id, label: (LANG === 'fr' ? m.label_fr : m.label_en) || m.id, hint: (LANG === 'fr' ? m.hint_fr : m.hint_en) || '' }));
  return agentId(a) === 'claude' ? MODES : [];
}
async function agentDefaultMode(a) { return agentId(a) === 'claude' ? defaultMode() : (agentDef(a)?.default_mode || 'auto'); }
// Dernier agent choisi dans l'onglet Agents d'un projet (mémorisé sur cet appareil)
const agentPref = (slug) => { try { return agentId(localStorage.getItem(`helmshell.agent.${slug}`)); } catch (_) { return 'claude'; } };
const setAgentPref = (slug, a) => { try { localStorage.setItem(`helmshell.agent.${slug}`, agentId(a)); } catch (_) { /* rien */ } };
// Session Codex ouverte pour ce projet (flux direct, sinon dernier aperçu)
const codexSessionOf = (slug) => (liveState()?.repos || overview?.repos || []).some((r) => r.slug === slug && r.agent === 'codex');
// Claude Code installé ? (vrai tant que /api/agents n'a pas répondu, comme avant)
const claudeOn = () => (agentsInfo?.agents?.length ? !!agentDef('claude')?.available : true);
// IA installées sur le serveur, Claude Code et/ou Codex : chacune indépendante, elles cohabitent
const aiAgents = () => { const l = availableAgents(); return l.length ? l : ['claude']; };
// Sessions d'IA ouvertes dans un projet (agent au premier plan de son terminal tmux)
const agentReposOf = (slug) => (liveState()?.repos || overview?.repos || []).filter((r) => r.slug === slug && r.claude);
// Libellé du bouton d'ouverture : l'IA installée, ou « Ouvrir IA » quand les deux le sont (choix dans une fenêtre)
const openAiLabel = (list = aiAgents()) => (list.length > 1 ? t('Ouvrir IA') : list[0] === 'codex' ? t('Ouvrir Codex') : t('Ouvrir Claude'));
// Petits logos des IA ouvertes dans un projet, avec leur état en info-bulle
const agentMinis = (slug) => agentReposOf(slug).filter((r) => !r.branch).map((r) => { const st = repoStatus(r); return `<span class="mini ${st.cls === 'warn' ? 'warn' : 'ok'} amini" title="${esc(`${agentShort(r.agent)} : ${st.short}`)}">${agentLogo(r.agent, 14)}${esc(agentShort(r.agent))}</span>`; }).join('');
// Fenêtre « Quelle IA ouvrir ? » : une tuile par IA installée, avec son état dans ce projet. Renvoie l'agent ou null.
function chooseAgent(slug, name) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'agentdlg';
    const repos = agentReposOf(slug), pref = agentPref(slug);
    const tile = (a) => {
      const r = repos.find((x) => x.agent === a && !x.branch);
      return `<button type="button" class="agent-tile" data-agent="${a}">${agentLogo(a, 36)}<span class="two"><b>${AGENT_LABELS[a]}</b><span class="sub">${esc(r ? repoStatus(r).short : t('Pas ouvert dans ce projet'))}</span></span>${r ? `<span class="dot ${repoStatus(r).cls === 'warn' ? 'warn' : 'ok'}"></span>` : ''}</button>`;
    };
    d.innerHTML = `<div class="stack" style="gap:14px">
      <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2 style="margin:0">${t('Quelle IA ouvrir ?')}</h2><button type="button" class="btn icon ghost" data-x aria-label="${t('Fermer')}">${ic('x', 16)}</button></div>
      <p class="small muted" style="margin:0">${t('Sur {name}. Chaque IA a son propre terminal, son historique et ses permissions.', { name: esc(name || slug) })}</p>
      <div class="agent-tiles">${aiAgents().map(tile).join('')}</div></div>`;
    document.body.append(d);
    let val = null;
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-agent]');
      if (b) { val = b.dataset.agent; d.close(); } else if (e.target === d || e.target.closest('[data-x]')) d.close();
    });
    d.addEventListener('close', () => { d.remove(); resolve(val); });
    d.showModal();
    ($(`[data-agent="${pref}"]`, d) || $('[data-agent]', d))?.focus();
  });
}
// Ouvre une IA sur un projet depuis n'importe quelle page : choix si les deux sont installées, terminal si elle
// est déjà ouverte, sinon fenêtre de lancement
async function openAi(slug, name) {
  await loadAgents();
  const list = aiAgents();
  const a = list.length > 1 ? await chooseAgent(slug, name) : list[0];
  if (!a) return false;
  if (agentReposOf(slug).some((r) => r.agent === a && !r.branch)) { setAgentPref(slug, a); location.hash = claudeHash(slug, null, a); return true; }
  return launchClaude(slug, name, a, true);
}

function deployStatus(app) {
  if (!app) return { label: t('Pas de déploiement'), short: '—', dot: '', cls: 'c-muted' };
  const s = (app.status || '').toLowerCase();
  const mk = (short, dot, cls) => ({ label: `${short} · ${DEPLOY.name || t('Déploiement')}`, short, dot, cls });
  if (s.startsWith('running')) return s.includes('unhealthy') ? mk(t('Instable'), 'warn', 'c-warn') : mk(t('En ligne'), 'ok', 'c-ok');
  if (s.includes('starting') || s.includes('restarting')) return mk(t('Redémarrage'), 'warn', 'c-warn');
  if (s.includes('degraded')) return mk(t('Dégradé'), 'err', 'c-err');
  if (s.startsWith('exited')) return mk(t('Arrêté'), 'err', 'c-err');
  return mk(app.status || t('Inconnu'), '', 'c-muted');
}
// Pastille d'état d'une appli déployée (« running:unknown » → En ligne…)
const appPill = (a) => { const d = deployStatus(a); return `<span class="pill ${d.dot}" title="${esc(a?.status || '')}"><span class="dot"></span>${esc(d.short)}</span>`; };
const isoAgo = (v) => (v ? ago(Date.parse(v) / 1000) : '');
const ACT_DOT = { claude: 'ok', create: '', error: 'err', deploy: 'ok', git: 'accent', file: '', stop: 'warn', login: '', domain: 'accent' };

async function startClaude(slug, mode, cont = false, spawn = null) {
  try {
    await api('POST', `/api/projects/${enc(slug)}/claude/start`, { mode, continue: cont, spawn });
    toast(t('Session Claude démarrée'));
    return true;
  } catch (e) { fail(e); return false; }
}
async function stopClaude(slug) {
  if (!await confirmBox(t('Arrêter la session ?'), t('Claude sera interrompu et la session Remote Control fermée.'), t('Arrêter'))) return false;
  try { await api('POST', `/api/projects/${enc(slug)}/claude/stop`); toast(t('Session arrêtée')); return true; } catch (e) { fail(e); return false; }
}

/* -------------------------------------------------------------- connexion */
function renderLogin() {
  cleanups.forEach((f) => f()); cleanups = [];
  disconnectLive();
  livePrev = null;
  $('#app').innerHTML = `<div class="login"><form class="card" id="login">
    <div class="brand"><div class="brand-logo"><img src="/logo.svg" alt=""></div><div><b>Helmshell</b><span>${t('Console du serveur')}</span></div></div>
    <div id="login-sso" class="stack" style="gap:12px" hidden></div>
    <div id="login-pw" class="stack" style="gap:16px">
    <label class="field"><span>${t('Mot de passe')}</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>
    <label class="field" id="code-field" hidden><span>${t('Code de l’application d’authentification')}</span><input name="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" maxlength="12"><span class="hint">${t('Les 6 chiffres affichés par l’app, ou un code de secours.')}</span></label>
    <p class="hint" id="login-err" role="alert"></p>
    <button class="btn primary lg">${t('Se connecter')}</button>
    <p class="hint">${t('Mot de passe initial : affiché au premier lancement et dans {path}.', { path: '<span class="mono">~/.config/helmshell/mot-de-passe-initial.txt</span>' })}</p>
    </div>
  </form></div>`;
  fetch('/api/auth-info', { cache: 'no-store' }).then((r) => r.json()).then((info) => {
    const sso = $('#login-sso'), pw = $('#login-pw');
    syncLang(info.language);
    if (!sso || !pw) return;
    if (info.oidc) {
      sso.hidden = false;
      sso.innerHTML = `<a class="btn primary lg sso-btn" href="/auth/oidc/start">${ic('lock', 20, 2)}${t('Se connecter avec {name}', { name: esc(info.oidc.label) })}</a>
        ${info.password ? `<div class="or"><span>${t('ou')}</span></div>` : ''}`;
      if (info.password) $('button.primary', pw)?.classList.replace('primary', 'tonal');
    }
    if (!info.password) {
      pw.hidden = true;
      $('[name=password]', pw).required = false;
      if (!info.oidc) { sso.hidden = false; sso.innerHTML = `<p class="hint">${t('Connexion par mot de passe désactivée et OIDC indisponible : voir {var} dans le README.', { var: '<span class="mono">HELMSHELL_OIDC_DISABLE=1</span>' })}</p>`; }
    }
  }).catch(() => { /* page de connexion classique */ });
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button', e.target);
    btn.disabled = true;
    try {
      const body = { password: e.target.password.value };
      if (!$('#code-field').hidden) body.code = e.target.code.value.trim();
      await api('POST', '/api/login', body);
      renderShell();
      route();
    } catch (err) {
      const needCode = err.data?.totp;
      if (needCode && $('#code-field').hidden) {
        // Mot de passe accepté : deuxième étape, le code de l'application
        $('#code-field').hidden = false;
        $('#login-err').textContent = '';
        e.target.code.focus();
        return;
      }
      if (needCode) { e.target.code.value = ''; e.target.code.focus(); }
      $('#login-err').textContent = err.message;
      $('#login-err').style.color = 'var(--err)';
    } finally { btn.disabled = false; }
  };
}

/* ------------------------------------------------------------------ coque */
// [lien, icône, nom complet, test de la route, libellé court du rail]
const NAV = [
  ['#/', 'home', t('Accueil'), /^#\/?$/, t('Accueil')],
  ['#/projets', 'folder', t('Projets'), /^#\/(projets|nouveau)/, t('Projets')],
  ['#/sessions', 'spark', t('Sessions IA'), /^#\/sessions/, t('Sessions')],
  ['#/terminal', 'term', t('Terminal'), /^#\/terminal/, t('Terminal')],
  ['#/deploiements', 'upload', t('Déploiements'), /^#\/deploiements/, t('Déploiem.')],
  ['#/serveur', 'server', t('Serveur'), /^#\/serveur/, t('Serveur')],
  ['#/parametres', 'sliders', t('Paramètres'), /^#\/parametres/, t('Réglages')],
];

function renderShell() {
  $('#app').innerHTML = `<div class="shell">
    <aside class="side">
      <a class="brand" href="#/" aria-label="${t('Helmshell, accueil')}"><span class="brand-logo"><img src="/logo.svg" alt=""></span><span class="brand-name">Helmshell</span></a>
      <nav class="nav" aria-label="${t('Navigation principale')}">
        ${NAV.map(([href, icon, label, , short]) => `<a href="${href}" title="${label}"><span class="ic">${ic(icon, 22, 2)}${href === '#/sessions' ? '<span class="count" id="nav-count" hidden></span>' : ''}</span><span class="label">${short}</span><span class="label-l">${label}</span></a>`).join('')}
      </nav>
    </aside>
    <div class="content">
      <div class="topbar">
        <button type="button" class="cmdk" id="cmdk">${ic('search', 22, 2)}<span class="grow ellipsis">${t('Rechercher un projet, une page, une action')}</span><kbd>Ctrl K</kbd></button>
        <div class="ai-chips" id="ai-chips">${['claude', 'codex'].map(usageChip).join('')}</div>
        <div class="health" id="health" aria-label="${t('État du serveur')}"></div>
        <button type="button" class="avatar" id="avatar" aria-label="${t('Compte et apparence')}">${esc((window.__user || 'A').slice(0, 1).toUpperCase())}</button>
      </div>
      <main class="main" id="main"></main>
      <footer class="appfoot" id="appfoot"></footer>
    </div>
  </div>`;
  $('#cmdk').onclick = openPalette;
  $('#appfoot').onclick = (e) => { if (e.target.closest('[data-x=update]')) openUpdate(); };
  drawFooter();
  checkVersion();
  if (!window.__verTimer) window.__verTimer = setInterval(() => checkVersion(), 6 * 3600 * 1000);
  loadAgents().then(() => { showUsageChips(); loadUsageChips(); });
  applyDeployNav();
  loadUsageChips();
  setInterval(() => { if (!document.hidden) loadUsageChips(); }, 120000);
  $('#avatar').onclick = (e) => menu(e.currentTarget, [
    { label: t('Réglages'), icon: 'sliders', run: () => { location.hash = '#/parametres'; } },
    { label: document.documentElement.dataset.theme === 'dark' ? t('Passer en thème clair') : t('Passer en thème sombre'), icon: 'eye', run: () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') },
    { label: t('Raccourcis clavier'), icon: 'keyboard', run: showShortcuts },
    installPrompt ? { label: t('Installer l’application'), icon: 'download', run: installApp } : null,
    versionInfo?.available ? { label: t('{v} disponible', { v: `v${versionInfo.latest}` }), icon: 'download', dot: true, run: openUpdate } : null,
    { label: t('Se déconnecter'), icon: 'logout', run: async () => { await api('POST', '/api/logout').catch(() => {}); renderLogin(); } },
  ]);
  refreshOverview();
  if (!window.__ovTimer) window.__ovTimer = setInterval(() => { if (!document.hidden && $('#main')) refreshOverview(); }, 60000);
  connectLive();
  if (!window.__liveGlobal) window.__liveGlobal = onLive(onLiveGlobal);
}

/* --- version de Helmshell, lien GitHub, mises à jour --- */
const REPO_URL = 'https://github.com/MrDDream/Helmshell';
let versionInfo = null;
// /api/version : version installée et dernière version publiée (vérifiée côté serveur au plus une fois par jour)
async function checkVersion(force = false) {
  try { versionInfo = await api('GET', `/api/version${force ? '?force=1' : ''}`); } catch (_) { return; }
  drawFooter();
}
// Pied de page discret, en bas à droite de chaque page (dans le flux, sous le contenu)
function drawFooter() {
  const f = $('#appfoot');
  if (!f) return;
  const v = versionInfo, up = !!(v?.available && v.latest);
  setHTML(f, `${up ? `<button type="button" class="pill accent upd-pill" data-x="update">${ic('download', 14, 2)}${esc(t('{v} disponible', { v: `v${v.latest}` }))}</button>` : ''}
    <a class="gh-link" href="${REPO_URL}" target="_blank" rel="noopener" title="${t('Helmshell sur GitHub')}"><img class="inv-dark" src="/logos/github.svg" alt="" width="16" height="16"><span>MrDDream/Helmshell</span>${v?.version ? `<span class="mono gh-ver">v${esc(v.version)}</span>` : ''}</a>`);
  const av = $('#avatar');
  if (av) { av.classList.toggle('has-update', up); av.setAttribute('aria-label', up ? `${t('Compte et apparence')} · ${t('{v} disponible', { v: `v${v.latest}` })}` : t('Compte et apparence')); }
}
// Commande de mise à jour selon l'installation (Git, Docker, autre)
const UPDATE_CMDS = {
  git: 'cd ~/helmshell && git pull && systemctl --user restart helmshell',
  docker: 'docker compose -f deploy/docker-compose.yml pull && docker compose -f deploy/docker-compose.yml up -d',
  other: 'curl -fsSL https://raw.githubusercontent.com/MrDDream/Helmshell/main/install.sh | bash',
};
async function openUpdate() {
  const v = versionInfo;
  if (!v?.latest) return;
  closePop();
  const kind = Object.hasOwn(UPDATE_CMDS, v.kind) ? v.kind : 'other';
  const cmd = UPDATE_CMDS[kind];
  const how = { git: t('Installation depuis Git : sur le serveur, dans le dossier de Helmshell ({path} par défaut).', { path: '<span class="mono">~/helmshell</span>' }),
    docker: t('Installation Docker : sur le serveur, depuis le dossier du dépôt Helmshell.'),
    other: t('Sur le serveur, relance l’installateur : il met Helmshell à jour en gardant tes réglages.') }[kind];
  const d = document.createElement('dialog');
  d.className = 'wide';
  d.innerHTML = '<div class="skeleton"><span class="spin"></span></div>';
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
  let notes = '';
  if (v.notes) { try { notes = await renderMarkdown(v.notes); } catch (_) { notes = `<p class="plain-text">${esc(v.notes)}</p>`; } }
  const url = webUrl(v.url) || `${REPO_URL}/releases`;
  d.innerHTML = `<div class="stack upd-dlg" style="gap:14px">
    <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><h2 style="margin:0">${esc(t('Helmshell {v} est disponible', { v: `v${v.latest}` }))}</h2><button class="btn icon ghost" data-x="close" aria-label="${t('Fermer')}">${ic('x', 16)}</button></div>
    <p class="small muted" style="margin:0">${esc(t('Version installée : {v}', { v: `v${v.current}` }))}</p>
    ${notes ? `<div class="md upd-notes">${notes}</div>` : `<p class="small muted" style="margin:0">${t('Pas de notes de version.')}</p>`}
    <h3 style="margin:0">${t('Mettre à jour')}</h3>
    <p class="small" style="margin:0">${how}</p>
    <div class="upd-cmd"><code class="mono">${esc(cmd)}</code><button type="button" class="btn icon sm" data-x="copy" aria-label="${t('Copier la commande')}" title="${t('Copier la commande')}">${ic('copy', 16, 2)}</button></div>
    <div class="row" style="justify-content:flex-end"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${ic('external', 16, 2)}${t('Voir la version sur GitHub')}</a><button class="btn primary" data-x="close">${t('Fermer')}</button></div></div>`;
  d.onclick = (e) => {
    if (e.target === d) { d.close(); return; }
    const b = e.target.closest('[data-x]');
    if (!b || b.closest('.md')) return;
    if (b.dataset.x === 'close') d.close();
    if (b.dataset.x === 'copy') copyText(cmd, t('Commande copiée'));
  };
}

/* --- direct : santé, compteur, titre de l’onglet, alertes --- */
function gauge(label, v, title) {
  const r = 15, c = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, v || 0));
  const lvl = pct > 90 ? 'err' : pct > 75 ? 'warn' : '';
  return `<span class="gauge ${lvl}" title="${esc(title)}"><svg viewBox="0 0 38 38" aria-hidden="true"><circle class="track" cx="19" cy="19" r="${r}"/><circle class="val" cx="19" cy="19" r="${r}" stroke-dasharray="${((c * pct) / 100).toFixed(1)} ${c.toFixed(1)}"/></svg><span class="txt"><span>${label}</span><b>${fmtPct(pct)}</b></span></span>`;
}
function drawHealth(st) {
  const h = $('#health');
  if (!h || !st || !st.mem_total) return;
  const mem = (100 * st.mem_used) / st.mem_total, disk = (100 * st.disk_used) / st.disk_total;
  setHTML(h, `<a class="gauges" href="#/serveur" title="${t('{host} · en ligne depuis {n} j', { host: esc(st.hostname), n: Math.floor(st.uptime / 86400) })}" aria-label="${t('{host} : processeur {cpu}, mémoire {mem}, disque {disk}. Ouvrir la page Serveur', { host: esc(st.hostname), cpu: fmtPct(st.cpu), mem: fmtPct(mem), disk: fmtPct(disk) })}">
    ${gauge('CPU', st.cpu, t('{cores} threads · charge {load}', { cores: st.cores, load: fmtNum(st.load) }))}
    ${gauge('RAM', mem, t('{used} / {total} Go', { used: fmtGo(st.mem_used), total: fmtGo(st.mem_total) }))}
    ${gauge(t('Disque'), disk, `${t('{used} / {total} Go', { used: fmtGo(st.disk_used), total: fmtGo(st.disk_total) })}${st.projects_size ? ` · ${t('projets : {size}', { size: fmtBytes(st.projects_size) })}` : ''}`)}
  </a>`);
}

// Favicon (gouvernail Helmshell) avec une pastille quand quelque chose attend une réponse
const FAVICON = (badge) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="28" fill="#E3EEF8"/><g stroke="#1F4E79" stroke-linecap="round"><path d="M60 16L60 104M16 60L104 60M29 29L91 91M91 29L29 91" stroke-width="9"/><circle cx="60" cy="60" r="27" fill="none" stroke-width="11"/></g><circle cx="60" cy="60" r="11" fill="#D97757"/>${badge ? '<circle cx="96" cy="24" r="22" fill="#F2B84B" stroke="#0E1014" stroke-width="5"/>' : ''}</svg>`)}`;

/* Boutons d'utilisation de la barre du haut, un par IA installée (Claude Code, Codex) : limite la plus
   proche de son plafond dans un anneau, détail dans une petite fenêtre */
const USAGE = { claude: { url: '/api/claude/usage', data: null }, codex: { url: '/api/codex/usage', data: null } };
const usageTitle = (a) => (a === 'codex' ? t('Utilisation de Codex') : t('Utilisation de Claude'));
function usageChip(a) {
  return `<button type="button" class="claude-chip${a === 'codex' ? ' codex-chip' : ''}" id="${a}-chip" data-usage="${a}" aria-haspopup="dialog" aria-label="${usageTitle(a)}" title="${usageTitle(a)}" ${a === 'codex' ? 'hidden' : ''}>
    <span class="cc-ring"><svg viewBox="0 0 38 38" aria-hidden="true"><circle class="track" cx="19" cy="19" r="16"/><circle class="val" id="${a}-chip-ring" cx="19" cy="19" r="16" stroke-dasharray="0 101"/></svg>${agentLogo(a, 18)}</span>
    <span class="txt"><span id="${a}-chip-l">${agentShort(a)}</span><b id="${a}-chip-v">…</b></span>${ic('chevronDown', 16, 2)}</button>`;
}
// Seulement les IA installées (Claude affiché tant que /api/agents n'a pas répondu)
function showUsageChips() {
  const cl = $('#claude-chip'), cx = $('#codex-chip');
  if (cl) cl.hidden = !claudeOn();
  if (cx) cx.hidden = !codexOn();
}
// Libellé court d'une limite d'après sa durée : 5 h, sem., mois
const limShort = (l) => (!l?.window ? '' : l.window <= 86400 ? t('{n} h', { n: Math.round(l.window / 3600) }) : l.window <= 8 * 86400 ? t('sem.') : t('mois'));
// Limite affichée dans l'anneau : session de 5 h pour Claude (sinon la plus entamée), la plus courte pour Codex
function usageTop(a, u) {
  const L = u?.limits || [];
  if (!L.length) return null;
  if (a === 'claude') return L.find((l) => l.id === 'session') || L.reduce((m, l) => (l.used > (m?.used ?? -1) ? l : m), null);
  return L.reduce((m, l) => (!m || (l.window || Infinity) < (m.window || Infinity) ? l : m), null);
}
async function loadUsageChip(a) {
  const chip = $(`#${a}-chip`);
  if (!chip || chip.hidden) return;
  let u;
  try { u = USAGE[a].data = await api('GET', USAGE[a].url); } catch (_) { return; }
  const top = usageTop(a, u);
  $(`#${a}-chip-v`).textContent = top ? fmtPct(top.used) : '—';
  const c = 2 * Math.PI * 16, pct = Math.max(0, Math.min(100, top?.used || 0));
  $(`#${a}-chip-ring`)?.setAttribute('stroke-dasharray', `${((c * pct) / 100).toFixed(1)} ${c.toFixed(1)}`);
  const lb = $(`#${a}-chip-l`);
  if (lb) lb.innerHTML = top && limShort(top) ? `<i>${agentShort(a)} · </i>${limShort(top)}` : agentShort(a);
  chip.classList.toggle('warn', !!top && top.used >= 75 && top.used < 90);
  chip.classList.toggle('err', !!top && top.used >= 90);
  chip.title = top ? t('{title} · {label} : {pct}', { title: usageTitle(a), label: top.label, pct: fmtPct(top.used) }) : usageTitle(a);
  if (openPop?._anchor === chip) drawUsagePop(openPop, a);
}
const loadUsageChips = () => { showUsageChips(); loadUsageChip('claude'); loadUsageChip('codex'); };
function drawUsagePop(pop, a) {
  const u = USAGE[a].data;
  const box = $('.cpop-body', pop);
  if (!box) return;
  if (!u) { box.innerHTML = '<div class="skeleton"><span class="spin"></span></div>'; return; }
  // Rythme sur la limite la plus longue (semaine de Claude, semaine ou mois de Codex)
  const long = a === 'claude' ? u.limits.find((l) => l.id === 'week') : u.limits.reduce((m, l) => (l.window && l.window >= 7 * 86400 && (!m || l.window > m.window) ? l : m), null);
  let pace = '';
  if (long?.resets_at && long.window) {
    const elapsed = 1 - (long.resets_at - Date.now() / 1000) / long.window;
    const day = new Date(long.resets_at * 1000).toLocaleDateString(LOCALE, long.window > 8 * 86400 ? { day: 'numeric', month: 'long' } : { weekday: 'long' });
    pace = long.used <= elapsed * 100 + 5
      ? `<p class="upace ok">${ic('check', 16, 2)}${t('Dans les temps jusqu’à {day}.', { day: esc(day) })}</p>`
      : `<p class="upace warn">${ic('clock', 16, 2)}${t('Plus rapide que le rythme : limite atteinte avant {day}.', { day: esc(day) })}</p>`;
  }
  const busy = (u.sessions || []).filter((x) => x.used != null);
  box.innerHTML = (u.plan ? `<span class="small muted">${t('Forfait {plan}', { plan: esc(u.plan.charAt(0).toUpperCase() + u.plan.slice(1)) })}</span>` : '')
    + (u.limits.length ? u.limits.map((l) => usageBar(l.label, l.used, resetText(l.resets_at))).join('') + pace
      : `<span class="small muted">${a === 'codex' ? t('Pas encore de chiffres : Codex les donne à chaque échange.') : t('Pas encore de chiffres : ils arrivent avec la prochaine lecture.')}</span>`)
    + (busy.length ? `<span class="ulabel" style="margin-top:4px">${t('Contexte des sessions ouvertes')}</span>${busy.map((x) => usageBar(x.project || t('Session'), x.used, x.tokens != null ? t('{used} sur {size} jetons', { used: fmtTok(x.tokens), size: fmtTok(x.size) }) : '', x.used >= 70 ? 'warn' : 'amber')).join('')}` : '');
  $('.cpop-upd', pop).textContent = u.refreshing ? t('Actualisation…') : u.updated ? t('Mis à jour {ago}', { ago: ago(u.updated) }) : '';
}
document.addEventListener('click', (e) => {
  const chip = e.target.closest?.('[data-usage]');
  if (!chip) return;
  const a = chip.dataset.usage;
  const pop = popover(chip, `<div class="cpop" role="dialog" aria-label="${usageTitle(a)}">
    <div class="cpop-head">${agentLogo(a, 20)}<b>${usageTitle(a)}</b><span class="cpop-upd small muted"></span></div>
    <div class="cpop-body stack"></div></div>`);
  if (!pop) return;
  drawUsagePop(pop, a);
  loadUsageChip(a);
});
let lastBadge = null;
function setBadge(n) {
  document.title = n ? `(${n}) Helmshell` : 'Helmshell';
  if ((n > 0) === lastBadge) return;
  lastBadge = n > 0;
  const link = $('link[rel=icon]');
  if (link) link.href = n ? FAVICON(true) : '/favicon.svg';
}

function browserNotify(title, body, hash) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const n = new Notification(title, { body, icon: '/favicon.svg', tag: hash });
    n.onclick = () => { window.focus(); location.hash = hash; n.close(); };
  } catch (_) { /* notifications indisponibles */ }
}

async function answerClaude(slug, v, question) {
  try {
    await api('POST', `/api/projects/${enc(slug)}/claude/send`, { text: v, key: 'Enter', question });
    toast(v === 'y' ? t('Réponse « Oui » envoyée') : t('Réponse « Non » envoyée'));
    return true;
  } catch (e) { fail(e); return false; }
}

let livePrev = null;
function onLiveGlobal(st) {
  drawHealth({ ...st.health, projects_size: overview?.stats?.projects_size });
  const c = $('#nav-count');
  const nses = st.sessions.length + (st.repos || []).filter((r) => r.claude).length;
  if (c) { c.hidden = !nses; c.textContent = nses; }
  const attention = st.sessions.filter((s) => s.phase === 'question' || s.phase === 'exited');
  setBadge(attention.length + (st.repos || []).filter((r) => r.agent === 'codex' && r.claude && r.status === 'waiting').length);
  const cur = { s: Object.fromEntries(st.sessions.map((s) => [s.slug, s])), t: Object.fromEntries(st.tasks.map((t) => [t.id, t])), r: Object.fromEntries((st.repos || []).map((r) => [r.key || r.slug, r])) };
  if (livePrev) {
    for (const s of st.sessions) {
      const b = livePrev.s[s.slug];
      const hash = `#/projets/${enc(s.slug)}`;
      const here = location.hash === hash || location.hash.startsWith(`${hash}/`);
      if (s.phase === 'question' && (!b || b.phase !== 'question' || b.question !== s.question)) {
        if (!here) toast(`${t('{name} : Claude attend une réponse', { name: s.name })}\n${s.question}`, false, [{ label: t('Oui'), run: () => answerClaude(s.slug, 'y', s.question) }, { label: t('Non'), run: () => answerClaude(s.slug, 'n', s.question) }, { label: t('Voir'), run: () => { location.hash = hash; } }]);
        browserNotify(t('{name} : Claude attend une réponse', { name: s.name }), s.question, hash);
      } else if (s.phase === 'exited' && b && b.phase !== 'exited') {
        if (!here) toast(t('{name} : Claude s’est arrêté', { name: s.name }), true, { label: t('Voir'), run: () => { location.hash = `${hash}/claude`; } });
        browserNotify(t('{name} : Claude s’est arrêté', { name: s.name }), t('Code {code}', { code: s.exit_code }), `${hash}/claude`);
      }
    }
    for (const r of st.repos || []) {
      const b = livePrev.r?.[r.key || r.slug];
      const hash = claudeHash(r.slug, r.branch, r.agent);
      const who = agentShort(r.agent);
      if (b && b.status === 'busy' && r.status === 'idle' && r.claude) {
        if (!location.hash.startsWith(hash)) toast(t('{name} : {agent} a terminé', { name: r.name, agent: who }), false, { label: t('Voir'), run: () => { location.hash = hash; } });
        browserNotify(t('{name} : {agent} a terminé', { name: r.name, agent: who }), t('{agent} attend la suite.', { agent: who }), hash);
      }
      // Codex attend une validation (commande, modification, confiance dans le dossier) : réponse dans son terminal
      if (r.agent === 'codex' && r.claude && r.status === 'waiting' && (!b || b.status !== 'waiting' || b.question !== r.question)) {
        if (!location.hash.startsWith(hash)) toast(`${t('{name} : Codex attend ta validation', { name: r.name })}${r.question ? `\n${r.question}` : ''}`, false, { label: t('Voir'), run: () => { location.hash = hash; } });
        browserNotify(t('{name} : Codex attend ta validation', { name: r.name }), r.question || t('Validation demandée'), hash);
      }
    }
    for (const tk of st.tasks) {
      const b = livePrev.t[tk.id];
      if (b && b.status === 'running' && tk.status !== 'running') {
        const ok = tk.status === 'ok';
        const hash = `#/projets/${enc(tk.slug)}/claude`;
        const head = ok ? t('{name} : tâche terminée', { name: tk.name }) : t('{name} : tâche en échec', { name: tk.name });
        toast(`${head}\n${tk.prompt.slice(0, 120)}`, !ok, { label: t('Voir'), run: () => { openTask(tk.id); } });
        browserNotify(head, tk.last || tk.prompt, hash);
      }
    }
  }
  livePrev = cur;
}

async function refreshOverview() {
  try { overview = await api('GET', '/api/overview'); } catch (_) { return; }
  setDeploy(overview.deploy);
  if (overview.user && overview.user !== window.__user) {
    window.__user = overview.user;
    const a = $('#avatar');
    if (a) { a.textContent = overview.user.slice(0, 1).toUpperCase(); a.title = overview.user; }
  }
  const live = liveState();
  const n = (live?.sessions || overview.sessions).length + (live?.repos || overview.repos || []).filter((r) => r.claude).length;
  const c = $('#nav-count');
  if (c) { c.hidden = !n; c.textContent = n; }
  drawHealth(live?.health?.mem_total ? { ...live.health, projects_size: overview.stats.projects_size } : overview.stats);
  document.dispatchEvent(new CustomEvent('overview'));
}

/* ------------------------------------------------------------------ routeur */
const ROUTES = [
  [/^#\/?$/, viewDashboard],
  [/^#\/projets\/([^/?]+)(?:\/([a-z]+))?(?:\?(.*))?$/, viewProject],
  [/^#\/projets$/, viewProjects],
  [/^#\/nouveau$/, viewNew],
  [/^#\/sessions$/, viewSessions],
  [/^#\/terminal$/, viewTerminal],
  [/^#\/deploiements$/, viewDeployments],
  [/^#\/parametres$/, viewSettings],
  [/^#\/serveur$/, viewServer],
];

function route() {
  routeGen++;
  cleanups.forEach((f) => { try { f(); } catch (_) { /* rien */ } });
  cleanups = [];
  const hash = location.hash || '#/';
  for (const a of $$('.nav a')) {
    const item = NAV.find((n) => n[0] === a.getAttribute('href'));
    if (item && item[3].test(hash)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const main = $('#main');
  if (!main) return;
  closePop();
  main.onclick = main.onchange = main.oninput = main.onsubmit = null;
  main.className = 'main';
  main.innerHTML = '<div class="skeleton"><span class="spin"></span></div>';
  window.scrollTo(0, 0);
  for (const [rx, view] of ROUTES) {
    const m = hash.match(rx);
    if (m) {
      Promise.resolve(view(main, ...m.slice(1).map((x) => (x === undefined ? x : decodeURIComponent(x))))).catch((e) => {
        if (e.status !== 401) main.innerHTML = `<div class="notice err">${esc(e.message)}</div>`;
      });
      return;
    }
  }
  main.innerHTML = `<div class="empty">${t('Page introuvable.')} <a href="#/">${t('Retour au tableau de bord')}</a></div>`;
}

/* Délégation d'événements : chaque vue fournit ses actions par data-act */
function bind(root, acts) {
  root.onclick = (e) => {
    const el = e.target.closest('[data-act]');
    if (el && el.closest('.md')) return;  // contenu d'un projet : jamais d'action de l'appli
    if (el && root.contains(el) && Object.hasOwn(acts, el.dataset.act) && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') {
      acts[el.dataset.act](el, e);
    }
  };
  // Cases à cocher et listes : l’action part sur « change » (pas sur le clic)
  root.onchange = (e) => {
    const el = e.target;
    if ((el.tagName === 'INPUT' || el.tagName === 'SELECT') && !el.closest('.md') && el.dataset.act && Object.hasOwn(acts, el.dataset.act)) acts[el.dataset.act](el, e);
  };
}

/* ------------------------------------------------------ popovers et menus */
let openPop = null;
function closePop() {
  if (!openPop) return;
  openPop.remove();
  openPop = null;
  document.removeEventListener('mousedown', popOutside, true);
  document.removeEventListener('keydown', popKey, true);
}
function popOutside(e) { if (openPop && !openPop.contains(e.target) && !openPop._anchor.contains(e.target)) closePop(); }
function popKey(e) { if (e.key === 'Escape') { const a = openPop?._anchor; closePop(); a?.focus(); } }
function popover(anchor, html, onClick) {
  if (openPop && openPop._anchor === anchor) { closePop(); return null; }
  closePop();
  const el = document.createElement('div');
  el.className = 'popover';
  el.innerHTML = html;
  el._anchor = anchor;
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
  const above = r.bottom + 6 + h > window.innerHeight && r.top - h - 6 > 0;
  el.style.left = `${left + window.scrollX}px`;
  el.style.top = `${(above ? r.top - h - 6 : r.bottom + 6) + window.scrollY}px`;
  openPop = el;
  if (onClick) el.onclick = onClick;
  setTimeout(() => {
    document.addEventListener('mousedown', popOutside, true);
    document.addEventListener('keydown', popKey, true);
  });
  return el;
}
function menu(anchor, items) {
  const list = items.filter(Boolean);
  const el = popover(anchor, `<div class="menu" role="menu">${list.map((it, i) => `<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}">${ic(it.icon || 'chevron', 16)}<span>${esc(it.label)}</span>${it.dot ? '<span class="dot accent" aria-hidden="true"></span>' : ''}</button>`).join('')}</div>`,
    (e) => { const b = e.target.closest('[data-i]'); if (b) { closePop(); list[+b.dataset.i].run(); } });
  if (el) {
    const btns = $$('button', el);
    btns[0]?.focus();
    el.onkeydown = (e) => {
      const i = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    };
  }
}
async function drawQr(box, url) {
  try {
    await loadScript(CDN + 'qrcode-generator@2.0.4/dist/qrcode.js');
    const qr = window.qrcode(0, 'M');
    qr.addData(url); qr.make();
    if (box && box.isConnected) box.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true, alt: t('QR code de la session') });
  } catch (_) { /* QR facultatif */ }
}
async function copyText(text, label = t('Lien copié')) {
  try { await navigator.clipboard.writeText(text); toast(label); } catch (_) { toast(t('Copie impossible : sélectionne le texte à la main'), true); }
}

/* ------------------------------------------------------- lancement de Claude */
let defaultModeCache = null;
async function defaultMode() {
  if (!defaultModeCache) { try { defaultModeCache = (await api('GET', '/api/settings')).default_mode; } catch (_) { /* défaut */ } }
  return defaultModeCache || 'acceptEdits';
}
// opts.open : ouverture dans le terminal du projet (tmux), avec le choix de l'agent (opts.agent : choix initial)
// et la case Remote Control (Claude seulement). Sans : session Claude en arrière-plan (`claude remote-control`),
// avec l'option des copies de travail.
function startDialog(name, mode, canWorktree = false, opts = {}) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'startdlg';
    const choices = opts.open && !opts.lock ? availableAgents() : [];
    let agent = opts.open ? agentId(opts.agent) : 'claude';
    if (choices.length && !choices.includes(agent)) agent = choices[0];
    const modeFor = (a) => (a === 'claude' ? mode : (agentDef(a)?.default_mode || 'auto'));
    const title = (a) => t('Lancer {agent} sur {name}', { agent: agentShort(a), name: esc(name) });
    const modesHtml = (a) => `<legend>${a === 'codex' ? t('Permissions de Codex') : t('Permissions de Claude')}</legend>
        ${agentModes(a).map((m) => `<label class="mode" title="${esc(m.hint)}"><input type="radio" name="mode" value="${esc(m.id)}" ${m.id === modeFor(a) ? 'checked' : ''}><span><b>${esc(m.label)}</b><small>${esc(m.hint)}</small></span></label>`).join('')}`;
    // Options en tuiles à cocher (pas d'interrupteurs), permissions en grille compacte : tout tient sans défiler
    const tile = (n, icon, ttl, sub, on, attrs = '') => `<label class="otile" ${attrs}><input type="checkbox" name="${n}" ${on ? 'checked' : ''}>
        <span class="otile-ic">${ic(icon, 20, 2)}</span><span class="otile-t"><b>${ttl}</b><small>${sub}</small></span><span class="otile-ck" aria-hidden="true">${ic('check', 14, 3)}</span></label>`;
    d.innerHTML = `<form method="dialog">
      <h2 id="sd-title">${title(agent)}</h2>
      ${choices.length > 1 ? `<div class="seg sm sd-agents" role="group" aria-label="${t('Agent')}">${choices.map((a) => `<button type="button" class="ico" data-agent="${a}" aria-pressed="${a === agent}">${agentLogo(a, 18)}${AGENT_LABELS[a]}</button>`).join('')}</div>` : ''}
      <div class="otiles">
        ${tile('cont', 'undo', t('Reprendre la dernière session'), t('Sinon, une nouvelle conversation'), opts.cont !== false)}
        ${opts.open ? tile('rc', 'phone', 'Remote Control', t('Aussi depuis l’app Claude ou claude.ai'), !!opts.rc, `id="sd-rc" ${agent === 'claude' ? '' : 'hidden'}`) : ''}
      </div>
      <fieldset class="modes grid">${modesHtml(agent)}</fieldset>
      ${canWorktree && !opts.open ? `<label class="row small" style="gap:8px;flex-wrap:nowrap;align-items:flex-start"><input type="checkbox" name="wt" style="accent-color:var(--accent);width:16px;height:16px;margin-top:2px"><span>${t('Une copie de travail (worktree Git) par conversation')}<br><span class="muted">${t('Plusieurs conversations ouvertes depuis claude.ai travaillent en parallèle sans se marcher dessus.')}</span></span></label>` : ''}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>${t('Annuler')}</button><button class="btn primary" value="ok">${ic('play', 15, 2)}${t('Lancer')}</button></div>
    </form>`;
    document.body.append(d);
    $('[data-close]', d).onclick = () => d.close('cancel');
    const seg = $('.sd-agents', d);
    if (seg) seg.onclick = (e) => {
      const b = e.target.closest('[data-agent]');
      if (!b || b.dataset.agent === agent) return;
      agent = b.dataset.agent;
      for (const x of $$('[data-agent]', seg)) x.setAttribute('aria-pressed', String(x === b));
      $('#sd-title', d).innerHTML = title(agent);
      $('.modes', d).innerHTML = modesHtml(agent);
      const rc = $('#sd-rc', d);
      if (rc) rc.hidden = agent !== 'claude';
    };
    d.addEventListener('close', () => {
      const f = $('form', d);
      const r = d.returnValue === 'ok' ? { agent, mode: f.mode?.value || modeFor(agent), cont: f.cont.checked, spawn: f.wt?.checked ? 'worktree' : null, rc: agent === 'claude' && !!f.rc?.checked } : null;
      d.remove();
      resolve(r);
    });
    d.showModal();
    $('input[name=mode]:checked', d)?.focus();
  });
}
// « Reprendre la dernière conversation » : coché par défaut, mémorisé sur cet appareil
const contPref = () => { try { return localStorage.getItem('helmshell.cont') !== '0'; } catch (_) { return true; } };
// Tâche de fond : si le dépôt a sa propre configuration Claude, on demande une fois si on lui fait confiance
async function withTrust(call) {
  try { return await call(false); } catch (e) {
    if (e.status !== 428) throw e;
    if (!await confirmBox(t('Faire confiance à ce dépôt ?'), e.message, t('Je fais confiance'))) throw Object.assign(new Error(t('Tâche annulée')), { quiet: true });
    return call(true);
  }
}
// Ouvre un agent (Claude par défaut, ou `agent`) dans le terminal tmux d'un projet, après le dialogue de lancement
async function launchClaude(slug, name, agent = 'claude', lock = false) {
  await loadAgents();
  const r = await startDialog(name || slug, await defaultMode(), false, { open: true, agent, lock, cont: contPref() });
  if (!r) return false;
  try {
    await api('POST', `/api/projects/${enc(slug)}/claude/repo/open${brQ(null, r.agent)}`, { mode: r.mode, continue: r.cont, rc: r.rc });
  } catch (e) { fail(e); return false; }
  toast(r.agent === 'codex' ? t('Codex ouvert') : r.rc ? t('Claude ouvert avec Remote Control') : t('Claude ouvert'));
  setAgentPref(slug, r.agent);
  location.hash = claudeHash(slug, null, r.agent);
  return true;
}
async function deployApp(uuid, name) {
  try { await api('POST', '/api/deploy/deploy', { uuid }); toast(t('Déploiement de {name} lancé', { name })); } catch (e) { fail(e); }
}

/* ------------------------------------------------------------ palette Ctrl K */
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
async function openPalette() {
  if ($('#palette')) return;
  closePop();
  const d = document.createElement('dialog');
  d.id = 'palette';
  d.className = 'palette';
  d.innerHTML = `<div class="pal-in">${ic('search', 18)}<input id="pal-q" placeholder="${t('Rechercher un projet, une page, une action')}" autocomplete="off" aria-label="${t('Commande')}" aria-controls="pal-list"></div>
    <ul id="pal-list" role="listbox" aria-label="${t('Résultats')}"></ul>
    <div class="pal-foot small muted"><span><kbd>↑</kbd><kbd>↓</kbd> ${t('choisir')}</span><span><kbd>${t('Entrée')}</kbd> ${t('valider')}</span><span><kbd>${t('Échap')}</kbd> ${t('fermer')}</span></div>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.showModal();
  let projects = [], items = [], sel = 0;
  const go = (h) => () => { location.hash = h; };
  const pages = NAV.filter(([href]) => href !== '#/deploiements' || DEPLOY.provider).map(([href, icon, label]) => ({ label, hint: t('Page'), icon, run: go(href), base: true }))
    .concat([
      { label: t('Nouveau projet'), hint: t('Action'), icon: 'plus', run: go('#/nouveau'), base: true },
      { label: t('Raccourcis clavier'), hint: t('Aide'), icon: 'keyboard', run: showShortcuts },
      ...THEMES.map(([id, l]) => ({ label: t('Thème : {name}', { name: l }), hint: t('Apparence'), icon: 'eye', run: () => applyTheme(id) })),
      ...STYLES.map(([id, l]) => ({ label: t('Style : {name}', { name: l }), hint: t('Apparence'), icon: 'palette', run: () => applyStyle(id) })),
      ...SEEDS.map(([id, l]) => ({ label: t('Couleur : {name}', { name: l }), hint: t('Apparence'), icon: 'palette', run: () => applySeed(id) })),
    ]);
  const build = () => {
    const out = [];
    for (const p of projects) {
      const h = `#/projets/${enc(p.slug)}`;
      const name = p.name;
      out.push({ label: name, hint: t('Projet'), icon: 'folder', run: go(h), base: true });
      // Une entrée par IA installée (ou déjà ouverte) : sa session, sinon son lancement
      const open = agentReposOf(p.slug).filter((r) => !r.branch).map((r) => r.agent);
      if (p.claude.running || open.includes('claude')) out.push({ label: t('Session Claude · {name}', { name }), hint: 'Claude', icon: 'spark', run: go(open.includes('claude') ? claudeHash(p.slug, null, 'claude') : `${h}/claude`) });
      else if (claudeOn()) out.push({ label: t('Lancer Claude sur {name}', { name }), hint: 'Claude', icon: 'spark', run: () => launchClaude(p.slug, name, 'claude', true) });
      if (open.includes('codex')) out.push({ label: t('Session Codex · {name}', { name }), hint: 'Codex', icon: 'term', run: go(claudeHash(p.slug, null, 'codex')) });
      else if (codexOn()) out.push({ label: t('Lancer Codex sur {name}', { name }), hint: 'Codex', icon: 'term', run: () => launchClaude(p.slug, name, 'codex', true) });
      out.push({ label: t('Fichiers de {name}', { name }), hint: t('Fichiers'), icon: 'file', run: go(`${h}/fichiers`) });
      out.push({ label: t('Confier une tâche à une IA · {name}', { name }), hint: aiAgents().map(agentShort).join(' / '), icon: 'task', run: go(`${h}/claude`) });
      if (p.app_id) out.push({ label: t('Logs et variables de {name}', { name }), hint: DEPLOY.name, icon: 'upload', run: go(`${h}/deploiement`) });
      if (p.git?.changes) out.push({ label: t('Valider les modifications de {name}', { name }), hint: 'Git', icon: 'branch', run: go(`${h}/git`) });
      if (p.app_id) out.push({ label: t('Déployer {name}', { name }), hint: DEPLOY.name, icon: 'upload', run: () => deployApp(p.app_id, name) });
    }
    return out.concat(pages);
  };
  const list = $('#pal-list', d), inp = $('#pal-q', d);
  const draw = () => {
    const words = norm(inp.value).split(/\s+/).filter(Boolean);
    const all = build();
    items = (words.length ? all.filter((it) => words.every((w) => norm(`${it.label} ${it.hint}`).includes(w))) : all.filter((it) => it.base)).slice(0, 12);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.innerHTML = items.length
      ? items.map((it, i) => `<li role="option" id="pal-${i}" aria-selected="${i === sel}" data-i="${i}">${ic(it.icon, 16)}<span class="grow ellipsis">${esc(it.label)}</span><span class="small muted">${esc(it.hint)}</span></li>`).join('')
      : `<li class="muted" aria-disabled="true">${t('Aucun résultat')}</li>`;
    inp.setAttribute('aria-activedescendant', items.length ? `pal-${sel}` : '');
    $('[aria-selected=true]', list)?.scrollIntoView({ block: 'nearest' });
  };
  const run = (i) => { const it = items[i]; if (!it) return; d.close(); it.run(); };
  inp.oninput = () => { sel = 0; draw(); };
  inp.onkeydown = (e) => {
    const n = Math.max(items.length, 1);
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % n; draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + n) % n; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  };
  list.onclick = (e) => { const li = e.target.closest('[data-i]'); if (li) run(+li.dataset.i); };
  draw();
  inp.focus();
  try { [projects] = await Promise.all([api('GET', '/api/projects'), loadAgents()]); if (d.open) draw(); } catch (_) { /* pages seules */ }
}
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && $('#main') && !e.target.closest?.('.xterm') && !document.querySelector('dialog[open]')) {
    e.preventDefault();
    openPalette();
  }
});

/* ------------------------------------------------------------ raccourcis clavier */
const GO = { a: '#/', p: '#/projets', s: '#/sessions', t: '#/terminal', d: '#/deploiements', v: '#/serveur', r: '#/parametres' };
const SHORTCUTS = [
  ['Ctrl K', t('Rechercher, aller n’importe où, lancer une action')],
  [t('g puis a / p / s / t'), t('Accueil, Projets, Sessions IA, Terminal')],
  [t('g puis d / v / r'), t('Déploiements, Serveur, Paramètres')],
  [t('1 à 6'), t('Onglets d’un projet (Aperçu, Fichiers, Git, Agents, Déploiement, Réglages)')],
  ['Ctrl P', t('Ouvrir un fichier du projet par son nom')],
  [t('Ctrl Maj F'), t('Rechercher dans tout le projet')],
  ['Ctrl `', t('Ouvrir ou fermer le terminal du projet')],
  ['Ctrl S', t('Enregistrer le fichier (dans l’éditeur)')],
  ['Ctrl F · Ctrl H', t('Chercher · remplacer dans le fichier ouvert')],
  ['?', t('Afficher cette aide')],
];
function showShortcuts() {
  if ($('#shortcuts')) return;
  const d = document.createElement('dialog');
  d.id = 'shortcuts';
  d.innerHTML = `<form method="dialog"><h2>${t('Raccourcis clavier')}</h2>
    <table class="table keys">${SHORTCUTS.map(([k, txt]) => `<tr><td class="nowrap">${k.split(' ').map((x) => (/^(puis|à|then|to|·|\/)$/.test(x) ? ` ${x} ` : `<kbd>${esc(x)}</kbd>`)).join('')}</td><td>${esc(txt)}</td></tr>`).join('')}</table>
    <div class="row" style="justify-content:flex-end"><button class="btn primary">${t('Fermer')}</button></div></form>`;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
}
let gAt = 0;
const typing = (t) => t?.closest?.('input, textarea, select, [contenteditable], .xterm, .CodeMirror');
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('dialog[open]') || !$('#main')) return;
  if (e.key === '?') { e.preventDefault(); showShortcuts(); return; }
  if (gAt && Date.now() - gAt < 1200) {
    gAt = 0;
    if (GO[e.key]) { e.preventDefault(); location.hash = GO[e.key]; }
    return;
  }
  if (e.key === 'g') { gAt = Date.now(); return; }
  document.dispatchEvent(new CustomEvent('helmshell-key', { detail: e }));
});

/* ------------------------------------------------------------ tâches Claude */
const TASK_ST = { running: ['warn', t('En cours')], ok: ['ok', t('Terminée')], error: ['err', t('En échec')] };
// Titre d'une tâche dans les listes, et dernière ligne sans la syntaxe Markdown (#, **, `…`)
const taskTitle = (tk) => ({ 'clean-report': t('Inventaire de nettoyage'), clean: t('Nettoyage') }[taskKind(tk)] || tk.prompt.split('\n')[0]);
const plainLine = (x) => String(x).replace(/^\s*(#{1,6}|[-*>]|\d+\.)\s+/, '').replace(/[*_`]+/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
function taskRows(list, { project = false, actions = false } = {}) {
  if (!list.length) return '';
  return list.map((tk) => {
    const [dot, label] = TASK_ST[tk.status] || ['', tk.status];
    if (actions) {
      return `<div class="list-row task-row"><button type="button" class="task-main" data-act="task" data-id="${esc(tk.id)}">
      <span class="lead ${tk.status === 'running' ? '' : dot}" aria-hidden="true">${ic(tk.status === 'running' ? 'task' : tk.status === 'ok' ? 'check' : 'x', 20, 2)}</span>
      <span class="two"><span class="ellipsis">${agentLogo(tk.agent, 14, 'task-ag')}${project ? `${esc(tk.name)} · ` : ''}${esc(taskTitle(tk))}</span>
        <span class="sub ellipsis">${esc(label)} · ${ago(tk.started)}${tk.last ? ` · <span class="small">${esc(plainLine(tk.last))}</span>` : ''}</span>
        ${tk.status === 'running' ? `<span class="progress" role="progressbar" aria-label="${t('Tâche en cours')}"></span>` : ''}</span></button>
        ${tk.status === 'running' ? '' : `<button type="button" class="btn sm" data-act="task-retry" data-id="${esc(tk.id)}">${ic('refresh', 16, 2)}${t('Relancer')}</button>`}</div>`;
    }
    return `<button type="button" class="list-row task-row" data-act="task" data-id="${esc(tk.id)}">
      <span class="lead ${tk.status === 'running' ? '' : dot}" aria-hidden="true">${ic(tk.status === 'running' ? 'task' : tk.status === 'ok' ? 'check' : 'x', 20, 2)}</span>
      <span class="two"><span class="ellipsis">${agentLogo(tk.agent, 14, 'task-ag')}${project ? `${esc(tk.name)} · ` : ''}${esc(taskTitle(tk))}</span>
        <span class="sub ellipsis">${esc(label)} · ${ago(tk.started)}${tk.last ? ` · <span class="small">${esc(plainLine(tk.last))}</span>` : ''}</span>
        ${tk.status === 'running' ? `<span class="progress" role="progressbar" aria-label="${t('Tâche en cours')}"></span>` : ''}</span></button>`;
  }).join('');
}
async function openTask(id) {
  if ($('#task-dlg')) $('#task-dlg').close();
  const d = document.createElement('dialog');
  d.id = 'task-dlg';
  d.className = 'wide';
  d.innerHTML = '<div class="skeleton"><span class="spin"></span></div>';
  document.body.append(d);
  let timer = null, alive = true;
  d.addEventListener('close', () => { alive = false; clearTimeout(timer); d.remove(); });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.showModal();
  let task = null, resultHtml = null;
  const draw = async () => {
    let tk;
    try { tk = await api('GET', `/api/tasks/${enc(id)}`); } catch (e) { d.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; return; }
    if (!alive) return;
    task = tk;
    const kind = taskKind(tk);
    const [dot, label] = TASK_ST[tk.status] || ['', tk.status];
    const running = tk.status === 'running';
    const box = $('.task-log', d);
    const atEnd = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 30;
    const steps = tk.events.map((e) => (e.k === 'tool'
      ? `<div class="ev tool">${ic('chevron', 13)}<b>${esc(e.name)}</b> <span class="mono small muted">${esc(e.detail)}</span></div>`
      : `<div class="ev text">${esc(e.t)}</div>`)).join('');
    const nTools = tk.events.filter((e) => e.k === 'tool').length;
    if (tk.result && resultHtml === null) {
      try { resultHtml = await renderMarkdown(tk.result.text || ''); } catch (_) { resultHtml = `<p>${esc(tk.result.text || '')}</p>`; }
      if (!alive) return;
    }
    const nm = { name: esc(tk.name) };
    const codex = tk.agent === 'codex';
    const title = kind === 'clean-report' ? t('Inventaire · {name}', nm) : kind === 'clean' ? t('Nettoyage · {name}', nm) : t('Tâche · {name}', nm);
    const report = kind === 'clean-report' && tk.status === 'ok';
    d.innerHTML = `<div class="stack task-dlg" style="gap:14px">
      <div class="row" style="justify-content:space-between"><h2 class="row nowrap" style="margin:0;gap:10px">${agentLogo(tk.agent, 24)}<span>${title}</span></h2><span class="row small nowrap" style="gap:8px"><span class="dot ${dot}"></span>${esc(label)} · ${tk.finished ? fmtDur(tk.finished - tk.started) : t('depuis {time}', { time: since(tk.started) })}</span></div>
      ${kind ? '' : `<details class="tprompt"><summary>${ic('chevron', 14, 2)}${t('Consigne')}</summary><div class="quote">${esc(tk.prompt)}</div></details>`}
      ${running || !tk.result ? `<div class="task-log">${steps || `<div class="small muted">${codex ? t('Codex démarre…') : t('Claude démarre…')}</div>`}</div>`
    : `<div class="task-out">
        ${steps ? `<details class="tsteps"><summary>${ic('chevron', 14, 2)}${tp(nTools, '{n} étape de travail', '{n} étapes de travail')}</summary><div class="task-log">${steps}</div></details>` : ''}
        <div class="tresult ${tk.result.error ? 'err' : ''}">${tk.result.error ? `<b class="c-err">${t('Échec')}</b>` : ''}<div class="md">${resultHtml}</div></div>
        <span class="small muted">${codex ? tp(tk.result.turns || 0, '{n} échange avec Codex', '{n} échanges avec Codex') : tp(tk.result.turns || 0, '{n} échange avec Claude', '{n} échanges avec Claude')} · ${fmtDur(tk.result.duration || 0)}</span>
      </div>`}
      ${report ? `<div class="tapprove" title="${t('{agent} supprime ce qui est sûr dans cette liste. Les fichiers suivis par Git restent récupérables ; rien n’est validé ni poussé.', { agent: codex ? 'Codex' : 'Claude' })}">
        <span class="tq">${ic('broom', 18, 2)}<b>${t('Nettoyer selon ce rapport ?')}</b></span>
        <label class="tnote"><span class="sr">${t('Précisions')}</span><input id="clean-note" maxlength="500" placeholder="${t('Précisions (facultatif) : garde le dossier docs/…')}"></label>
        <span class="row nowrap" style="gap:6px"><button class="btn sm ghost" data-x="close">${t('Ignorer')}</button><button class="btn sm primary" data-x="approve">${ic('check', 16, 2)}${t('Valider et nettoyer')}</button></span>
      </div>` : ''}
      <div class="row" style="justify-content:space-between">
        <span class="small muted">${t('Mode : {mode}', { mode: esc(modeLabel(tk.mode, tk.agent)) })}</span>
        <div class="row">${running ? `<button class="btn danger" data-x="stop">${t('Arrêter')}</button>` : `<button class="btn ghost" data-x="del">${t('Supprimer')}</button>`}
          ${kind === 'clean-report' ? '' : `<a class="btn" href="#/projets/${enc(tk.slug)}/git" data-x="git">${t('Voir les modifications')}</a>`}${report ? '' : `<button class="btn primary" data-x="close">${t('Fermer')}</button>`}</div>
      </div></div>`;
    const log = $('.task-log', d);
    if (log && running && atEnd) log.scrollTop = log.scrollHeight;
    if (running) timer = setTimeout(draw, 2000);
  };
  d.onclick = async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b || b.closest('.md')) { if (e.target === d) d.close(); return; }
    if (b.dataset.x === 'close' || b.dataset.x === 'git') d.close();
    if (b.dataset.x === 'stop') { try { await api('POST', `/api/tasks/${enc(id)}/stop`); toast(t('Tâche arrêtée')); draw(); } catch (err) { fail(err); } }
    if (b.dataset.x === 'approve' && task?.result) {
      b.disabled = true;
      const note = ($('#clean-note', d)?.value || '').trim();
      const prompt = `${CLEAN_DO}\n\n${CLEAN_APPROVED}\n\n${task.result.text.slice(0, 15000)}${note ? `\n\n${CLEAN_NOTE} ${note}` : ''}`;
      try {
        const r = await withTrust((trust) => api('POST', `/api/projects/${enc(task.slug)}/tasks`, { prompt, mode: 'auto', kind: 'clean', trust, agent: task.agent || 'claude' }));
        toast(t('Nettoyage de {name} lancé', { name: task.name }));
        d.close();
        document.dispatchEvent(new CustomEvent('tasks-changed'));
        openTask(r.id);
      } catch (err) { fail(err); b.disabled = false; }
    }
    if (b.dataset.x === 'del') { try { await api('DELETE', `/api/tasks/${enc(id)}`); toast(t('Tâche supprimée')); d.close(); document.dispatchEvent(new CustomEvent('tasks-changed')); } catch (err) { fail(err); } }
  };
  draw();
}

async function openTranscript(base, id, agent = 'claude') {
  const d = document.createElement('dialog');
  d.className = 'wide';
  d.innerHTML = '<div class="skeleton"><span class="spin"></span></div>';
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-x=close]')) d.close(); });
  d.showModal();
  let conv;
  try { conv = await api('GET', agentId(agent) === 'codex' ? `${base}/agents/history/${enc(id)}?agent=codex` : `${base}/claude/history/${enc(id)}`); } catch (e) { d.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; return; }
  const msgs = await Promise.all(conv.messages.map(async (m) => {
    if (m.role === 'tool') return `<div class="ev tool">${ic('chevron', 13)}<b>${esc(m.text)}</b> <span class="mono small muted">${esc(m.detail || '')}</span></div>`;
    let body;
    try { body = m.role === 'assistant' ? await renderMarkdown(m.text) : esc(m.text); } catch (_) { body = esc(m.text); }
    return `<div class="msg ${m.role}"><span class="who small">${m.role === 'user' ? t('Toi') : agentShort(agent)}</span><div class="${m.role === 'assistant' ? 'md' : 'plain-text'}">${body}</div></div>`;
  }));
  d.innerHTML = `<div class="stack" style="gap:12px">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(conv.title || t('Conversation'))}</h2><button class="btn icon ghost" data-x="close" aria-label="${t('Fermer')}">${ic('x', 16)}</button></div>
    ${conv.total > conv.messages.length ? `<p class="small muted" style="margin:0">${t('Les {n} derniers éléments sur {total}.', { n: conv.messages.length, total: conv.total })}</p>` : ''}
    <div class="transcript">${msgs.join('') || `<div class="empty small">${t('Conversation vide.')}</div>`}</div></div>`;
  const tr = $('.transcript', d);
  tr.scrollTop = tr.scrollHeight;
}

/* ------------------------------------------------------------ éléments communs */
function pageHeader(title, subtitle, actions = '') {
  return `<header class="page-head"><div class="titles"><h1>${title}</h1>${subtitle ? `<p class="muted">${subtitle}</p>` : ''}</div>${actions ? `<div class="row">${actions}</div>` : ''}</header>`;
}


const projectIcon = (p, cls = '') => (p.icon
  ? `<span class="picon has-img ${cls}"><img src="/api/projects/${enc(p.slug)}/icon?v=${p.icon}" alt="" loading="lazy"></span>`
  : `<span class="picon ${cls}">${ic('folder', cls.includes('xl') ? 40 : cls.includes('lg') ? 28 : 20, 2)}</span>`);

// Plateformes visées (Android, Windows, Linux, macOS, iOS, Web)
const PLATFORM_LOGOS = { Android: 'android.svg', Windows: 'windows.svg', Linux: 'linux.svg', macOS: 'apple.svg', iOS: 'apple.svg', Web: 'web.svg', Discord: 'discord.svg', Telegram: 'telegram.svg' };
const PLATFORMS = ['Android', 'iOS', 'Windows', 'Linux', 'macOS', 'Web', 'Discord', 'Telegram'];
const platformBadges = (list) => list.map((t) => `<span class="plat" title="${esc(t)}" role="img" aria-label="${esc(t)}">${PLATFORM_LOGOS[t]
  ? `<img src="/logos/platform/${PLATFORM_LOGOS[t]}" alt="" width="18" height="18"${['macOS', 'iOS', 'Linux'].includes(t) ? ' class="inv-dark"' : ''}>` : ic('globe', 18, 2)}</span>`).join('');
// Technos : logo quand on en a un (selfh.st/icons), sinon l'étiquette en texte
// Technos connues, par famille (l'ordre sert au sélecteur des réglages), avec leur logo dans /logos/tech
const TECH_GROUPS = {
  [t('Langages')]: { Kotlin: 'kotlin', Java: 'java', Swift: 'swift', Dart: 'dart', Rust: 'rust', Go: 'golang', Python: 'python', TypeScript: 'typescript', JavaScript: 'javascript', 'C#': 'csharp', 'C/C++': 'cplusplus', PHP: 'php', Ruby: 'ruby', Lua: 'lua', Elixir: 'elixir', Haskell: 'haskell', Scala: 'scala', Zig: 'zig', Shell: 'bash', HTML: 'html5', CSS: 'css3', Sass: 'sass' },
  [t('Environnements')]: { 'Node.js': 'node-js', Deno: 'denojs', Bun: 'bun', '.NET': 'dot-net' },
  [t('Mobile et bureau')]: { Flutter: 'flutter', 'React Native': 'react', 'Jetpack Compose': 'jetpackcompose', Avalonia: 'avalonia', Electron: 'electron', Tauri: 'tauri', Qt: 'qt', GTK: '' },
  [t('Web (interface)')]: { React: 'react', Vue: 'vuejs', Svelte: 'svelte', Angular: 'angular', 'Next.js': 'nextjs', Nuxt: 'nuxtjs', Astro: 'astro', Vite: 'vitejs', 'Tailwind CSS': 'tailwindcss' },
  [t('Web (serveur)')]: { Express: 'express', NestJS: 'nestjs', Django: 'django', Flask: 'flask', FastAPI: 'fastapi', Laravel: 'laravel', Symfony: 'symfony', Rails: 'rails', Spring: 'spring' },
  [t('Données')]: { PostgreSQL: 'postgresql', MySQL: 'mysql', SQLite: 'sqlite', MongoDB: 'mongodb', Redis: 'redis', Supabase: 'supabase', Firebase: 'firebase', Prisma: 'prisma' },
  [t('Infra et jeux')]: { Docker: 'docker', Kubernetes: 'kubernetes', Nginx: 'nginx', Godot: 'godot', Unity: 'unity' },
};
const TECH_LOGOS = Object.fromEntries(Object.values(TECH_GROUPS).flatMap((g) => Object.entries(g)).filter(([, f]) => f).map(([t, f]) => [t, `${f}.svg`]));
// Logos noirs : inversés en thème sombre
const DARK_TECH = new Set(['Rust', 'Deno', 'Express', 'Flask', 'Next.js', 'Symfony', 'Prisma', 'Unity', 'Django']);
const techImg = (t, size) => `<img src="/logos/tech/${TECH_LOGOS[t]}" alt="" width="${size}" height="${size}"${DARK_TECH.has(t) ? ' class="inv-dark"' : ''}>`;
// Les plateformes (Android, Windows…) ont leur propre ligne : on ne les répète pas dans les technos
const KNOWN_TECHS = Object.values(TECH_GROUPS).flatMap((g) => Object.keys(g));
const techGroup = (t) => Object.keys(TECH_GROUPS).find((g) => t in TECH_GROUPS[g]) || '';
const techIcon = (t) => (TECH_LOGOS[t] ? techImg(t, 18) : '');
const platIcon = (t) => (PLATFORM_LOGOS[t] ? `<img src="/logos/platform/${PLATFORM_LOGOS[t]}" alt="" width="18" height="18"${['macOS', 'iOS', 'Linux'].includes(t) ? ' class="inv-dark"' : ''}>` : ic('globe', 18, 2));
const techBadge = (t) => (TECH_LOGOS[t]
  ? `<span class="tech" title="${esc(t)}" aria-label="${esc(t)}">${techImg(t, 22)}</span>`
  : `<span class="tag">${esc(t)}</span>`);
// Au-delà de `max`, les premières (les plus importantes, triées par le serveur) puis « +N » qui déplie le reste
// `max` places en tout : au-delà, les max−1 premières puis « +N » (la ligne garde sa largeur)
const techBadges = (tags, max = 5) => {
  const list = tags.filter((t) => !PLATFORMS.includes(t));
  if (list.length <= max) return list.map(techBadge).join('');
  const rest = list.slice(max - 1);
  return list.slice(0, max - 1).map(techBadge).join('')
    + `<span class="tech-rest" hidden>${rest.map(techBadge).join('')}</span>`
    + `<button type="button" class="tech tech-more" aria-expanded="false" data-n="${rest.length}" title="${esc(rest.join(', '))}" aria-label="${t('Voir les {n} autres technos : {list}', { n: rest.length, list: esc(rest.join(', ')) })}">+${rest.length}</button>`;
};
// Le bouton « +N » est dans des cartes cliquables : on l'intercepte avant elles
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('.tech-more');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const open = b.getAttribute('aria-expanded') !== 'true';
  b.setAttribute('aria-expanded', String(open));
  b.previousElementSibling.hidden = !open;
  b.textContent = open ? '−' : `+${b.dataset.n}`;
  b.setAttribute('aria-label', open ? t('Replier les technos') : t('Voir les {n} autres technos : {list}', { n: b.dataset.n, list: b.title }));
}, true);

// Plateformes visées et technos, avec leur libellé (cartes et page du projet)
const facets = (p, cls = '') => {
  const plat = p.platforms?.length ? platformBadges(p.platforms) : '';
  const tech = techBadges(p.tags || []);
  if (!plat && !tech) return '';
  return `<div class="facets ${cls}">${plat ? `<div class="facet"><span class="lbl">${t('Plateformes')}</span><span class="plats">${plat}</span></div>` : ''}${tech ? `<div class="facet"><span class="lbl">${t('Technos')}</span><span class="row techs" style="gap:6px">${tech}</span></div>` : ''}</div>`;
};

const initials = (name) => esc(String(name || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).replace(/^./, (c) => c.toUpperCase()) || '?');
const leadCls = (st) => (st.dot === 'warn' ? 'question' : st.dot === 'err' ? 'err' : st.dot === 'ok' ? 'ok' : '');

function sessionRows(sessions) {
  if (!sessions.length) return `<div class="empty">${t('Aucune session Claude en cours. Lance-en une depuis un projet, ou avec {key}.', { key: '<kbd>Ctrl K</kbd>' })}</div>`;
  return sessions.map((s) => {
    const st = sessionStatus(s);
    return `<div class="session-row">
      <span class="lead ${leadCls(st)}" aria-hidden="true">${initials(s.name)}</span>
      <div class="who"><b>${esc(s.name)}</b><span class="mono small muted ellipsis">${esc(s.path)}</span></div>
      <div class="what"><span class="c-${st.cls || 'muted'}" style="font-weight:500;font-size:13px">${esc(st.label)}</span>
        <span class="small muted">${t('Depuis {time}', { time: since(s.started) })} · ${esc(modeLabel(s.mode))}</span></div>
      <div class="row" style="gap:8px">
        ${s.phase === 'question' ? `<button class="btn sm" data-act="answer" data-slug="${esc(s.slug)}" data-q="${esc(s.question)}" data-v="n">${t('Non')}</button><button class="btn sm primary" data-act="answer" data-slug="${esc(s.slug)}" data-q="${esc(s.question)}" data-v="y">${t('Oui')}</button>` : ''}
        ${s.url ? `<a class="btn sm" href="${esc(s.url)}" target="_blank" rel="noopener">${ic('external', 14)}claude.ai</a>` : ''}
        <a class="btn sm" href="#/projets/${enc(s.slug)}/claude">${t('Voir')}</a>
        <button class="btn icon sm danger" aria-label="${t('Arrêter la session de {name}', { name: esc(s.name) })}" data-act="stop" data-slug="${esc(s.slug)}">${ic('stop', 14)}</button>
      </div>
    </div>`;
  }).join('');
}

/* Sessions « dépôt » : Claude interactif dans le tmux qui porte le nom du dossier */
const repoStatus = (r) => (r.agent === 'codex' ? (!r.claude ? { short: t('Shell · Codex arrêté'), cls: 'warn', lead: '' }
  : r.status === 'waiting' ? { short: t('Codex attend ta validation'), cls: 'warn', lead: 'warn' }
    : r.status === 'busy' ? { short: t('Codex travaille'), cls: 'ok', lead: 'ok' } : { short: t('Codex actif dans le terminal'), cls: 'ok', lead: 'ok' })
  : !r.claude ? { short: t('Shell · Claude arrêté'), cls: 'warn', lead: '' }
    : r.rc ? { short: t('Remote Control actif'), cls: 'ok', lead: 'ok' } : { short: t('Claude actif dans le terminal'), cls: 'ok', lead: 'ok' });
// Session tmux d'une branche en parallèle : ?branch=x côté API, ?branche=x dans l'adresse de la page.
// Agent : ?agent=codex (Claude sans paramètre), dans l'API comme dans l'adresse de la page.
const qs = (pairs) => { const q = pairs.filter(([, v]) => v).map(([k, v]) => `${k}=${enc(v)}`).join('&'); return q ? `?${q}` : ''; };
const brQ = (b, a) => qs([['branch', b], ['agent', a && agentId(a) !== 'claude' ? agentId(a) : '']]);
const claudeHash = (slug, b, a) => `#/projets/${enc(slug)}/claude${qs([['branche', b], ['agent', a && agentId(a) !== 'claude' ? agentId(a) : '']])}`;
function repoRows(list, { compact = false } = {}) {
  return list.map((r) => {
    const st = repoStatus(r);
    const link = r.rc ? `<a class="btn ${compact ? '' : 'sm'}" href="${esc(r.url || 'https://claude.ai/code')}" target="_blank" rel="noopener">${ic('external', compact ? 18 : 14, 2)}${compact ? t('Ouvrir') : 'claude.ai'}</a>` : '';
    if (compact) {
      return `<div class="list-row"><span class="lead ${st.lead}" aria-hidden="true">${ic('term', 20, 2)}</span>
        <a class="two plain" href="${claudeHash(r.slug, r.branch, r.agent)}"><span>${agentLogo(r.agent, 14)} ${esc(r.name)}</span><span class="sub">${esc(st.short)} · tmux ${esc(r.tmux)}</span></a>${link}</div>`;
    }
    return `<div class="session-row">
      <span class="lead ${st.lead}" aria-hidden="true">${ic('term', 20, 2)}</span>
      <div class="who"><b>${agentLogo(r.agent, 14)} ${esc(r.name)}</b><span class="mono small muted ellipsis">tmux · ${esc(r.tmux)}</span></div>
      <div class="what"><span class="c-${st.cls}" style="font-weight:500;font-size:13px">${esc(st.short)}</span>
        <span class="small muted">${t('Depuis {time}', { time: since(r.started) })} · ${t('terminal interactif')}</span></div>
      <div class="row" style="gap:8px">${link}
        <a class="btn sm" href="${claudeHash(r.slug, r.branch, r.agent)}">${t('Voir')}</a>
        <button class="btn icon sm danger" aria-label="${t('Fermer la session tmux de {name}', { name: esc(r.name) })}" data-act="repo-kill" data-slug="${esc(r.slug)}" data-branch="${esc(r.branch || '')}" data-agent="${esc(r.agent || 'claude')}" data-tmux="${esc(r.tmux)}">${ic('stop', 14)}</button>
      </div>
    </div>`;
  }).join('');
}
const killText = (a) => (agentId(a) === 'codex' ? t('Codex et tout ce qui tourne dans cette session tmux seront arrêtés.') : t('Claude et tout ce qui tourne dans cette session tmux seront arrêtés.'));
async function killRepo(slug, tmux, branch = null, agent = 'claude') {
  if (!await confirmBox(t('Fermer « {name} » ?', { name: tmux }), killText(agent), t('Fermer'))) return false;
  try { await api('POST', `/api/projects/${enc(slug)}/claude/repo/kill${brQ(branch, agent)}`); toast(t('Session fermée')); return true; } catch (e) { fail(e); return false; }
}

const sessionActs = (reload) => ({
  'repo-kill': async (el) => { if (await killRepo(el.dataset.slug, el.dataset.tmux, el.dataset.branch || null, el.dataset.agent)) reload(); },
  stop: async (el) => { if (await stopClaude(el.dataset.slug)) reload(); },
  answer: async (el) => { await answerClaude(el.dataset.slug, el.dataset.v, el.dataset.q); reload(); },
});

function statusIcons(p) {
  const st = sessionStatus(p.claude);
  const d = deployStatus(p.app);
  return `<span class="icons">
    ${p.claude.running ? `<span class="mini ${st.cls}" title="${t('Claude : {status}', { status: esc(st.short) })}">${esc(st.short)}</span>` : ''}${agentMinis(p.slug)}
    ${p.git?.changes ? `<span class="mini accent" title="${tp(p.git.changes, '{n} fichier non validé', '{n} fichiers non validés')}">${ic('branch', 14, 2)}${p.git.changes}</span>` : ''}
    ${p.app ? `<span class="mini ${d.dot}" title="${t('{tool} : {status}', { tool: DN(), status: esc(d.short) })}">${esc(d.short)}</span>` : ''}
  </span>`;
}

/* ------------------------------------------------------------------- utilisation de Claude */
const usageLevel = (v) => (v >= 90 ? 'err' : v >= 70 ? 'warn' : '');
function resetText(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000), now = new Date();
  const hm = d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return t('Réinitialisation à {time}', { time: hm });
  return t('Réinitialisation : {day} {time}', { day: d.toLocaleDateString(LOCALE, { weekday: 'short' }), time: hm });
}
// Contexte de la session : barre, %, jetons utilisés sur la taille de la fenêtre (ex. 123k / 1M)
function ctxPill(c) {
  if (!c || c.used == null) return '';
  const v = Math.max(0, Math.min(100, c.used)), lvl = v >= 85 ? 'err' : v >= 60 ? 'warn' : '';
  const nums = c.tokens != null && c.size ? `${fmtTok(c.tokens)} / ${fmtTok(c.size)}` : '';
  return `<span class="pill sm ctxp ${lvl}" title="${t('Contexte utilisé : {pct}', { pct: fmtPct(v) })}${nums ? ` ${t('({n} jetons)', { n: nums })}` : ''}"><span class="ctxbar" aria-hidden="true"><i style="width:${v}%"></i></span>${fmtPct(v)}${nums ? `<span class="ctxn">· ${nums}</span>` : ''}</span>`;
}
// Jetons en abrégé : 1,2M / 1.2M, 850k
const fmtTok = (n) => (n >= 1e6 ? `${fmtNum(Math.round(n / 1e5) / 10)}M` : n >= 1e3 ? `${fmtNum(Math.round(n / 100) / 10)}k` : String(n));
function usageBar(label, used, sub, cls = '') {
  const v = Math.max(0, Math.min(100, used));
  return `<div class="ubar"><div class="ubar-h"><b>${esc(label)}</b><span>${t('{pct} utilisés', { pct: fmtPct(used) })}</span></div>
    <div class="meter ${cls || usageLevel(used)}" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${Math.round(v)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${v}%"></i></div>
    ${sub ? `<span class="small muted">${sub}</span>` : ''}</div>`;
}

/* ------------------------------------------------------------------- accueil */
async function viewDashboard(main) {
  const gen = routeGen;
  if (!overview) await refreshOverview();
  if (isStale(gen)) return;
  let projects = null;
  main.innerHTML = `
    ${pageHeader(t('Accueil'), `${t('Projets dans {path}', { path: `<span class="mono">${esc(overview?.root || '…')}</span>` })} · ${t('{key} pour aller n’importe où', { key: '<kbd>Ctrl K</kbd>' })}`, `<a class="btn fab" href="#/nouveau">${ic('plus', 24, 2.2)}${t('Nouveau projet')}</a>`)}
    <section class="card" aria-labelledby="todo-t" style="overflow:hidden;padding-bottom:8px">
      <div class="card-head"><h2 id="todo-t">${t('À traiter')} <span class="badge" id="todo-n" hidden></span></h2></div>
      <div id="todo"><div class="skeleton"><span class="spin"></span></div></div>
    </section>
    <section class="card" aria-labelledby="tasks-t" style="overflow:hidden;padding-bottom:8px"><div class="card-head"><h2 id="tasks-t">${t('Tâches de fond')}</h2>
      <div class="row" style="gap:6px"><span class="row" id="tfilters" style="gap:6px"></span><button class="btn sm ghost" data-act="tasks-clear">${ic('trash', 16, 2)}${t('Effacer les terminées')}</button></div></div>
      <div id="tasks"><div class="skeleton"><span class="spin"></span></div></div></section>
    <section class="card" aria-labelledby="rec-t" style="overflow:hidden">
      <div class="card-head"><h2 id="rec-t">${t('Récents')}</h2><a class="btn ghost" href="#/projets">${t('Tous les projets')}</a></div>
      <div id="rec" class="rec-row"><div class="skeleton"><span class="spin"></span></div></div>
    </section>`;

  const todos = () => {
    const out = [];
    for (const tk of liveState()?.tasks || []) {
      if (tk.status === 'error' && tk.finished && Date.now() / 1000 - tk.finished < 86400) {
        out.push({ lvl: 'err', icon: 'x', title: tk.name, text: t('Tâche en échec : {prompt}', { prompt: tk.prompt.split('\n')[0].slice(0, 80) }), acts: `<button class="btn tonal" data-act="task" data-id="${esc(tk.id)}">${t('Voir')}</button>` });
      }
    }
    const s = overview?.stats;
    if (s && s.disk_used / s.disk_total > 0.9) out.push({ lvl: 'err', icon: 'server', title: t('Disque presque plein'), text: t('{pct} utilisés', { pct: fmtPct((100 * s.disk_used) / s.disk_total) }), acts: '' });
    if (s && s.mem_used / s.mem_total > 0.9) out.push({ lvl: 'err', icon: 'server', title: t('Mémoire presque pleine'), text: t('{pct} utilisés', { pct: fmtPct((100 * s.mem_used) / s.mem_total) }), acts: '' });
    for (const r of liveState()?.repos || []) {
      if (r.agent === 'codex' && r.claude && r.status === 'waiting') {
        out.push({ lvl: 'question', icon: 'spark', title: t('{name} · Codex attend ta validation', { name: r.name }), text: r.question || t('Validation demandée'),
          acts: `<a class="btn primary" href="${claudeHash(r.slug, r.branch, 'codex')}">${t('Répondre')}</a>` });
      }
    }
    for (const p of projects || []) {
      const c = p.claude, a = `data-slug="${esc(p.slug)}"`, h = `#/projets/${enc(p.slug)}`;
      if (c.running && c.phase === 'question') {
        out.push({ lvl: 'question', icon: 'spark', title: t('{name} · Claude attend une réponse', { name: p.name }), text: c.question,
          acts: `<button class="btn" data-act="answer" ${a} data-q="${esc(c.question)}" data-v="n">${t('Non')}</button><button class="btn primary" data-act="answer" ${a} data-q="${esc(c.question)}" data-v="y">${t('Oui')}</button>` });
      } else if (c.running && c.phase === 'exited') {
        out.push({ lvl: 'err', icon: 'stop', title: p.name, text: t('La session Claude s’est arrêtée'), acts: `<a class="btn tonal" href="${h}/claude">${t('Voir le journal')}</a>` });
      }
      const d = deployStatus(p.app);
      if (p.app && d.dot === 'err') {
        out.push({ lvl: 'err', icon: 'upload', title: p.name, text: t('{status} sur {tool}', { status: d.short, tool: DEPLOY.name }), acts: `<button class="btn tonal" data-act="deploy" data-uuid="${esc(p.app_id)}" data-name="${esc(p.name)}">${t('Redéployer')}</button>` });
      }
      if (p.git?.changes) {
        out.push({ lvl: '', icon: 'branch', title: p.name, text: tp(p.git.changes, '{n} fichier non validé', '{n} fichiers non validés'), acts: `<a class="btn tonal" href="${h}/git">${ic('eye', 18, 2)}${t('Voir')}</a>` });
      }
    }
    return out;
  };

  const draw = () => {
    if (!$('#todo')) return;
    if (!projects) return;
    const items = todos();
    $('#todo-n').textContent = items.length;
    $('#todo-n').hidden = !items.length;
    setHTML($('#todo'), items.length ? items.map((x) => `<div class="list-row ${x.lvl === 'question' ? 'todo-q' : ''}" style="flex-wrap:wrap"><span class="lead ${x.lvl}" aria-hidden="true">${ic(x.icon || 'dots', 20, 2)}</span>
        <div class="two" style="flex:1 1 320px"><span>${esc(x.title)}</span><span class="sub">${esc(x.text)}</span></div>
        <div class="row nowrap" style="gap:8px">${x.acts}</div></div>`).join('')
      : `<div class="empty-ok">${ic('check', 18, 2)}${t('Rien à traiter : tout est à jour.')}</div>`);
    const recent = [...projects].sort((a, b) => b.last_activity - a.last_activity).slice(0, 6);
    // Une seule ligne de tuiles (défile sur le côté si l'écran est étroit)
    setHTML($('#rec'), recent.length ? recent.map((p) => `<a class="rec-tile plain" href="#/projets/${enc(p.slug)}" title="${esc(p.name)}">
        ${projectIcon(p)}<span class="two" style="min-width:0"><span class="ellipsis">${esc(p.name)}</span><span class="sub ellipsis">${ago(p.last_activity)}</span></span></a>`).join('')
      : `<div class="empty small">${t('Aucun projet.')} <a href="#/nouveau">${t('Crée le premier')}</a>.</div>`);
  };
  const loadProjects = async () => { try { projects = await api('GET', '/api/projects'); draw(); } catch (e) { fail(e); } };
  /* --- tâches de fond (tous projets) --- */
  const TFILTERS = [['all', t('Toutes')], ['running', t('En cours')], ['ok', t('Terminées')], ['error', t('En échec')]];
  let tasks = [], taskFilter = 'all';
  const drawTasks = () => {
    if (!$('#tasks')) return;
    setHTML($('#tfilters'), TFILTERS.map(([id, l]) => `<button type="button" class="chip sm" data-act="t-filter" data-f="${id}" aria-pressed="${id === taskFilter}">${l}</button>`).join(''));
    const list = tasks.filter((t) => taskFilter === 'all' || t.status === taskFilter);
    setHTML($('#tasks'), taskRows(list, { project: true, actions: true }) || `<div class="empty small">${tasks.length ? t('Aucune tâche dans ce filtre.') : t('Aucune tâche. Confie-en une depuis l’onglet Agents d’un projet.')}</div>`);
  };
  const loadTasks = async () => { try { tasks = await api('GET', '/api/tasks?limit=40'); drawTasks(); } catch (_) { /* rien */ } };
  const onTasksChanged = () => loadTasks();
  document.addEventListener('tasks-changed', onTasksChanged);
  onLeave(() => document.removeEventListener('tasks-changed', onTasksChanged));
  loadTasks();
  const reload = () => { refreshOverview(); loadProjects(); };
  bind(main, {
    ...sessionActs(reload),
    deploy: (el) => deployApp(el.dataset.uuid, el.dataset.name),
    task: (el) => openTask(el.dataset.id),
    't-filter': (el) => { taskFilter = el.dataset.f; drawTasks(); },
    'task-retry': async (el) => {
      el.disabled = true;
      try { await withTrust((trust) => api('POST', `/api/tasks/${enc(el.dataset.id)}/retry`, { trust })); toast(t('Tâche relancée')); loadTasks(); } catch (e) { if (!e.quiet) fail(e); el.disabled = false; }
    },
    'tasks-clear': async () => {
      if (!await confirmBox(t('Effacer les tâches terminées ?'), t('Les tâches terminées et en échec disparaissent avec leur journal. Les tâches en cours restent.'), t('Effacer'))) return;
      try { const r = await api('DELETE', '/api/tasks?done=1'); toast(tp(r.deleted, '{n} tâche effacée', '{n} tâches effacées')); loadTasks(); } catch (e) { fail(e); }
    },
  });
  const onOv = () => draw();
  document.addEventListener('overview', onOv);
  onLeave(() => document.removeEventListener('overview', onOv));
  // Direct : on redessine quand une session ou une tâche change, et on recharge les projets
  // (leurs pastilles dépendent de l’état des sessions).
  let liveKey = '';
  onLeave(onLive((st) => {
    const k = JSON.stringify([st.sessions.map((x) => [x.slug, x.phase, x.question]), (st.repos || []).map((x) => [x.slug, x.claude, x.rc, x.url]), st.tasks.map((t) => [t.id, t.status])]);
    if (k !== liveKey) { const first = !liveKey; liveKey = k; draw(); if (!first) { loadProjects(); loadTasks(); } }
  }));
  draw();
  refreshOverview();
  await loadProjects();
  every(30000, loadProjects);
}

/* ------------------------------------------------------------------- projets */
function projectCard(p) {
  const d = deployStatus(p.app), g = p.git;
  return `<article class="project" data-act="go" data-slug="${esc(p.slug)}">
    <div class="top">
      <a class="ident plain" href="#/projets/${enc(p.slug)}" title="${esc(p.path)}">${projectIcon(p, 'lg')}<span class="stack" style="gap:4px;min-width:0">
        <span class="row nowrap" style="gap:8px;min-width:0"><h3 class="ellipsis">${esc(p.name)}</h3>${g ? `<span class="pill sm ${g.changes ? 'accent' : ''}" title="${g.changes ? tp(g.changes, '{n} fichier non validé', '{n} fichiers non validés') : t('Branche courante')}">${ic('branch', 12, 2)}<span class="mono">${esc(g.branch)}</span>${g.changes ? ` · ${g.changes}` : ''}</span>` : ''}</span>
        <span class="small muted mono ellipsis">${esc(p.slug)}</span></span></a>
      <button class="btn icon sm" data-act="pmenu" data-slug="${esc(p.slug)}" aria-label="${t('Actions pour {name}', { name: esc(p.name) })}">${ic('dotsV', 20)}</button>
    </div>
    ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
    ${facets(p)}
    <div class="foot"><span>${t('Modifié {ago}', { ago: ago(p.last_activity) })}${p.app ? ` · <span class="c-${d.dot === 'ok' ? 'ok' : d.dot === 'err' ? 'err' : 'warn'}">${t('{status} sur {tool}', { status: esc(d.short), tool: DN() })}</span>` : ''}</span>
      <span class="row nowrap" style="gap:6px">${p.size != null ? `<span class="pill sm psize" title="${t('Taille du dossier')}">${ic('folder', 13, 2)}${fmtBytes(p.size)}</span>` : ''}${ic('chevron', 18, 2)}</span></div>
  </article>`;
}

/* Supprimer un projet : le dossier local va à la corbeille (30 jours). Rien sur GitHub ni chez l'outil de déploiement. */
async function deleteProject(p, after) {
  const linked = [p.remote || p.git ? t('son dépôt distant (GitHub…)') : '', p.app_id ? t('son application {tool}', { tool: DEPLOY.name }) : ''].filter(Boolean);
  const list = linked.join(` ${t('et')} `);
  const ok = await confirmBox(t('Supprimer le projet {name} ?', { name: p.name }),
    t('Le dossier {path} part dans la corbeille de Helmshell, restaurable 30 jours (page Serveur). Les sessions d’IA et les terminaux du projet sont fermés.', { path: p.path || p.slug })
    + (linked.length ? ` ${tp(linked.length, 'Rien n’est supprimé ailleurs : {list} n’est pas touché.', 'Rien n’est supprimé ailleurs : {list} ne sont pas touchés.', { list })}` : ''),
    t('Mettre à la corbeille'));
  if (!ok) return;
  try {
    const r = await api('DELETE', `/api/projects/${enc(p.slug)}`, { confirm: p.slug });
    toast(t('{name} mis à la corbeille', { name: p.name }), false, { label: t('Annuler'), run: async () => {
      try { await api('POST', `/api/trash/${enc(r.trash_id)}/restore`); toast(t('{name} restauré', { name: p.name })); location.hash = `#/projets/${enc(p.slug)}`; } catch (e) { fail(e); }
    } });
    after?.();
  } catch (e) { fail(e); }
}

/* Nettoyer un projet : tâche de fond confiée à une IA, Claude Code ou Codex (elle sait ce qui sert encore,
   contrairement à un script). Par défaut un rapport seulement ; sinon elle supprime ce qui est sûr et laisse les
   changements à valider. */
const CLEAN_REPORT_FR = `Fais l'inventaire de ce qui ne sert plus dans ce projet, sans rien modifier ni supprimer :
fichiers et dossiers générés (builds, caches, journaux, dépendances installées), fichiers temporaires ou de sauvegarde,
doublons, ressources et code jamais utilisés, anciens scripts, dépendances déclarées mais inutilisées.
Réponds en français avec une liste groupée par catégorie : chemin, taille approximative, pourquoi ça peut partir,
et le niveau de certitude. Termine par la place que ça libérerait au total.`;
const CLEAN_DO_FR = `Nettoie ce projet de ce qui ne sert plus.
Règles :
- Supprime seulement ce qui est sûr : fichiers et dossiers générés qui se recréent (builds, caches, journaux),
  fichiers temporaires ou de sauvegarde, et ce qui n'est clairement plus utilisé nulle part.
- Ne touche jamais aux fichiers .env, aux secrets, aux données, aux migrations, ni au dossier .git.
- Pour les fichiers suivis par Git, utilise git rm : la suppression reste visible et annulable. Ne fais aucun commit.
- Dans le doute, garde le fichier et cite-le dans le rapport.
Réponds en français : ce que tu as supprimé (avec la place libérée), puis ce que tu as gardé par prudence.`;
// Mêmes consignes en anglais (interface en anglais : l'IA répond en anglais)
const CLEAN_REPORT_EN = `Take stock of what is no longer needed in this project, without modifying or deleting anything:
generated files and folders (builds, caches, logs, installed dependencies), temporary or backup files,
duplicates, assets and code that are never used, old scripts, dependencies that are declared but unused.
Reply in English with a list grouped by category: path, approximate size, why it can go,
and how certain you are. End with the total space this would free.`;
const CLEAN_DO_EN = `Clean this project of what is no longer needed.
Rules:
- Only delete what is safe: generated files and folders that get recreated (builds, caches, logs),
  temporary or backup files, and anything that is clearly no longer used anywhere.
- Never touch .env files, secrets, data, migrations, or the .git folder.
- For files tracked by Git, use git rm: the deletion stays visible and can be undone. Do not commit anything.
- When in doubt, keep the file and mention it in the report.
Reply in English: what you deleted (with the space freed), then what you kept to be safe.`;
const CLEAN_REPORT = LANG === 'fr' ? CLEAN_REPORT_FR : CLEAN_REPORT_EN;
const CLEAN_DO = LANG === 'fr' ? CLEAN_DO_FR : CLEAN_DO_EN;
// Suite de la consigne quand on valide un inventaire, et introduction des précisions de l'utilisateur
const CLEAN_APPROVED = LANG === 'fr'
  ? 'Voici l’inventaire que tu as fait et que j’ai validé. Supprime uniquement ce qu’il présente comme sûr, après avoir vérifié que c’est toujours le cas :'
  : 'Here is the inventory you made, which I have approved. Delete only what it lists as safe, after checking that this is still the case:';
const CLEAN_NOTE = LANG === 'fr' ? 'Précisions de ma part :' : 'Additional notes from me:';
// Nature d'une tâche (les anciennes n'avaient pas le champ : on reconnaît la consigne, dans l'une ou l'autre langue)
const startsAny = (s, list) => !!s && list.some((x) => s.startsWith(x.slice(0, 40)));
const taskKind = (tk) => tk.kind || (startsAny(tk.prompt, [CLEAN_REPORT_FR, CLEAN_REPORT_EN]) ? 'clean-report' : startsAny(tk.prompt, [CLEAN_DO_FR, CLEAN_DO_EN]) ? 'clean' : '');
const fmtDur = (s) => (s < 90 ? t('{n} s', { n: Math.round(s) }) : s < 5400 ? t('{n} min', { n: Math.round(s / 60) }) : fmtHM(s));
async function cleanProject(p) {
  await loadAgents();
  const list = aiAgents();
  let agent = list.includes(agentsInfo?.default_agent) ? agentsInfo.default_agent : list[0];
  const d = document.createElement('dialog');
  // Textes selon l'IA choisie (Claude Code ou Codex), qui fait le tri
  const texts = (a) => {
    const v = { agent: agentShort(a) };
    return [t('{agent} parcourt le projet en tâche de fond pour repérer ce qui ne sert plus : builds, caches, fichiers temporaires, code ou ressources inutilisés. Tu es prévenu à la fin.', v),
      t('{agent} liste ce qui peut partir, sans rien supprimer.', v),
      t('{agent} supprime ce qui est sûr. Les fichiers suivis par Git restent récupérables, rien n’est validé ni poussé.', v)];
  };
  const [intro, rep, del] = texts(agent);
  d.innerHTML = `<form method="dialog">
    <h2 class="row" style="gap:10px">${ic('broom', 24, 2)}${t('Nettoyer {name}', { name: esc(p.name) })}</h2>
    ${list.length > 1 ? `<div class="seg sm cl-agents" role="group" aria-label="${t('IA')}" style="align-self:flex-start">${list.map((a) => `<button type="button" class="ico" data-agent="${a}" aria-pressed="${a === agent}">${agentLogo(a, 18)}${AGENT_LABELS[a]}</button>`).join('')}</div>` : ''}
    <p class="muted small cl-t0" style="margin:0">${intro}</p>
    <label class="rc-opt"><input type="radio" name="how" value="report" checked><span class="grow"><b>${t('Rapport seulement')}</b><small class="cl-t1">${rep}</small></span></label>
    <label class="rc-opt"><input type="radio" name="how" value="do"><span class="grow"><b>${t('Nettoyer')}</b><small class="cl-t2">${del}</small></span></label>
    <div class="row" style="justify-content:flex-end">
      <button type="button" class="btn ghost" data-close>${t('Annuler')}</button>
      <button class="btn primary" value="ok">${ic('broom', 18, 2)}${t('Lancer')}</button>
    </div></form>`;
  document.body.append(d);
  $('[data-close]', d).onclick = () => d.close('cancel');
  const seg = $('.cl-agents', d);
  if (seg) seg.onclick = (e) => {
    const b = e.target.closest('[data-agent]');
    if (!b) return;
    agent = b.dataset.agent;
    for (const x of $$('[data-agent]', seg)) x.setAttribute('aria-pressed', String(x === b));
    texts(agent).forEach((txt, i) => { $(`.cl-t${i}`, d).textContent = txt; });
  };
  const ok = await new Promise((res) => { d.addEventListener('close', () => res(d.returnValue === 'ok')); d.showModal(); });
  const how = $('input[name=how]:checked', d).value;
  d.remove();
  if (!ok) return;
  try {
    // Inventaire sans rien modifier : plan d'abord (Claude), lecture seule (Codex) ; nettoyage : mode automatique
    const reportMode = agent === 'codex' ? 'read-only' : 'plan';
    await withTrust((trust) => api('POST', `/api/projects/${enc(p.slug)}/tasks`, how === 'do' ? { prompt: CLEAN_DO, mode: 'auto', kind: 'clean', trust, agent } : { prompt: CLEAN_REPORT, mode: reportMode, kind: 'clean-report', trust, agent }));
    toast(how === 'do' ? t('Nettoyage de {name} lancé', { name: p.name }) : t('Inventaire de {name} lancé', { name: p.name }), false, { label: t('Voir'), run: () => { location.hash = `#/projets/${enc(p.slug)}/claude`; } });
  } catch (e) { fail(e); }
}

function projectMenu(anchor, p, reload) {
  const h = `#/projets/${enc(p.slug)}`;
  menu(anchor, [
    { label: t('Ouvrir'), icon: 'folderOpen', run: () => { location.hash = h; } },
    { label: openAiLabel(), icon: 'spark', run: () => openAi(p.slug, p.name) },
    p.claude.running ? { label: t('Voir la session Claude en arrière-plan'), icon: 'eye', run: () => { location.hash = `${h}/claude`; } } : null,
    { label: t('Fichiers'), icon: 'file', run: () => { location.hash = `${h}/fichiers`; } },
    p.git ? { label: 'Git', icon: 'branch', run: () => { location.hash = `${h}/git`; } } : null,
    p.app_id ? { label: t('Déployer sur {tool}', { tool: DEPLOY.name }), icon: 'upload', run: () => deployApp(p.app_id, p.name).then(reload) } : null,
    { label: t('Nettoyer…'), icon: 'broom', run: () => cleanProject(p) },
    { label: t('Copier le chemin'), icon: 'copy', run: () => copyText(p.path, t('Chemin copié')) },
    { label: t('Supprimer le projet…'), icon: 'trash', danger: true, run: () => deleteProject(p, reload) },
  ]);
}

async function viewProjects(main) {
  const gen = routeGen;
  if (!overview) await refreshOverview();
  if (isStale(gen)) return;
  let all = [], query = '';
  let sort = { k: 'recent', dir: -1 };
  let view = 'grid';
  // Filtres par plateforme et par techno (cases à cocher) : un projet passe s'il a l'une des valeurs cochées
  let fsel = { pf: [], tg: [] };
  try { view = localStorage.getItem('helmshell.view') || 'grid'; } catch (_) { /* défaut : cartes */ }
  try { fsel = { pf: [], tg: [], ...JSON.parse(localStorage.getItem('helmshell.pfilters') || '{}') }; } catch (_) { /* aucun filtre */ }
  const saveF = () => { try { localStorage.setItem('helmshell.pfilters', JSON.stringify(fsel)); } catch (_) { /* rien */ } };
  const FGROUPS = { pf: [t('Plateformes'), 'platforms', platIcon], tg: [t('Technos'), 'tags', techIcon] };
  const values = (k) => {
    const n = new Map();
    for (const p of all) for (const v of p[FGROUPS[k][1]] || []) if (k === 'pf' || !PLATFORMS.includes(v)) n.set(v, (n.get(v) || 0) + 1);
    const order = k === 'pf' ? PLATFORMS : KNOWN_TECHS;
    const rank = (v) => (order.includes(v) ? order.indexOf(v) : order.length);
    return [...n].sort((a, b) => rank(a[0]) - rank(b[0]) || cmp(a[0], b[0]));
  };
  main.innerHTML = `
    ${pageHeader(t('Projets'), t('Chaque dossier de {path} est un projet.', { path: `<span class="mono">${esc(overview?.root || '')}</span>` }),
    `<a class="btn fab" href="#/nouveau">${ic('plus', 24, 2.2)}${t('Nouveau projet')}</a>`)}
    <div class="toolbar">
      <label class="searchbox">${ic('list', 20, 2)}<span class="sr">${t('Filtrer les projets')}</span><input type="search" id="q" placeholder="${t('Filtrer par nom ou techno')}"></label>
      <div class="row" role="group" aria-label="${t('Filtres')}" id="filters" style="gap:6px"></div>
      <div class="seg" role="group" aria-label="${t('Affichage')}" id="views"></div>
    </div>
    <div id="plist"><div class="skeleton"><span class="spin"></span></div></div>`;

  const sorted = (list) => [...list].sort((a, b) => (sort.k === 'name'
    ? cmp(a.name, b.name) * sort.dir
    : sort.k === 'size' ? ((a.size || 0) - (b.size || 0)) * sort.dir
      : (a.last_activity - b.last_activity) * sort.dir));
  const draw = () => {
    if (!$('#plist')) return;
    const none = !fsel.pf.length && !fsel.tg.length;
    setHTML($('#filters'), `<button type="button" class="chip" data-act="f-all" aria-pressed="${none}">${t('Tous')}</button>`
      + Object.entries(FGROUPS).map(([k, [l]]) => `<button type="button" class="chip fsel" data-act="f-open" data-k="${k}" aria-haspopup="true" aria-pressed="${!!fsel[k].length}">${l}${fsel[k].length ? ` · ${fsel[k].length === 1 ? esc(fsel[k][0]) : fsel[k].length}` : ''}${ic('chevronDown', 16, 2)}</button>`).join(''));
    setHTML($('#views'), [['grid', t('Cartes')], ['list', t('Liste')]].map(([id, l]) => `<button type="button" data-act="view" data-v="${id}" aria-pressed="${id === view}">${l}</button>`).join(''));
    const q = norm(query);
    const has = (p, k) => !fsel[k].length || fsel[k].some((v) => (p[FGROUPS[k][1]] || []).includes(v));
    const list = sorted(all.filter((p) => has(p, 'pf') && has(p, 'tg')
      && (!q || norm(`${p.name} ${p.slug} ${p.tags.join(' ')}`).includes(q))));
    if (!list.length) {
      setHTML($('#plist'), `<div class="empty card">${all.length ? t('Aucun projet ne correspond.') : `${t('Aucun projet pour l’instant.')} <a href="#/nouveau">${t('Crée le premier')}</a>.`}</div>`);
      return;
    }
    if (view === 'grid') { setHTML($('#plist'), `<div class="projects">${list.map(projectCard).join('')}</div>`); return; }
    const arrow = (k) => (sort.k === k ? ic(sort.dir > 0 ? 'chevronUp' : 'chevronDown', 13, 2) : '');
    const sortAttr = (k) => (sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none');
    setHTML($('#plist'), `<div class="card" style="overflow:hidden"><div class="scrollx"><table class="table ptable">
      <thead><tr>
        <th aria-sort="${sortAttr('name')}"><button class="th" data-act="sort" data-k="name">${t('Nom')}${arrow('name')}</button></th>
        <th class="hide-sm">${t('Plateformes')}</th><th class="hide-sm">${t('Technos')}</th><th>${t('IA')}</th><th class="hide-sm">Git</th>${DEPLOY.provider ? `<th class="hide-sm">${t('Déploiement')}</th>` : ''}
        <th aria-sort="${sortAttr('recent')}"><button class="th" data-act="sort" data-k="recent">${t('Modifié')}${arrow('recent')}</button></th>
        <th class="hide-sm" aria-sort="${sortAttr('size')}"><button class="th" data-act="sort" data-k="size">${t('Taille')}${arrow('size')}</button></th>
        <th><span class="sr">${t('Actions')}</span></th>
      </tr></thead><tbody>
      ${list.map((p) => {
    const st = sessionStatus(p.claude), d = deployStatus(p.app), g = p.git;
    return `<tr data-act="go" data-slug="${esc(p.slug)}">
          <td><span class="row nowrap" style="gap:12px">${projectIcon(p)}<span class="stack" style="gap:2px;min-width:0"><a class="plain" href="#/projets/${enc(p.slug)}" title="${esc(p.path)}"><b>${esc(p.name)}</b></a>${p.description ? `<span class="small muted ellipsis pdesc">${esc(p.description)}</span>` : ''}</span></span></td>
          <td class="hide-sm"><span class="plats">${platformBadges(p.platforms || [])}</span></td>
          <td class="hide-sm"><span class="row nowrap techs" style="gap:4px">${techBadges(p.tags, 5)}</span></td>
          <td>${p.claude.running || agentMinis(p.slug) ? `<span class="row nowrap" style="gap:4px">${p.claude.running ? `<span class="pill ${st.dot}">${esc(st.short)}</span>` : ''}${agentMinis(p.slug)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="hide-sm nowrap">${g ? `<span class="mono small">${esc(g.branch)}</span>${g.changes ? ` <span class="pill accent-soft">${g.changes}</span>` : ` <span class="c-ok">${ic('check', 16, 2.4)}</span>`}` : '<span class="muted">—</span>'}</td>
          ${DEPLOY.provider ? `<td class="hide-sm">${p.app ? `<span class="pill ${d.dot}">${esc(d.short)}</span>` : '<span class="muted">—</span>'}</td>` : ''}
          <td class="small muted nowrap">${ago(p.last_activity)}</td>
          <td class="hide-sm small muted nowrap">${p.size != null ? fmtBytes(p.size) : '—'}</td>
          <td style="text-align:right"><button class="btn icon" data-act="pmenu" data-slug="${esc(p.slug)}" aria-label="${t('Actions pour {name}', { name: esc(p.name) })}">${ic('dotsV', 22)}</button></td>
        </tr>`;
  }).join('')}
      </tbody></table></div></div>`);
  };
  const load = async () => { try { all = await api('GET', '/api/projects'); draw(); } catch (e) { fail(e); } };
  bind(main, {
    'f-all': () => { fsel = { pf: [], tg: [] }; saveF(); draw(); },
    'f-open': (el) => {
      const k = el.dataset.k, [label, , icon] = FGROUPS[k];
      const vals = values(k);
      const one = k === 'pf' ? t('Rechercher une plateforme') : t('Rechercher une techno');
      const pop = popover(el, `<div class="fpop" role="group" aria-label="${label}">
        <div class="fpop-head"><b>${label}</b><span class="fpop-n small muted"></span></div>
        <label class="fpop-search">${ic('search', 18, 2)}<span class="sr">${one}</span><input type="search" placeholder="${one}…" autocomplete="off" spellcheck="false"></label>
        <div class="fpop-list">${vals.map(([v, n]) => `<label class="fopt" data-v="${esc(norm(v))}"><input type="checkbox" value="${esc(v)}" ${fsel[k].includes(v) ? 'checked' : ''}><span class="fbox" aria-hidden="true">${ic('check', 14, 3)}</span><span class="fic">${icon(v) || ic('code', 16, 2)}</span><span class="grow ellipsis">${esc(v)}</span><span class="fcount">${n}</span></label>`).join('')}
          <div class="fpop-empty small muted" ${vals.length ? 'hidden' : ''}>${vals.length ? t('Aucune correspondance') : t('Aucune pour l’instant')}</div></div>
        <div class="fpop-foot"><button type="button" class="btn sm ghost" data-clear>${t('Tout décocher')}</button><button type="button" class="btn sm tonal" data-done>${t('OK')}</button></div>
      </div>`, (e) => {
        if (e.target.closest('[data-clear]')) { for (const i of $$('.fopt input', pop)) i.checked = false; sync(); }
        if (e.target.closest('[data-done]')) closePop();
      });
      if (!pop) return;
      const inp = $('.fpop-search input', pop);
      const sync = () => {
        fsel[k] = $$('.fopt input:checked', pop).map((i) => i.value);
        const n = fsel[k].length;
        $('.fpop-n', pop).textContent = n ? tp(n, '{n} cochée', '{n} cochées') : t('Aucun filtre');
        $('[data-clear]', pop).disabled = !n;
        saveF(); draw();
      };
      const filter = () => {
        const q = norm(inp.value.trim());
        let shown = 0;
        for (const o of $$('.fopt', pop)) { const ok = !q || o.dataset.v.includes(q); o.hidden = !ok; shown += ok; }
        $('.fpop-empty', pop).hidden = shown > 0 || !vals.length;
      };
      pop.onchange = (e) => { if (e.target.closest('.fopt')) sync(); };
      inp.oninput = filter;
      // Entrée : coche (ou décoche) la première valeur affichée
      inp.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const first = $$('.fopt', pop).find((o) => !o.hidden);
        if (first) { const c = $('input', first); c.checked = !c.checked; sync(); inp.select(); }
      };
      $('.fpop-n', pop).textContent = fsel[k].length ? tp(fsel[k].length, '{n} cochée', '{n} cochées') : t('Aucun filtre');
      $('[data-clear]', pop).disabled = !fsel[k].length;
      // Liste ouverte sous la puce, alignée à gauche
      const r = el.getBoundingClientRect();
      pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + window.scrollX}px`;
      if (matchMedia('(pointer: fine)').matches) inp.focus();
    },
    view: (el) => { view = el.dataset.v; try { localStorage.setItem('helmshell.view', view); } catch (_) { /* rien */ } draw(); },
    sort: (el) => { const k = el.dataset.k; sort = sort.k === k ? { k, dir: -sort.dir } : { k, dir: k === 'name' ? 1 : -1 }; draw(); },
    go: (el, e) => { if (!e.target.closest('a,button')) location.hash = `#/projets/${enc(el.dataset.slug)}`; },
    pmenu: (el) => { const p = all.find((x) => x.slug === el.dataset.slug); if (p) projectMenu(el, p, load); },
  });
  $('#q').oninput = (e) => { query = e.target.value; draw(); };
  await load();
  every(15000, load);
}

/* -------------------------------------------------------------------- projet */
function highlight(path, text) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const isMd = ext === 'md' || ext === 'markdown';
  const isConf = ['yml', 'yaml', 'toml', 'ini', 'env', 'conf'].includes(ext) || path.endsWith('.env');
  const hashComment = ['py', 'sh', 'yml', 'yaml', 'toml', 'rb', 'conf', 'env', 'dockerfile'].includes(ext) || /dockerfile$/i.test(path);
  return text.split('\n').map((l) => {
    let cls = '';
    if (isMd && /^#{1,6}\s/.test(l)) cls = 'h';
    else if (/^\s*(\/\/|\/\*|\*|<!--)/.test(l) || (hashComment && /^\s*#/.test(l))) cls = 'c';
    else if (isConf && /^\s*[\w.-]+\s*[:=]/.test(l)) {
      const m = l.match(/^(\s*[\w.-]+\s*[:=])(.*)$/);
      return `<div class="ln"><span><span class="k">${esc(m[1])}</span><span class="s">${esc(m[2])}</span></span></div>`;
    }
    return `<div class="ln"><span${cls ? ` class="${cls}"` : ''}>${esc(l) || ' '}</span></div>`;
  }).join('');
}

function colorDiff(text) {
  return text.split('\n').map((l) => {
    let c = '';
    if (l.startsWith('+++') || l.startsWith('---') || l.startsWith('diff ') || l.startsWith('index ')) c = 'meta';
    else if (l.startsWith('+')) c = 'add';
    else if (l.startsWith('-')) c = 'del';
    else if (l.startsWith('@@')) c = 'hunk';
    return c ? `<span class="${c}">${esc(l)}</span>` : esc(l);
  }).join('\n');
}

const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'svg'];
// Projet pour lequel l'utilisateur a demandé à démarrer Claude (bouton « Ouvrir Claude », cartes de la page Sessions).
// Sans cette demande, l'onglet Claude se contente d'afficher la session si elle existe déjà.
let claudeStartFor = null;
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('[data-claude-start]');
  if (a) claudeStartFor = a.dataset.claudeStart;
}, true);
// Libellés évalués au rendu (langue de l’interface)
const TABS = [['apercu', () => t('Aperçu'), 'eye'], ['fichiers', () => t('Fichiers'), 'folder'], ['git', () => 'Git', 'branch'], ['claude', () => t('Agents'), 'spark'], ['deploiement', () => t('Déploiement'), 'upload'], ['reglages', () => t('Réglages'), 'sliders']];
const PDF_EXT = ['pdf'];
let diffMode = 'unified';
try { diffMode = localStorage.getItem('helmshell.diff') || 'unified'; } catch (_) { /* défaut */ }
const setDiffMode = (m) => { diffMode = m; try { localStorage.setItem('helmshell.diff', m); } catch (_) { /* rien */ } };
const diffSeg = () => `<div class="seg sm" role="group" aria-label="${t('Affichage du diff')}">${[['unified', t('Unifié')], ['split', t('Côte à côte')]].map(([id, l]) => `<button type="button" data-act="diff-mode" data-m="${id}" aria-pressed="${diffMode === id}">${l}</button>`).join('')}</div>`;

/* Recherche floue pour Ctrl P : toutes les lettres dans l’ordre, bonus aux débuts de mots et au nom du fichier */
function fuzzyScore(q, path) {
  const t = path.toLowerCase();
  let i = 0, score = 0, prev = -2;
  for (const ch of q) {
    const j = t.indexOf(ch, i);
    if (j < 0) return -1;
    score += j === prev + 1 ? 3 : 1;
    if (j === 0 || '/._-'.includes(t[j - 1])) score += 2;
    prev = j; i = j + 1;
  }
  const base = t.slice(t.lastIndexOf('/') + 1);
  if (base.includes(q)) score += 10;
  return score - t.length / 100;
}

async function viewProject(main, slug, tab, query) {
  const gen = routeGen;
  const P = `/api/projects/${enc(slug)}`;
  const [loaded] = await Promise.all([api('GET', P), loadAgents()]);
  if (isStale(gen)) return;
  const qAgent = new URLSearchParams(query || '').get('agent');
  const S = {
    info: loaded,
    tab: TABS.some((t) => t[0] === tab) ? tab : 'apercu',
    expanded: new Set(['']), children: new Map(), sel: null, selDir: false, file: null, editing: false,
    git: null, change: null, diff: '', claude: null, claudeKey: '',
    termTarget: 'project', disposeTerm: null, termGen: 0, drawer: false, left: false,
    cm: null, pvGen: 0, mdSource: false, gotoLine: 0, search: null, searchView: false,
    unchecked: new Set(), log: null, logEnd: false, liveKey: null, tasksKey: '', tasks: [], commands: null,
    cf: { logs: null, follow: false, envs: null, reveal: new Set(), deps: null, images: null },
    repo: null, repoKey: '', repoGen: 0, disposeRepo: null, cmdsDrawn: false, accounts: [],
    // Branche affichée dans l'onglet Claude (null : dossier principal) et copies de travail des branches
    br: new URLSearchParams(query || '').get('branche') || null, copies: null,
    // Agent affiché dans l'onglet Agents : Claude Code ou Codex (chacun sa session tmux, son terminal, son historique)
    agent: qAgent ? agentId(qAgent) : agentPref(slug),
  };
  if (qAgent) setAgentPref(slug, S.agent);
  // IA choisie mais ni installée ni ouverte dans ce projet : l'autre (Claude si Codex manque, et inversement)
  if (S.agent === 'codex' && !codexOn() && !codexSessionOf(slug)) S.agent = 'claude';
  if (S.agent === 'claude' && !claudeOn() && codexOn() && !agentReposOf(slug).some((r) => r.agent === 'claude')) S.agent = 'codex';
  const BQ = () => brQ(S.br, S.agent);
  const isCodex = () => S.agent === 'codex';
  // Le choix Claude Code | Codex n'apparaît que si les deux sont installés (ou l'autre déjà ouvert dans ce projet)
  const showAgentSwitch = () => aiAgents().length > 1 || agentReposOf(slug).some((r) => r.agent !== S.agent);
  const info = S.info;
  onLeave(() => { S.left = true; S.termGen++; if (S.disposeTerm) S.disposeTerm(); S.repoGen++; if (S.disposeRepo) S.disposeRepo(); });

  main.innerHTML = `
    <header class="phead">
      <div class="grow" style="min-width:0">
        <nav class="crumbs" aria-label="${t('Fil d’Ariane')}"><a href="#/projets">${t('Projets')}</a>${ic('chevron', 16, 2)}<span>${esc(info.name)}</span></nav>
        <div class="titleline"><span id="phead-icon">${projectIcon(info, 'lg')}</span><h1 class="ellipsis" title="${esc(info.path)}">${esc(info.name)}</h1></div>
        <div class="row pills" id="pills"></div>
        ${info.description ? `<p class="phead-desc">${esc(info.description)}</p>` : ''}
        ${facets(info, 'inline')}
      </div>
      <div class="row nowrap pactions">
        <span id="claude-btn" class="splitbtn"></span>
        <button class="btn icon" data-act="more" aria-label="${t('Plus d’actions')}">${ic('dotsV', 22)}</button>
      </div>
    </header>
    ${info.app_suggestion ? `<div class="notice row" style="justify-content:space-between">${t('L’application {tool} « {name} » utilise ce dépôt.', { tool: DN(), name: esc(info.app_suggestion.name) })}<button class="btn sm" data-act="link" data-uuid="${esc(info.app_suggestion.uuid)}">${t('Relier ce projet')}</button></div>` : ''}
    <div id="sbar"></div>
    <div class="ptabs" role="tablist" aria-label="${t('Vues du projet')}" id="tabs"></div>
    <div id="pane"></div>
    <section class="drawer" id="drawer" hidden aria-label="Terminal">
      <div class="drawer-head"><div class="row" role="group" aria-label="${t('Choisir le terminal')}" id="drawer-targets" style="gap:6px"></div>
        <span class="small muted grow hide-sm">${t('Le shell reste ouvert (tmux) même si tu fermes la page.')}</span>
        <button class="btn icon sm ghost" data-act="term-close" aria-label="${t('Fermer le terminal')}">${ic('x', 16)}</button></div>
      <div class="drawer-body" id="termbox"></div>
    </section>`;

  /* --- état et en-tête --- */
  const gitSum = () => {
    if (S.git) return S.git.repo ? { branch: S.git.branch, n: S.git.changes.length } : null;
    return info.git ? { branch: info.git.branch, n: info.git.changes } : null;
  };
  // État de synchronisation avec le dépôt distant (après le dernier fetch)
  const syncText = (g) => {
    if (!g?.remote) return '';
    if (!g.upstream) return t('branche pas encore poussée');
    const parts = [];
    if (g.behind) parts.push(t('{n} à récupérer', { n: g.behind }));
    if (g.ahead) parts.push(t('{n} à pousser', { n: g.ahead }));
    return parts.join(' · ') || t('à jour');
  };
  const remotePill = () => {
    const url = S.git?.remote ?? info.remote;
    const r = remoteInfo(url, S.accounts);
    if (!r) return '';
    const sync = S.git?.repo ? syncText(S.git) : '';
    const cls = S.git?.behind ? 'warn' : S.git?.ahead ? 'accent' : '';
    return `<a class="pill ${cls}" href="${esc(r.web)}" target="_blank" rel="noopener" title="${esc(url)}${S.git?.fetched ? ` · ${t('vérifié {when}', { when: ago(S.git.fetched) })}` : ''}">${r.kind ? forgeLogo(r.kind, 14) : ic('globe', 13, 2)}<span>${esc(r.name)}</span>${sync ? ` · ${esc(sync)}` : ''}</a>`;
  };
  function drawPills() {
    if (S.left || !$('#pills')) return;
    const c = S.claude, st = sessionStatus(c), g = gitSum();
    const d = info.app ? deployStatus(info.app) : null;
    const r = S.repo;
    drawClaudeBtn();
    // Une pastille par IA ouverte (terminal du dossier principal), plus la session Claude en arrière-plan
    const open = agentReposOf(slug).filter((x) => !x.branch);
    if (r?.claude && !r.branch && !open.some((x) => x.agent === r.agent)) open.push(r);
    const aiPills = open.map((x) => { const xs = repoStatus(x); return `<button class="pill ${xs.cls === 'warn' ? 'warn' : 'ok'}" data-act="agent-pick" data-agent="${agentId(x.agent)}" title="${esc(xs.short)}">${agentLogo(x.agent, 14)}${agentShort(x.agent)} · ${x.rc ? 'Remote Control' : x.status === 'waiting' ? t('validation') : x.status === 'busy' ? t('travaille') : t('terminal')}</button>`; });
    $('#pills').innerHTML = [
      c?.running ? `<button class="pill ${st.dot}" data-act="tab" data-tab="claude"><span class="dot"></span>Claude · ${esc(st.short)}</button>` : '',
      ...aiPills,
      !c?.running && !aiPills.length ? `<button class="pill" data-act="tab" data-tab="claude"><span class="dot"></span>${aiAgents().length > 1 ? t('Aucune IA ouverte') : aiAgents()[0] === 'codex' ? t('Codex arrêté') : t('Claude arrêté')}</button>` : '',
      g ? `<button class="pill ${g.n ? 'accent-soft' : ''}" data-act="tab" data-tab="git">${ic('branch', 13, 2)}<span class="mono">${esc(g.branch)}</span>${g.n ? ` · ${tp(g.n, '{n} modifié', '{n} modifiés')}` : ''}</button>` : `<span class="pill">${t('Pas de dépôt Git')}</span>`,
      g ? (remotePill() || `<button class="pill" data-act="link-remote">${t('Pas de dépôt distant · relier')}</button>`) : '',
      d ? `<span class="pill ${d.dot === 'ok' ? 'ok' : d.dot}"><span class="dot ${d.dot}"></span>${esc(d.short)} · ${DN()}</span>` : '',
    ].join('');
  }
  // Bouton d'ouverture : « Ouvrir Claude » ou « Ouvrir Codex » quand une seule IA est installée,
  // « Ouvrir IA » (avec la fenêtre de choix) quand les deux le sont
  function drawClaudeBtn() {
    const box = $('#claude-btn');
    if (!box) return;
    const list = aiAgents();
    const open = agentReposOf(slug).filter((x) => !x.branch).map((x) => agentId(x.agent));
    if (S.repo?.claude && !S.repo.branch && !open.includes(S.agent)) open.push(S.agent);
    if (S.claude?.running && !open.includes('claude')) open.push('claude');
    const on = open.length > 0;
    let html;
    if (list.length > 1) {
      const tip = on ? t('IA ouvertes : {list}', { list: open.map(agentShort).join(', ') }) : t('Choisis Claude Code ou Codex, puis ouvre-le dans un terminal tmux');
      html = `<button class="btn ${on ? 'tonal' : 'primary'} claude-btn" data-act="claude-open" title="${esc(tip)}">${on ? open.map((a) => agentLogo(a, 18)).join('') : ic('spark', 18, 2)}${on ? `${t('IA')}<span class="dot ok"></span>` : t('Ouvrir IA')}</button>`;
    } else {
      const a = list[0], me = open.includes(a);
      const tip = a === 'codex' ? (me ? t('Codex tourne dans ce projet') : t('Ouvre Codex dans un terminal tmux')) : (me ? t('Claude tourne dans ce projet') : t('Ouvre Claude dans un terminal tmux'));
      html = `<button class="btn ${me ? 'tonal' : 'primary'} claude-btn" data-act="claude-open" title="${tip}">${agentLogo(a, 18)}${me ? `${agentShort(a)}<span class="dot ok"></span>` : openAiLabel(list)}</button>`;
    }
    setHTML(box, `${html}<button class="btn ${on ? 'tonal' : 'primary'} caret" data-act="claude-menu" aria-haspopup="menu" aria-label="${list.length > 1 ? t('Autres façons de lancer une IA') : list[0] === 'codex' ? t('Autres façons de lancer Codex') : t('Autres façons de lancer Claude')}">${ic('chevronDown', 18, 2)}</button>`);
  }
  function drawSbar() {
    if (S.left || !$('#sbar')) return;
    const c = S.claude;
    let h = '';
    if (!c) h = '';
    else if (!c.running) {
      h = ''; // lancer Claude : bouton « Claude » en haut de la page
    } else if (c.phase === 'question') {
      h = `<div class="sbar warn" role="alert">${ic('spark', 22, 2)}<span class="grow" style="min-width:0"><b>${t('Claude attend une réponse')}</b> · <span class="mono small">${esc(c.question)}</span></span>
        <button class="btn" data-act="answer" data-q="${esc(c.question)}" data-v="n">${t('Non')}</button><button class="btn primary" data-act="answer" data-q="${esc(c.question)}" data-v="y">${t('Oui')}</button></div>`;
    } else if (c.phase === 'starting') {
      h = `<div class="sbar"><span class="spin" style="color:var(--warn)"></span><span class="grow">${t('Démarrage de Claude…')}</span><button class="btn sm danger" data-act="stop">${t('Arrêter')}</button></div>`;
    } else if (c.phase === 'exited') {
      h = `<div class="sbar err" role="alert"><span class="dot err"></span><span class="grow">${t('Claude s’est arrêté (code {code})', { code: esc(c.exit_code) })}</span>
        <button class="btn sm" data-act="tab" data-tab="claude">${t('Journal')}</button><button class="btn sm primary" data-act="restart">${t('Relancer la session')}</button><button class="btn sm ghost" data-act="close-session">${t('Fermer')}</button></div>`;
    } else {
      h = `<div class="sbar ok"><span class="dot ok"></span><span class="grow" style="min-width:0">${c.url ? t('Claude prêt') : t('Claude actif')} · ${esc(modeLabel(c.mode))} · ${t('depuis {when}', { when: since(c.started) })}</span>
        ${c.url ? `<button class="btn sm" data-act="qr">${ic('qr', 14)}${t('QR code')}</button><button class="btn sm" data-act="copy">${ic('copy', 14)}${t('Copier le lien')}</button>` : ''}
        <a class="btn sm" href="${esc(c.url || 'https://claude.ai/code')}" target="_blank" rel="noopener">${ic('external', 14)}${t('Ouvrir')}</a>
        <button class="btn sm danger" data-act="stop">${ic('stop', 14)}${t('Arrêter')}</button></div>`;
    }
    $('#sbar').innerHTML = h;
  }
  function drawTabs() {
    if (S.left || !$('#tabs')) return;
    const g = gitSum();
    // Icône (affichée sur mobile, au-dessus du libellé) + pastille : modifications Git, Claude ouvert
    $('#tabs').innerHTML = TABS.filter(([id]) => id !== 'deploiement' || DEPLOY.provider).map(([id, l, icon]) => `<button type="button" role="tab" data-act="tab" data-tab="${id}" aria-selected="${id === S.tab}"><span class="ti">${ic(icon, 22, 2)}${id === 'git' && g?.n ? `<span class="badge">${g.n}</span>` : ''}${id === 'claude' && (S.claude?.running || S.repo?.claude || agentReposOf(slug).length) ? `<span class="dot ${S.claude?.running ? sessionStatus(S.claude).dot : agentReposOf(slug).some((x) => x.status === 'waiting') ? 'warn' : 'ok'}"></span>` : ''}</span><span class="tl">${l()}</span></button>`).join('');
    // Sur un écran étroit, l'onglet actif reste visible si la barre défile
    const cur = $('#tabs [aria-selected="true"]');
    if (cur && $('#tabs').scrollWidth > $('#tabs').clientWidth) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function setTab(tab) {
    if (S.left) return;
    if (S.editing && S.cm) S.draft = S.cm.getValue();
    if (S.tab === 'claude' && tab !== 'claude') disposeRepoTerm();
    if (tab !== S.tab || !$('#pane').hasChildNodes()) {
      S.tab = tab;
      history.replaceState(null, '', tab === 'claude' ? claudeHash(slug, S.br, S.agent) : `#/projets/${enc(slug)}/${tab}`);
    }
    closePop();
    drawTabs();
    drawSbar();
    drawPane();
  }
  function drawPane() {
    if (S.left) return;
    if (S.tab === 'apercu') drawOverview();
    else if (S.tab === 'fichiers') { drawFilesLayout(); drawTree(); drawPreview(); }
    else if (S.tab === 'git') { drawGit(); loadGit().then(() => { drawGit(); drawTabs(); drawPills(); }); }
    else if (S.tab === 'claude') drawClaudeTab();
    else if (S.tab === 'deploiement') drawDeploy();
    else drawSettings();
  }

  /* --- aperçu --- */
  async function drawOverview() {
    $('#pane').innerHTML = `<div class="ov">
      <section class="card" style="overflow:hidden"><div class="card-head sm"><h2 id="doc-t">CLAUDE.md</h2><span id="doc-act"></span></div><div id="doc" class="doc-scroll" tabindex="0"><div class="skeleton"><span class="spin"></span></div></div></section>
      <div class="stack" style="gap:16px">
        <section class="card" style="overflow:hidden"><div class="card-head sm"><h2>${t('Modifications en cours')}</h2></div><div id="ov-changes"><div class="skeleton"><span class="spin"></span></div></div></section>
        ${DEPLOY.provider ? `<section class="card" style="overflow:hidden"><div class="card-head sm"><h2>${t('Déploiement')}</h2></div><div class="card-pad stack" style="gap:10px" id="ov-deploy"></div></section>` : ''}
        <section class="card" style="overflow:hidden"><div class="card-head sm"><h2>${t('Activité')}</h2></div><ol class="feed" id="ov-act"></ol></section>
      </div></div>`;
    const here = () => !S.left && S.tab === 'apercu' && $('#doc');
    // déploiement
    const cf = info.app;
    if (!$('#ov-deploy')) { /* pas d'outil de déploiement */ } else if (cf) {
      const d = deployStatus(cf);
      $('#ov-deploy').innerHTML = `<div class="row" style="gap:8px"><span class="dot ${d.dot}"></span><b class="${d.cls}">${esc(d.short)}</b><span class="muted small">· ${esc(cf.name)}</span></div>
        ${cf.fqdn ? cf.fqdn.split(',').map((f) => (webUrl(f) ? `<a class="small ellipsis" href="${esc(webUrl(f))}" target="_blank" rel="noopener">${esc(f.trim().replace(/^https?:\/\//, ''))}</a>` : `<span class="small">${esc(f)}</span>`)).join('') : ''}
        <div><button class="btn sm" data-act="deploy">${ic('upload', 14)}${t('Déployer')}</button></div>`;
    } else {
      $('#ov-deploy').innerHTML = `<p class="small muted">${t('Ce projet n’est relié à aucune application {tool}.', { tool: DN() })}</p><div><button class="btn sm" data-act="tab" data-tab="reglages">${t('Relier à {tool}', { tool: DN() })}</button></div>`;
    }
    // document de contexte
    await loadDir('');
    if (!here()) return;
    const docNode = (S.children.get('') || []).find((n) => /^claude\.md$/i.test(n.name)) || (S.children.get('') || []).find((n) => /^readme\.md$/i.test(n.name));
    if (docNode) {
      try {
        const f = await api('GET', `${P}/file?path=${enc(docNode.path)}`);
        if (!here()) return;
        $('#doc-t').textContent = docNode.name;
        $('#doc-act').innerHTML = `<button class="btn tonal" data-act="edit-doc" data-path="${esc(docNode.path)}">${ic('edit', 18, 2)}${t('Modifier')}</button>`;
        let html;
        try { html = `<div class="md card-pad">${await renderMarkdown(f.content || '', { base: P, path: docNode.path })}</div>`; } catch (_) {
          html = `<pre class="code doc">${highlight(docNode.path, f.content || '')}</pre>`;
        }
        if (!here()) return;
        $('#doc').innerHTML = html;
      } catch (e) { $('#doc').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    } else {
      $('#doc').innerHTML = `<div class="empty stack" style="align-items:center;gap:14px"><span>${t('Pas encore de {file} : c’est là que tu donnes à Claude le contexte du projet.', { file: '<span class="mono">CLAUDE.md</span>' })}</span>
        <button class="btn primary" data-act="create-doc">${ic('filePlus', 15)}${t('Créer {file}', { file: 'CLAUDE.md' })}</button></div>`;
    }
    // modifications
    await loadGit();
    if (!here()) return;
    drawTabs(); drawPills();
    const g = S.git;
    if (!g.repo) {
      $('#ov-changes').innerHTML = `<div class="card-pad stack" style="gap:10px"><span class="small muted">${t('Ce dossier n’est pas un dépôt Git.')}</span><div><button class="btn sm" data-act="git-init">${t('Initialiser Git')}</button></div></div>`;
    } else if (!g.changes.length) {
      $('#ov-changes').innerHTML = `<div class="empty-ok small">${ic('check', 16, 2)}${t('Tout est validé')}${g.log[0] ? ` · ${t('dernier commit {when}', { when: ago(Number(g.log[0].when)) })}` : ''}</div>`;
    } else {
      $('#ov-changes').innerHTML = `<div class="stack" style="gap:1px;padding:6px">${g.changes.slice(0, 6).map((c) => `<button class="change" data-act="diff-go" data-path="${esc(c.path)}">
          <span class="k ${c.kind === 'A' ? 'c-ok' : c.kind === 'D' ? 'c-err' : 'c-warn'}">${esc(c.kind)}</span><span class="p">${esc(c.path)}</span><span class="small"><span class="c-ok">+${c.add}</span>${c.del ? ` <span class="c-err">−${c.del}</span>` : ''}</span></button>`).join('')}
        ${g.changes.length > 6 ? `<span class="small muted" style="padding:4px 12px">${tp(g.changes.length - 6, 'et {n} autre', 'et {n} autres')}</span>` : ''}</div>
        <div class="card-pad" style="padding-top:6px"><button class="btn tonal" style="width:100%" data-act="tab" data-tab="git">${ic('eye', 18, 2)}${tp(g.changes.length, 'Voir la modification', 'Voir les {n} modifications')}</button></div>`;
    }
    // activité
    try {
      const acts = await api('GET', `/api/activity?project=${enc(slug)}&limit=8`);
      if (!here()) return;
      $('#ov-act').innerHTML = acts.length ? acts.map((a) => `<li><span class="dot ${ACT_DOT[a.kind] || ''}" aria-hidden="true"></span><span class="t">${esc(a.text)}</span><span class="w">${ago(a.t)}</span></li>`).join('')
        : `<li class="none small">${t('Rien pour l’instant.')}</li>`;
    } catch (_) { /* rien */ }
  }

  /* --- fichiers --- */
  async function loadDir(path) {
    try { S.children.set(path, await api('GET', `${P}/tree?path=${enc(path)}`)); } catch (e) {
      if (path && (e.status === 400 || e.status === 404)) {
        for (const x of [...S.expanded]) if (x === path || x.startsWith(`${path}/`)) { S.expanded.delete(x); S.children.delete(x); }
        return;
      }
      fail(e); S.children.set(path, []);
    }
  }
  function flat(path, depth, out) {
    for (const n of S.children.get(path) || []) {
      out.push({ ...n, depth });
      if (n.dir && S.expanded.has(n.path)) flat(n.path, depth + 1, out);
    }
    return out;
  }
  function drawFilesLayout() {
    $('#pane').innerHTML = `<div class="files card">
      <div class="files-tree">
        <form class="files-search" id="fsearch" role="search"><label class="searchbox">${ic('search', 15)}<span class="sr">${t('Rechercher dans le projet')}</span><input type="search" name="q" placeholder="${t('Rechercher dans le projet')}" value="${esc(S.search?.q || '')}" title="${t('Ctrl Maj F')}"></label></form>
        <div class="files-tools"><button type="button" class="btn sm ghost" data-act="finder" title="Ctrl P">${ic('file', 14)}${t('Ouvrir…')} <kbd>Ctrl P</kbd></button><div class="row nowrap" style="gap:4px">
          <button class="btn icon sm ghost" data-act="mkdir" aria-label="${t('Nouveau dossier')}" title="${t('Nouveau dossier')}">${ic('folderPlus', 16)}</button>
          <button class="btn icon sm ghost" data-act="newfile" aria-label="${t('Nouveau fichier')}" title="${t('Nouveau fichier')}">${ic('filePlus', 16)}</button>
          <button class="btn icon sm ghost" data-act="upload" aria-label="${t('Importer des fichiers')}" title="${t('Importer des fichiers')}">${ic('upload', 16)}</button>
          <button class="btn icon sm ghost" data-act="refresh" aria-label="${t('Actualiser')}" title="${t('Actualiser')}">${ic('refresh', 16)}</button>
          <input type="file" id="upload-input" multiple hidden></div></div>
        <ul class="tree" role="tree" aria-label="${t('Arborescence de {name}', { name: esc(info.name) })}" id="tree"></ul>
        <div class="drop" id="drop">${t('Glisse des fichiers ici pour les envoyer')}</div>
      </div>
      <div class="files-main" id="fpane"></div>
    </div>`;
    $('#upload-input').onchange = (e) => { uploadFiles([...e.target.files]); e.target.value = ''; };
    const drop = $('#drop');
    for (const el of [drop, $('#tree')]) {
      el.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      el.addEventListener('dragleave', () => drop.classList.remove('over'));
      el.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); uploadFiles([...e.dataTransfer.files]); });
    }
    if (!S.children.has('')) loadDir('').then(drawTree);
  }
  function drawTree() {
    if (S.left || !$('#tree')) return;
    const items = flat('', 0, []);
    setHTML($('#tree'), items.length ? items.map((n) => `<li role="treeitem" ${n.dir ? `aria-expanded="${S.expanded.has(n.path)}"` : ''} class="${n.heavy ? 'heavy' : ''}">
      <button type="button" data-act="pick" data-path="${esc(n.path)}" data-dir="${n.dir ? 1 : ''}" aria-selected="${n.path === S.sel}" style="padding-left:${8 + n.depth * 16}px">
        ${n.dir ? `<span style="color:var(--muted);display:flex">${ic(S.expanded.has(n.path) ? 'chevronDown' : 'chevron', 14)}</span><span style="color:var(--accent);display:flex">${ic(S.expanded.has(n.path) ? 'folderOpen' : 'folder', 16)}</span>`
    : `<span style="width:14px"></span><span style="color:var(--muted);display:flex">${ic('file', 16)}</span>`}
        <span class="name">${esc(n.name)}</span>${n.modified ? `<span class="m" title="${t('Modifié (Git)')}">M</span>` : ''}
      </button></li>`).join('') : (S.children.has('') ? `<li class="empty small">${t('Dossier vide')}</li>` : '<li class="skeleton"><span class="spin"></span></li>'));
  }
  async function refreshTree() {
    await Promise.all([...S.expanded].map(loadDir));
    drawTree();
  }
  const targetDir = () => (!S.sel ? '' : (S.selDir ? S.sel : S.sel.split('/').slice(0, -1).join('/')));
  const joinPath = (dir, name) => (dir ? `${dir}/${name}` : name);

  const crumbs = (path) => {
    const parts = path.split('/');
    return `<nav class="fcrumbs mono small" aria-label="${t('Chemin')}">${parts.map((part, i) => (i < parts.length - 1
      ? `<button type="button" data-act="crumb" data-path="${esc(parts.slice(0, i + 1).join('/'))}">${esc(part)}</button><span class="muted">/</span>`
      : `<span>${esc(part)}</span>`)).join('')}</nav>`;
  };
  function drawPreview() {
    const pane = $('#fpane');
    if (S.left || !pane || S.tab !== 'fichiers') return;
    S.cm = null;
    const tok = ++S.pvGen;
    if (S.searchView) { drawSearch(); return; }
    if (!S.sel) {
      pane.innerHTML = `<div class="empty stack" style="align-items:center;gap:10px">${t('Choisis un fichier dans l’arborescence.')}<span class="small muted"><kbd>Ctrl P</kbd> ${t('pour ouvrir un fichier par son nom')} · <kbd>${t('Ctrl Maj F')}</kbd> ${t('pour chercher dans tout le projet')}</span></div>`;
      return;
    }
    const f = S.file;
    const ext = (S.sel.split('.').pop() || '').toLowerCase();
    const md = isMarkdown(S.sel) && f && !f.binary;
    const head = (extra = '') => `<div class="content-head"><div style="min-width:0">${crumbs(S.sel)}<div class="small muted">${extra}</div></div><div class="row nowrap" style="gap:6px">
      ${md && !S.editing ? `<div class="seg sm" role="group" aria-label="${t('Affichage')}"><button type="button" data-act="md-view" data-v="0" aria-pressed="${!S.mdSource}">${t('Aperçu')}</button><button type="button" data-act="md-view" data-v="1" aria-pressed="${S.mdSource}">${t('Source')}</button></div>` : ''}
      ${f && !f.binary && !f.truncated && !S.selDir && !S.editing ? `<button class="btn tonal" data-act="edit">${ic('edit', 18, 2)}${t('Modifier')}</button>` : ''}
      ${S.editing ? `<button class="btn sm ghost" data-act="cancel-edit">${t('Annuler')}</button><button class="btn sm primary" data-act="save" title="Ctrl S">${t('Enregistrer')}</button>` : ''}
      <button class="btn sm icon ghost" data-act="fmenu" aria-label="${t('Actions sur {path}', { path: esc(S.sel) })}">${ic('dots', 16)}</button>
    </div></div>`;
    if (S.selDir) {
      const kids = S.children.get(S.sel);
      pane.innerHTML = head(`${t('Dossier')} · ${kids ? tp(kids.length, '{n} élément', '{n} éléments') : '…'}`)
        + `<div class="empty">${t('Les nouveaux fichiers, dossiers et imports iront dans ce dossier.')}</div>`;
      return;
    }
    if (!f) { pane.innerHTML = `${head()}<div class="skeleton"><span class="spin"></span></div>`; return; }
    const meta = `${fmtBytes(f.size)} · ${t('modifié {when}', { when: ago(f.mtime) })}${f.truncated ? ` · ${t('aperçu tronqué (fichier trop gros pour l’éditeur)')}` : ''}`;
    const url = `${P}/download?inline=1&path=${enc(S.sel)}`;
    if (IMG_EXT.includes(ext) && !S.editing) {
      pane.innerHTML = head(meta) + `<div class="preview-img"><img alt="${esc(S.sel)}" src="${url}"></div>`;
    } else if (PDF_EXT.includes(ext)) {
      pane.innerHTML = head(meta) + `<iframe class="pdf" title="${esc(S.sel)}" src="${url}"></iframe>`;
    } else if (f.binary) {
      pane.innerHTML = `${head(meta)}<div class="empty">${t('Fichier binaire : pas d’aperçu. Télécharge-le ou demande à une IA.')}</div>`;
    } else if (md && !S.editing && !S.mdSource) {
      pane.innerHTML = `${head(meta)}<div class="md card-pad" id="mdview"><div class="skeleton"><span class="spin"></span></div></div>`;
      renderMarkdown(f.content, { base: P, path: S.sel }).then((h) => { if (tok === S.pvGen && $('#mdview')) $('#mdview').innerHTML = h; })
        .catch(() => { if (tok === S.pvGen && $('#mdview')) $('#mdview').outerHTML = `<pre class="code">${highlight(S.sel, f.content)}</pre>`; });
    } else {
      pane.innerHTML = `${head(meta)}<div class="cmbox" id="cmbox"><div class="skeleton"><span class="spin"></span></div></div>`;
      const line = S.gotoLine;
      S.gotoLine = 0;
      createEditor($('#cmbox'), {
        value: S.editing ? (S.draft ?? f.content) : f.content, path: S.sel, readOnly: !S.editing, line, onSave: save,
      }).then((cm) => {
        if (tok !== S.pvGen || S.left) return;
        S.cm = cm;
        if (S.editing) cm.focus();
      }).catch(() => {
        // Éditeur indisponible : éditeur simple
        if (tok !== S.pvGen || !$('#cmbox')) return;
        $('#cmbox').innerHTML = S.editing
          ? `<textarea class="editor" id="editor" spellcheck="false">${esc(S.draft ?? f.content)}</textarea>`
          : `<pre class="code">${highlight(S.sel, f.content)}</pre>`;
        if (S.editing) {
          const ta = $('#editor');
          S.cm = { getValue: () => ta.value, focus: () => ta.focus() };
          ta.onkeydown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } };
        }
      });
    }
  }
  async function openFile(path, edit = false) {
    S.file = null; S.editing = false; S.draft = null; S.searchView = false;
    drawPreview();
    let f = null;
    try { f = await api('GET', `${P}/file?path=${enc(path)}`); } catch (e) { fail(e); }
    if (S.sel !== path || S.left) return;
    if (!f) { S.sel = null; drawTree(); drawPreview(); return; }
    S.file = f;
    S.editing = edit && !f.binary && !f.truncated;
    drawPreview();
  }
  const dirty = () => S.editing && (S.cm ? S.cm.getValue() : S.draft ?? S.file?.content) !== S.file?.content;
  const okToLeaveFile = async () => !dirty() || !!(await confirmBox(t('Abandonner les modifications ?'), t('Les changements non enregistrés de {path} seront perdus.', { path: S.sel }), t('Abandonner')));
  async function openInFiles(path, edit = false, line = 0) {
    if (path !== S.sel && !await okToLeaveFile()) return;
    S.sel = path; S.selDir = false; S.file = null; S.editing = false; S.draft = null; S.searchView = false;
    S.gotoLine = line;
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) S.expanded.add(parts.slice(0, i).join('/'));
    setTab('fichiers');
    await refreshTree();
    await openFile(path, edit);
  }
  async function save() {
    if (!S.cm || !S.editing) return;
    const content = S.cm.getValue();
    try {
      await api('PUT', `${P}/file?path=${enc(S.sel)}`, { content });
      S.file = { ...S.file, content, size: new Blob([content]).size, mtime: Date.now() / 1000 };
      S.editing = false; S.draft = null;
      toast(t('Fichier enregistré'));
      drawPreview(); refreshTree(); loadGit().then(() => { drawTabs(); drawPills(); });
    } catch (e) { fail(e); }
  }

  /* --- recherche dans le projet --- */
  async function runSearch(q) {
    q = (q || '').trim();
    if (q.length < 2) { toast(t('Tape au moins 2 caractères'), true); return; }
    if (!await okToLeaveFile()) return;
    S.search = { q, loading: true };
    S.searchView = true; S.editing = false;
    drawPreview();
    try { S.search = { q, ...(await api('GET', `${P}/search?q=${enc(q)}`)) }; } catch (e) { S.search = { q, error: e.message }; }
    if (S.searchView) drawPreview();
  }
  function drawSearch() {
    const pane = $('#fpane');
    const r = S.search;
    if (!pane || !r) return;
    const head = `<div class="content-head"><div style="min-width:0"><b>${t('Recherche « {q} »', { q: esc(r.q) })}</b><div class="small muted">${r.loading ? t('Recherche…') : r.error ? '' : `${r.truncated ? t('{n}+ résultats', { n: r.results.length }) : tp(r.results.length, '{n} résultat', '{n} résultats')} ${tp(r.files, 'dans {n} fichier', 'dans {n} fichiers')}`}</div></div>
      <button class="btn sm ghost" data-act="search-close">${ic('x', 14)}${t('Fermer')}</button></div>`;
    if (r.loading) { pane.innerHTML = `${head}<div class="skeleton"><span class="spin"></span></div>`; return; }
    if (r.error) { pane.innerHTML = `${head}<div class="notice err">${esc(r.error)}</div>`; return; }
    const byFile = new Map();
    for (const x of r.results) { if (!byFile.has(x.path)) byFile.set(x.path, []); byFile.get(x.path).push(x); }
    const words = r.q.toLowerCase();
    const mark = (t) => {
      const i = t.toLowerCase().indexOf(words);
      return i < 0 ? esc(t) : `${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + words.length))}</mark>${esc(t.slice(i + words.length))}`;
    };
    pane.innerHTML = head + (byFile.size ? `<div class="sresults">${[...byFile].map(([path, hits]) => `<div class="sfile"><div class="sfile-name mono small">${ic('file', 14)}${esc(path)} <span class="muted">· ${hits.length}</span></div>
      ${hits.map((h) => `<button type="button" class="shit" data-act="search-go" data-path="${esc(path)}" data-line="${h.line}"><span class="n">${h.line}</span><span class="t">${mark(h.text.trim())}</span></button>`).join('')}</div>`).join('')}</div>`
      : `<div class="empty">${t('Aucun résultat.')}</div>`);
  }

  /* --- Ctrl P : ouvrir un fichier par son nom --- */
  async function openFinder() {
    if ($('#finder')) return;
    const d = document.createElement('dialog');
    d.id = 'finder';
    d.className = 'palette';
    d.innerHTML = `<div class="pal-in">${ic('file', 18)}<input id="fd-q" placeholder="${t('Nom du fichier dans {name}', { name: esc(info.name) })}" autocomplete="off" aria-label="${t('Fichier')}" aria-controls="fd-list"></div>
      <ul id="fd-list" role="listbox" aria-label="${t('Fichiers')}"><li class="muted">${t('Chargement…')}</li></ul>
      <div class="pal-foot small muted"><span><kbd>↑</kbd><kbd>↓</kbd> ${t('choisir')}</span><span><kbd>${t('Entrée')}</kbd> ${t('ouvrir')}</span><span><kbd>${t('Échap')}</kbd> ${t('fermer')}</span></div>`;
    document.body.append(d);
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.showModal();
    let files = [], items = [], sel = 0;
    const list = $('#fd-list', d), inp = $('#fd-q', d);
    const draw = () => {
      const q = inp.value.toLowerCase().replace(/\s+/g, '');
      items = q ? files.map((f) => [fuzzyScore(q, f), f]).filter((x) => x[0] >= 0).sort((a, b) => b[0] - a[0]).slice(0, 14).map((x) => x[1]) : files.slice(0, 14);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.innerHTML = items.length ? items.map((f, i) => {
        const cut = f.lastIndexOf('/');
        return `<li role="option" id="fd-${i}" aria-selected="${i === sel}" data-i="${i}">${ic('file', 15)}<span class="grow ellipsis"><b>${esc(f.slice(cut + 1))}</b> <span class="small muted mono">${esc(cut > 0 ? f.slice(0, cut) : '')}</span></span></li>`;
      }).join('') : `<li class="muted" aria-disabled="true">${t('Aucun fichier')}</li>`;
      inp.setAttribute('aria-activedescendant', items.length ? `fd-${sel}` : '');
      $('[aria-selected=true]', list)?.scrollIntoView({ block: 'nearest' });
    };
    const run = (i) => { const f = items[i]; if (!f) return; d.close(); openInFiles(f); };
    inp.oninput = () => { sel = 0; draw(); };
    inp.onkeydown = (e) => {
      const n = Math.max(items.length, 1);
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % n; draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + n) % n; draw(); } else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    };
    list.onclick = (e) => { const li = e.target.closest('[data-i]'); if (li) run(+li.dataset.i); };
    inp.focus();
    try { files = await api('GET', `${P}/files`); } catch (e) { fail(e); }
    if (d.open) draw();
  }
  async function uploadFiles(files) {
    const dir = targetDir();
    let ok = 0;
    for (const f of files) {
      try { await api('PUT', `${P}/upload?path=${enc(joinPath(dir, f.webkitRelativePath || f.name))}`, f); ok++; } catch (e) { fail(e); }
    }
    if (ok) { toast(dir ? tp(ok, '{n} fichier envoyé dans {dir}', '{n} fichiers envoyés dans {dir}', { dir }) : tp(ok, '{n} fichier envoyé', '{n} fichiers envoyés')); S.expanded.add(dir); refreshTree(); }
  }

  /* --- git --- */
  async function loadGit() {
    try { S.git = await api('GET', `${P}/git`); } catch (_) { S.git = null; }
    if (!S.git?.repo) S.git = { repo: false, changes: [], log: [] };
  }
  function drawGit() {
    if (S.left || S.tab !== 'git' || !$('#pane')) return;
    const g = S.git;
    if (!g) { $('#pane').innerHTML = '<div class="card"><div class="skeleton"><span class="spin"></span></div></div>'; return; }
    if (!g.repo) {
      $('#pane').innerHTML = `<div class="card empty stack" style="align-items:center">${t('Ce dossier n’est pas un dépôt Git.')}<button class="btn primary" data-act="git-init">${t('Initialiser Git')}</button></div>`;
      return;
    }
    for (const p of [...S.unchecked]) if (!g.changes.some((c) => c.path === p)) S.unchecked.delete(p);
    const chosen = g.changes.filter((c) => !S.unchecked.has(c.path)).length;
    const msg = $('#commit-msg')?.value || S.commitMsg || '';
    $('#pane').innerHTML = `<div class="${g.changes.length ? 'ov' : 'stack'}" style="gap:16px">
      <div class="stack" style="gap:16px;min-width:0">
      <section class="card" style="overflow:hidden">
        <div class="card-head sm"><h2>${g.changes.length ? tp(g.changes.length, '{n} modification', '{n} modifications') : t('Aucune modification')}</h2>
          <button class="btn sm ghost" data-act="branches" aria-haspopup="menu" title="${t('Changer de branche')}">${ic('branch', 14)}<span class="mono">${esc(g.branch)}</span>${ic('chevronDown', 13)}</button></div>
        ${g.changes.length ? `<div class="row small" style="padding:8px 14px 0;justify-content:space-between"><label class="row nowrap" style="gap:8px"><input type="checkbox" class="chk" data-act="check-all" ${chosen === g.changes.length ? 'checked' : ''}>${t('{n} sur {total} dans le commit', { n: chosen, total: g.changes.length })}</label></div>` : ''}
        <div class="stack" style="gap:1px;padding:6px">
          ${g.changes.length ? g.changes.map((c) => `<div class="change-row"><input type="checkbox" class="chk" data-act="check" data-path="${esc(c.path)}" aria-label="${t('Inclure {path}', { path: esc(c.path) })}" ${S.unchecked.has(c.path) ? '' : 'checked'}>
            <button class="change" data-act="diff" data-path="${esc(c.path)}" aria-pressed="${c.path === S.change}">
            <span class="k ${c.kind === 'A' ? 'c-ok' : c.kind === 'D' ? 'c-err' : 'c-warn'}">${esc(c.kind)}</span><span class="p">${esc(c.path)}</span>
            <span class="small"><span class="c-ok">+${c.add}</span>${c.del ? ` <span class="c-err">−${c.del}</span>` : ''}</span></button></div>`).join('')
    : `<div class="empty-ok small">${ic('check', 16, 2)}${t('Tout est validé.')}</div>`}
        </div>
        ${S.change ? `<div class="diff-head"><span class="mono small ellipsis">${esc(S.change)}</span>${diffSeg()}</div><div class="diffview">${renderDiff(S.diff, diffMode, { showNames: false })}</div>` : ''}
      </section>
      <section class="card" style="overflow:hidden"><div class="card-head sm"><h2>${t('Branches en parallèle')}</h2><button class="btn sm tonal" data-act="copy-new">${ic('plus', 16, 2)}${t('Nouvelle')}</button></div>
        <div id="copies" class="copies"></div></section>
      <section class="card" style="overflow:hidden"><div class="card-head sm"><h2>${t('Historique')}</h2>${g.remote ? `<div class="row nowrap" style="gap:12px"><span class="small muted hide-sm" title="${esc(g.remote)}">${esc(remoteInfo(g.remote, S.accounts)?.name || '')} · ${esc(syncText(g))}</span><button class="btn sm" data-act="git-sync" title="${t('Vérifier auprès du dépôt distant')}">${ic('refresh', 16, 2)}${t('Vérifier')}</button><button class="btn sm" data-act="pull">${ic('download', 16, 2)}${t('Récupérer')}</button></div>`
    : `<button class="btn sm tonal" data-act="link-remote">${ic('branch', 16, 2)}${t('Relier à un dépôt distant')}</button>`}</div>
        <div id="git-log">${S.log ? (S.log.length ? S.log.map((c) => `<button type="button" class="list-row commit-row" data-act="commit-show" data-rev="${esc(c.hash)}">
          <span class="mono small muted">${esc(c.short)}</span><span class="grow ellipsis" style="text-align:left">${esc(c.msg)}${c.refs ? ` <span class="pill sm">${esc(c.refs.replace('HEAD -> ', ''))}</span>` : ''}</span>
          <span class="small muted nowrap hide-sm">${esc(c.author)}</span><span class="small muted nowrap">${ago(c.when)}</span></button>`).join('')
    + (S.logEnd ? '' : `<div class="card-pad" style="padding-top:8px"><button class="btn sm" data-act="log-more">${t('Voir les commits plus anciens')}</button></div>`)
    : `<div class="empty small">${t('Aucun commit pour l’instant.')}</div>`) : '<div class="skeleton"><span class="spin"></span></div>'}</div></section>
      </div>
      ${g.changes.length ? `<div class="stack" style="gap:16px">
        <section class="card card-pad stack">
          <label class="field"><span>${t('Message du commit')}</span><textarea id="commit-msg" rows="3" placeholder="${t('Décris les changements')}">${esc(msg)}</textarea></label>
          <button class="btn ghost sm" style="align-self:flex-start" data-act="suggest">${ic('spark', 14)}${t('Rédiger avec {agent}', { agent: agentShort(agentsInfo?.default_agent) })}</button>
          <button class="btn primary" data-act="commit" ${chosen ? '' : 'disabled'}>${ic('check', 16, 2)}${g.remote ? t('Valider et pousser') : t('Valider le commit')}${chosen < g.changes.length ? ` ${tp(chosen, '{n} fichier', '{n} fichiers')}` : ''}</button>
        </section>
      </div>` : ''}</div>`;
    if (!S.log) loadLog();
    drawCopies();
    if (!S.copies) loadCopies();
  }
  async function loadLog(more = false) {
    try {
      const list = await api('GET', `${P}/git/log?skip=${more ? S.log.length : 0}&n=30`);
      S.log = more ? S.log.concat(list) : list;
      S.logEnd = list.length < 30;
    } catch (_) { S.log = S.log || []; S.logEnd = true; }
    if (S.tab === 'git') drawGit();
  }
  async function showCommit(rev) {
    const d = document.createElement('dialog');
    d.className = 'wide';
    d.innerHTML = '<div class="skeleton"><span class="spin"></span></div>';
    document.body.append(d);
    d.addEventListener('close', () => d.remove());
    d.showModal();
    let c;
    try { c = await api('GET', `${P}/git/show?rev=${enc(rev)}`); } catch (e) { d.innerHTML = `<div class="notice err">${esc(e.message)}</div>`; return; }
    // Découpe du diff : par fichier, puis par bloc (@@), pour ne garder que ce qui correspond au filtre
    const chunks = [];
    for (const line of (c.diff || '').split('\n')) {
      if (line.startsWith('diff --git ') || !chunks.length) {
        chunks.push({ path: line.replace(/^diff --git a\/.* b\/(.*)$/, '$1'), head: [line], hunks: [] });
        continue;
      }
      const f = chunks[chunks.length - 1];
      if (line.startsWith('@@')) f.hunks.push([line]);
      else if (f.hunks.length) f.hunks[f.hunks.length - 1].push(line);
      else f.head.push(line);
    }
    let q = '';
    const total = c.files.length;
    d.innerHTML = `<div class="stack" style="gap:12px">
      <div class="row" style="justify-content:space-between;align-items:flex-start"><div style="min-width:0"><h2 style="margin:0 0 4px">${esc(c.message.split('\n')[0])}</h2>
        <span class="small muted"><span class="mono">${esc(c.hash.slice(0, 10))}</span> · ${esc(c.author)} · ${new Date(c.when * 1000).toLocaleString(LOCALE)}</span></div>
        <div class="row nowrap"><span id="cd-seg">${diffSeg()}</span><button class="btn icon" data-x="close" aria-label="${t('Fermer')}">${ic('x', 20)}</button></div></div>
      ${c.message.includes('\n') ? `<div class="quote">${esc(c.message.split('\n').slice(1).join('\n').trim())}</div>` : ''}
      <div class="cfilter"><label class="searchbox">${ic('search', 20, 2)}<span class="sr">${t('Filtrer le commit')}</span><input type="search" id="cd-q" placeholder="${t('Filtre rapide : nom de fichier ou code')}" autocomplete="off" spellcheck="false"></label>
        <span class="small muted" id="cd-n"></span></div>
      <div class="cfiles" id="cd-files">${c.files.map((f) => `<button type="button" class="chip sm" data-f="${esc(f.path)}" title="${esc(f.path)}">${esc(f.path.split('/').pop())} <span class="c-ok">+${f.add}</span>${f.del ? ` <span class="c-err">−${f.del}</span>` : ''}</button>`).join('')}</div>
      <div class="diffview tall" id="cd-diff"></div></div>`;
    const drawDiff = () => {
      const ql = q.trim().toLowerCase();
      let text = c.diff, nfiles = total;
      if (ql) {
        const out = [];
        nfiles = 0;
        for (const f of chunks) {
          const hunks = f.path.toLowerCase().includes(ql) ? f.hunks : f.hunks.filter((h) => h.slice(1).some((l) => l.toLowerCase().includes(ql)));
          if (!hunks.length && !f.path.toLowerCase().includes(ql)) continue;
          nfiles++;
          out.push(...f.head, ...hunks.flat());
        }
        text = out.join('\n');
      }
      const box = $('#cd-diff', d);
      box.innerHTML = ql && !nfiles ? `<div class="empty">${t('Rien ne correspond à « {q} » dans ce commit.', { q: esc(q.trim()) })}</div>` : renderDiff(text, diffMode);
      let hits = 0;
      if (ql) {
        // Surligne les occurrences dans le code et les noms de fichiers
        const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) if (walker.currentNode.nodeValue.toLowerCase().includes(ql)) nodes.push(walker.currentNode);
        for (const n of nodes.slice(0, 1500)) {
          const tx = n.nodeValue, frag = document.createDocumentFragment();
          let i = 0, j;
          while ((j = tx.toLowerCase().indexOf(ql, i)) >= 0) {
            frag.append(tx.slice(i, j));
            const m = document.createElement('mark');
            m.textContent = tx.slice(j, j + ql.length);
            frag.append(m);
            hits++;
            i = j + ql.length;
          }
          frag.append(tx.slice(i));
          n.replaceWith(frag);
        }
        box.querySelector('mark')?.scrollIntoView({ block: 'center' });
      }
      $('#cd-n', d).textContent = ql ? `${tp(nfiles, '{n} fichier sur {total}', '{n} fichiers sur {total}', { total })}${hits ? ` · ${tp(hits, '{n} occurrence', '{n} occurrences')}` : ''}` : `${tp(total, '{n} fichier', '{n} fichiers')} · +${c.files.reduce((a, f) => a + f.add, 0)} −${c.files.reduce((a, f) => a + f.del, 0)}`;
      $$('[data-f]', d).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === q)));
    };
    drawDiff();
    const inp = $('#cd-q', d);
    let timer = null;
    inp.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { q = inp.value; drawDiff(); }, 120); };
    inp.focus();
    d.onclick = (e) => {
      if (e.target === d) { d.close(); return; }
      const b = e.target.closest('[data-x], [data-act=diff-mode], [data-f]');
      if (!b) return;
      if (b.dataset.x === 'close') d.close();
      else if (b.dataset.f !== undefined) { q = q === b.dataset.f ? '' : b.dataset.f; inp.value = q; drawDiff(); }
      else { setDiffMode(b.dataset.m); $('#cd-seg', d).innerHTML = diffSeg(); drawDiff(); }
    };
  }
  async function branchMenu(anchor) {
    let b;
    try { b = await api('GET', `${P}/git/branches`); } catch (e) { fail(e); return; }
    menu(anchor, [
      ...b.local.map((x) => ({ label: x.current ? t('{name} (actuelle)', { name: x.name }) : x.name, icon: x.current ? 'check' : 'branch', run: () => { if (!x.current) checkout(x.name); } })),
      ...b.remote.slice(0, 10).map((r) => ({ label: t('{name} (distante)', { name: r }), icon: 'download', run: () => checkout(r) })),
      { label: t('Travailler sur une branche en parallèle…'), icon: 'branch', run: newCopy },
      { label: t('Nouvelle branche…'), icon: 'plus', run: async () => {
        const name = await ask({ title: t('Nouvelle branche'), label: t('Créée depuis {branch}', { branch: b.current }), placeholder: t('ma-fonctionnalite'), okLabel: t('Créer') });
        if (name) checkout(name, true);
      } },
    ]);
  }
  async function checkout(branch, create = false) {
    try {
      await api('POST', `${P}/git/checkout`, { branch, create });
      toast(create ? t('Branche {branch} créée', { branch }) : t('Passé sur {branch}', { branch: branch.replace(/^origin\//, '') }));
      S.log = null; S.change = null;
      await loadGit(); drawPane(); drawTabs(); drawPills(); refreshTree();
    } catch (e) { fail(e); }
  }

  /* --- Claude --- */
  async function loadClaude() {
    const req = (S.claudeReq = (S.claudeReq || 0) + 1);
    let c;
    try { c = await api('GET', `${P}/claude`); } catch (_) { return; }
    if (S.left || req !== S.claudeReq) return; // une requête plus récente est partie entre-temps
    S.claude = c;
    const { output, ...meta } = c;
    const key = JSON.stringify(meta);
    const outChanged = output !== S.claudeOut;
    S.claudeOut = output;
    if (key !== S.claudeKey) {
      S.claudeKey = key;
      drawSbar(); drawPills(); drawTabs();
      if (S.tab === 'claude') drawClaudeTab();
      if (S.drawer) drawDrawerHead();
    } else if (outChanged && S.tab === 'claude') {
      const j = $('#journal');
      if (j) {
        const atEnd = j.scrollHeight - j.scrollTop - j.clientHeight < 24;
        j.textContent = output || '';
        if (atEnd) j.scrollTop = j.scrollHeight;
      }
    }
  }
  /* Session interactive « du dépôt » : tmux nommé comme le dossier, Claude lancé dedans */
  async function loadRepo() {
    let r;
    const br = S.br, ag = S.agent;
    try { r = await api('GET', `${P}/claude/repo${BQ()}`); } catch (e) {
      // Copie de la branche supprimée entre-temps : retour au dossier principal
      if (e.status === 404 && br && br === S.br) pickBranch(null);
      return;
    }
    if (S.left || br !== S.br || ag !== S.agent) return;
    const k = JSON.stringify(r);
    if (k === S.repoKey) return;
    const first = !S.repo;
    S.repo = r; S.repoKey = k;
    drawPills(); drawTabs();
    if (first) drawSbar();
    if (S.tab === 'claude') {
      drawRepoParts();
      // Session ouverte ailleurs (page Sessions, SSH…) pendant qu'on regarde l'onglet : on l'affiche
      if (r.exists && !S.disposeRepo && $('#claude-term .cterm-off')) mountRepoTerm();
    }
  }
  function drawRepoParts() {
    const r = S.repo;
    if (!r || !$('#repo-acts')) return;
    $('#repo-name').textContent = `tmux · ${r.name}`;
    if (isCodex()) {
      // Codex : pas de Remote Control (propre à Claude) ; état lu à l'écran de son terminal
      setHTML($('#repo-st'), !r.exists ? `<span class="pill sm">${t('Session fermée')}</span>`
        : !r.claude ? `<span class="pill sm warn"><span class="dot"></span>${t('Codex arrêté · shell')}</span>`
          : r.status === 'waiting' ? `<span class="pill sm warn" title="${esc(r.question || '')}"><span class="dot"></span>${t('Codex attend ta validation')}</span>${ctxPill(r.context)}`
            : `<span class="pill sm ok"><span class="dot"></span>${r.status === 'busy' ? t('Codex travaille') : t('Codex actif')}</span>${ctxPill(r.context)}`);
      setHTML($('#repo-acts'), `${r.exists && !r.claude ? `<button class="btn sm primary" data-act="repo-restart">${ic('play', 16, 2)}${t('Relancer Codex')}</button>` : ''}
        <button class="btn icon sm" data-act="repo-more" aria-label="${t('Plus d’actions sur la session tmux')}">${ic('dotsV', 20)}</button>`);
      return;
    }
    setHTML($('#repo-st'), !r.exists ? `<span class="pill sm">${t('Session fermée')}</span>`
      : r.claude ? `<span class="pill sm ok"><span class="dot"></span>${r.status === 'busy' ? t('Claude travaille') : t('Claude actif')}</span>${ctxPill(r.context)}` : `<span class="pill sm warn"><span class="dot"></span>${t('Claude arrêté · shell')}</span>`);
    setHTML($('#repo-acts'), `${r.exists && !r.claude ? `<button class="btn sm primary" data-act="repo-restart">${ic('play', 16, 2)}${t('Relancer Claude')}</button>` : ''}
      ${r.rc ? `<button class="btn sm tonal rc-btn on" data-act="rc-pop" aria-haspopup="true" title="${t('Remote Control actif : lien et QR code')}">${ic('phone', 16, 2)}<span class="hide-sm">Remote Control</span><span class="dot ok"></span></button>`
    : r.claude ? `<button class="btn sm rc-btn" data-act="repo-rc" title="${t('Piloter cette session depuis l’app Claude ou claude.ai (Helmshell tape /remote-control)')}">${ic('phone', 16, 2)}<span class="hide-sm">Remote Control</span></button>` : ''}
      <button class="btn icon sm" data-act="repo-more" aria-label="${t('Plus d’actions sur la session tmux')}">${ic('dotsV', 20)}</button>`);
  }
  function drawHeadless() {
    const box = $('#headless');
    if (!box) return;
    const c = S.claude;
    setHTML(box, c?.running ? `<section class="card card-pad stack" style="gap:10px"><h3>${t('Session en arrière-plan')}</h3>
      <span class="small muted">${t('Une session {cmd} tourne aussi pour ce projet : {status}.', { cmd: '<span class="mono">claude remote-control</span>', status: esc(sessionStatus(c).short.toLowerCase()) })}</span>
      <div class="row" style="gap:8px"><button class="btn sm" data-act="see-term">${ic('term', 16)}${t('Voir son terminal')}</button>${c.url ? `<a class="btn sm" href="${esc(c.url)}" target="_blank" rel="noopener">${ic('external', 16)}claude.ai</a>` : ''}<button class="btn sm danger" data-act="stop">${ic('stop', 16)}${t('Arrêter')}</button></div></section>` : '');
  }
  /* --- Branches en parallèle : une copie de travail (worktree) et une session Claude par branche --- */
  async function loadCopies() {
    try { S.copies = await api('GET', `${P}/branches`); } catch (_) { S.copies = []; }
    if (S.left) return;
    if (S.br && !S.copies.some((c) => c.branch === S.br)) { pickBranch(null); return; }
    drawBrStrip();
    if (S.tab === 'git') drawCopies();
  }
  function drawBrStrip() {
    const box = $('#brstrip');
    if (!box) return;
    const cs = S.copies || [];
    const main = S.git?.branch || info.git?.branch || t('principal');
    const chip = (b, label, sub, on, dot) => `<button type="button" class="brchip" data-act="br-pick" data-b="${esc(b)}" aria-pressed="${on}" title="${esc(sub)}">${ic('branch', 14, 2)}<span class="mono ellipsis">${esc(label)}</span>${dot ? `<span class="dot ${dot}"></span>` : ''}</button>`;
    setHTML(box, chip('', main, t('Dossier principal'), !S.br, '')
      + cs.map((c) => chip(c.branch, c.branch, t('Copie de travail : {path}', { path: c.path }), c.branch === S.br, c.claude ? (c.status === 'busy' ? 'warn' : 'ok') : '')).join('')
      + (info.git || S.git?.repo ? `<button type="button" class="brchip add" data-act="copy-new" title="${t('Travailler sur une autre branche en même temps')}">${ic('plus', 14, 2)}<span>${t('Branche')}</span></button>` : ''));
  }
  function pickBranch(b, start = false) {
    b = b || null;
    if (start) claudeStartFor = slug;
    if (b === S.br && !start) return;
    S.br = b;
    disposeRepoTerm();
    S.repo = null; S.repoKey = '';
    if (S.tab !== 'claude') { setTab('claude'); return; }
    history.replaceState(null, '', claudeHash(slug, S.br, S.agent));
    drawBrStrip();
    if ($('#claude-term')) mountRepoTerm();
  }
  // Onglet Agents : passe de Claude Code à Codex (ou l'inverse) ; chacun garde sa session tmux
  function pickAgent(a) {
    a = agentId(a);
    setAgentPref(slug, a);
    if (a === S.agent) { if (S.tab !== 'claude') setTab('claude'); return; }
    S.agent = a;
    disposeRepoTerm();
    S.repo = null; S.repoKey = '';
    drawClaudeBtn(); drawPills(); drawTabs();
    if (S.tab !== 'claude') { setTab('claude'); return; }
    history.replaceState(null, '', claudeHash(slug, S.br, S.agent));
    $('#pane').innerHTML = '';
    drawClaudeTab();
  }
  async function newCopy() {
    let b = { local: [], remote: [], current: '' };
    try { b = await api('GET', `${P}/git/branches`); } catch (_) { /* liste vide */ }
    const taken = new Set([b.current, ...(S.copies || []).map((c) => c.branch)]);
    const existing = [...b.local.map((x) => x.name), ...b.remote.map((r) => r.replace(/^[^/]+\//, ''))].filter((x, i, a) => !taken.has(x) && a.indexOf(x) === i);
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog">
      <h2>${t('Travailler sur une autre branche')}</h2>
      <p class="muted small" style="margin:0">${t('La branche a sa propre copie du projet (dans {dir}, à côté des projets) et ses propres sessions d’IA (Claude Code, Codex). Le dossier principal reste sur {branch}.', { dir: '<span class="mono">.branches</span>', branch: `<span class="mono">${esc(b.current || t('sa branche'))}</span>` })}</p>
      <label class="field"><span>${t('Branche')}</span><input name="b" list="br-list" required maxlength="120" placeholder="${t('ma-fonctionnalite')}" autocomplete="off" spellcheck="false">
        <span class="hint">${t('Nouvelle branche créée depuis {branch}, ou branche existante (locale ou sur le dépôt distant).', { branch: esc(b.current || t('la branche courante')) })}</span></label>
      <datalist id="br-list">${existing.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
      ${existing.length ? `<div class="row" style="gap:6px;flex-wrap:wrap">${existing.slice(0, 8).map((x) => `<button type="button" class="chip sm mono" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
      <label class="row small" style="gap:8px"><input type="checkbox" name="claude" checked class="chk">${S.agent === 'codex' ? t('Ouvrir Codex sur cette branche') : t('Ouvrir Claude sur cette branche')}</label>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn ghost" data-close>${t('Annuler')}</button>
        <button class="btn primary" value="ok">${ic('branch', 18, 2)}${t('Créer la copie')}</button>
      </div></form>`;
    document.body.append(d);
    const f = $('form', d);
    $('[data-close]', d).onclick = () => d.close('cancel');
    for (const c of $$('[data-v]', d)) c.onclick = () => { f.b.value = c.dataset.v; f.b.focus(); };
    d.addEventListener('close', async () => {
      const name = f.b.value.trim(), open = f.claude.checked;
      d.remove();
      if (d.returnValue !== 'ok' || !name) return;
      try {
        const r = await api('POST', `${P}/branches`, { branch: name });
        toast(r.existing ? t('Copie de {branch} prête', { branch: r.branch }) : t('Branche {branch} créée avec sa copie', { branch: r.branch }));
        S.copies = null;
        await loadCopies();
        if (open) pickBranch(r.branch, true); else if (S.tab === 'git') drawCopies();
      } catch (e) { fail(e); }
    });
    d.showModal();
    f.b.focus();
  }
  async function mergeCopy(c) {
    const into = c.base || t('la branche principale');
    const v = { branch: c.branch, into };
    if (!await confirmBox(t('Fusionner {branch} dans {into} ?', v),
      `${c.ahead ? tp(c.ahead, '{n} commit de {branch} rejoint {into}, dans le dossier principal.', '{n} commits de {branch} rejoignent {into}, dans le dossier principal.', v) : t('{branch} n’a pas de commit de plus que {into}, dans le dossier principal.', v)} ${t('Rien n’est poussé sur le dépôt distant. En cas de conflit, rien n’est modifié.')}`, t('Fusionner'))) return;
    try {
      await api('POST', `${P}/branches/merge`, { branch: c.branch });
      toast(t('{branch} fusionnée dans {into}', v), false, { label: t('Supprimer la copie'), run: () => removeCopy(c, { deleteBranch: true, ask: false }) });
      S.log = null;
      await loadGit(); loadCopies(); drawPane(); drawTabs(); drawPills(); refreshTree();
    } catch (e) { fail(e); }
  }
  async function removeCopy(c, { deleteBranch = false, ask: askFirst = true, force = false } = {}) {
    if (askFirst) {
      const d = document.createElement('dialog');
      const dir = { path: `<span class="mono">${esc(c.path)}</span>` };
      d.innerHTML = `<form method="dialog"><h2>${t('Supprimer la copie de {branch} ?', { branch: esc(c.branch) })}</h2>
        <p class="muted" style="margin:0">${c.session || c.codex_session ? t('Le dossier {path} est supprimé, et ses sessions d’IA fermées.', dir) : t('Le dossier {path} est supprimé.', dir)} ${t('Les commits restent dans le dépôt.')}${c.changes ? ` <b class="c-err">${tp(c.changes, '{n} fichier non validé sera perdu.', '{n} fichiers non validés seront perdus.')}</b>` : ''}</p>
        <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" name="del" class="chk" ${c.ahead ? '' : 'checked'}><span>${t('Supprimer aussi la branche {branch}', { branch: esc(c.branch) })}<br><span class="muted">${t('Seulement si elle est fusionnée. Jamais sur le dépôt distant (GitHub…).')}</span></span></label>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>${t('Annuler')}</button><button class="btn danger" value="ok">${t('Supprimer la copie')}</button></div></form>`;
      document.body.append(d);
      $('[data-close]', d).onclick = () => d.close('cancel');
      const ok = await new Promise((res) => { d.addEventListener('close', () => res(d.returnValue === 'ok')); d.showModal(); });
      deleteBranch = $('[name=del]', d).checked;
      d.remove();
      if (!ok) return;
      force = c.changes > 0;
    }
    try {
      const r = await api('POST', `${P}/branches/remove`, { branch: c.branch, delete_branch: deleteBranch, force });
      toast(r.deleted_branch ? t('Copie de {branch} supprimée, branche supprimée', { branch: c.branch })
        : r.note ? t('Copie de {branch} supprimée ({note})', { branch: c.branch, note: r.note }) : t('Copie de {branch} supprimée', { branch: c.branch }));
      if (S.br === c.branch) pickBranch(null);
      await loadCopies();
    } catch (e) { fail(e); }
  }
  function drawCopies() {
    const box = $('#copies');
    if (!box) return;
    const cs = S.copies;
    if (!cs) { box.innerHTML = '<div class="skeleton"><span class="spin"></span></div>'; return; }
    const main = S.git?.branch || '';
    setHTML(box, cs.length ? cs.map((c) => `<div class="copy-row">
        <span class="lead" aria-hidden="true">${ic('branch', 18, 2)}</span>
        <div class="two" style="flex:1;min-width:0"><span class="row nowrap" style="gap:8px;min-width:0"><b class="mono ellipsis">${esc(c.branch)}</b>${c.claude ? `<span class="pill sm ${c.status === 'busy' ? 'warn' : 'ok'}">${agentLogo('claude', 14)}${c.status === 'busy' ? t('Claude travaille') : 'Claude'}</span>` : ''}${c.codex ? `<span class="pill sm ${c.codex_status === 'idle' || !c.codex_status ? 'ok' : 'warn'}">${agentLogo('codex', 14)}${c.codex_status === 'busy' ? t('Codex travaille') : c.codex_status === 'waiting' ? t('Codex attend ta validation') : 'Codex'}</span>` : ''}</span>
          <span class="sub ellipsis">${[c.changes ? tp(c.changes, '{n} non validé', '{n} non validés') : '', c.ahead ? tp(c.ahead, '{n} commit d’avance', '{n} commits d’avance') : t('à jour'), c.behind ? t('{n} de retard sur {branch}', { n: c.behind, branch: esc(main) }) : ''].filter(Boolean).join(' · ')}${c.subject ? ` · ${esc(c.subject)}` : ''}</span></div>
        <div class="row nowrap" style="gap:6px">
          ${aiAgents().map((a) => `<button class="btn sm tonal" data-act="copy-claude" data-agent="${a}" data-b="${esc(c.branch)}" title="${a === 'codex' ? t('Ouvrir Codex sur cette branche') : t('Ouvrir Claude sur cette branche')}">${agentLogo(a, 16)}${agentShort(a)}</button>`).join('')}
          <button class="btn sm" data-act="copy-merge" data-b="${esc(c.branch)}" ${c.ahead ? '' : 'disabled'} title="${t('Fusionner dans {branch}', { branch: esc(main) })}">${ic('download', 16, 2)}<span class="hide-sm">${t('Fusionner')}</span></button>
          <button class="btn icon sm" data-act="copy-remove" data-b="${esc(c.branch)}" aria-label="${t('Supprimer la copie de {branch}', { branch: esc(c.branch) })}">${ic('trash', 16)}</button>
        </div></div>`).join('')
      : `<div class="empty small">${t('Aucune. Crée une copie pour faire travailler une IA sur une autre branche sans toucher à {branch}.', { branch: `<span class="mono">${esc(main || t('la branche courante'))}</span>` })}</div>`);
  }
  function disposeRepoTerm() {
    S.repoGen++;
    if (S.disposeRepo) { S.disposeRepo(); S.disposeRepo = null; }
  }
  function openClaude(a) {
    claudeStartFor = slug;
    if (a && agentId(a) !== S.agent) { pickAgent(a); return; }
    if (S.tab !== 'claude') { setTab('claude'); return; }
    if (!S.disposeRepo) mountRepoTerm();
  }
  async function mountRepoTerm() {
    const box = $('#claude-term');
    if (!box) return;
    if (!S.repo) await loadRepo();
    if (S.left || !$('#claude-term')) return;
    if (!S.repo?.exists && claudeStartFor !== slug) {
      // Pas de session : rien ne démarre tant qu'on ne le demande pas
      disposeRepoTerm();
      const nm = { name: esc(S.repo?.name || slug) }, bm = { branch: esc(S.br || '') };
      const txt = isCodex()
        ? [S.br ? t('Aucune session Codex sur la branche {branch}', bm) : t('Aucune session Codex ouverte dans ce projet'),
          S.br ? t('Codex s’ouvrira dans une session tmux « {name} », dans la copie de travail de cette branche.', nm) : t('Codex s’ouvrira dans une session tmux « {name} ».', nm), t('Ouvrir Codex')]
        : [S.br ? t('Aucune session Claude sur la branche {branch}', bm) : t('Aucune session Claude ouverte dans ce projet'),
          S.br ? t('Claude s’ouvrira dans une session tmux « {name} », dans la copie de travail de cette branche.', nm) : t('Claude s’ouvrira dans une session tmux « {name} ».', nm), t('Ouvrir Claude')];
      $('#claude-term').innerHTML = `<div class="cterm-off stack">
        ${agentLogo(S.agent, 40)}
        <b>${txt[0]}</b>
        <span class="small">${txt[1]} ${t('Tu peux aussi la rejoindre en SSH.')}</span>
        <button class="btn primary" data-act="claude-start-off">${ic('play', 18, 2)}${txt[2]}</button>
        <label class="cont-chk"><input type="checkbox" id="cont-chk" ${contPref() ? 'checked' : ''}><span class="box" aria-hidden="true">${ic('check', 14, 3)}</span>${t('Reprendre la dernière conversation')}</label></div>`;
      $('#cont-chk').onchange = (e) => { try { localStorage.setItem('helmshell.cont', e.target.checked ? '1' : '0'); } catch (_) { /* rien */ } };
      return;
    }
    if (claudeStartFor === slug) claudeStartFor = null;
    $('#claude-term').innerHTML = '<div class="skeleton"><span class="spin"></span></div>';
    disposeRepoTerm();
    const g = S.repoGen;
    let d;
    try { d = await mountTerminal(box, 'repo', slug, { branch: S.br, agent: S.agent }); } catch (e) {
      if (g === S.repoGen && $('#claude-term')) $('#claude-term').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
      return;
    }
    if (S.left || g !== S.repoGen || S.tab !== 'claude' || !$('#claude-term')) d(); else S.disposeRepo = d;
    S.repoKey = '';
    loadRepo();
  }
  // Agent des tâches de fond : celui choisi dans le formulaire, sinon celui de l'onglet s'il est installé
  function taskAgent() {
    const avail = availableAgents();
    if (S.taskAgent && avail.includes(S.taskAgent)) return S.taskAgent;
    return avail.includes(S.agent) || !avail.length ? S.agent : avail.includes(agentsInfo?.default_agent) ? agentsInfo.default_agent : avail[0];
  }
  function modeOptions(a, cur) { return agentModes(a).map((m) => `<option value="${esc(m.id)}" ${m.id === cur ? 'selected' : ''}>${esc(m.label)}</option>`).join(''); }
  async function drawAgentHistory() {
    const ag = S.agent;
    try {
      // Conversations vides (lancement abandonné, question de confiance…) : rien à lire ni à reprendre
      const list = ag === 'codex' ? await api('GET', `${P}/agents/history?agent=codex&limit=12`) : await api('GET', `${P}/claude/history`);
      const h = list.filter((x) => x.prompts > 0);
      if (!$('#history') || ag !== S.agent) return;
      $('#history').innerHTML = h.length ? h.slice(0, 12).map((x) => `<div class="chist-row">
          <button type="button" class="chist-main" data-act="transcript" data-id="${esc(x.id)}" title="${t('Lire la conversation')}"><span class="ellipsis">${esc(x.title)}</span><span class="small muted">${ago(x.mtime)} · ${tp(x.prompts, '{n} message', '{n} messages')}${x.task ? ` · ${t('tâche de fond')}` : ''}</span></button>
          <button type="button" class="btn icon sm" data-act="h-resume" data-id="${esc(x.id)}" aria-label="${t('Reprendre cette conversation dans le terminal')}" title="${t('Reprendre dans le terminal')}">${ic('play', 16, 2)}</button></div>`).join('')
        : `<div class="empty small">${t('Aucune conversation enregistrée pour ce dossier.')}</div>`;
    } catch (_) { if ($('#history') && ag === S.agent) $('#history').innerHTML = `<div class="empty small">${t('Aucune conversation enregistrée pour ce dossier.')}</div>`; }
  }
  async function drawClaudeTab() {
    if (S.left || S.tab !== 'claude' || !$('#pane')) return;
    if ($('#claude-term')) { drawRepoParts(); drawHeadless(); return; } // déjà monté : on ne touche pas au terminal
    const tAgent = taskAgent();
    const mode = S.taskMode && agentModes(tAgent).some((m) => m.id === S.taskMode) ? S.taskMode : await agentDefaultMode(tAgent);
    if (S.left || S.tab !== 'claude' || !$('#pane') || $('#claude-term')) return;
    const ag = S.agent, name = agentShort(ag);
    const choices = availableAgents();
    const pickTask = choices.length > 1 || (choices.length === 1 && choices[0] !== 'claude');
    $('#pane').innerHTML = `<div class="ctab">
      <section class="card cterm" aria-label="${t('Terminal {agent}', { agent: name })}">
        <div class="card-head sm cterm-head"><div class="row nowrap" style="gap:12px;min-width:0">${agentLogo(ag, 28, 'cterm-logo')}
          <div class="stack" style="gap:2px;min-width:0"><div class="row nowrap" style="gap:8px"><h2>${name}</h2><span id="repo-st" class="row nowrap" style="gap:6px"></span></div>
          <span class="small muted mono ellipsis" id="repo-name" title="${t('Session tmux, aussi joignable en SSH')}">tmux · ${esc(S.repo?.name || slug)}</span></div></div>
          <div class="row nowrap" style="gap:6px" id="repo-acts"></div></div>
        ${showAgentSwitch() ? `<div class="agentbar"><div class="seg sm" role="group" aria-label="${t('Agent')}">${['claude', 'codex'].map((a) => `<button type="button" class="ico" data-act="agent-pick" data-agent="${a}" aria-pressed="${a === ag}">${agentLogo(a, 16)}${AGENT_LABELS[a]}</button>`).join('')}</div></div>` : ''}
        <div class="brstrip" id="brstrip" role="group" aria-label="${t('Branche')}"></div>
        <div class="termbox ctermbox" id="claude-term"><div class="skeleton"><span class="spin"></span></div></div>
        <div class="keybar" role="group" aria-label="${t('Touches à envoyer à {agent}', { agent: name })}">
          ${[['Up', '↑', t('Flèche haut')], ['Down', '↓', t('Flèche bas')], ['Enter', t('Entrée'), t('Entrée')], ['Escape', t('Échap'), t('Échap')], ['Tab', 'Tab', t('Tabulation')], ['C-c', 'Ctrl C', 'Ctrl C']]
    .map(([k, l, a]) => `<button type="button" class="btn sm" data-act="repo-key" data-key="${k}" aria-label="${a}">${l}</button>`).join('')}
        </div>
      </section>
      <div class="stack cside" style="gap:16px;min-width:0">
        <div id="headless"></div>
        <section class="card" style="overflow:hidden">
          <div class="card-head sm"><div class="titles"><h2>${t('Tâches de fond')}</h2><span class="small muted">${pickTask ? t('L’agent travaille seul et te prévient à la fin') : t('Claude travaille seul et te prévient à la fin')}</span></div></div>
          <form class="task-compose" id="task-form">
            <label class="sr" for="task-prompt">${t('Consigne')}</label>
            <textarea id="task-prompt" rows="3" placeholder="${t('Ex. : ajoute des tests pour le module de paiement et corrige ce qui échoue')}">${esc(S.taskDraft || '')}</textarea>
            <div class="row task-opts" style="justify-content:space-between;gap:8px">
              <span class="row" style="gap:6px;min-width:0;flex:1 1 auto">
                ${pickTask ? `<label class="row small nowrap" style="gap:8px;min-width:0"><span class="sr">${t('Agent')}</span><select id="task-agent" class="sm">${choices.map((a) => `<option value="${a}" ${a === tAgent ? 'selected' : ''}>${AGENT_LABELS[a]}</option>`).join('')}</select></label>` : ''}
                <label class="row small nowrap" style="gap:8px;min-width:0"><span class="sr">${t('Permissions')}</span><select id="task-mode" class="sm">${modeOptions(tAgent, mode)}</select></label>
              </span>
              <button class="btn sm primary">${ic('play', 16, 2)}${t('Confier')}</button>
            </div>
          </form>
          <div id="tasks" class="ctasks">${taskRows(S.tasks)}</div>
        </section>
        <section class="card" style="overflow:hidden">
          <div class="card-head sm"><h2>${t('Conversations précédentes')}</h2>${showAgentSwitch() ? `<span class="pill sm">${agentLogo(ag, 14)}${name}</span>` : ''}</div>
          <div class="chist" id="history"><div class="skeleton"><span class="spin"></span></div></div>
        </section>
      </div></div>`;
    $('#task-prompt').oninput = (e) => { S.taskDraft = e.target.value; };
    $('#task-mode').onchange = (e) => { S.taskMode = e.target.value; };
    const tsel = $('#task-agent');
    if (tsel) tsel.onchange = async (e) => {
      S.taskAgent = e.target.value; S.taskMode = null;
      const a = e.target.value, m = await agentDefaultMode(a);
      if ($('#task-mode') && $('#task-agent')?.value === a) $('#task-mode').innerHTML = modeOptions(a, m);
    };
    drawRepoParts(); drawHeadless(); drawBrStrip();
    if (!S.copies) loadCopies();
    mountRepoTerm();
    drawAgentHistory();
  }
  function drawTasks() {
    if (S.tab === 'claude' && $('#tasks')) setHTML($('#tasks'), taskRows(S.tasks));
  }
  /* --- déploiement (Coolify ou Dokploy) --- */
  async function drawDeploy() {
    const pane = $('#pane');
    if (S.left || S.tab !== 'deploiement' || !pane) return;
    if (!DEPLOY.provider) {
      settingsTab = 'deploy'; try { localStorage.setItem('helmshell.stab', 'deploy'); } catch (_) { /* rien */ }
      pane.innerHTML = `<div class="card empty stack" style="align-items:center;gap:14px">${t('Aucun outil de déploiement n’est configuré.')}
        <a class="btn primary" href="#/parametres">${t('Choisir Coolify ou Dokploy')}</a></div>`;
      return;
    }
    const uuid = info.app_id;
    if (!uuid) {
      pane.innerHTML = `<div class="card empty stack" style="align-items:center;gap:14px">${t('Ce projet n’est relié à aucune application {tool}.', { tool: DN() })}
        <span class="small muted">${DEPLOY.features.rollback ? t('Relie-le pour voir ici son état, ses logs, ses variables d’environnement et revenir à une version précédente.') : t('Relie-le pour voir ici son état, ses logs, ses variables d’environnement.')}</span>
        <button class="btn primary" data-act="tab" data-tab="reglages">${t('Relier à {tool}', { tool: DN() })}</button></div>`;
      return;
    }
    const cf = info.app;
    const d = deployStatus(cf);
    pane.innerHTML = `<div class="ov">
      <div class="stack" style="gap:16px;min-width:0">
        <section class="card" style="overflow:hidden"><div class="card-head sm"><h2>${t('Logs de l’application')}</h2>
          <div class="row nowrap" style="gap:8px"><label class="row small nowrap" style="gap:6px"><input type="checkbox" class="chk" data-act="cf-follow" ${S.cf.follow ? 'checked' : ''}>${t('Suivre')}</label>
          <button class="btn sm" data-act="cf-logs">${ic('refresh', 14)}${t('Actualiser')}</button></div></div>
          <pre class="journal big" id="cf-logs">${esc(S.cf.logs ?? t('Chargement…'))}</pre></section>
        <section class="card" style="overflow:hidden"><div class="card-head sm"><h2>${t('Variables d’environnement')}</h2><button class="btn sm" data-act="env-add">${ic('plus', 14)}${t('Ajouter')}</button></div>
          <div id="cf-envs"><div class="skeleton"><span class="spin"></span></div></div>
          <p class="small muted card-pad" style="margin:0;padding-top:0">${t('Les changements s’appliquent au prochain déploiement.')}</p></section>
      </div>
      <div class="stack" style="gap:16px">
        <section class="card card-pad stack" style="gap:10px">
          <div class="row" style="gap:8px"><span class="dot ${d.dot}"></span><b class="${d.cls}">${esc(cf ? d.short : t('État inconnu'))}</b><span class="muted small">· ${esc(cf?.name || uuid)}</span></div>
          <div class="app-domains">${cf?.fqdn ? cf.fqdn.split(',').map(domainChip).join('') : `<span class="small muted">${t('Aucun domaine')}</span>`}
            <button type="button" class="chip sm" data-act="cf-domains">${ic('edit', 14, 2)}${cf?.fqdn ? t('Modifier') : t('Ajouter un domaine')}</button></div>
          <div class="row"><button class="btn sm primary" data-act="deploy">${ic('upload', 14)}${t('Déployer')}</button><button class="btn sm" data-act="deploy-force">${t('Reconstruire sans cache')}</button></div>
        </section>
        <section class="card" style="overflow:hidden"><div class="card-head sm"><h2>${t('Déploiements')}</h2></div><div id="cf-deps"><div class="skeleton"><span class="spin"></span></div></div></section>
        ${DEPLOY.features.rollback ? `<section class="card" style="overflow:hidden"><div class="card-head sm"><h2>${t('Revenir en arrière')}</h2></div><div id="cf-images"><div class="skeleton"><span class="spin"></span></div></div></section>` : ''}
        ${DEPLOY.url ? `<a class="btn sm ghost" style="align-self:flex-start" href="${esc(DEPLOY.url)}" target="_blank" rel="noopener">${ic('external', 16, 2)}${t('Ouvrir {tool}', { tool: DN() })}</a>` : ''}
      </div></div>`;
    loadLogs(); loadEnvs();
    const here = () => !S.left && S.tab === 'deploiement';
    api('GET', `/api/deploy/apps/${enc(uuid)}/deployments`).then((list) => {
      if (!here()) return;
      setHTML($('#cf-deps'), list.length ? list.map((x) => {
        const ok = /finished|success/i.test(x.status), bad = /fail|error|cancel/i.test(x.status);
        return `<div class="list-row"><span class="dot ${ok ? 'ok' : bad ? 'err' : 'warn'}" title="${esc(x.status_label || x.status)}"></span><span class="two" style="flex:1;min-width:0"><span class="ellipsis" style="font-size:14px">${esc(x.label || x.message || x.status)}</span><span class="sub">${esc(x.status_label || x.status)}${x.commit ? ` · <span class="mono">${esc(x.commit)}</span>` : ''}</span></span><span class="small muted nowrap">${isoAgo(x.created)}</span></div>`;
      }).join('') : `<div class="empty small">${t('Aucun déploiement.')}</div>`);
    }).catch((e) => { if (here()) setHTML($('#cf-deps'), `<div class="empty small">${esc(e.message)}</div>`); });
    if (DEPLOY.features.rollback) api('GET', `/api/deploy/apps/${enc(uuid)}/rollback`).then((r) => {
      if (!here()) return;
      const imgs = (Array.isArray(r) ? r : (r.images || r.data || [])).map((x) => (typeof x === 'string' ? { tag: x } : x));
      const current = r.current_tag || r.current || '';
      S.cf.images = imgs;
      setHTML($('#cf-images'), imgs.length ? imgs.slice(0, 10).map((x) => {
        const tag = x.tag || x.commit || x.image_tag || '';
        const isCur = x.is_current || x.current || (current && tag === current);
        const when = x.created_at || x.created || '';
        return `<div class="list-row"><span class="mono small grow ellipsis">${esc(tag.slice(0, 12))}</span><span class="small muted nowrap">${when ? ago(Date.parse(when) / 1000) : ''}</span>
          ${isCur ? `<span class="pill sm ok">${t('Actuelle')}</span>` : `<button class="btn sm" data-act="rollback" data-tag="${esc(tag)}">${t('Revenir')}</button>`}</div>`;
      }).join('') : `<div class="empty small">${t('Aucune image précédente sur le serveur.')}</div>`);
    }).catch((e) => { if (here()) setHTML($('#cf-images'), `<div class="empty small">${esc(e.message)}</div>`); });
  }
  async function loadLogs() {
    const uuid = info.app_id;
    if (!uuid) return;
    try { S.cf.logs = (await api('GET', `/api/deploy/apps/${enc(uuid)}/logs?lines=300`)).logs || t('(aucun log)'); } catch (e) { S.cf.logs = e.message; }
    const box = $('#cf-logs');
    if (!box || S.tab !== 'deploiement') return;
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 30 || box.textContent === t('Chargement…');
    box.textContent = S.cf.logs;
    if (atEnd) box.scrollTop = box.scrollHeight;
  }
  async function loadEnvs() {
    const uuid = info.app_id;
    try { S.cf.envs = await api('GET', `/api/deploy/apps/${enc(uuid)}/envs`); } catch (e) { setHTML($('#cf-envs'), `<div class="empty small">${esc(e.message)}</div>`); return; }
    drawEnvs();
  }
  function drawEnvs() {
    const box = $('#cf-envs');
    if (!box || !S.cf.envs) return;
    setHTML(box, S.cf.envs.length ? `<div class="scrollx"><table class="table envs"><tbody>${S.cf.envs.map((e) => `<tr>
      <td class="mono small"><b>${esc(e.key)}</b>${e.build ? ' <span class="pill sm">build</span>' : ''}</td>
      <td class="mono small val">${S.cf.reveal.has(e.uuid) ? esc(e.value) : (e.value ? '••••••••' : `<span class="muted">${t('(vide)')}</span>`)}</td>
      <td class="nowrap" style="text-align:right"><button class="btn icon sm ghost" data-act="env-reveal" data-id="${esc(e.uuid)}" aria-label="${S.cf.reveal.has(e.uuid) ? t('Masquer {key}', { key: esc(e.key) }) : t('Afficher {key}', { key: esc(e.key) })}">${ic('eye', 15)}</button>
        <button class="btn icon sm ghost" data-act="env-edit" data-id="${esc(e.uuid)}" aria-label="${t('Modifier {key}', { key: esc(e.key) })}">${ic('edit', 15)}</button>
        <button class="btn icon sm ghost" data-act="env-del" data-id="${esc(e.uuid)}" aria-label="${t('Supprimer {key}', { key: esc(e.key) })}">${ic('trash', 15)}</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty small">${t('Aucune variable.')}</div>`);
  }

  /* --- commandes favorites --- */
  async function loadCommands() {
    try { S.commands = await api('GET', `${P}/commands`); } catch (e) { fail(e); S.commands = { saved: [], suggested: [] }; }
    return S.commands;
  }
  async function cmdsMenu(el) {
    const c = S.commands || await loadCommands();
    menu(el, [
      ...c.saved.map((x) => ({ label: x.label, icon: 'play', run: () => runCommand(x.cmd) })),
      ...c.suggested.slice(0, c.saved.length ? 4 : 8).map((x) => ({ label: t('{label} (suggestion)', { label: x.label }), icon: 'play', run: () => runCommand(x.cmd) })),
      { label: t('Taper une commande…'), icon: 'term', run: async () => { const cmd = await ask({ title: t('Lancer une commande'), label: t('Dans le shell du projet'), placeholder: 'npm test', okLabel: t('Lancer') }); if (cmd) runCommand(cmd); } },
      { label: t('Gérer les commandes favorites'), icon: 'sliders', run: () => setTab('reglages') },
    ]);
  }
  async function runCommand(cmd) {
    try {
      await api('POST', `${P}/run`, { cmd });
      if (!S.drawer || S.termTarget !== 'project') openDrawer('project');
      toast(t('Lancé dans le shell du projet : {cmd}', { cmd }));
    } catch (e) { fail(e); }
  }

  /* --- réglages --- */
  function iconBlock() {
    return `<div class="row" style="gap:20px;align-items:center;flex-wrap:nowrap">
        <span id="picon-big">${projectIcon(info, 'xl')}</span>
        <div class="stack" style="gap:10px;min-width:0">
          <div class="row" style="gap:8px">
            <button type="button" class="btn tonal" data-act="icon-upload">${ic('upload', 18, 2)}${t('Importer une image')}</button>
            <button type="button" class="btn" data-act="icon-repo">${ic('search', 18, 2)}${t('Chercher dans le dépôt')}</button>
            ${info.icon ? `<button type="button" class="btn ghost danger" data-act="icon-del">${t('Retirer')}</button>` : ''}
          </div>
          <span class="hint">${t('PNG, SVG, JPG, WebP ou ICO, 2 Mo max. Gardée par Helmshell : rien n’est ajouté au dépôt.')}</span>
        </div></div>`;
  }
  function refreshIcon() {
    if ($('#icon-block')) $('#icon-block').innerHTML = iconBlock();
    if ($('#phead-icon')) $('#phead-icon').innerHTML = projectIcon(info, 'lg');
  }
  // Plateformes et technos : null = détection automatique, sinon liste choisie à la main
  const pick = { pf: info.platforms_manual ? [...info.platforms] : null, tg: info.tags_manual ? [...info.tags] : null, pfDirty: false, tgDirty: false };
  // Choisies : puces avec ×. Les autres : dans la liste de la barre de recherche (et « Ajouter … » pour une techno libre)
  const pickCur = (k) => (k === 'pf' ? (pick.pf ?? info.platforms) : (pick.tg ?? info.tags));
  const pickSet = (k, v) => { if (k === 'pf') { pick.pf = PLATFORMS.filter((x) => v.includes(x)); pick.pfDirty = true; } else { pick.tg = v; pick.tgDirty = true; } };
  function drawPickBox(k, focus = false) {
    const box = $(k === 'pf' ? '#pf-box' : '#tg-box');
    if (!box) return;
    const cur = pickCur(k), icon = k === 'pf' ? platIcon : techIcon;
    box.innerHTML = `<div class="tpick-sel">${cur.length ? cur.map((x) => `<span class="tchip">${icon(x)}${esc(x)}<button type="button" class="tx" data-act="tp-remove" data-k="${k}" data-v="${esc(x)}" aria-label="${t('Retirer {name}', { name: esc(x) })}">${ic('x', 14, 2)}</button></span>`).join('') : `<span class="small muted">${t('Aucune pour l’instant')}</span>`}</div>
      <div class="tpick-search">${ic('search', 18, 2)}<input placeholder="${k === 'pf' ? t('Ajouter une plateforme…') : t('Ajouter une techno…')}" autocomplete="off" maxlength="30" aria-label="${k === 'pf' ? t('Ajouter une plateforme') : t('Ajouter une techno')}"><div class="tpick-list" role="listbox" hidden></div></div>`;
    const inp = $('input', box), list = $('.tpick-list', box);
    const show = () => {
      const q = norm(inp.value.trim());
      const all = k === 'pf' ? PLATFORMS : KNOWN_TECHS;
      const opts = all.filter((x) => !cur.includes(x) && (!q || norm(x).includes(q)));
      const free = k === 'tg' && q && !all.some((x) => norm(x) === q) && !cur.some((x) => norm(x) === q) ? inp.value.trim() : '';
      let grp = null;
      list.innerHTML = opts.map((x) => {
        const g = k === 'tg' ? techGroup(x) : '';
        const head = g && g !== grp ? `<span class="tp-group">${esc(g)}</span>` : '';
        grp = g;
        return `${head}<button type="button" class="tp-opt" role="option" data-act="tp-add" data-k="${k}" data-v="${esc(x)}">${icon(x) || '<i class="tp-noimg"></i>'}${esc(x)}</button>`;
      }).join('')
        + (free ? `<button type="button" class="tp-opt" role="option" data-act="tp-add" data-k="${k}" data-v="${esc(free)}">${ic('plus', 16, 2)}${t('Ajouter « {name} »', { name: esc(free) })}</button>` : '')
        || `<span class="small muted" style="padding:10px 14px">${q ? t('Aucune correspondance') : t('Tout est déjà choisi')}</span>`;
      list.hidden = false;
    };
    list.onmousedown = (e) => e.preventDefault(); // garde le focus dans le champ pendant le clic
    inp.onfocus = show;
    inp.oninput = show;
    inp.onblur = () => { list.hidden = true; };
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('.tp-opt', list)?.click(); } else if (e.key === 'Escape') { list.hidden = true; inp.blur(); }
    };
    if (focus) inp.focus();
  }
  function drawPicks() {
    drawPickBox('pf'); drawPickBox('tg');
    $('#pf-hint').innerHTML = pick.pf === null ? t('Détectées automatiquement. Ajoute ou retire pour corriger.')
      : `${t('Choisies à la main')} · <button type="button" class="linkbtn" data-act="pf-auto">${t('revenir à la détection automatique')}</button>`;
    $('#tg-hint').innerHTML = pick.tg === null ? t('Détectées automatiquement. Ajoute ou retire pour corriger.')
      : `${t('Choisies à la main')} · <button type="button" class="linkbtn" data-act="tg-auto">${t('revenir à la détection automatique')}</button>`;
  }
  async function drawSettings() {
    S.cmdsDrawn = false;
    $('#pane').innerHTML = `<form id="psettings" class="stack" style="gap:16px">
      <div class="pgrid">
        <div class="stack">
          <section class="card form-section"><h2><span class="ic2">${ic('image', 20, 2)}</span>${t('Identité')}</h2>
            <div id="icon-block">${iconBlock()}</div>
            <div class="icon-cands" id="icon-cands" hidden></div>
            <input type="file" id="icon-input" accept="image/*,.svg,.ico" hidden>
            <label class="field"><span>${t('Nom affiché')}</span><input name="name" value="${esc(info.name)}"></label>
            <label class="field"><span>${t('Description')}</span><textarea name="description" rows="3" placeholder="${t('Une phrase sur le projet : elle apparaît sur sa carte')}">${esc(info.description)}</textarea></label>
            <div class="field"><span>${t('Plateformes visées')}</span><div class="tpick" id="pf-box"></div><span class="hint" id="pf-hint"></span></div>
            <div class="field"><span>${t('Technos')}</span><div class="tpick" id="tg-box"></div><span class="hint" id="tg-hint"></span></div>
          </section>
        </div>
        <div class="stack">
          <section class="card form-section"><h2><span class="ic2">${ic(DEPLOY.provider ? 'upload' : 'folder', 20, 2)}</span>${DEPLOY.provider ? t('{tool} et dossier', { tool: DN() }) : t('Dossier')}</h2>
            ${DEPLOY.provider ? `<label class="field"><span>${t('Application {tool} liée', { tool: DN() })}</span><select name="coolify"><option value="">${t('Aucune')}</option>${info.app_id ? `<option value="${esc(info.app_id)}" selected>${esc(info.app?.name || info.app_id)}</option>` : ''}</select><span class="hint" id="cf-hint"></span></label>` : ''}
            <div class="stack" style="gap:6px"><span class="small muted">${t('Dossier')}</span><div class="row nowrap" style="gap:8px"><div class="pathbox grow">${esc(info.path)}</div><button type="button" class="btn icon" data-act="copy-path" aria-label="${t('Copier le chemin')}">${ic('copy', 18)}</button></div></div>
          </section>
          <section class="card form-section"><h2><span class="ic2">${ic('play', 20, 2)}</span>${t('Commandes favorites')}</h2>
            <span class="small muted" style="margin-top:-8px">${t('Lancées en un clic dans le shell du projet (menu ⋮ en haut de la page du projet).')}</span>
            <div id="cmd-rows" class="stack" style="gap:8px"><div class="skeleton"><span class="spin"></span></div></div>
            <div class="row" style="gap:8px"><button type="button" class="btn sm" data-act="cmd-add">${ic('plus', 16, 2)}${t('Ajouter')}</button><span id="cmd-sugg" class="row" style="gap:6px"></span></div>
          </section>
        </div>
      </div>
      <button class="btn fab save">${ic('check', 24, 2.2)}${t('Enregistrer')}</button>
    </form>`;
    drawPicks();
    $('#icon-input').onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try { info.icon = (await api('PUT', `${P}/icon?name=${enc(f.name)}`, f)).icon; refreshIcon(); toast(t('Icône enregistrée')); } catch (err) { fail(err); }
    };
    loadCommands().then(() => { if (S.tab === 'reglages') drawCmdRows(S.commands.saved); });
    if (DEPLOY.provider) try {
      const apps = await api('GET', '/api/deploy/apps');
      if (S.left || S.tab !== 'reglages') return;
      const sel = $('#psettings select[name=coolify]');
      if (sel) sel.innerHTML = `<option value="">${t('Aucune')}</option>` + apps.map((a) => `<option value="${esc(a.uuid)}" ${a.uuid === info.app_id ? 'selected' : ''}>${esc(a.name)}${a.fqdn ? ` — ${esc(a.fqdn)}` : ''}</option>`).join('');
    } catch (_) {
      const hint = $('#cf-hint');
      if (hint) hint.innerHTML = t('Relie {tool} dans {link} pour choisir une application.', { tool: DN(), link: `<a href="#/parametres">${t('Paramètres')}</a>` });
    }
  }
  function cmdRowsValue() {
    return $$('#cmd-rows .cmd-row').map((r) => ({ label: $('[name=label]', r).value.trim(), cmd: $('[name=cmd]', r).value.trim() })).filter((c) => c.cmd);
  }
  function drawCmdRows(list) {
    const box = $('#cmd-rows');
    if (!box) return;
    S.cmdsDrawn = true;
    box.innerHTML = list.map((c) => `<div class="row nowrap cmd-row" style="gap:8px"><input name="label" placeholder="${t('Nom')}" value="${esc(c.label)}" style="width:32%"><input name="cmd" class="mono grow" placeholder="npm run dev" value="${esc(c.cmd)}"><button type="button" class="btn icon sm ghost" data-act="cmd-del" aria-label="${t('Retirer')}">${ic('x', 15)}</button></div>`).join('')
      || `<span class="small muted">${t('Aucune commande enregistrée.')}</span>`;
    const used = new Set(list.map((c) => c.cmd));
    const sugg = (S.commands?.suggested || []).filter((c) => !used.has(c.cmd)).slice(0, 8);
    $('#cmd-sugg').innerHTML = sugg.length ? `<span class="small muted">${t('Suggestions :')}</span>${sugg.map((c) => `<button type="button" class="chip sm" data-act="cmd-sugg" data-cmd="${esc(c.cmd)}" data-label="${esc(c.label)}">${esc(c.label)}</button>`).join('')}` : '';
  }
  main.onsubmit = async (e) => {
    if (e.target.id === 'fsearch') { e.preventDefault(); runSearch(e.target.q.value); return; }
    if (e.target.id === 'task-form') {
      e.preventDefault();
      const prompt = $('#task-prompt').value.trim();
      if (!prompt) { toast(t('Écris la consigne'), true); $('#task-prompt').focus(); return; }
      const btn = $('button', e.target);
      btn.disabled = true;
      try {
        const agent = $('#task-agent')?.value || taskAgent();
        const task = await withTrust((trust) => api('POST', `${P}/tasks`, { prompt, mode: $('#task-mode').value, trust, agent }));
        S.taskDraft = '';
        $('#task-prompt').value = '';
        S.tasks = [task, ...S.tasks.filter((x) => x.id !== task.id)];
        drawTasks();
        toast(task.agent === 'codex' ? t('Tâche confiée à Codex : tu seras prévenu à la fin') : t('Tâche confiée à Claude : tu seras prévenu à la fin'));
      } catch (err) { fail(err); }
      btn.disabled = false;
      return;
    }
    if (e.target.id !== 'psettings') return;
    e.preventDefault();
    const f = e.target;
    try {
      const body = { name: f.name.value.trim(), description: f.description.value, ...(f.coolify ? { app_id: f.coolify.value } : {}) };
      // Étiquettes : enregistrées seulement si tu les as modifiées (sinon elles restent détectées automatiquement)
      if (pick.tgDirty) body.tags = pick.tg;          // null = retour à la détection
      if (pick.pfDirty) body.platforms = pick.pf;
      await api('PATCH', P, body);
      // Les commandes ne sont enregistrées qu'une fois chargées : sinon on effacerait la liste.
      if (S.cmdsDrawn) S.commands = { ...S.commands, saved: await api('PUT', `${P}/commands`, { commands: cmdRowsValue() }) };
      toast(t('Réglages enregistrés'));
      route();
    } catch (err) { fail(err); }
  };

  /* --- terminal (volet du bas) --- */
  function drawDrawerHead() {
    if (S.left || !$('#drawer-targets')) return;
    const running = S.claude?.running;
    if (S.termTarget === 'claude' && !running) {
      S.termTarget = 'project';
      if (S.drawer) { mountDrawer(); return; }
    }
    $('#drawer-targets').innerHTML = `<button class="chip" data-act="term" data-t="project" aria-pressed="${S.termTarget === 'project'}">${t('Shell du projet')}</button>
      ${running ? `<button class="chip" data-act="term" data-t="claude" aria-pressed="${S.termTarget === 'claude'}">${t('Session Claude')}</button>` : ''}`;
  }
  async function mountDrawer() {
    const g = ++S.termGen;
    if (S.disposeTerm) { S.disposeTerm(); S.disposeTerm = null; }
    drawDrawerHead();
    let d;
    try { d = await mountTerminal($('#termbox'), S.termTarget, slug); } catch (e) {
      if (g === S.termGen && $('#termbox')) $('#termbox').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
      return;
    }
    if (S.left || g !== S.termGen || !S.drawer) d(); else S.disposeTerm = d;
  }
  function openDrawer(target) {
    if (target) S.termTarget = target;
    S.drawer = true;
    $('#drawer').hidden = false;
    main.classList.add('with-drawer');
    mountDrawer();
  }
  function closeDrawer() {
    S.drawer = false;
    S.termGen++;
    if (S.disposeTerm) { S.disposeTerm(); S.disposeTerm = null; }
    $('#drawer').hidden = true;
    main.classList.remove('with-drawer');
  }

  /* --- actions --- */
  const startHere = async () => {
    const r = await startDialog(info.name, await defaultMode(), !!(S.git?.repo || info.git));
    if (!r) return;
    await startClaude(slug, r.mode, r.cont, r.spawn);
    S.claudeKey = '';
    loadClaude();
  };
  // Dialogue de lancement (agent, reprise, permissions, Remote Control pour Claude) puis terminal de l'agent choisi
  const launchHere = async () => {
    const r = await startDialog(info.name, await defaultMode(), false, { open: true, agent: S.agent, cont: contPref() });
    if (!r) return;
    try {
      await api('POST', `${P}/claude/repo/open${brQ(S.br, r.agent)}`, { mode: r.mode, continue: r.cont, rc: r.rc });
    } catch (e) { fail(e); return; }
    toast(r.agent === 'codex' ? t('Codex ouvert') : r.rc ? t('Claude ouvert avec Remote Control') : t('Claude ouvert'));
    if (r.agent !== S.agent) { openClaude(r.agent); return; }
    S.repo = null; S.repoKey = '';
    openClaude();
  };
  bind(main, {
    tab: (el) => setTab(el.dataset.tab),
    // Une seule IA installée : on l'ouvre ; les deux : fenêtre de choix
    'claude-open': async () => {
      const list = aiAgents();
      const a = list.length > 1 ? await chooseAgent(slug, info.name) : list[0];
      if (a) openClaude(a);
    },
    'agent-pick': (el) => pickAgent(el.dataset.agent),
    // Onglet Claude sans session : ouvrir en reprenant (ou non) la dernière conversation
    'claude-start-off': async (el) => {
      el.disabled = true;
      try {
        await api('POST', `${P}/claude/repo/open${BQ()}`, { continue: !!$('#cont-chk')?.checked });
        S.repo = null;
        openClaude();
      } catch (e) { el.disabled = false; fail(e); }
    },
    'br-pick': (el) => pickBranch(el.dataset.b),
    'copy-new': () => newCopy(),
    // Ouvre la copie de la branche dans l'IA choisie (chacune a sa session tmux par branche)
    'copy-claude': (el) => {
      const a = agentId(el.dataset.agent || S.agent);
      if (a !== S.agent) {
        S.agent = a; setAgentPref(slug, a); disposeRepoTerm(); S.repo = null; S.repoKey = ''; drawClaudeBtn();
        if (S.tab === 'claude') {
          S.br = el.dataset.b || null; claudeStartFor = slug;
          history.replaceState(null, '', claudeHash(slug, S.br, S.agent));
          $('#pane').innerHTML = ''; drawClaudeTab();
          return;
        }
      }
      pickBranch(el.dataset.b, true);
    },
    'copy-merge': (el) => { const c = S.copies?.find((x) => x.branch === el.dataset.b); if (c) mergeCopy(c); },
    'copy-remove': (el) => { const c = S.copies?.find((x) => x.branch === el.dataset.b); if (c) removeCopy(c); },
    'repo-key': async (el) => {
      try { await api('POST', `${P}/claude/repo/send${BQ()}`, { key: el.dataset.key }); } catch (e) { fail(e); }
    },
    finder: openFinder,
    crumb: async (el) => {
      const path = el.dataset.path;
      if (!await okToLeaveFile()) return;
      S.sel = path; S.selDir = true; S.file = null; S.editing = false; S.searchView = false;
      S.expanded.add(path);
      if (!S.children.has(path)) await loadDir(path);
      drawTree(); drawPreview();
    },
    'md-view': (el) => { S.mdSource = el.dataset.v === '1'; drawPreview(); },
    'search-go': (el) => openInFiles(el.dataset.path, false, +el.dataset.line),
    'search-close': () => { S.searchView = false; drawPreview(); },
    'diff-mode': (el) => { setDiffMode(el.dataset.m); drawGit(); },
    check: (el) => { if (el.checked) S.unchecked.delete(el.dataset.path); else S.unchecked.add(el.dataset.path); S.commitMsg = $('#commit-msg')?.value; drawGit(); },
    'check-all': (el) => { S.unchecked = el.checked ? new Set() : new Set(S.git.changes.map((c) => c.path)); S.commitMsg = $('#commit-msg')?.value; drawGit(); },
    branches: (el) => branchMenu(el),
    'log-more': () => loadLog(true),
    'commit-show': (el) => showCommit(el.dataset.rev),
    task: (el) => openTask(el.dataset.id),
    transcript: (el) => openTranscript(P, el.dataset.id, S.agent),
    'h-resume': async (el) => {
      if (S.br) { toast(t('Les conversations listées sont celles du dossier principal'), true); pickBranch(null); return; }
      el.disabled = true;
      try {
        await api('POST', `${P}/claude/repo/resume${brQ(null, S.agent)}`, { id: el.dataset.id });
        toast(t('Conversation reprise dans le terminal'));
        S.repoKey = '';
        if (!S.disposeRepo) mountRepoTerm();
        loadRepo();
      } catch (e) { fail(e); }
      el.disabled = false;
    },
    'cf-logs': () => loadLogs(),
    'cf-domains': async () => {
      const st = await api('GET', '/api/settings').catch(() => ({}));
      if (await editDomains({ uuid: info.app_id, name: info.app?.name || info.name, fqdn: info.app?.fqdn || '' }, st.domain_suffix)) setTimeout(route, 1200);
    },
    'cf-follow': (el) => { S.cf.follow = el.checked; if (el.checked) loadLogs(); },
    'deploy-force': async () => { try { await api('POST', '/api/deploy/deploy', { uuid: info.app_id, force: true }); toast(t('Reconstruction lancée')); } catch (e) { fail(e); } },
    rollback: async (el) => {
      if (!await confirmBox(t('Revenir à cette version ?'), t('{tool} redémarre l’application avec l’image {tag}.', { tool: DEPLOY.name, tag: el.dataset.tag.slice(0, 12) }), t('Revenir'))) return;
      try { await api('POST', `/api/deploy/apps/${enc(info.app_id)}/rollback`, { commit: el.dataset.tag }); toast(t('Retour en arrière lancé')); } catch (e) { fail(e); }
    },
    'env-reveal': (el) => { const id = el.dataset.id; if (S.cf.reveal.has(id)) S.cf.reveal.delete(id); else S.cf.reveal.add(id); drawEnvs(); },
    'env-add': async () => {
      const key = await ask({ title: t('Nouvelle variable'), label: t('Nom'), placeholder: 'DATABASE_URL', okLabel: t('Suivant') });
      if (!key) return;
      const value = await ask({ title: key, label: t('Valeur'), okLabel: t('Ajouter') });
      if (value === null) return;
      try { await api('POST', `/api/deploy/apps/${enc(info.app_id)}/envs`, { key, value, create: true }); toast(t('{key} ajoutée', { key })); loadEnvs(); } catch (e) { fail(e); }
    },
    'env-edit': async (el) => {
      const e = S.cf.envs.find((x) => x.uuid === el.dataset.id);
      if (!e) return;
      const value = await ask({ title: e.key, label: t('Nouvelle valeur'), value: e.value, okLabel: t('Enregistrer') });
      if (value === null) return;
      try { await api('POST', `/api/deploy/apps/${enc(info.app_id)}/envs`, { key: e.key, value }); toast(t('{key} modifiée', { key: e.key })); loadEnvs(); } catch (err) { fail(err); }
    },
    'env-del': async (el) => {
      const e = S.cf.envs.find((x) => x.uuid === el.dataset.id);
      if (!e || !await confirmBox(t('Supprimer {key} ?', { key: e.key }), t('La variable disparaît de {tool} au prochain déploiement.', { tool: DEPLOY.name }), t('Supprimer'))) return;
      try { await api('DELETE', `/api/deploy/apps/${enc(info.app_id)}/envs/${enc(e.uuid)}`); toast(t('{key} supprimée', { key: e.key })); loadEnvs(); } catch (err) { fail(err); }
    },
    'cmd-add': () => { const list = cmdRowsValue(); list.push({ label: '', cmd: '' }); drawCmdRows(list); $$('#cmd-rows [name=cmd]').pop()?.focus(); },
    'cmd-del': (el) => { el.closest('.cmd-row').remove(); drawCmdRows(cmdRowsValue()); },
    'cmd-sugg': (el) => { const list = cmdRowsValue(); list.push({ label: el.dataset.label, cmd: el.dataset.cmd }); drawCmdRows(list); },
    more: (el) => menu(el, [
      { label: S.drawer ? t('Fermer le terminal du projet') : t('Terminal du projet (Ctrl `)'), icon: 'term', run: () => (S.drawer ? closeDrawer() : openDrawer()) },
      { label: t('Commandes favorites…'), icon: 'play', run: () => cmdsMenu(main.querySelector('[data-act=more]')) },
      info.app ? { label: t('Déployer sur {tool}', { tool: DEPLOY.name }), icon: 'upload', run: () => deployApp(info.app_id, info.name) } : null,
      info.remote ? { label: t('Ouvrir le dépôt'), icon: 'external', run: () => window.open(remoteInfo(info.remote).web, '_blank', 'noopener') } : null,
      (S.git?.repo ?? info.git) ? { label: info.remote ? t('Changer de dépôt distant…') : t('Relier à un dépôt distant…'), icon: 'branch', run: linkRemote } : null,
      { label: t('Copier le chemin'), icon: 'copy', run: () => copyText(info.path, t('Chemin copié')) },
      { label: t('Réglages du projet'), icon: 'sliders', run: () => setTab('reglages') },
      { label: t('Supprimer le projet…'), icon: 'trash', danger: true, run: () => deleteProject(info, () => { location.hash = '#/projets'; }) },
    ]),
    'term-toggle': () => (S.drawer ? closeDrawer() : openDrawer()),
    'term-close': closeDrawer,
    term: (el) => { if (el.dataset.t !== S.termTarget) { S.termTarget = el.dataset.t; mountDrawer(); } },
    'see-term': () => openDrawer('claude'),
    'link-remote': () => linkRemote(),
    'claude-menu': (el) => {
      const open = (a) => agentReposOf(slug).some((x) => x.agent === a && !x.branch) || (S.agent === a && S.repo?.claude && !S.br);
      menu(el, [
        claudeOn() || open('claude') ? { label: open('claude') ? t('Terminal Claude (tmux)') : t('Ouvrir Claude dans un terminal'), icon: 'term', run: () => openClaude('claude') } : null,
        codexOn() || open('codex') ? { label: open('codex') ? t('Terminal Codex (tmux)') : t('Ouvrir Codex dans un terminal'), icon: 'term', run: () => openClaude('codex') } : null,
        { label: t('Lancer avec des options…'), icon: 'sliders', run: launchHere },
        S.claude?.running
          ? { label: t('Voir la session en arrière-plan'), icon: 'eye', run: () => openDrawer('claude') }
          : claudeOn() ? { label: t('Lancer Claude en arrière-plan (Remote Control)'), icon: 'phone', run: startHere } : null,
      { label: t('Confier une tâche de fond…'), icon: 'task', run: () => { setTab('claude'); setTimeout(() => $('#task-prompt')?.focus(), 300); } },
      ]);
    },
    'git-sync': async (el) => { el.disabled = true; await syncRemote(true); el.disabled = false; toast(t('Dépôt distant : {status}', { status: syncText(S.git) })); },
    'repo-rc': async (el) => {
      el.disabled = true;
      try {
        S.repo = await api('POST', `${P}/claude/repo/rc${BQ()}`);
        S.repoKey = '';
        toast(S.repo.url ? t('Remote Control activé') : t('Commande /remote-control envoyée : suis la suite dans le terminal'));
        if (!S.disposeRepo && S.tab === 'claude') mountRepoTerm();
        loadRepo();
      } catch (e) { fail(e); }
      el.disabled = false;
    },
    'repo-restart': async () => { try { await api('POST', `${P}/claude/repo/restart${BQ()}`); S.repoKey = ''; loadRepo(); } catch (e) { fail(e); } },
    'repo-copy': () => copyText(S.repo?.url || ''),
    'rc-pop': (el) => {
      const r = S.repo;
      if (!r?.rc) return;
      const pop = popover(el, `<div class="rc-pop">
        <b class="rc-on">${ic('check', 18, 2.2)}${t('Remote Control actif')}</b>
        ${r.url ? `<div class="qr" id="qr-rc" role="img" aria-label="${t('QR code de la session')}"></div>
          <span class="small muted">${t('Scanne avec ton téléphone pour reprendre la session dans l’app Claude. Ce terminal reste synchronisé.')}</span>
          <div class="row nowrap" style="gap:6px;width:100%"><a class="btn sm tonal grow" href="${esc(r.url)}" target="_blank" rel="noopener">${ic('external', 16, 2)}${t('Ouvrir')}</a><button class="btn sm" data-x="copy">${ic('copy', 16, 2)}${t('Copier le lien')}</button></div>`
    : `<span class="small muted">${t('La session apparaît dans claude.ai/code et dans l’app Claude. Helmshell peut afficher son lien et son QR code en tapant /remote-control.')}</span>
          <button class="btn sm tonal" data-x="show">${ic('qr', 16, 2)}${t('Afficher le lien')}</button>`}</div>`, (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        closePop();
        if (b.dataset.x === 'copy') copyText(r.url);
        if (b.dataset.x === 'show') {
          api('POST', `${P}/claude/repo/rc${BQ()}`).then((st) => {
            S.repo = st; S.repoKey = '';
            toast(st.url ? t('Lien Remote Control affiché : rouvre le bouton pour le QR code') : t('Commande /remote-control envoyée : suis la suite dans le terminal'));
            loadRepo();
          }).catch(fail);
        }
      });
      if (pop && r.url) drawQr($('#qr-rc', pop), r.url);
    },
    'repo-open': () => mountRepoTerm(),
    'repo-more': (el) => menu(el, [
      { label: t('Ouvrir dans la page Terminal'), icon: 'term', run: () => { location.hash = '#/terminal'; } },
      S.repo?.exists ? { label: t('Fermer la session tmux'), icon: 'trash', danger: true, run: async () => {
        if (!await confirmBox(t('Fermer « {name} » ?', { name: S.repo.name }), killText(S.agent), t('Fermer'))) return;
        disposeRepoTerm();
        try { await api('POST', `${P}/claude/repo/kill${BQ()}`); } catch (e) { fail(e); }
        if ($('#claude-term')) $('#claude-term').innerHTML = `<div class="empty stack" style="align-items:center;gap:14px;height:100%;justify-content:center">${t('Session fermée.')}<button class="btn primary" data-act="repo-open">${ic('play', 18, 2)}${isCodex() ? t('Relancer Codex dans tmux') : t('Relancer Claude dans tmux')}</button></div>`;
        S.repoKey = ''; loadRepo();
      } } : null,
    ]),
    'tp-add': (el) => {
      const k = el.dataset.k, cur = [...pickCur(k)];
      if (!cur.includes(el.dataset.v)) cur.push(el.dataset.v.slice(0, 30));
      pickSet(k, cur); drawPicks(); drawPickBox(k, true);
    },
    'tp-remove': (el) => { const k = el.dataset.k; pickSet(k, pickCur(k).filter((x) => x !== el.dataset.v)); drawPicks(); },
    'pf-auto': () => { pick.pf = null; pick.pfDirty = true; drawPicks(); },
    'tg-auto': () => { pick.tg = null; pick.tgDirty = true; drawPicks(); },
    'icon-upload': () => $('#icon-input')?.click(),
    'icon-del': async () => { try { await api('DELETE', `${P}/icon`); info.icon = 0; refreshIcon(); toast(t('Icône retirée')); } catch (e) { fail(e); } },
    'icon-repo': async () => {
      const box = $('#icon-cands');
      if (!box) return;
      box.hidden = false;
      box.innerHTML = '<div class="skeleton"><span class="spin"></span></div>';
      let list = [];
      try { list = await api('GET', `${P}/icon/candidates`); } catch (e) { fail(e); }
      if (!$('#icon-cands')) return;
      box.innerHTML = list.length ? list.map((c) => `<button type="button" class="icon-cand" data-act="icon-pick" data-path="${esc(c.path)}" title="${esc(c.path)} · ${fmtBytes(c.size)}"><img src="${P}/download?inline=1&path=${enc(c.path)}" alt="" loading="lazy"><span>${esc(c.path)}</span></button>`).join('')
        : `<span class="small muted" style="grid-column:1/-1">${t('Aucune image de type icône ou logo trouvée dans le dépôt (noms contenant icon, logo, favicon, ic_launcher…).')}</span>`;
    },
    'icon-pick': async (el) => {
      try { info.icon = (await api('POST', `${P}/icon`, { path: el.dataset.path })).icon; refreshIcon(); $('#icon-cands').hidden = true; toast(t('Icône enregistrée')); } catch (e) { fail(e); }
    },
    start: startHere,
    restart: async () => {
      try { await api('POST', `${P}/claude/stop`); } catch (_) { /* déjà arrêtée */ }
      await startClaude(slug, S.claude?.mode || await defaultMode(), false, S.claude?.spawn === 'worktree' ? 'worktree' : null);
      S.claudeKey = ''; loadClaude();
    },
    'close-session': async () => { try { await api('POST', `${P}/claude/stop`); } catch (e) { fail(e); } S.claudeKey = ''; loadClaude(); },
    stop: async () => { if (await stopClaude(slug)) { S.claudeKey = ''; loadClaude(); } },
    answer: async (el) => { await answerClaude(slug, el.dataset.v, el.dataset.q); S.claudeKey = ''; loadClaude(); },
    copy: () => copyText(S.claude?.url || ''),
    'copy-path': () => copyText(info.path, t('Chemin copié')),
    qr: (el) => {
      const pop = popover(el, `<div class="qr-pop"><div class="qr" id="qr-pop" role="img" aria-label="${t('QR code de la session')}"></div><p class="small muted">${t('Scanne avec ton téléphone pour ouvrir la session dans l’app Claude.')}</p></div>`);
      if (pop) drawQr($('#qr-pop', pop), S.claude.url);
    },
    deploy: (el) => deployApp(info.app_id, info.name),
    link: async (el) => { try { await api('PATCH', P, { app_id: el.dataset.uuid }); toast(t('Projet relié à {tool}', { tool: DEPLOY.name })); route(); } catch (e) { fail(e); } },
    'edit-doc': (el) => openInFiles(el.dataset.path, true),
    'create-doc': async () => {
      // Modèle de CLAUDE.md, dans la langue de l’interface
      const content = `# ${info.name}\n\n${info.description || t('[Décris ici le projet, ses technos et ce que Claude doit savoir.]')}\n\n## ${t('Règles')}\n\n- ${t('Réponds et commente en français')}\n- ${t('Ne commite jamais de secrets : ils vont dans .env')}\n`;
      try {
        await api('POST', `${P}/newfile`, { path: 'CLAUDE.md' });
        await api('PUT', `${P}/file?path=CLAUDE.md`, { content });
        S.children.delete('');
        await loadDir('');
        await openInFiles('CLAUDE.md', true);
      } catch (e) { fail(e); }
    },
    'git-init': async () => {
      try { await api('POST', `${P}/git/init`); toast(t('Dépôt Git initialisé')); info.git = { branch: 'main', changes: 0 }; await loadGit(); drawPills(); drawTabs(); drawPane(); } catch (e) { fail(e); }
    },
    'diff-go': async (el) => {
      S.change = el.dataset.path;
      try { S.diff = (await api('GET', `${P}/git/diff?path=${enc(S.change)}`)).diff || t('(pas de différence affichable)'); } catch (e) { S.diff = e.message; }
      setTab('git');
    },
    diff: async (el) => {
      const path = el.dataset.path;
      if (S.change === path) { S.change = null; drawGit(); return; }
      S.change = path;
      try { S.diff = (await api('GET', `${P}/git/diff?path=${enc(path)}`)).diff || t('(pas de différence affichable)'); } catch (e) { S.diff = e.message; }
      drawGit();
    },
    commit: async (el) => {
      const message = $('#commit-msg').value.trim();
      if (!message) { toast(t('Écris un message de commit'), true); $('#commit-msg').focus(); return; }
      const all = S.git.changes.map((c) => c.path);
      const paths = all.filter((p) => !S.unchecked.has(p));
      el.disabled = true;
      try {
        await api('POST', `${P}/git/commit`, { message, push: true, paths: paths.length === all.length ? undefined : paths });
        toast(S.git.remote ? t('Commit validé et poussé') : t('Commit validé'));
        $('#commit-msg').value = '';
        S.commitMsg = '';
        S.change = null; S.log = null; S.unchecked = new Set();
      } catch (e) { fail(e); }
      await loadGit(); drawGit(); drawTabs(); drawPills();
    },
    suggest: async (el) => {
      el.disabled = true;
      el.innerHTML = `<span class="spin"></span>${t('{agent} rédige…', { agent: agentShort(agentsInfo?.default_agent) })}`;
      try { const r = await api('POST', `${P}/git/suggest`); if ($('#commit-msg')) $('#commit-msg').value = r.message; } catch (e) { fail(e); }
      el.disabled = false;
      el.innerHTML = `${ic('spark', 14)}${t('Rédiger avec {agent}', { agent: agentShort(agentsInfo?.default_agent) })}`;
    },
    pull: async () => { try { const r = await api('POST', `${P}/git/pull`); toast(r.output || t('À jour')); await loadGit(); drawGit(); drawPills(); } catch (e) { fail(e); } },
    pick: async (el) => {
      const path = el.dataset.path;
      if (path !== S.sel && !el.dataset.dir && !await okToLeaveFile()) return;
      if (path !== S.sel && el.dataset.dir && dirty()) { S.expanded.has(path) ? S.expanded.delete(path) : S.expanded.add(path); await loadDir(path); drawTree(); return; }
      S.sel = path; S.selDir = !!el.dataset.dir;
      if (S.selDir) {
        S.file = null; S.editing = false; S.draft = null;
        if (S.expanded.has(path)) S.expanded.delete(path);
        else { S.expanded.add(path); if (!S.children.has(path)) await loadDir(path); }
        drawTree(); drawPreview();
      } else { drawTree(); openFile(path); }
    },
    refresh: () => refreshTree(),
    mkdir: async () => {
      const dir = targetDir();
      const name = await ask({ title: t('Nouveau dossier'), label: t('Nom (dans {dir})', { dir: dir || t('la racine') }), okLabel: t('Créer') });
      if (!name) return;
      try { await api('POST', `${P}/mkdir`, { path: joinPath(dir, name) }); S.expanded.add(dir); refreshTree(); } catch (e) { fail(e); }
    },
    newfile: async () => {
      const dir = targetDir();
      const name = await ask({ title: t('Nouveau fichier'), label: t('Nom (dans {dir})', { dir: dir || t('la racine') }), placeholder: 'notes.md', okLabel: t('Créer') });
      if (!name) return;
      const path = joinPath(dir, name);
      try { await api('POST', `${P}/newfile`, { path }); await openInFiles(path, true); } catch (e) { fail(e); }
    },
    upload: () => $('#upload-input')?.click(),
    fmenu: (el) => menu(el, [
      !S.selDir ? { label: t('Télécharger'), icon: 'download', run: () => { location.href = `${P}/download?path=${enc(S.sel)}`; } } : null,
      { label: t('Renommer ou déplacer'), icon: 'edit', run: renameSel },
      { label: t('Copier le chemin'), icon: 'copy', run: () => copyText(`${info.path}/${S.sel}`, t('Chemin copié')) },
      { label: t('Supprimer'), icon: 'trash', danger: true, run: deleteSel },
    ]),
    edit: () => { S.editing = true; S.draft = null; drawPreview(); },
    'cancel-edit': () => { S.editing = false; S.draft = null; drawPreview(); },
    save,
  });
  async function renameSel() {
    const to = await ask({ title: t('Renommer ou déplacer'), label: t('Nouveau chemin (depuis la racine du projet)'), value: S.sel, okLabel: t('Renommer') });
    if (!to || to === S.sel) return;
    try { await api('POST', `${P}/rename`, { from: S.sel, to }); S.sel = to; await refreshTree(); if (!S.selDir) openFile(to); else drawPreview(); } catch (e) { fail(e); }
  }
  async function deleteSel() {
    const path = S.sel;
    if (!await confirmBox(t('Supprimer {path} ?', { path }), S.selDir ? t('Le dossier et son contenu vont dans la corbeille (page Serveur), restaurable pendant 30 jours.') : t('Le fichier va dans la corbeille (page Serveur), restaurable pendant 30 jours.'), t('Supprimer'))) return;
    try {
      const r = await api('POST', `${P}/delete`, { path });
      S.sel = null; S.file = null; S.editing = false;
      await refreshTree(); drawPreview();
      toast(t('{path} mis à la corbeille', { path }), false, { label: t('Annuler'), run: async () => {
        try { const back = await api('POST', `/api/trash/${enc(r.trash_id)}/restore`); toast(t('{path} restauré', { path: back.path })); if (!S.left) refreshTree(); } catch (e) { fail(e); }
      } });
    } catch (e) { fail(e); }
  }

  /* --- dépôt distant --- */
  async function syncRemote(force = false) {
    let r;
    try { r = await api('POST', `${P}/git/fetch`, { force }); } catch (e) { if (force) fail(e); return; }
    if (S.left) return;
    if (force && r.ok === false && !r.skipped) toast(t('Dépôt distant injoignable : {output}', { output: r.output || '' }), true);
    if (!r.skipped || force) { await loadGit(); drawPills(); drawTabs(); if (S.tab === 'git') drawGit(); }
  }
  async function linkRemote() {
    const pick = await importDialog({ title: info.remote ? t('Changer de dépôt distant') : t('Relier à un dépôt distant'), allowUrl: true });
    if (!pick) return;
    const url = pick.url || pick.repo.clone_url;
    try {
      const g = await api('POST', `${P}/git/remote`, { url });
      info.remote = g.remote;
      S.git = g; S.log = null;
      const name = remoteInfo(g.remote, S.accounts).name;
      if (g.unrelated) toast(t('Relié à {name}, mais ce dépôt n’a aucun commit en commun avec le projet : vérifie que c’est le bon.', { name }), true);
      else if (!g.tracking) toast(t('Relié à {name}. La branche {branch} n’existe pas encore sur le dépôt : elle sera créée au prochain envoi.', { name, branch: g.branch }));
      else toast(t('Relié à {name} : {status}', { name, status: syncText(g) }));
      drawPills(); drawTabs(); if (S.tab === 'git') drawGit();
    } catch (e) { fail(e); }
  }

  /* --- démarrage --- */
  api('GET', '/api/forges').then((l) => { S.accounts = l; drawPills(); }).catch(() => {});
  syncRemote();
  every(180000, () => syncRemote());
  drawPills();
  drawTabs();
  setTab(S.tab);
  api('GET', `/api/tasks?project=${enc(slug)}&limit=10`).then((list) => { S.tasks = list; drawTasks(); }).catch(() => {});
  // Direct : la session de ce projet et ses tâches. Le journal, lui, est relu toutes les 2,5 s quand l’onglet Claude est ouvert.
  onLeave(onLive((st) => {
    const ak = JSON.stringify((st.repos || []).filter((x) => x.slug === slug).map((x) => [x.agent, x.branch, x.claude, x.status, x.question]));
    if (ak !== S.aiKey) { S.aiKey = ak; drawPills(); drawTabs(); }
    const s = st.sessions.find((x) => x.slug === slug);
    const k = s ? JSON.stringify([s.phase, s.url, s.question, s.mode, s.exit_code]) : 'off';
    if (k !== S.liveKey) { S.liveKey = k; loadClaude(); }
    const mine = st.tasks.filter((t) => t.slug === slug);
    const tk = JSON.stringify(mine.map((t) => [t.id, t.status, t.last]));
    if (tk !== S.tasksKey) {
      const finished = S.tasksKey && mine.some((t) => t.status !== 'running' && S.tasks.find((x) => x.id === t.id)?.status === 'running');
      S.tasksKey = tk;
      const ids = new Set(mine.map((t) => t.id));
      S.tasks = [...mine, ...S.tasks.filter((t) => !ids.has(t.id))].sort((a, b) => b.started - a.started).slice(0, 10);
      drawTasks();
      if (finished) { loadGit().then(() => { drawTabs(); drawPills(); if (S.tab === 'git') drawGit(); }); if (S.tab === 'fichiers') refreshTree(); }
    }
  }));
  loadRepo();
  every(3000, () => { if (S.tab === 'claude') loadRepo(); });
  every(10000, () => { if (S.tab === 'claude' || S.tab === 'git') loadCopies(); });
  every(60000, () => { if (S.claude?.running) drawSbar(); }); // « depuis X min »
  every(3000, () => { if (S.tab === 'deploiement' && S.cf.follow) loadLogs(); });
  every(20000, async () => {
    if (S.tab === 'fichiers') refreshTree();
    if (S.tab !== 'claude') loadRepo();
    if (S.tab !== 'git') { await loadGit(); drawTabs(); drawPills(); }
  });
  const onKeys = (e) => {
    if (document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === 'p') { e.preventDefault(); openFinder(); }
    else if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'f') {
      e.preventDefault();
      if (S.tab !== 'fichiers') setTab('fichiers');
      $('#fsearch input')?.focus();
    } else if (e.ctrlKey && (e.key === '`' || e.code === 'Backquote')) { e.preventDefault(); if (S.drawer) closeDrawer(); else openDrawer(); }
  };
  const onDigit = (ev) => {
    const i = '123456'.indexOf(ev.detail.key);
    if (i >= 0 && TABS[i]) { ev.detail.preventDefault(); setTab(TABS[i][0]); }
  };
  document.addEventListener('keydown', onKeys);
  document.addEventListener('helmshell-key', onDigit);
  const onTasksChanged = () => api('GET', `/api/tasks?project=${enc(slug)}&limit=10`).then((list) => { S.tasks = list; drawTasks(); }).catch(() => {});
  document.addEventListener('tasks-changed', onTasksChanged);
  onLeave(() => { document.removeEventListener('keydown', onKeys); document.removeEventListener('helmshell-key', onDigit); document.removeEventListener('tasks-changed', onTasksChanged); });
}

/* ------------------------------------------------------------- comptes Git */
const FORGES = [['github', 'GitHub', 'https://github.com'], ['gitlab', 'GitLab', 'https://gitlab.com'], ['codeberg', 'Codeberg', 'https://codeberg.org'], ['forgejo', 'Forgejo', ''], ['gitea', 'Gitea', '']];
const forgeName = (k) => (FORGES.find((f) => f[0] === k) || [k, k])[1];
const forgeLogo = (k, size = 20) => `<img class="svc-logo${k === 'github' ? ' inv-dark' : ''}" src="/logos/${k}.svg" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`;
const hostOf = (u) => { try { return new URL(u).host; } catch (_) { return u; } };

/* Dépôt distant : forge (pour le logo), « propriétaire/dépôt » et page web */
function remoteInfo(url, accounts = []) {
  if (!url) return null;
  let host = '', path = '';
  const ssh = url.match(/^[\w.-]+@([^:]+):(.+)$/);
  try {
    if (ssh) { host = ssh[1]; path = ssh[2]; } else { const u = new URL(url); host = u.host; path = u.pathname; }
  } catch (_) { return { name: url, web: '', kind: null }; }
  path = path.replace(/^\/+/, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const known = { 'github.com': 'github', 'gitlab.com': 'gitlab', 'codeberg.org': 'codeberg' };
  const kind = known[host.toLowerCase()] || accounts.find((a) => hostOf(a.url).toLowerCase() === host.toLowerCase())?.kind || null;
  return { name: path || host, host, web: `https://${host}/${path}`, kind };
}

/* Choisir un dépôt dans un compte lié. Renvoie { repo, account }, { url } (saisie à la main) ou null. */
function importDialog({ title = t('Importer un dépôt'), allowUrl = false } = {}) {
  return new Promise(async (resolve) => {
    const d = document.createElement('dialog');
    d.className = 'wide';
    d.innerHTML = '<div class="skeleton"><span class="spin"></span></div>';
    document.body.append(d);
    let picked = null;
    d.addEventListener('close', () => { d.remove(); resolve(picked); });
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.showModal();
    let accounts = [];
    try { accounts = await api('GET', '/api/forges'); } catch (e) { fail(e); }
    const head = `<div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(title)}</h2><div class="row nowrap" style="gap:8px">${allowUrl ? `<button type="button" class="btn ghost" data-x="url">${ic('edit', 18, 2)}${t('Saisir une adresse')}</button>` : ''}<button type="button" class="btn icon" data-x="close" aria-label="${t('Fermer')}">${ic('x', 20)}</button></div></div>`;
    if (!accounts.length) {
      d.innerHTML = `<div class="stack" style="gap:16px">${head}<div class="empty stack" style="align-items:center;gap:14px">${t('Aucun compte Git n’est lié à Helmshell.')}
        <span class="small muted">${t('GitHub, GitLab, Gitea, Forgejo ou Codeberg : ajoute-le dans Paramètres › Git avec un jeton d’accès.')}</span>
        <button type="button" class="btn primary" data-x="settings">${ic('branch', 18, 2)}${t('Lier un compte')}</button></div></div>`;
    } else {
      d.innerHTML = `<div class="stack imp" style="gap:12px">${head}
        <div class="row" style="gap:8px" role="group" aria-label="${t('Compte')}">${accounts.map((a, i) => `<button type="button" class="chip" data-acc="${i}" aria-pressed="${i === 0}">${forgeLogo(a.kind, 18)}${esc(a.user)}<span class="small muted">${esc(hostOf(a.url))}</span></button>`).join('')}</div>
        <div class="row" style="gap:8px"><label class="searchbox grow">${ic('search', 20, 2)}<span class="sr">${t('Chercher un dépôt')}</span><input type="search" id="imp-q" placeholder="${t('Chercher un dépôt')}" autocomplete="off"></label>
          <button type="button" class="btn icon" data-x="refresh" aria-label="${t('Actualiser la liste')}" title="${t('Actualiser')}">${ic('refresh', 20)}</button></div>
        <div class="imp-list" id="imp-list"><div class="skeleton"><span class="spin"></span></div></div></div>`;
    }
    const cache = new Map();
    let cur = 0, shown = [];
    const draw = () => {
      const list = cache.get(cur);
      const box = $('#imp-list', d);
      if (!box) return;
      if (!list) { box.innerHTML = '<div class="skeleton"><span class="spin"></span></div>'; return; }
      if (list.error) { box.innerHTML = `<div class="notice err">${esc(list.error)}</div>`; return; }
      const q = norm($('#imp-q', d).value);
      shown = list.filter((r) => !q || norm(`${r.full_name} ${r.description}`).includes(q)).slice(0, 200);
      box.innerHTML = shown.length ? shown.map((r, i) => `<button type="button" class="list-row imp-row" data-i="${i}">
          <span class="lead sq" aria-hidden="true">${ic(r.private ? 'lock' : 'branch', 20, 2)}</span>
          <span class="two" style="flex:1;min-width:0"><span class="ellipsis">${esc(r.full_name)}</span><span class="sub ellipsis">${esc(r.description || t('Pas de description'))}</span></span>
          <span class="row nowrap" style="gap:6px">${r.private ? `<span class="pill sm">${t('privé')}</span>` : ''}${r.fork ? `<span class="pill sm">${t('fork')}</span>` : ''}${r.archived ? `<span class="pill sm warn">${t('archivé')}</span>` : ''}${r.language ? `<span class="small muted hide-sm">${esc(r.language)}</span>` : ''}</span>
          <span class="small muted nowrap hide-sm">${r.updated ? ago(Date.parse(r.updated) / 1000) : ''}</span></button>`).join('')
        : `<div class="empty small">${list.length ? t('Aucun dépôt ne correspond.') : t('Aucun dépôt sur ce compte.')}</div>`;
    };
    const load = async (i, fresh = false) => {
      cur = i;
      if (fresh) cache.delete(i);
      draw();
      if (!cache.has(i)) {
        try { cache.set(i, await api('GET', `/api/forges/${accounts[i].id}/repos${fresh ? '?fresh=1' : ''}`)); } catch (e) { cache.set(i, { error: e.message }); }
        if (cur === i) draw();
      }
    };
    d.onclick = (e) => {
      if (e.target === d) { d.close(); return; }
      const b = e.target.closest('[data-x], [data-acc], [data-i]');
      if (!b) return;
      if (b.dataset.x === 'close') d.close();
      else if (b.dataset.x === 'url') {
        ask({ title: t('Adresse du dépôt'), label: t('URL HTTPS ou SSH'), placeholder: t('https://github.com/utilisateur/depot.git'), okLabel: t('Relier') })
          .then((url) => { if (url) { picked = { url }; d.close(); } });
      } else if (b.dataset.x === 'settings') { settingsTab = 'git'; try { localStorage.setItem('helmshell.stab', 'git'); } catch (_) { /* rien */ } d.close(); location.hash = '#/parametres'; }
      else if (b.dataset.x === 'refresh') load(cur, true);
      else if (b.dataset.acc !== undefined) { $$('[data-acc]', d).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load(+b.dataset.acc); }
      else if (b.dataset.i !== undefined) { picked = { repo: shown[+b.dataset.i], account: accounts[cur] }; d.close(); }
    };
    if (accounts.length) {
      $('#imp-q', d).oninput = draw;
      $('#imp-q', d).focus();
      load(0);
    }
  });
}

/* ------------------------------------------------------------- nouveau projet */
// Fonction : les libellés sont traduits à l'affichage, pas au chargement du module
const TEMPLATES = () => [['node', 'Node.js'], ['python', 'Python'], ['android', 'Android (Kotlin)'], ['static', t('Site statique')]];
const slugify = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'projet';

async function viewNew(main) {
  const gen = routeGen;
  const [settings] = await Promise.all([api('GET', '/api/settings').catch(() => ({})), loadAgents()]);
  if (isStale(gen)) return;
  const root = overview?.root || settings.projects_root || '';
  // opts.agent : agent démarré après la création ('' : aucun)
  // IA démarrée après la création : celle par défaut parmi les IA installées
  const npAgent = claudeOn() && agentsInfo?.default_agent !== 'codex' ? 'claude' : codexOn() ? 'codex' : '';
  const S = { source: 'vide', template: 'node', opts: { git: true, claudemd: claudeOn(), agentsmd: codexOn(), deploy: false, domain: false, agent: npAgent } };
  const npMode = (a) => (a === 'codex' ? settings.codex_default_mode || agentDef('codex')?.default_mode || 'auto' : settings.default_mode || 'acceptEdits');
  const npModes = (a) => agentModes(a).map((m) => `<option value="${esc(m.id)}" ${m.id === npMode(a) ? 'selected' : ''}>${esc(m.label)}</option>`).join('');
  const OPTIONS = [
    ['git', t('Initialiser Git'), t('git init et un premier commit (ignoré si tu clones un dépôt)')],
    ['claudemd', t('Créer un CLAUDE.md'), t('Contexte du projet pour Claude, à partir de la description (jamais ajouté à un dépôt cloné)')],
    ['agentsmd', t('Créer un AGENTS.md (Codex)'), t('Contexte du projet pour Codex et les autres agents, à partir de la description (jamais ajouté à un dépôt cloné)')],
    ...(DEPLOY.provider ? [
      ['deploy', t('Créer l’application dans {name}', { name: DEPLOY.name }), t('Relie le dépôt à une nouvelle application {name} (dépôt public)', { name: DEPLOY.name })],
      ['domain', t('Exposer via un sous-domaine'), settings.domain_suffix ? t('Domaine attribué dans {name} : {domain}', { name: DEPLOY.name, domain: `<slug>.${settings.domain_suffix}` }) : t('Renseigne le domaine de base dans Paramètres')],
    ] : []),
  ];
  main.innerHTML = `
    <header class="page-head">
      <div class="titles"><nav class="crumbs" aria-label="${t('Fil d’Ariane')}"><a href="#/projets">${t('Projets')}</a>${ic('chevron', 14)}<span style="color:var(--text)">${t('Nouveau projet')}</span></nav>
        <h1>${t('Nouveau projet')}</h1>
        <p class="muted">${DEPLOY.provider ? t('Crée le dossier sur le serveur, prépare Git et Claude, et branche-le à {name} si besoin.', { name: DN() }) : t('Crée le dossier sur le serveur, prépare Git et Claude.')}</p></div>
      <div class="row"><button type="button" class="btn primary lg" data-act="import">${ic('download', 20, 2)}${t('Importer un dépôt')}</button></div>
    </header>
    <div class="form-grid">
      <form id="np" novalidate>
        <section class="card form-section">
          <h2><span class="n">1</span> · ${t('Identité')}</h2>
          <div class="row" style="align-items:flex-start;gap:16px">
            <label class="field grow" style="min-width:220px"><span>${t('Nom du projet')}</span><input name="name" required placeholder="${t('Mon nouveau projet')}" autocomplete="off"></label>
            <div class="field grow" style="min-width:220px"><span>${t('Dossier créé')}</span><div class="pathbox" id="np-path">${esc(root)}/…</div></div>
          </div>
          <label class="field"><span>${t('Description (reprise dans CLAUDE.md)')}</span><textarea name="description" rows="3" placeholder="${t('À quoi sert ce projet, quelles technos, ce que Claude doit savoir')}"></textarea></label>
        </section>
        <section class="card form-section">
          <h2><span class="n">2</span> · ${t('Point de départ')}</h2>
          <div class="choices" role="radiogroup" aria-label="${t('Point de départ')}" id="np-sources"></div>
          <label class="field" id="np-git" hidden><span>${t('URL du dépôt')}</span><input name="repo" type="url" placeholder="${t('https://github.com/utilisateur/depot.git')}"><span class="hint" id="np-imported"></span></label>
          <div class="row" id="np-tpl" hidden style="gap:8px"></div>
        </section>
        <section class="card form-section">
          <h2><span class="n">3</span> · ${t('Options')}</h2>
          ${OPTIONS.map(([id, l, h]) => `<label class="check"><span><b>${l}</b><small>${esc(h)}</small></span><input type="checkbox" role="switch" class="switch" data-opt="${id}" ${S.opts[id] ? 'checked' : ''}></label>`).join('')}
          <div class="fgrid">
            <label class="field"><span>${t('Démarrer un agent après la création')}</span><select name="agent" id="np-agent">
              <option value="" ${npAgent ? '' : 'selected'}>${t('Aucun')}</option>
              <option value="claude" ${claudeOn() ? '' : 'disabled'} ${claudeOn() && agentsInfo?.default_agent !== 'codex' ? 'selected' : ''}>${claudeOn() ? t('Claude Code (Remote Control)') : t('Claude Code (non installé)')}</option>
              <option value="codex" ${codexOn() ? '' : 'disabled'} ${codexOn() && (agentsInfo?.default_agent === 'codex' || !claudeOn()) ? 'selected' : ''}>${codexOn() ? 'Codex' : t('Codex (non installé)')}</option></select>
              <span class="hint">${t('Ouvre la session dans ce dossier dès la création')}</span></label>
            <label class="field" id="np-mode" ${npAgent ? '' : 'hidden'}><span id="np-mode-l">${npAgent === 'codex' ? t('Permissions de Codex') : t('Permissions de Claude')}</span><select name="mode">${npModes(npAgent || 'claude')}</select></label>
          </div>
        </section>
        <div class="row" style="justify-content:flex-end">
          <a class="btn ghost" href="#/projets">${t('Annuler')}</a>
          <button class="btn primary" id="np-submit">${ic('plus', 18, 2)}${t('Créer le projet')}</button>
        </div>
      </form>
      <aside aria-labelledby="resume-titre"><section class="card form-section">
        <h2 id="resume-titre">${t('Ce qui va être créé')}</h2>
        <div class="treeview" id="np-tree"></div>
        <h3>${t('Étapes')}</h3>
        <ol class="steps" id="np-steps"></ol>
        <div id="np-result"></div>
      </section></aside>
    </div>`;
  const form = $('#np');
  const draw = () => {
    const name = form.name.value.trim();
    const slug = slugify(name);
    $('#np-path').textContent = `${root}/${name ? slug : '…'}`;
    $('#np-sources').innerHTML = [['vide', t('Dossier vide'), t('Un dossier propre, rien d’autre')], ['git', t('Cloner un dépôt'), t('Une URL Git, ou « Importer » depuis un compte lié')], ['modele', t('Partir d’un modèle'), t('Structure de base prête à coder')]]
      .map(([id, l, h]) => `<button type="button" class="choice" role="radio" aria-checked="${id === S.source}" data-act="source" data-v="${id}"><b>${l}</b><small>${h}</small></button>`).join('');
    $('#np-git').hidden = S.source !== 'git';
    $('#np-tpl').hidden = S.source !== 'modele';
    $('#np-tpl').innerHTML = TEMPLATES().map(([id, l]) => `<button type="button" class="chip" aria-pressed="${id === S.template}" data-act="tpl" data-v="${id}">${l}</button>`).join('');
    $('#np-mode').hidden = !S.opts.agent;
    for (const k of ['claudemd', 'agentsmd']) {
      const cm = $(`[data-opt=${k}]`);
      if (cm) { cm.disabled = S.source === 'git'; cm.checked = S.source !== 'git' && S.opts[k]; cm.closest('.check').classList.toggle('off', S.source === 'git'); }
    }
    const lines = [];
    if (S.source === 'git' || S.opts.git) lines.push('├─ .git/');
    if (S.opts.claudemd && S.source !== 'git') lines.push('├─ CLAUDE.md');
    if (S.opts.agentsmd && S.source !== 'git') lines.push('├─ AGENTS.md');
    if (S.source === 'git') lines.push(`└─ (${t('contenu du dépôt, et son logo comme icône')})`);
    else if (S.source === 'modele') lines.push(`└─ (${t('fichiers du modèle {name}', { name: TEMPLATES().find((x) => x[0] === S.template)[1] })})`);
    else lines.push(`└─ (${t('vide')})`);
    $('#np-tree').textContent = `${root}/${slug}/\n${lines.join('\n')}`;
    const steps = [[t('Créer le dossier'), `mkdir -p ${root}/${slug}`]];
    if (S.source === 'git') steps.push([t('Cloner le dépôt'), `git clone ${form.repo.value || '<url>'} .`]);
    else if (S.opts.git) steps.push([t('Initialiser Git'), 'git init -b main']);
    if (S.source === 'modele') steps.push([t('Copier le modèle'), t('modèle : {name}', { name: S.template })]);
    if (S.source === 'git') steps.push([t('Icône du projet'), t('logo trouvé dans le dépôt')]);
    else {
      if (S.opts.claudemd) steps.push([t('Écrire CLAUDE.md'), t('à partir de la description')]);
      if (S.opts.agentsmd) steps.push([t('Écrire AGENTS.md'), t('à partir de la description')]);
    }
    if (S.opts.deploy) steps.push([t('Créer l’application {name}', { name: DEPLOY.name }), S.source === 'git' ? `API ${DEPLOY.name}` : t('nécessite un dépôt Git distant')]);
    if (S.opts.domain && S.opts.deploy) steps.push([t('Publier le sous-domaine'), `${slug}.${settings.domain_suffix || t('[TON-DOMAINE]')} → proxy ${DEPLOY.name}`]);
    if (S.opts.agent === 'claude') steps.push([t('Démarrer Claude'), `tmux new -d -s claude-${slug} "claude remote-control"`]);
    if (S.opts.agent === 'codex') steps.push([t('Démarrer Codex'), `tmux new -d -s codex-${slug} codex`]);
    $('#np-steps').innerHTML = steps.map(([l, c], i) => `<li><span class="n">${i + 1}</span><span class="stack" style="gap:2px"><span>${esc(l)}</span><code>${esc(c)}</code></span></li>`).join('');
  };
  bind(main, {
    import: async () => {
      const r = await importDialog();
      if (!r) return;
      const { repo, account } = r;
      S.source = 'git';
      form.repo.value = repo.clone_url;
      if (!form.name.value.trim()) form.name.value = repo.name;
      if (!form.description.value.trim() && repo.description) form.description.value = repo.description;
      $('#np-imported').innerHTML = `${forgeLogo(account.kind, 14)} ${t('{repo} sur {forge}', { repo: esc(repo.full_name), forge: esc(forgeName(account.kind)) })}${repo.private ? ` · ${t('privé : cloné avec le jeton du compte lié')}` : ''}`;
      draw();
      toast(t('{name} sélectionné', { name: repo.full_name }));
    },
    source: (el) => { S.source = el.dataset.v; draw(); },
    tpl: (el) => { S.template = el.dataset.v; draw(); },
  });
  main.oninput = draw;
  main.onchange = (e) => {
    if (e.target.dataset.opt) { S.opts[e.target.dataset.opt] = e.target.checked; draw(); }
    if (e.target.id === 'np-agent') {
      S.opts.agent = e.target.value;
      if (S.opts.agent) {
        form.mode.innerHTML = npModes(S.opts.agent);
        $('#np-mode-l').textContent = S.opts.agent === 'codex' ? t('Permissions de Codex') : t('Permissions de Claude');
      }
      draw();
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.name.value.trim()) { form.name.focus(); toast(t('Donne un nom au projet'), true); return; }
    const btn = $('#np-submit');
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span>${t('Création…')}`;
    try {
      const r = await api('POST', '/api/projects', {
        name: form.name.value.trim(), description: form.description.value, source: S.source,
        repo: form.repo.value.trim(), template: S.template, opts: { ...S.opts, claude: S.opts.agent === 'claude' }, mode: form.mode.value,
      });
      $('#np-steps').innerHTML = r.steps.map((s) => `<li><span class="n ${s.ok ? 'ok' : 'err'}">${s.ok ? ic('check', 12, 3) : ic('x', 12, 3)}</span><span class="stack" style="gap:2px"><span>${esc(s.label)}</span>${s.detail ? `<code>${esc(s.detail)}</code>` : ''}</span></li>`).join('');
      $('#np-result').innerHTML = `<a class="btn primary lg" style="width:100%" href="#/projets/${enc(r.slug)}">${t('Ouvrir le projet')}</a>`;
      toast(t('Projet créé'));
      btn.innerHTML = `${ic('check', 16, 2)}${t('Projet créé')}`;
    } catch (err) {
      fail(err);
      btn.disabled = false;
      btn.innerHTML = `${ic('plus', 16, 2)}${t('Créer le projet')}`;
    }
  };
  draw();
  form.name.focus();
}

/* ------------------------------------------------------------------ sessions */
function sessionState(r) {
  if (!r.claude) return { cls: 'warn', text: r.agent === 'codex' ? t('Shell · Codex arrêté') : t('Shell · Claude arrêté') };
  if (r.status === 'waiting') return { cls: 'warn', text: r.question ? t('Attend ta validation : {question}', { question: r.question }) : t('Attend ta validation') };
  if (r.status === 'busy') return { cls: 'busy', text: t('Travaille…') };
  if (r.status === 'idle') return { cls: 'ok', text: `${t('En attente')}${r.since ? ` · ${ago(r.since)}` : ''}` };
  return { cls: 'ok', text: t('Actif') };
}
function sessionCard(r, p) {
  const st = sessionState(r);
  const proj = p || { slug: r.slug, icon: 0 };
  const k = esc(r.key || r.slug), da = `data-key="${k}"`;
  const codex = r.agent === 'codex';
  return `<article class="scard ${st.cls}" data-key="${k}">
    <div class="scard-head">${projectIcon(proj)}
      <a class="two plain" href="${claudeHash(r.slug, r.branch, r.agent)}" style="min-width:0;flex:1"><span class="ellipsis"><span class="sagent" title="${AGENT_LABELS[agentId(r.agent)]}">${agentLogo(r.agent, 16)}</span><b>${esc(r.branch ? (p?.name || r.slug) : r.name)}</b>${r.branch || p?.git ? ` <span class="pill sm ${r.branch ? 'accent' : ''}">${ic('branch', 12, 2)}<span class="mono">${esc(r.branch || p.git.branch)}</span></span>` : ''}</span><span class="sub mono ellipsis">tmux · ${esc(r.tmux)}</span></a>
      <button class="btn icon sm" data-act="s-more" ${da} aria-label="${t('Plus d’actions pour {name}', { name: esc(r.name) })}">${ic('dotsV', 20)}</button>
    </div>
    <div class="row s-head2" style="gap:6px"><span class="pill s-state ${st.cls}"><span class="dot"></span>${esc(st.text)}</span>
      ${r.rc ? `<button type="button" class="pill ok" data-act="s-qr" data-url="${esc(r.url || 'https://claude.ai/code')}">${ic('phone', 13, 2)}Remote Control</button>` : ''}</div>
    <pre class="spreview" data-act="s-term" ${da} title="${t('Ouvrir le terminal')}">${esc(r.preview ?? '…')}</pre>
    <form class="ssend" ${da} autocomplete="off">
      <input name="msg" placeholder="${r.claude ? (codex ? t('Envoyer à Codex…') : t('Envoyer à Claude…')) : t('Commande dans le shell…')}" aria-label="${t('Envoyer un message à {name}', { name: esc(r.name) })}" maxlength="2000">
      <button class="btn icon sm" aria-label="${t('Envoyer')}">${ic('send', 18, 2)}</button>
    </form>
    <div class="row sacts" style="gap:6px">
      <button type="button" class="btn sm tonal" data-act="s-term" ${da}>${ic('term', 16, 2)}${t('Terminal')}</button>
      ${r.claude && !r.rc && !codex ? `<button type="button" class="btn sm" data-act="s-rc" ${da}>${ic('phone', 16, 2)}Remote Control</button>` : ''}
      <span class="grow"></span>
      <button type="button" class="btn sm ghost" data-act="s-key" data-k="Escape" ${da} title="${t('Touche Échap')}">${t('Échap')}</button>
      <button type="button" class="btn sm ghost" data-act="s-key" data-k="C-c" ${da} title="${t('Interrompre (Ctrl C)')}">Ctrl C</button>
    </div>
  </article>`;
}

async function viewSessions(main) {
  const gen = routeGen;
  let projects = await api('GET', '/api/projects').catch(() => []);
  if (isStale(gen)) return;
  let repos = [], headless = [], drawer = { key: null, dispose: null, gen: 0 };
  const rkey = (r) => r.key || r.slug;
  const byKey = (k) => repos.find((r) => rkey(r) === k);
  main.innerHTML = `${pageHeader(t('Sessions IA'), t('Claude Code et Codex dans le terminal de chaque projet (tmux), sessions en arrière-plan et conversations passées.'))}
    <section aria-labelledby="ses-t" class="stack" style="gap:12px">
      <h2 id="ses-t" class="sec-title">${t('En cours')} <span class="badge" id="ses-n" hidden></span></h2>
      <div class="scards" id="scards"></div>
      <div id="headless"></div>
    </section>
    <section class="card" style="overflow:hidden;padding-bottom:8px"><div class="card-head"><div class="titles"><h2>${t('Conversations récentes')}</h2><span class="small muted hide-sm">${t('Tous projets · « Reprendre » relance la conversation dans le terminal du projet')}</span></div>
      <label class="searchbox sm">${ic('search', 18, 2)}<span class="sr">${t('Filtrer les conversations')}</span><input type="search" id="hq" placeholder="${t('Filtrer')}"></label></div>
      <div id="hist"><div class="skeleton"><span class="spin"></span></div></div></section>
    <section class="drawer" id="sdrawer" hidden aria-label="${t('Terminal de la session')}">
      <div class="drawer-head"><b id="sdrawer-t"></b><span class="small muted grow hide-sm">${t('Session tmux : elle continue si tu fermes ce volet.')}</span>
        <button class="btn icon sm" data-act="s-close" aria-label="${t('Fermer le terminal')}">${ic('x', 18)}</button></div>
      <div class="drawer-body" id="stermbox"></div>
    </section>`;
  const proj = (slug) => projects.find((x) => x.slug === slug);

  /* --- sessions --- */
  const drawCards = () => {
    const box = $('#scards');
    if (!box) return;
    const n = repos.length + headless.length;
    $('#ses-n').textContent = n; $('#ses-n').hidden = !n;
    const keys = repos.map((r) => `${rkey(r)}:${proj(r.slug)?.icon || 0}`).join(',');
    if (box.dataset.keys !== keys) {
      // Nouvelle liste : on redessine en gardant les messages en cours de saisie
      const drafts = Object.fromEntries($$('.ssend', box).map((f) => [f.dataset.key, f.msg.value]));
      box.innerHTML = repos.length ? repos.map((r) => sessionCard(r, proj(r.slug))).join('')
        : `<div class="empty card">${t('Aucune IA ouverte. Lance-la depuis un {link} (bouton « {button} »).', { link: `<a href="#/projets">${t('projet')}</a>`, button: esc(openAiLabel()) })}</div>`;
      box.dataset.keys = keys;
      for (const f of $$('.ssend', box)) if (drafts[f.dataset.key]) f.msg.value = drafts[f.dataset.key];
    } else {
      // Mise à jour fine : état, Remote Control, aperçu
      for (const r of repos) {
        const card = $(`.scard[data-key="${CSS.escape(rkey(r))}"]`, box);
        if (!card) continue;
        const st = sessionState(r);
        card.className = `scard ${st.cls}`;
        setHTML($('.s-head2', card), `<span class="pill s-state ${st.cls}"><span class="dot"></span>${esc(st.text)}</span>
          ${r.rc && r.agent !== 'codex' ? `<button type="button" class="pill ok" data-act="s-qr" data-url="${esc(r.url || 'https://claude.ai/code')}">${ic('phone', 13, 2)}Remote Control</button>` : ''}`);
        if (r.preview !== undefined) {
          const pre = $('.spreview', card);
          if (pre.textContent !== r.preview) pre.textContent = r.preview || ' ';
        }
        const rcBtn = $('[data-act=s-rc]', card);
        if (rcBtn && (r.rc || !r.claude || r.agent === 'codex')) rcBtn.remove();
      }
    }
    setHTML($('#headless'), headless.length ? `<section class="card" style="overflow:hidden;padding-bottom:8px"><div class="card-head sm"><h2>${t('En arrière-plan')}</h2><span class="small muted">claude remote-control</span></div>${sessionRows(headless)}</section>` : '');
  };
  const loadPreviews = async () => {
    try {
      const list = await api('GET', '/api/repo-sessions?preview=1');
      repos = list;
      drawCards();
    } catch (_) { /* rien */ }
  };

  /* --- historique --- */
  let hist = [], hq = '';
  const drawHistory = () => {
    const q = norm(hq.trim());
    const list = hist.filter((c) => !q || norm(`${c.title} ${c.project} ${agentShort(c.agent)}`).includes(q));
    const da = (c) => `data-slug="${esc(c.slug)}" data-id="${esc(c.id)}" data-agent="${agentId(c.agent)}"`;
    setHTML($('#hist'), list.length ? list.map((c) => `<div class="list-row">${projectIcon({ slug: c.slug, icon: c.icon })}
        <span class="two" style="flex:1;min-width:0"><span class="ellipsis">${esc(c.title)}</span><span class="sub row nowrap" style="gap:6px;min-width:0">${agentLogo(c.agent, 14)}<span class="ellipsis">${esc(agentShort(c.agent))} · ${esc(c.project)} · ${ago(c.mtime)} · ${tp(c.prompts, '{n} message', '{n} messages')}${c.task ? ` · ${t('tâche de fond')}` : ''}</span></span></span>
        <button class="btn sm" data-act="h-read" ${da(c)} title="${t('Lire')}" aria-label="${t('Lire')}">${ic('eye', 16, 2)}<span class="hide-sm">${t('Lire')}</span></button>
        <button class="btn sm tonal" data-act="h-resume" ${da(c)} title="${t('Reprendre')}" aria-label="${t('Reprendre')}">${ic('play', 16, 2)}<span class="hide-sm">${t('Reprendre')}</span></button></div>`).join('')
      : `<div class="empty small">${hist.length ? t('Aucune conversation ne correspond.') : t('Aucune conversation enregistrée.')}</div>`);
  };
  const loadHistory = async () => {
    try { hist = (await api('GET', '/api/claude/history?limit=40')).filter((c) => c.prompts > 0); } catch (e) { setHTML($('#hist'), `<div class="empty small">${esc(e.message)}</div>`); return; }
    drawHistory();
  };
  $('#hq').oninput = (e) => { hq = e.target.value; drawHistory(); };


  /* --- terminal en volet --- */
  const closeDrawer = () => {
    drawer.gen++;
    if (drawer.dispose) { drawer.dispose(); drawer.dispose = null; }
    drawer.key = null;
    $('#sdrawer').hidden = true;
    main.classList.remove('with-drawer');
  };
  const openDrawer = async (key) => {
    const r = byKey(key);
    if (drawer.key === key || !r) return;
    closeDrawer();
    drawer.key = key;
    const g = ++drawer.gen;
    $('#sdrawer-t').textContent = `${agentShort(r.agent)} · ${r.name}`;
    $('#sdrawer').hidden = false;
    main.classList.add('with-drawer');
    let d;
    try { d = await mountTerminal($('#stermbox'), 'repo', r.slug, { branch: r.branch || null, agent: r.agent || null }); } catch (e) { $('#stermbox').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (g !== drawer.gen || isStale(gen)) d(); else drawer.dispose = d;
  };
  onLeave(closeDrawer);

  /* --- actions --- */
  const send = async (key, body) => {
    const r = byKey(key);
    if (!r) return;
    try { await api('POST', `/api/projects/${enc(r.slug)}/claude/repo/send${brQ(r.branch, r.agent)}`, body); setTimeout(loadPreviews, 700); setTimeout(loadPreviews, 2500); } catch (e) { fail(e); }
  };
  main.onsubmit = (e) => {
    const f = e.target.closest('.ssend');
    if (!f) return;
    e.preventDefault();
    const text = f.msg.value.trim();
    if (!text) { f.msg.focus(); return; }
    f.msg.value = '';
    send(f.dataset.key, { text });
  };
  bind(main, {
    ...sessionActs(() => api('GET', '/api/sessions').then((l) => { headless = l; drawCards(); }).catch(() => {})),
    task: (el) => openTask(el.dataset.id),
    's-term': (el) => openDrawer(el.dataset.key),
    's-close': closeDrawer,
    's-key': (el) => send(el.dataset.key, { key: el.dataset.k }),
    's-rc': async (el) => {
      const s = byKey(el.dataset.key);
      if (!s || s.agent === 'codex') return;
      el.disabled = true;
      try { const r = await api('POST', `/api/projects/${enc(s.slug)}/claude/repo/rc${brQ(s.branch)}`); toast(r.url ? t('Remote Control activé') : t('Commande /remote-control envoyée')); loadPreviews(); } catch (e) { fail(e); el.disabled = false; }
    },
    's-qr': (el) => {
      const url = el.dataset.url;
      const pop = popover(el, `<div class="qr-pop"><div class="qr" id="qr-pop" role="img" aria-label="${t('QR code de la session')}"></div><a class="small ellipsis" href="${esc(url)}" target="_blank" rel="noopener" style="max-width:180px">${esc(url.replace(/^https:\/\//, ''))}</a></div>`);
      if (pop) drawQr($('#qr-pop', pop), url);
    },
    's-more': (el) => {
      const r = byKey(el.dataset.key);
      if (!r) return;
      menu(el, [
        { label: t('Voir le projet'), icon: 'folderOpen', run: () => { location.hash = claudeHash(r.slug, r.branch, r.agent); } },
        r.url ? { label: t('Copier le lien Remote Control'), icon: 'copy', run: () => copyText(r.url) } : null,
        { label: t('Fermer la session tmux'), icon: 'trash', danger: true, run: async () => { if (drawer.key === rkey(r)) closeDrawer(); if (await killRepo(r.slug, r.tmux, r.branch, r.agent)) loadPreviews(); } },
      ]);
    },
    'h-read': (el) => openTranscript(`/api/projects/${enc(el.dataset.slug)}`, el.dataset.id, el.dataset.agent),
    'h-resume': async (el) => {
      el.disabled = true;
      try {
        const ag = agentId(el.dataset.agent);
        await api('POST', `/api/projects/${enc(el.dataset.slug)}/claude/repo/resume${brQ(null, ag)}`, { id: el.dataset.id });
        toast(t('Conversation reprise dans le terminal du projet'));
        setAgentPref(el.dataset.slug, ag);
        location.hash = claudeHash(el.dataset.slug, null, ag);
      } catch (e) { fail(e); el.disabled = false; }
    },
  });

  // Direct : l'état (sans l'aperçu) arrive par le flux ; l'aperçu est relu toutes les 4 s
  onLeave(onLive((st) => {
    headless = st.sessions;
    const prev = Object.fromEntries(repos.map((r) => [rkey(r), r.preview]));
    repos = (st.repos || []).map((r) => ({ ...r, preview: prev[rkey(r)] }));
    drawCards();
  }));
  await Promise.all([loadPreviews(), loadHistory()]);
  every(4000, loadPreviews);
  // Logos des projets : si la liste n'était pas encore là au premier affichage, on redessine les cartes
  const reloadProjects = async () => {
    projects = await api('GET', '/api/projects').catch(() => projects);
    if ($('#scards')) { $('#scards').dataset.keys = ''; drawCards(); }
  };
  if (!projects.length) setTimeout(reloadProjects, 1500);
  every(60000, reloadProjects);
}

/* ------------------------------------------------------------------ terminal */
async function viewTerminal(main) {
  const rgen = routeGen;
  const [projects] = await Promise.all([api('GET', '/api/projects').catch(() => []), loadAgents()]);
  if (isStale(rgen)) return;
  let list = [], current = null, dispose = null, gen = 0, left = false;
  try { current = localStorage.getItem('helmshell.term') || null; } catch (_) { /* rien */ }
  main.innerHTML = `${pageHeader(t('Terminal'), t('Sessions tmux persistantes : ferme la page, elles continuent de tourner.'))}
    <section class="twin" id="twin" aria-label="${t('Terminal')}">
      <div class="twin-bar">
        <div class="ttabs" role="tablist" aria-label="${t('Sessions ouvertes')}" id="ttabs"></div>
        <button type="button" class="twin-btn" data-act="new" aria-haspopup="menu" aria-label="${t('Nouveau terminal')}" title="${t('Nouveau terminal')}">${ic('plus', 18, 2)}</button>
        <span class="grow"></span>
        <button type="button" class="twin-btn" data-act="font" data-d="-1" aria-label="${t('Texte plus petit')}" title="${t('Texte plus petit')}">A−</button>
        <span class="twin-size" id="tfont"></span>
        <button type="button" class="twin-btn" data-act="font" data-d="1" aria-label="${t('Texte plus grand')}" title="${t('Texte plus grand')}">A+</button>
        <button type="button" class="twin-btn" data-act="attach" aria-label="${t('Copier la commande pour s’attacher en SSH')}" title="${t('Copier la commande pour s’attacher en SSH')}">${ic('copy', 16, 2)}</button>
        <button type="button" class="twin-btn" data-act="full" aria-label="${t('Plein écran')}" title="${t('Plein écran')}">${ic('external', 16, 2)}</button>
      </div>
      <div class="termbox twin-body" id="termbox"></div>
    </section>`;
  $('#tfont').textContent = TERM_FONT();
  const pname = (slug) => projects.find((p) => p.slug === slug)?.name || slug;
  const claudeLogo = '<img class="tlogo" src="/logos/claude.svg" alt="" width="16" height="16">';
  const codexLogo = '<img class="tlogo alogo-codex" src="/logos/codex.svg" alt="" width="16" height="16">';
  const pIcon = (slug) => { const p = projects.find((x) => x.slug === slug); return p?.icon ? `<img class="tlogo" src="/api/projects/${enc(slug)}/icon?v=${p.icon}" alt="" width="16" height="16">` : ic('folder', 16, 2); };
  const label = (x) => {
    if (x.kind === 'repo') return { icon: x.claude ? (x.agent === 'codex' ? codexLogo : claudeLogo) : pIcon(x.slug), text: pname(x.slug), sub: x.claude ? agentShort(x.agent) : 'shell' };
    if (x.kind === 'remote') return { icon: claudeLogo, text: pname(x.slug), sub: 'Remote Control' };
    const n = x.name.match(/-(\d+)$/)?.[1];
    const base = x.name.startsWith('helmshell-serveur') ? t('Serveur') : x.slug ? pname(x.slug) : x.name;
    return { icon: x.slug ? pIcon(x.slug) : ic('server', 16, 2), text: base, sub: n ? `#${n}` : (x.name.startsWith('helmshell-') ? '' : x.name) };
  };
  const draw = () => {
    setHTML($('#ttabs'), list.length ? list.map((tm) => {
      const l = label(tm);
      return `<div class="ttab" role="tab" aria-selected="${tm.name === current}" title="${t('Session tmux « {name} »', { name: esc(tm.name) })} · ${esc(tm.path)}">
        <button type="button" class="go" data-act="pick" data-n="${esc(tm.name)}">${l.icon}${esc(l.text)}${l.sub ? `<span class="sub">${esc(l.sub)}</span>` : ''}</button>
        <button type="button" class="x" data-act="close" data-n="${esc(tm.name)}" aria-label="${t('Fermer {name}', { name: esc(l.text) })}">${ic('x', 16, 2)}</button></div>`;
    }).join('') : `<span class="twin-empty">${t('Aucune session')}</span>`);
  };
  const load = async () => {
    try { list = await api('GET', '/api/terminals'); } catch (_) { return; }
    if (!left) draw();
  };
  const remember = (n) => { current = n; try { localStorage.setItem('helmshell.term', n); } catch (_) { /* rien */ } };
  const open = async (opts) => {
    const g = ++gen;
    if (dispose) { dispose(); dispose = null; }
    const d = await mountTerminal($('#termbox'), opts.target, opts.slug || null, {
      name: opts.name || null, agent: opts.agent || null,
      onOpen: (r) => { if (g === gen) { remember(r.name); load(); } },
    });
    if (left || g !== gen) d(); else dispose = d;
  };
  const showEmpty = () => {
    if (dispose) { dispose(); dispose = null; }
    gen++;
    current = null;
    $('#termbox').innerHTML = `<div class="empty stack" style="align-items:center;justify-content:center;gap:14px;height:100%;color:#A9B4B0">${t('Aucun terminal ouvert.')}<button class="btn primary" data-act="new-server">${ic('plus', 18, 2)}${t('Ouvrir un shell sur le serveur')}</button></div>`;
    draw();
  };
  const newMenu = (anchor) => menu(anchor, [
    { label: t('Shell sur le serveur (~)'), icon: 'server', run: () => open({ target: 'new' }) },
    ...projects.map((p) => ({ label: t('Shell dans {name}', { name: p.name }), icon: 'folder', run: () => open({ target: 'new', slug: p.slug }) })),
    ...projects.map((p) => ({ label: t('Claude dans {name}', { name: p.name }), icon: 'spark', run: () => open({ target: 'repo', slug: p.slug }) })),
    ...(codexOn() ? projects.map((p) => ({ label: t('Codex dans {name}', { name: p.name }), icon: 'term', run: () => open({ target: 'repo', slug: p.slug, agent: 'codex' }) })) : []),
  ]);
  bind(main, {
    pick: (el) => { if (el.dataset.n !== current) { remember(el.dataset.n); draw(); open({ target: 'session', name: el.dataset.n }); } },
    close: async (el) => {
      const n = el.dataset.n, tm = list.find((x) => x.name === n);
      if (!await confirmBox(t('Fermer le terminal « {name} » ?', { name: n }), tm?.claude ? (tm.agent === 'codex' ? t('Codex tourne dans cette session : il sera arrêté.') : t('Claude tourne dans cette session : il sera arrêté.')) : t('Les programmes qui tournent dedans seront arrêtés.'), t('Fermer'))) return;
      if (n === current) { if (dispose) { dispose(); dispose = null; } gen++; }
      try { await api('DELETE', `/api/terminals/${enc(n)}`); toast(t('Terminal fermé')); } catch (e) { fail(e); }
      await load();
      if (n === current) {
        const next = list[0];
        if (next) { remember(next.name); draw(); open({ target: 'session', name: next.name }); } else showEmpty();
      }
    },
    new: (el) => newMenu(el),
    'new-server': () => open({ target: 'new' }),
    font: (el) => {
      const n = Math.min(22, Math.max(10, TERM_FONT() + +el.dataset.d));
      try { localStorage.setItem('helmshell.termFont', n); } catch (_) { /* rien */ }
      $('#tfont').textContent = n;
      dispose?.setFont?.(n);
    },
    attach: () => { if (current) copyText(`tmux -S ~/.config/helmshell/tmux.sock attach -t ${current}`, t('Commande copiée : à lancer en SSH sur le serveur')); },
    full: () => {
      const w = $('#twin');
      if (document.fullscreenElement) document.exitFullscreen?.(); else w.requestFullscreen?.().catch(() => toast(t('Plein écran indisponible'), true));
    },
  });
  onLeave(() => { left = true; gen++; if (dispose) dispose(); });
  await load();
  if (left) return;
  if (current && list.some((x) => x.name === current)) open({ target: 'session', name: current });
  else if (list.length) { const first = list.find((x) => x.kind === 'shell') || list[0]; remember(first.name); draw(); open({ target: 'session', name: first.name }); }
  else open({ target: 'server' });
  every(10000, load);
}

/* ------------------------------------------------------------- déploiements */
function deployMissing(main, title) {
  if (!DEPLOY.provider) {
    settingsTab = 'deploy'; try { localStorage.setItem('helmshell.stab', 'deploy'); } catch (_) { /* rien */ }
    location.replace('#/parametres');
    return;
  }
  const link = `<a href="#/parametres">${t('Paramètres › Déploiement')}</a>`;
  const how = DEPLOY.provider === 'dokploy'
    ? t('Crée une clé d’API dans Dokploy ({path}) puis colle-la dans {link}.', { path: '<b>Settings › Profile › API/CLI</b>', link })
    : t('Crée un jeton d’API dans Coolify ({path}, permission {a} ou {b}) puis colle-la dans {link}.', { path: '<b>Keys &amp; Tokens</b> › API tokens', a: '<i>root</i>', b: '<i>write</i>', link });
  main.innerHTML = `${pageHeader(title, '')}<div class="notice">${t('{name} n’est pas encore relié.', { name: DN() })} ${how}</div>`;
}

function appCard(a, p) {
  const d = deployStatus(a);
  const stopped = /^exited|^stopped/i.test(a.status || '');
  return `<article class="appcard ${d.dot}" data-uuid="${esc(a.uuid)}">
    <div class="scard-head">${p ? projectIcon(p) : `<span class="picon">${ic('upload', 20, 2)}</span>`}
      <span class="two" style="flex:1;min-width:0"><span class="ellipsis"><b>${esc(a.name)}</b></span><span class="sub mono ellipsis" title="${esc(a.source || '')}">${esc(a.source || a.build_pack || '')}</span></span>
      ${appPill(a)}
      <button class="btn icon sm" data-act="app-more" data-uuid="${esc(a.uuid)}" aria-label="${t('Plus d’actions pour {name}', { name: esc(a.name) })}">${ic('dotsV', 20)}</button>
    </div>
    <div class="app-domains">${a.fqdn ? a.fqdn.split(',').map(domainChip).join('') : `<span class="small muted">${t('Aucun domaine')}</span>`}
      ${p ? `<a class="chip sm" href="#/projets/${enc(p.slug)}/deploiement">${ic('folder', 14, 2)}${esc(p.name)}</a>` : ''}</div>
    <div class="app-last" id="last-${esc(a.uuid)}"><span class="small muted">${t('Dernier déploiement…')}</span></div>
    <div class="row app-acts" style="gap:6px">
      <button class="btn sm primary" data-act="deploy" data-uuid="${esc(a.uuid)}">${ic('upload', 16, 2)}${t('Déployer')}</button>
      ${stopped ? `<button class="btn sm tonal" data-act="app-start" data-uuid="${esc(a.uuid)}">${ic('play', 16, 2)}${t('Démarrer')}</button>` : ''}
      <button class="btn sm" data-act="app-logs" data-uuid="${esc(a.uuid)}">${ic('list', 16, 2)}${t('Logs')}</button>
      <button class="btn sm ghost" data-act="history" data-uuid="${esc(a.uuid)}" aria-expanded="false">${ic('clock', 16, 2)}${t('Historique')}</button>
    </div>
    <div class="app-hist" id="hist-${esc(a.uuid)}" hidden></div>
  </article>`;
}

const depRow = (x) => {
  const ok = /finished|success/i.test(x.status), bad = /fail|error|cancel/i.test(x.status);
  return `<div class="dep-row"><span class="dot ${ok ? 'ok' : bad ? 'err' : 'warn'}"></span><span class="ellipsis" style="flex:1;min-width:0">${esc(x.label || x.message || x.status)}</span><span class="pill sm ${ok ? 'ok' : bad ? 'err' : 'warn'}">${esc(x.status_label || x.status)}</span><span class="small muted nowrap">${isoAgo(x.created)}</span></div>`;
};

/* Domaines d'une appli déployée : URL complètes, séparées par des virgules ; redéploiement pour appliquer */
function editDomains(a, suffix = '') {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog" class="stack" style="gap:16px">
      <h2 style="margin:0">${t('Domaines')} · ${esc(a.name)}</h2>
      <label class="field"><span>${t('URL complètes (plusieurs séparées par des virgules)')}</span><input name="domains" class="mono" value="${esc(a.fqdn || '')}" placeholder="https://${esc(a.name || 'app')}.${esc(suffix || t('exemple.fr'))}" autocomplete="off" spellcheck="false">
        <span class="hint">${t('Le proxy de {name} sert ces adresses et crée leurs certificats HTTPS.', { name: DN() })} ${suffix ? t('Le DNS doit pointer vers le serveur (par ex. {pattern}).', { pattern: `*.${esc(suffix)}` }) : t('Le DNS doit pointer vers le serveur.')}</span></label>
      <label class="row small" style="gap:8px"><input type="checkbox" class="chk" name="redeploy" checked>${t('Redéployer pour appliquer')}</label>
      <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn ghost" data-close>${t('Annuler')}</button><button class="btn primary" value="ok">${ic('check', 18, 2)}${t('Enregistrer')}</button></div>
    </form>`;
    document.body.append(d);
    const f = $('form', d);
    $('[data-close]', d).onclick = () => d.close('cancel');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('button[value=ok]', d);
      btn.disabled = true;
      try {
        await api('POST', `/api/deploy/apps/${enc(a.uuid)}/domains`, { domains: f.domains.value.trim(), redeploy: f.redeploy.checked });
        toast(f.redeploy.checked ? t('Domaines enregistrés, redéploiement lancé') : t('Domaines enregistrés'));
        d.close('ok');
      } catch (err) { fail(err); btn.disabled = false; }
    };
    d.addEventListener('close', () => { const ok = d.returnValue === 'ok'; d.remove(); resolve(ok); });
    d.showModal();
    f.domains.focus();
  });
}

async function openAppLogs(a) {
  const d = document.createElement('dialog');
  d.className = 'wide';
  d.innerHTML = `<div class="stack" style="gap:12px">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">${t('Logs')} · ${esc(a.name)}</h2>
      <div class="row nowrap" style="gap:8px"><label class="row small nowrap" style="gap:6px"><input type="checkbox" class="chk" id="lg-follow" checked>${t('Suivre')}</label>
      <button class="btn icon" data-x="close" aria-label="${t('Fermer')}">${ic('x', 20)}</button></div></div>
    <pre class="journal big" id="lg-box" style="max-height:65vh;height:65vh">${t('Chargement…')}</pre></div>`;
  document.body.append(d);
  let timer = null;
  d.addEventListener('close', () => { clearInterval(timer); d.remove(); });
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-x=close]')) d.close(); });
  d.showModal();
  const box = $('#lg-box', d);
  const load = async () => {
    let txt;
    try { txt = (await api('GET', `/api/deploy/apps/${enc(a.uuid)}/logs?lines=400`)).logs || t('(aucun log)'); } catch (e) { txt = e.message; }
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 30 || box.textContent === t('Chargement…');
    if (box.textContent !== txt) box.textContent = txt;
    if (atEnd) box.scrollTop = box.scrollHeight;
  };
  await load();
  timer = setInterval(() => { if ($('#lg-follow', d)?.checked && !document.hidden) load(); }, 3000);
}

async function viewDeployments(main) {
  const gen = routeGen;
  if (!overview) await refreshOverview();
  if (isStale(gen)) return;
  if (!overview?.deploy?.configured) return deployMissing(main, t('Déploiements'));
  let projects = await api('GET', '/api/projects').catch(() => []);
  const settings = await api('GET', '/api/settings').catch(() => ({}));
  if (isStale(gen)) return;
  let query = '', state = 'all';
  const STATES = [['all', t('Toutes')], ['ok', t('En ligne')], ['bad', t('À surveiller')]];
  main.innerHTML = `${pageHeader(t('Déploiements'), `<span id="dep-sum">${t('Tes applications {name}', { name: DN() })}</span>`,
    `<button class="btn icon" data-act="reload" aria-label="${t('Actualiser')}" title="${t('Actualiser')}">${ic('refresh', 22)}</button>${DEPLOY.url ? `<a class="btn" href="${esc(DEPLOY.url)}" target="_blank" rel="noopener">${ic('external', 18, 2)}${t('Ouvrir {name}', { name: DN() })}</a>` : ''}`)}
    <div class="toolbar">
      <label class="searchbox">${ic('search', 20, 2)}<span class="sr">${t('Filtrer les applications')}</span><input type="search" id="dq" placeholder="${t('Filtrer : nom, domaine, image, projet')}" autocomplete="off"></label>
      <div class="row" role="group" aria-label="${t('État')}" id="dstates" style="gap:6px"></div>
    </div>
    <div id="running"></div>
    <div class="appgrid" id="apps"><div class="skeleton"><span class="spin"></span></div></div>
    <div class="empty card" id="dnone" hidden>${t('Aucune application ne correspond.')}</div>`;
  // Filtre appliqué aux cartes déjà affichées (elles se mettent à jour toutes seules)
  const applyFilter = () => {
    setHTML($('#dstates'), STATES.map(([id, l]) => `<button type="button" class="chip" data-act="dstate" data-s="${id}" aria-pressed="${id === state}">${l}</button>`).join(''));
    const q = norm(query);
    let shown = 0;
    for (const card of $$('#apps .appcard')) {
      const a = apps.find((x) => x.uuid === card.dataset.uuid);
      if (!a) continue;
      const ok = deployStatus(a).dot === 'ok';
      const text = norm(`${a.name} ${a.fqdn} ${a.source} ${a.project || ''} ${proj(a.project)?.name || ''}`);
      const vis = (!q || text.includes(q)) && (state === 'all' || (state === 'ok' ? ok : !ok));
      card.hidden = !vis;
      if (vis) shown++;
    }
    $('#dnone').hidden = !apps.length || shown > 0;
  };
  $('#dq').oninput = (e) => { query = e.target.value; applyFilter(); };
  let apps = [];
  const proj = (slug) => projects.find((p) => p.slug === slug);
  const loadLast = async (a) => {
    const deps = await api('GET', `/api/deploy/apps/${enc(a.uuid)}/deployments`).catch(() => []);
    const box = $(`#last-${CSS.escape(a.uuid)}`);
    if (box) setHTML(box, deps.length ? depRow(deps[0]) : `<span class="small muted">${t('Jamais déployée')}</span>`);
    const h = $(`#hist-${CSS.escape(a.uuid)}`);
    if (h && !h.hidden) setHTML(h, deps.length ? deps.map(depRow).join('') : `<div class="small muted">${t('Pas d’historique.')}</div>`);
  };
  const load = async (fresh) => {
    try {
      apps = await api('GET', `/api/deploy/apps${fresh ? '?fresh=1' : ''}`);
      if (isStale(gen)) return;
      const on = apps.filter((a) => deployStatus(a).dot === 'ok').length;
      $('#dep-sum').textContent = apps.length ? `${tp(apps.length, '{n} application', '{n} applications')} · ${t('{n} en ligne', { n: on })}${apps.length - on ? ` · ${t('{n} à surveiller', { n: apps.length - on })}` : ''}` : t('Tes applications {name}', { name: DEPLOY.name });
      const keys = apps.map((a) => `${a.uuid}:${a.status}:${a.fqdn}:${a.source}`).join('|');
      const box = $('#apps');
      if (box.dataset.keys !== keys) {
        const open = $$('.app-hist:not([hidden])', box).map((h) => h.id);
        box.innerHTML = apps.length ? apps.map((a) => appCard(a, proj(a.project))).join('') : `<div class="empty card">${t('Aucune application dans {name}. Crée-en une depuis un nouveau projet (option « Créer l’application dans {name} »).', { name: DN() })}</div>`;
        box.dataset.keys = keys;
        for (const id of open) { const h = $('#' + CSS.escape(id), box); if (h) { h.hidden = false; h.previousElementSibling.querySelector('[data-act=history]')?.setAttribute('aria-expanded', 'true'); } }
        apps.forEach(loadLast);
      }
      applyFilter();
    } catch (e) { setHTML($('#apps'), `<div class="notice err">${esc(e.message)}</div>`); }
    try {
      const running = await api('GET', '/api/deploy/deployments');
      setHTML($('#running'), running.length ? `<div class="notice warn row" style="gap:10px"><span class="spin" style="color:var(--warn)"></span>${running.map((d) => t('{app} : {status}', { app: esc(d.app || t('Application')), status: esc(d.status === 'in_progress' ? t('déploiement en cours') : d.status === 'queued' ? t('en file d’attente') : d.status) })).join(' · ')}</div>` : '');
      if (running.length) apps.forEach(loadLast);
    } catch (_) { /* rien */ }
  };
  const act = async (uuid, action, msg) => {
    try { await api('POST', `/api/deploy/apps/${enc(uuid)}/${action}`); toast(msg); setTimeout(() => load(true), 1500); } catch (e) { fail(e); }
  };
  bind(main, {
    reload: () => load(true),
    deploy: async (el) => {
      el.disabled = true;
      try { await api('POST', '/api/deploy/deploy', { uuid: el.dataset.uuid }); toast(t('Déploiement lancé')); setTimeout(() => load(true), 1500); } catch (e) { fail(e); }
      el.disabled = false;
    },
    'app-start': (el) => act(el.dataset.uuid, 'start', t('Démarrage demandé')),
    dstate: (el) => { state = el.dataset.s; applyFilter(); },
    'app-domains': async (el) => { const a = apps.find((x) => x.uuid === el.dataset.uuid); if (a && await editDomains(a, settings.domain_suffix)) setTimeout(() => load(true), 1200); },
    'app-logs': (el) => { const a = apps.find((x) => x.uuid === el.dataset.uuid); if (a) openAppLogs(a); },
    history: async (el) => {
      const h = $(`#hist-${CSS.escape(el.dataset.uuid)}`);
      h.hidden = !h.hidden;
      el.setAttribute('aria-expanded', String(!h.hidden));
      if (!h.hidden) { h.innerHTML = '<div class="skeleton"><span class="spin"></span></div>'; const a = apps.find((x) => x.uuid === el.dataset.uuid); if (a) loadLast(a); }
    },
    'app-more': (el) => {
      const a = apps.find((x) => x.uuid === el.dataset.uuid);
      if (!a) return;
      const stopped = /^exited|^stopped/i.test(a.status || '');
      menu(el, [
        { label: t('Redémarrer'), icon: 'refresh', run: () => act(a.uuid, 'restart', t('Redémarrage demandé')) },
        stopped ? { label: t('Démarrer'), icon: 'play', run: () => act(a.uuid, 'start', t('Démarrage demandé')) }
          : { label: t('Arrêter'), icon: 'stop', danger: true, run: async () => { if (await confirmBox(t('Arrêter {name} ?', { name: a.name }), t('L’application ne répondra plus jusqu’à son prochain démarrage.'), t('Arrêter'))) act(a.uuid, 'stop', t('Arrêt demandé')); } },
        { label: t('Reconstruire sans cache'), icon: 'upload', run: async () => { try { await api('POST', '/api/deploy/deploy', { uuid: a.uuid, force: true }); toast(t('Reconstruction lancée')); setTimeout(() => load(true), 1500); } catch (e) { fail(e); } } },
        { label: t('Modifier les domaines'), icon: 'globe', run: async () => { if (await editDomains(a, settings.domain_suffix)) setTimeout(() => load(true), 1200); } },
        a.project ? { label: t('Voir le projet'), icon: 'folderOpen', run: () => { location.hash = `#/projets/${enc(a.project)}/deploiement`; } } : null,
        { label: t('Supprimer l’application…'), icon: 'trash', danger: true, run: async () => {
          const typed = await ask({ title: t('Supprimer {name} ?', { name: a.name }), text: t('L’application est supprimée de {name} avec ses conteneurs, ses volumes (données) et sa configuration. C’est définitif. Le dossier du projet dans Helmshell n’est pas touché.', { name: DEPLOY.name }), label: t('Tape « {name} » pour confirmer', { name: a.name }), okLabel: t('Supprimer'), danger: true });
          if (typed === null) return;
          if (typed !== a.name) { toast(t('Nom différent : rien n’a été supprimé'), true); return; }
          try { await api('DELETE', `/api/deploy/apps/${enc(a.uuid)}`, { confirm: a.uuid }); toast(t('{app} supprimée de {name}', { app: a.name, name: DEPLOY.name })); load(true); } catch (e) { fail(e); }
        } },
      ]);
    },
  });
  await load(false);
  every(8000, () => load(false));
}

/* ------------------------------------------------------------------ serveur */
async function viewServer(main) {
  const gen = routeGen;
  const RANGES = [[1, t('{n} h', { n: 1 })], [6, t('{n} h', { n: 6 })], [12, t('{n} h', { n: 12 })], [24, t('{n} h', { n: 24 })], [72, t('{n} j', { n: 3 })], [168, t('{n} j', { n: 7 })], [336, t('{n} j', { n: 14 })], [720, t('{n} j', { n: 30 })]];
  let hours = 24;
  try { hours = +localStorage.getItem('helmshell.range') || 24; } catch (_) { /* défaut */ }
  if (!RANGES.some((r) => r[0] === hours)) hours = 24;
  main.innerHTML = `${pageHeader(t('Serveur'), DEPLOY.provider ? t('Moyennes de charge jusqu’à 30 jours, ressources {name} et corbeille.', { name: DN() }) : t('Moyennes de charge jusqu’à 30 jours et corbeille.'),
    `<label class="rangesel">${ic('clock', 18, 2)}<span class="sr">${t('Période')}</span><select id="ranges" data-act="range">
      <optgroup label="${t('Heures')}">${[[1, t('Dernière heure')], [6, t('{n} dernières heures', { n: 6 })], [12, t('{n} dernières heures', { n: 12 })], [24, t('{n} dernières heures', { n: 24 })]].map(([h, l]) => `<option value="${h}">${l}</option>`).join('')}</optgroup>
      <optgroup label="${t('Jours')}">${[[72, t('{n} derniers jours', { n: 3 })], [168, t('{n} derniers jours', { n: 7 })], [336, t('{n} derniers jours', { n: 14 })], [720, t('{n} derniers jours', { n: 30 })]].map(([h, l]) => `<option value="${h}">${l}</option>`).join('')}</optgroup>
    </select>${ic('chevronDown', 16, 2)}</label>`)}
    <div class="kpis" id="kpis"></div>
    <div class="split">
      <section class="card card-pad stack"><div class="row" style="justify-content:space-between;align-items:baseline"><h2>${t('Processeur')}</h2><span style="font-size:24px;line-height:32px" id="now-cpu" title="${t('En ce moment')}"></span></div><div id="ch-cpu"></div></section>
      <section class="card card-pad stack"><div class="row" style="justify-content:space-between;align-items:baseline"><h2>${t('Mémoire')}</h2><span style="font-size:24px;line-height:32px" id="now-mem" title="${t('En ce moment')}"></span></div><div id="ch-mem"></div></section>
    </div>
    ${DEPLOY.provider ? `<section class="card" style="overflow:hidden;padding-bottom:8px"><div class="card-head"><h2>${t('Ressources {name}', { name: DN() })}</h2><button class="btn" data-act="res-refresh">${ic('refresh', 18, 2)}${t('Actualiser')}</button></div><div id="res"><div class="skeleton"><span class="spin"></span></div></div></section>` : ''}
    <section class="card" style="overflow:hidden;padding-bottom:8px"><div class="card-head"><h2>${t('Corbeille')}</h2><span class="row" id="trash-act"></span></div><div id="trash"><div class="skeleton"><span class="spin"></span></div></div></section>`;
  const pct = (v) => (v === null || v === undefined ? '—' : t('{n} %', { n: fmtNum(Math.round(v * 10) / 10) }));
  let lastMetrics = null;
  // Courbes à la largeur réelle des cartes : redessinées quand la fenêtre change de taille
  const drawGraphs = () => {
    const m = lastMetrics;
    if (!m || !$('#ch-cpu')) return;
    const gap = Math.max(300, ((hours * 3600) / 180) * 2.5);
    const to = Date.now() / 1000, from = to - hours * 3600;
    const opts = (box, label, i, j) => areaChart(m.points.map((p) => [p[0], p[i]]), { label, gap, caption: false, from, to,
      width: box.clientWidth, height: box.clientWidth < 420 ? 160 : 190, peaks: hours > 1 ? m.points.map((p) => [p[0], p[j]]) : null });
    setHTML($('#ch-cpu'), opts($('#ch-cpu'), t('Processeur'), 1, 4));
    setHTML($('#ch-mem'), opts($('#ch-mem'), t('Mémoire'), 2, 5));
  };
  let rsz = 0;
  const onResize = () => { clearTimeout(rsz); rsz = setTimeout(drawGraphs, 150); };
  window.addEventListener('resize', onResize);
  onLeave(() => window.removeEventListener('resize', onResize));
  const drawCharts = async () => {
    if ($('#ranges')) $('#ranges').value = String(hours);
    let m;
    try { m = await api('GET', `/api/metrics?hours=${hours}`); } catch (_) { return; }
    if (isStale(gen)) return;
    lastMetrics = m;
    drawGraphs();
    const s = m.summary;
    const range = RANGES.find((r) => r[0] === hours)[1];
    setHTML($('#kpis'), s ? [
      [t('Processeur moyen'), pct(s.cpu), t('sur {range}', { range })], [t('Pic processeur'), pct(s.cpu_max), t('moyenne minute la plus haute')],
      [t('Mémoire moyenne'), pct(s.mem), t('sur {range}', { range })], [t('Pic mémoire'), pct(s.mem_max), t('moyenne minute la plus haute')],
      [t('Disque'), pct(s.disk), s.disk === null ? t('mesuré depuis cette mise à jour') : t('moyenne sur {range}', { range })],
    ].map(([l, v, sub]) => `<div class="kpi"><span>${l}</span><b>${v}</b><small>${sub}</small></div>`).join('')
      : `<div class="empty small">${t('Pas encore de mesures sur cette période : une par minute, l’historique se remplit tout seul.')}</div>`);
  };
  const drawRes = async (fresh = false) => {
    if (!$('#res')) return;
    let list;
    try { list = await api('GET', `/api/deploy/resources${fresh ? '?fresh=1' : ''}`); } catch (e) {
      if (!isStale(gen)) setHTML($('#res'), `<div class="empty small">${esc(e.message)} · <a href="#/parametres">${t('Paramètres')}</a></div>`);
      return;
    }
    if (isStale(gen)) return;
    const TYPES = { application: t('Application'), service: t('Service'), 'standalone-postgresql': 'PostgreSQL', 'standalone-mysql': 'MySQL', 'standalone-mariadb': 'MariaDB', 'standalone-redis': 'Redis', 'standalone-mongodb': 'MongoDB' };
    setHTML($('#res'), list.length ? list.map((r) => {
      const d = deployStatus(r);
      return `<div class="list-row"><span class="lead sq" aria-hidden="true">${ic(r.type === 'application' ? 'code' : r.type === 'service' ? 'server' : 'db', 20, 2)}</span><span class="two"><span class="ellipsis">${esc(r.name)}</span><span class="sub">${esc(TYPES[r.type] || r.type)}</span></span><span class="pill ${d.dot}"><span class="dot"></span>${esc(d.short)}</span></div>`;
    }).join('') : `<div class="empty small">${t('Aucune ressource dans {name}.', { name: DN() })}</div>`);
  };
  const drawTrash = async () => {
    let items;
    try { items = await api('GET', '/api/trash'); } catch (e) { fail(e); return; }
    if (isStale(gen)) return;
    const total = items.reduce((a, b) => a + b.size, 0);
    $('#trash-act').innerHTML = items.length ? `<span class="muted">${tp(items.length, '{n} élément', '{n} éléments')} · ${fmtBytes(total)} · ${t('vidée après 30 jours')}</span><button class="btn danger" data-act="trash-empty">${t('Vider la corbeille')}</button>` : '';
    setHTML($('#trash'), items.length ? items.map((it) => `<div class="list-row" style="flex-wrap:wrap"><span class="lead sq" aria-hidden="true">${ic(it.dir ? 'folder' : 'file', 20, 2)}</span>
      <span class="two" style="flex:1 1 260px"><span class="mono ellipsis" style="font-size:14px">${it.project ? t('Projet {name}', { name: esc(it.meta?.name || it.slug) }) : `${esc(it.slug)}/${esc(it.path)}`}</span><span class="sub">${t('supprimé {ago}', { ago: ago(it.deleted) })} · ${fmtBytes(it.size)}</span></span>
      <button class="btn tonal" data-act="restore" data-id="${esc(it.id)}">${ic('undo', 18, 2)}${t('Restaurer')}</button>
      <button class="btn icon" data-act="purge" data-id="${esc(it.id)}" aria-label="${t('Supprimer définitivement')}">${ic('trash', 20, 2)}</button></div>`).join('')
      : `<div class="empty-ok small">${ic('check', 16, 2)}${t('La corbeille est vide.')}</div>`);
  };
  onLeave(onLive((st) => {
    if (!st.health?.mem_total) return;
    $('#now-cpu') && ($('#now-cpu').textContent = t('{n} %', { n: Math.round(st.health.cpu) }));
    $('#now-mem') && ($('#now-mem').textContent = `${t('{n} %', { n: Math.round((100 * st.health.mem_used) / st.health.mem_total) })} · ${t('{used} / {total} Go', { used: fmtGo(st.health.mem_used), total: fmtGo(st.health.mem_total) })}`);
  }));
  bind(main, {
    range: (el) => { hours = +el.value; try { localStorage.setItem('helmshell.range', hours); } catch (_) { /* rien */ } drawCharts(); },
    'res-refresh': () => drawRes(true),
    restore: async (el) => { try { const r = await api('POST', `/api/trash/${enc(el.dataset.id)}/restore`); toast(t('Restauré : {path}', { path: `${r.slug}/${r.path}` })); drawTrash(); } catch (e) { fail(e); } },
    purge: async (el) => { if (!await confirmBox(t('Supprimer définitivement ?'), t('Cet élément ne pourra plus être restauré.'), t('Supprimer'))) return; try { await api('DELETE', `/api/trash/${enc(el.dataset.id)}`); drawTrash(); } catch (e) { fail(e); } },
    'trash-empty': async () => { if (!await confirmBox(t('Vider la corbeille ?'), t('Tous les éléments seront supprimés définitivement.'), t('Vider'))) return; try { await api('DELETE', '/api/trash'); toast(t('Corbeille vidée')); drawTrash(); } catch (e) { fail(e); } },
  });
  await Promise.all([drawCharts(), drawRes(), drawTrash()]);
  every(60000, drawCharts);
}

/* ---------------------------------------------------------------- paramètres */
// Fonctions : les libellés sont traduits à l'affichage, pas au chargement du module
const NSVC = () => [['off', t('Aucune')], ['ntfy', 'ntfy'], ['gotify', 'Gotify'], ['discord', 'Discord']];
const STABS = () => [['claude', t('Agents'), 'spark'], ['deploy', t('Déploiement'), 'upload'], ['git', 'Git', 'branch'], ['notif', t('Notifications'), 'bell'], ['securite', t('Sécurité'), 'shield'], ['apparence', t('Apparence'), 'palette']];
let settingsTab = 'claude';
try { settingsTab = localStorage.getItem('helmshell.stab') || 'claude'; } catch (_) { /* défaut */ }
if (settingsTab === 'coolify') settingsTab = 'deploy';
if (!STABS().some((x) => x[0] === settingsTab)) settingsTab = 'claude';
async function viewSettings(main) {
  const gen = routeGen;
  const s = await api('GET', '/api/settings');
  if (isStale(gen)) return;
  if (s.agents?.agents) agentsInfo = s.agents;
  const codexInfo = agentDef('codex') || { available: false, bin: s.codex_bin };
  const claudeInfo = agentDef('claude') || { available: true, bin: s.claude_bin };
  // Délais d'actualisation de l'utilisation, communs à Claude et Codex
  const everyOpts = (cur) => [[2, t('Toutes les {n} min', { n: 2 })], [5, t('Toutes les {n} min', { n: 5 })], [10, t('Toutes les {n} min', { n: 10 })], [15, t('Toutes les {n} min', { n: 15 })], [30, t('Toutes les {n} min', { n: 30 })], [60, t('Toutes les heures')], [0, t('Seulement quand l’Accueil est ouvert')]]
    .map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('');
  const codexModes = agentModes('codex');
  main.innerHTML = `${pageHeader(t('Paramètres'), t('Enregistrés dans {path} sur le serveur.', { path: '<span class="mono">~/.config/helmshell/config.json</span>' }))}
    <form id="settings" class="stack" style="gap:0">
      <div class="stabs" role="tablist" aria-label="${t('Rubriques des paramètres')}">${STABS().map(([id, l, icon]) => `<button type="button" role="tab" data-act="stab" data-t="${id}" aria-selected="${id === settingsTab}">${ic(icon, 22, 2)}${l}</button>`).join('')}</div>
      <div class="spanes">
      <section class="card form-section" data-pane="claude" ${settingsTab === 'claude' ? '' : 'hidden'}>
        <h2><span class="ic2">${ic('spark', 20, 2)}</span>${t('Projets et agents')}</h2>
        <label class="field"><span>${t('Dossier racine des projets')}</span><input name="projects_root" class="mono" value="${esc(s.projects_root)}"><span class="hint">${t('Chaque sous-dossier est un projet. Pour {path} : {cmd}', { path: '<span class="mono">/srv/projets</span>', cmd: '<span class="mono">sudo mkdir -p /srv/projets &amp;&amp; sudo chown $USER: /srv/projets</span>' })}</span></label>
        <label class="field"><span>${t('Agent par défaut')}</span><select name="default_agent">${[['', t('Automatique')], ['claude', 'Claude Code'], ['codex', 'Codex']].map(([v, l]) => `<option value="${v}" ${v === (s.default_agent || '') ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <span class="hint">${t('Agent proposé pour les tâches de fond et les nouvelles sessions. Automatique : Claude Code s’il est installé, sinon Codex.')}</span></label>
        <label class="check"><span><b>${t('Vérifier les mises à jour')}</b><small>${t('Interroge GitHub au plus une fois par jour pour savoir si une nouvelle version de Helmshell est publiée. Rien d’autre n’est envoyé.')}</small></span><input type="checkbox" role="switch" class="switch" name="update_check" ${s.update_check !== false ? 'checked' : ''}></label>
        <h3 class="sec-h agent-h">${agentLogo('claude', 22)}Claude Code ${claudeInfo.available ? `<span class="pill sm ok"><span class="dot"></span>${t('Installé')}</span>` : `<span class="pill sm warn"><span class="dot"></span>${t('Introuvable')}</span>`}</h3>
        ${claudeInfo.available ? '' : `<p class="hint" style="margin:0">${t('Commande {bin} introuvable sur le serveur. Installe Claude Code ({cmd}) puis connecte-toi avec {login}, ou indique son chemin ci-dessous.', { bin: `<span class="mono">${esc(claudeInfo.bin || 'claude')}</span>`, cmd: '<span class="mono">curl -fsSL https://claude.ai/install.sh | bash</span>', login: '<span class="mono">claude</span>' })}</p>`}
        <div class="fgrid">
          <label class="field"><span>${t('Exécutable Claude')}</span><input name="claude_bin" class="mono" value="${esc(s.claude_bin)}"></label>
          <label class="field"><span>${t('Permissions par défaut')}</span><select name="default_mode">${MODES.map((m) => `<option value="${m.id}" ${m.id === s.default_mode ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>${t('Actualiser l’utilisation de Claude')}</span><select name="usage_every">${[[2, t('Toutes les {n} min', { n: 2 })], [5, t('Toutes les {n} min', { n: 5 })], [10, t('Toutes les {n} min', { n: 10 })], [15, t('Toutes les {n} min', { n: 15 })], [30, t('Toutes les {n} min', { n: 30 })], [60, t('Toutes les heures')], [0, t('Seulement quand l’Accueil est ouvert')]]
    .map(([v, l]) => `<option value="${v}" ${v === s.usage_every ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <span class="hint">${t('Chiffres du bouton « Utilisation de Claude » de la barre du haut, lus avec la commande {cmd} de Claude Code. Elle ne sollicite pas le modèle : aucun jeton consommé.', { cmd: '<span class="mono">/usage</span>' })}</span></label>
        <h3 class="sec-h agent-h">${agentLogo('codex', 22)}Codex ${codexInfo.available ? `<span class="pill sm ok"><span class="dot"></span>${t('Installé')}</span>` : `<span class="pill sm warn"><span class="dot"></span>${t('Introuvable')}</span>`}</h3>
        ${codexInfo.available && codexInfo.sandbox && !codexInfo.sandbox.ok ? `<div class="notice warn stack" style="gap:8px" id="codex-sbx">
          <span>${t('Le bac à sable de Codex ne démarre pas sur ce serveur : en Lecture seule et en Automatique, toutes ses commandes sont refusées. Seul l’Accès complet fonctionne, sans protection.')}</span>
          ${codexInfo.sandbox.fix ? `<span>${t('Correctif : installe le paquet bubblewrap du système (son profil AppArmor autorise le bac à sable), puis vérifie à nouveau.')}</span><code class="mono">${esc(codexInfo.sandbox.fix)}</code>` : `<span>${t('bubblewrap est installé mais refusé : vérifie la règle AppArmor des espaces de noms (kernel.apparmor_restrict_unprivileged_userns).')}</span>`}
          ${codexInfo.sandbox.detail ? `<span class="small muted mono">${esc(codexInfo.sandbox.detail)}</span>` : ''}
          <button type="button" class="btn sm" data-act="codex-sbx" style="align-self:flex-start">${ic('refresh', 16, 2)}${t('Vérifier à nouveau')}</button></div>`
          : codexInfo.available && codexInfo.sandbox?.ok ? `<p class="hint" style="margin:0">${ic('check', 14, 2)} ${t('Bac à sable de Codex opérationnel.')}</p>` : ''}
        ${codexInfo.available ? '' : `<p class="hint" style="margin:0">${t('Commande {bin} introuvable sur le serveur. Installe Codex CLI ({cmd}) puis connecte-toi avec {login}, ou indique son chemin ci-dessous.', { bin: `<span class="mono">${esc(codexInfo.bin || 'codex')}</span>`, cmd: '<span class="mono">npm install -g @openai/codex</span>', login: '<span class="mono">codex login</span>' })}</p>`}
        <div class="fgrid">
          <label class="field"><span>${t('Exécutable Codex')}</span><input name="codex_bin" class="mono" value="${esc(s.codex_bin || '')}" placeholder="codex"></label>
          <label class="field"><span>${t('Permissions par défaut de Codex')}</span><select name="codex_default_mode">${codexModes.map((m) => `<option value="${esc(m.id)}" ${m.id === s.codex_default_mode ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>${t('Actualiser l’utilisation de Codex')}</span><select name="codex_usage_every">${everyOpts(s.codex_usage_every ?? 5)}</select>
          <span class="hint">${t('Chiffres du bouton « Utilisation de Codex » de la barre du haut, lus auprès du compte par le serveur d’application de Codex ({cmd}). Aucun message au modèle : aucun jeton consommé.', { cmd: '<span class="mono">account/rateLimits/read</span>' })}</span></label>
      </section>
      <section class="card form-section" data-pane="deploy" ${settingsTab === 'deploy' ? '' : 'hidden'}>
        <h2><span class="ic2">${ic('upload', 20, 2)}</span>${t('Déploiement')}</h2>
        <p class="muted small" style="margin:0">${t('L’outil qui construit et héberge tes applications. Sans outil, le menu Déploiements et les onglets de déploiement disparaissent.')}</p>
        <input type="hidden" name="deploy_provider" value="${esc(s.deploy_provider || '')}">
        <div class="seg" role="group" aria-label="${t('Outil de déploiement')}" style="align-self:flex-start">${[['', t('Aucun'), 'x'], ['coolify', 'Coolify', 'upload'], ['dokploy', 'Dokploy', 'upload']].map(([id, l, icon]) => `<button type="button" class="ico" data-act="dprov" data-p="${id}" aria-pressed="${id === (s.deploy_provider || '')}">${ic(icon, 18, 2)}${l}</button>`).join('')}</div>
        <div class="stack" style="gap:16px" data-prov="coolify" ${s.deploy_provider === 'coolify' ? '' : 'hidden'}>
        <div class="fgrid">
          <label class="field"><span>${t('URL de l’API (depuis le serveur)')}</span><input name="coolify_url" class="mono" value="${esc(s.coolify_url)}" placeholder="http://localhost:8000"></label>
          <label class="field"><span>${t('URL publique (lien « Ouvrir Coolify »)')}</span><input name="coolify_public_url" class="mono" value="${esc(s.coolify_public_url)}" placeholder="${t('https://coolify.exemple.fr')}"></label>
        </div>
        <label class="field"><span>${t('Jeton d’API')}</span><input name="coolify_token" type="password" autocomplete="off" placeholder="${s.coolify_token_set ? t('•••••••• (déjà enregistré — laisse vide pour le garder)') : 'Coolify › Keys & Tokens › API tokens'}"></label>
        <div class="row"><button type="button" class="btn" data-act="test">${t('Tester et charger les projets Coolify')}</button><span id="cf-test" class="small muted"></span></div>
        <div class="fgrid">
          <label class="field"><span>${t('Projet Coolify pour les nouvelles applis')}</span><select name="coolify_project_uuid" id="cf-proj"><option value="${esc(s.coolify_project_uuid)}">${s.coolify_project_uuid ? esc(s.coolify_project_uuid) : t('Le premier trouvé')}</option></select></label>
          <label class="field"><span>${t('Serveur Coolify')}</span><select name="coolify_server_uuid" id="cf-srv"><option value="${esc(s.coolify_server_uuid)}">${s.coolify_server_uuid ? esc(s.coolify_server_uuid) : t('Le premier trouvé')}</option></select></label>
          <label class="field"><span>${t('Environnement')}</span><input name="coolify_environment" value="${esc(s.coolify_environment)}"></label>
        </div>
        </div>
        <div class="stack" style="gap:16px" data-prov="dokploy" ${s.deploy_provider === 'dokploy' ? '' : 'hidden'}>
          <div class="fgrid">
            <label class="field"><span>${t('URL de Dokploy (depuis le serveur)')}</span><input name="dokploy_url" class="mono" value="${esc(s.dokploy_url)}" placeholder="http://host.docker.internal:3000"></label>
            <label class="field"><span>${t('URL publique (lien « Ouvrir Dokploy »)')}</span><input name="dokploy_public_url" class="mono" value="${esc(s.dokploy_public_url)}" placeholder="${t('https://dokploy.exemple.fr')}"></label>
          </div>
          <label class="field"><span>${t('Clé d’API')}</span><input name="dokploy_token" type="password" autocomplete="off" placeholder="${s.dokploy_token_set ? t('•••••••• (déjà enregistrée — laisse vide pour la garder)') : 'Dokploy › Settings › Profile › API/CLI › Generate'}"></label>
          <div class="row"><button type="button" class="btn" data-act="dk-test">${t('Tester et charger les projets Dokploy')}</button><span id="dk-test" class="small muted"></span></div>
          <div class="fgrid">
            <label class="field"><span>${t('Projet et environnement des nouvelles applis')}</span><select name="dokploy_environment_id" id="dk-env"><option value="${esc(s.dokploy_environment_id)}">${s.dokploy_environment_id ? esc(s.dokploy_environment_id) : t('Le premier trouvé')}</option></select></label>
            <label class="field"><span>${t('Serveur')}</span><select name="dokploy_server_id" id="dk-srv"><option value="${esc(s.dokploy_server_id)}">${s.dokploy_server_id ? esc(s.dokploy_server_id) : t('Celui de Dokploy')}</option></select></label>
          </div>
          <p class="hint" style="margin:0">${t('Avec Dokploy, les retours à une version précédente se font depuis Dokploy.')}</p>
        </div>
        <label class="field" data-prov-any ${s.deploy_provider ? '' : 'hidden'}><span>${t('Domaine de base des sous-domaines')}</span><input name="domain_suffix" class="mono" value="${esc(s.domain_suffix)}" placeholder="${t('exemple.fr')}"><span class="hint">${t('Pour l’option « Exposer via un sous-domaine » des nouveaux projets : {example}', { example: `&lt;${t('projet')}&gt;.${t('exemple.fr')}` })}</span></label>
      </section>
      <section class="card form-section" data-pane="git" ${settingsTab === 'git' ? '' : 'hidden'}>
        <h2><span class="ic2">${ic('branch', 20, 2)}</span>${t('Comptes Git')}</h2>
        <p class="muted small" style="margin:0">${t('Lie GitHub, GitLab, Gitea, Forgejo ou Codeberg pour importer tes dépôts dans un nouveau projet. Le jeton sert aussi à cloner, récupérer et pousser en HTTPS vers cette forge ; il reste sur le serveur et n’est jamais écrit dans les dépôts.')}</p>
        <div id="forge-list" class="forge-list"></div>
        <h3 style="margin-top:8px">${t('Lier un compte')}</h3>
        <div class="seg" role="group" aria-label="${t('Forge')}" id="fg-kinds" style="align-self:flex-start;flex-wrap:wrap"></div>
        <div class="stack" style="gap:8px"><span class="hint" style="font-weight:500">${t('Accès du jeton')}</span>
          <div class="seg" role="group" aria-label="${t('Accès du jeton')}" id="fg-access" style="align-self:flex-start;flex-wrap:wrap"></div></div>
        <div class="fgrid">
          <label class="field"><span>${t('Adresse de la forge')}</span><input id="fg-url" class="mono" autocomplete="off"></label>
          <label class="field"><span>${t('Jeton d’accès personnel')}</span><input id="fg-token" type="password" autocomplete="off" placeholder="${t('Colle le jeton ici')}"></label>
        </div>
        <p class="hint" id="fg-help" style="margin:0"></p>
        <div class="row" style="gap:12px"><button type="button" class="btn tonal" data-act="forge-add">${ic('plus', 18, 2)}${t('Lier le compte')}</button><span class="small" id="fg-res"></span></div>
      </section>
      <section class="card form-section" data-pane="notif" ${settingsTab === 'notif' ? '' : 'hidden'}>
        <h2><span class="ic2">${ic('bell', 20, 2)}</span>${t('Notifications')}</h2>
        <p class="muted small" style="margin:0">${t('Quand une IA (Claude Code ou Codex) pose une question, attend ta validation, s’arrête, ou qu’une tâche se termine.')}</p>
        <input type="hidden" name="notify_service" value="${esc(s.notify_service || 'off')}">
        <div class="stack" style="gap:8px"><span class="hint" style="font-weight:500">${t('Service')}</span>
          <div class="seg" role="group" aria-label="${t('Service de notification')}" style="align-self:flex-start">${NSVC().map(([id, l]) => `<button type="button" class="ico" data-act="nsvc" data-s="${id}" aria-pressed="${id === (s.notify_service || 'off')}">${id === 'off' ? ic('x', 18, 2) : `<img class="svc-logo" src="/logos/${id}.svg" alt="" width="20" height="20">`}${l}</button>`).join('')}</div></div>
        <div class="stack" style="gap:16px" data-svc="ntfy" ${s.notify_service === 'ntfy' ? '' : 'hidden'}>
          <p class="hint" style="margin:0">${t('Installe l’app {app} (Android, iOS) et abonne-toi au même sujet : les boutons {yesno} répondent directement à Claude.', { app: '<b>ntfy</b>', yesno: `<b>${t('Oui / Non')}</b>` })} ${t('Choisis un sujet difficile à deviner : sur ntfy.sh, n’importe qui connaissant le nom peut lire les messages.')}</p>
          <div class="fgrid">
            <label class="field"><span>${t('Adresse ntfy (serveur + sujet)')}</span><input name="ntfy_url" class="mono" value="${esc(s.ntfy_url)}" placeholder="${t('https://ntfy.sh/helmshell-un-nom-long-et-secret')}"></label>
            <label class="field"><span>${t('Jeton ntfy (facultatif)')}</span><input name="ntfy_token" type="password" autocomplete="off" placeholder="${s.ntfy_token_set ? t('•••••••• (déjà enregistré)') : t('Pour un serveur ntfy protégé')}"></label>
          </div>
        </div>
        <div class="stack" style="gap:16px" data-svc="gotify" ${s.notify_service === 'gotify' ? '' : 'hidden'}>
          <p class="hint" style="margin:0">${t('Dans Gotify : {path}, puis copie le jeton de l’application.', { path: '<b>Apps › Create Application</b>' })} ${t('Les liens {yesno} de la notification ouvrent une page de confirmation dans Helmshell.', { yesno: `<b>${t('Oui / Non')}</b>` })}</p>
          <div class="fgrid">
            <label class="field"><span>${t('Adresse du serveur Gotify')}</span><input name="gotify_url" class="mono" value="${esc(s.gotify_url)}" placeholder="${t('https://gotify.exemple.fr')}"></label>
            <label class="field"><span>${t('Jeton de l’application')}</span><input name="gotify_token" type="password" autocomplete="off" placeholder="${s.gotify_token_set ? t('•••••••• (déjà enregistré)') : 'Axxxxxxxxxxxxxx'}"></label>
          </div>
        </div>
        <div class="stack" style="gap:16px" data-svc="discord" ${s.notify_service === 'discord' ? '' : 'hidden'}>
          <p class="hint" style="margin:0">${t('Dans Discord : {path}.', { path: `<b>${t('Paramètres du salon › Intégrations › Webhooks › Nouveau webhook › Copier l’URL du webhook')}</b>` })} ${t('Les liens {yesno} du message ouvrent une page de confirmation dans Helmshell.', { yesno: `<b>${t('Oui / Non')}</b>` })}</p>
          <label class="field"><span>${t('URL du webhook')}</span><input name="discord_webhook" type="password" class="mono" autocomplete="off" placeholder="${s.discord_webhook_set ? t('•••••••• (déjà enregistrée — laisse vide pour la garder)') : 'https://discord.com/api/webhooks/…'}"></label>
        </div>
        <label class="field" data-svc-any ${s.notify_service === 'off' ? 'hidden' : ''}><span>${t('Adresse de Helmshell vue depuis le téléphone')}</span><input name="public_url" class="mono" value="${esc(s.public_url || location.origin)}" placeholder="${esc(location.origin)}"><span class="hint">${t('Sert aux liens et aux boutons des notifications. Le téléphone doit être sur le réseau local (ou NetBird).')}</span></label>
        <label class="check" data-svc-any ${s.notify_service === 'off' ? 'hidden' : ''}><span><b>${t('Prévenir quand l’IA a fini')}</b><small>${t('Quand Claude ou Codex, dans le terminal d’un projet, passe de « travaille » à « en attente » (après au moins 20 s de travail).')}</small></span><input type="checkbox" role="switch" class="switch" name="notify_done" ${s.notify_done !== false ? 'checked' : ''}></label>
        <div class="row" data-svc-any ${s.notify_service === 'off' ? 'hidden' : ''}><button type="button" class="btn" data-act="ntfy-test">${ic('bell', 18, 2)}${t('Envoyer une notification de test')}</button><span id="ntfy-res" class="small muted"></span></div>
        <div class="row" id="browser-notif"></div>
      </section>
      <section class="card form-section" data-pane="securite" ${settingsTab === 'securite' ? '' : 'hidden'}>
        <h2><span class="ic2">${ic('shield', 20, 2)}</span>${t('Sécurité')}</h2>
        <div class="stack acc" id="access"></div>
        <div class="stack acc" id="oidc"></div>
        <h3 class="sec-h">${t('Mot de passe')}${s.oidc?.only ? ` <span class="pill">${t('Inactif : OIDC seul')}</span>` : ''}</h3>
        ${s.password_from_env ? `<p class="muted">${t('Le mot de passe est défini par la variable HELMSHELL_PASSWORD.')}</p>` : `
        <div class="fgrid">
          <label class="field"><span>${t('Mot de passe actuel')}</span><input name="current_password" type="password" autocomplete="current-password"></label>
          <label class="field"><span>${t('Nouveau mot de passe')}</span><input name="new_password" type="password" autocomplete="new-password" minlength="8"></label>
        </div><p class="hint">${t('Changer le mot de passe déconnecte tous les autres appareils.')}</p>`}
        <div class="row sess-row"><span class="grow small muted">${t('Sessions : 7 jours sans utilisation, renouvelées à l’usage. Un appareil perdu ou un doute : déconnecte tout, celui-ci reste connecté.')}</span>
          <button type="button" class="btn" data-act="logout-all">${ic('logout', 18, 2)}${t('Déconnecter tous les appareils')}</button></div>
        <div class="stack tfa" id="tfa"></div>
      </section>
      <section class="card form-section" data-pane="apparence" ${settingsTab === 'apparence' ? '' : 'hidden'}>
        <h2><span class="ic2">${ic('palette', 20, 2)}</span>${t('Apparence')}</h2>
        <div class="stack" style="gap:8px"><span class="hint" style="font-weight:500">${t('Langue')}</span>
          <div class="seg" role="group" aria-label="${t('Langue')}" style="align-self:flex-start">${[['en', 'English'], ['fr', 'Français']].map(([id, l]) => `<button type="button" data-act="lang" data-l="${id}" lang="${id}" aria-pressed="${id === LANG}">${l}</button>`).join('')}</div></div>
        <div class="stack" style="gap:8px"><span class="hint" style="font-weight:500">${t('Thème')}</span>
          <div class="seg" role="group" aria-label="${t('Thème')}" style="align-self:flex-start">${THEMES.map(([id, l]) => `<button type="button" data-act="theme" data-t="${id}" aria-pressed="${id === themePref}">${l}</button>`).join('')}</div></div>
        <div class="stack" style="gap:8px"><span class="hint" style="font-weight:500">${t('Style')}</span>
          <div class="styles" role="radiogroup" aria-label="${t('Style')}">${STYLES.map(([id, l, sub]) => `<button type="button" class="stylec" role="radio" data-act="style" data-s="${id}" aria-checked="${id === stylePref}">
            <span class="spv spv-${id === 'material' ? 'mat' : id}" aria-hidden="true"><span class="spc"><i></i><i></i></span><u></u></span><b>${l}</b><small>${sub}</small></button>`).join('')}</div></div>
        <div class="stack" style="gap:8px"><span class="hint" style="font-weight:500">${t('Couleur')}</span>
          <div class="seeds many" role="radiogroup" aria-label="${t('Couleur')}">${SEEDS.map(([id, l, c]) => `<button type="button" class="seed" role="radio" data-act="seed" data-s="${id}" aria-checked="${id === seedPref}"><span class="sw" aria-hidden="true">${c.map((x) => `<span style="background:${x}"></span>`).join('')}</span>${l}</button>`).join('')}</div></div>
        <div class="stack" style="gap:8px"><span class="hint" style="font-weight:500">${t('Application')}</span><div id="pwa-box" class="pwa-box"></div></div>
      </section>
      </div>
      <button class="btn fab save" title="${t('Enregistre les réglages de tous les onglets')}">${ic('check', 24, 2.2)}${t('Enregistrer')}</button>
    </form>`;
  const form = $('#settings');
  // Téléphone : l'onglet choisi reste visible dans la rangée qui défile
  const stabs = $('.stabs', main);
  if (stabs && stabs.scrollWidth > stabs.clientWidth) $('[aria-selected=true]', stabs)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  // Champs des notifications (les secrets ne partent que s'ils ont été saisis)
  const notifBody = () => {
    const body = { notify_service: form.notify_service.value, ntfy_url: form.ntfy_url.value, gotify_url: form.gotify_url.value, public_url: form.public_url.value };
    for (const k of ['ntfy_token', 'gotify_token', 'discord_webhook']) if (form[k].value) body[k] = form[k].value.trim();
    body.notify_done = form.notify_done.checked;
    return body;
  };
  const drawBrowserNotif = () => {
    const box = $('#browser-notif');
    if (!box) return;
    if (!('Notification' in window) || !window.isSecureContext) {
      box.innerHTML = `<span class="small muted">${t('Notifications du navigateur : indisponibles en HTTP sur le réseau local (le navigateur les réserve aux sites HTTPS). Utilise un des services ci-dessus, et l’onglet affiche déjà un compteur « (1) Helmshell ».')}</span>`;
    } else if (Notification.permission === 'granted') {
      box.innerHTML = `<span class="small c-ok">${ic('check', 14, 2)} ${t('Notifications du navigateur activées (quand l’onglet est en arrière-plan).')}</span>`;
    } else {
      box.innerHTML = `<button type="button" class="btn" data-act="browser-notif">${ic('bell', 15)}${t('Activer les notifications du navigateur')}</button>`;
    }
  };
  drawBrowserNotif();
  /* --- comptes Git --- */
  let fgKind = 'github';
  let fgAccess = 'write';
  const FG_ACCESS = [['read', t('Lecture'), t('Importer, cloner et récupérer')], ['write', t('Lecture et écriture'), t('Pousser en plus')], ['full', t('Complet'), t('Tous les droits du compte')]];
  const sc = (list) => list.map((x) => `<span class="mono">${x}</span>`).join(', ');
  const fgHelp = () => {
    const url = ($('#fg-url')?.value || '').trim().replace(/\/+$/, '');
    const a = fgAccess;
    if (fgKind === 'github') {
      if (a === 'read') return `${t('Crée un {link} : {access} sur « All repositories », puis {contents} et {metadata} en « Read-only ».', { link: `<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">${t('jeton à granularité fine')}</a>`, access: '<b>Repository access</b>', contents: '<b>Contents</b>', metadata: '<b>Metadata</b>' })} ${t('(Un jeton classique ne sait pas lire les dépôts privés sans le droit d’écrire.)')}`;
      const scopes = a === 'write' ? ['repo', 'read:org'] : ['repo', 'workflow', 'read:org', 'admin:repo_hook', 'delete_repo', 'write:packages'];
      return t('Crée un {link} : les droits {scopes} sont pré-cochés.', { link: `<a href="https://github.com/settings/tokens/new?scopes=${scopes.join(',')}&description=Helmshell" target="_blank" rel="noopener">${t('jeton classique')}</a>`, scopes: sc(scopes) });
    }
    if (fgKind === 'gitlab') {
      const scopes = a === 'read' ? ['read_api', 'read_user', 'read_repository'] : a === 'write' ? ['read_api', 'read_user', 'read_repository', 'write_repository'] : ['api'];
      return t('Crée un {link} : {scopes} pré-cochés.', { link: `<a href="${esc(url || 'https://gitlab.com')}/-/user_settings/personal_access_tokens?name=Helmshell&scopes=${scopes.join(',')}" target="_blank" rel="noopener">${t('jeton d’accès personnel')}</a>`, scopes: sc(scopes) });
    }
    const scopes = a === 'read' ? ['read:user', 'read:repository'] : a === 'write' ? ['read:user', 'write:repository'] : ['write:repository', 'write:user', 'write:organization', 'write:issue', 'write:package'];
    return `${url ? t('Dans {link}, génère un jeton avec {scopes}', { link: `<a href="${esc(url)}/user/settings/applications" target="_blank" rel="noopener">${t('Paramètres › Applications')}</a>`, scopes: sc(scopes) }) : t('Dans Paramètres › Applications de ta forge, génère un jeton avec {scopes}', { scopes: sc(scopes) })}${a === 'full' ? ` ${t('(ou « Tout » en écriture)')}` : ''}.`;
  };
  const drawForgeForm = () => {
    setHTML($('#fg-kinds'), FORGES.map(([k, l]) => `<button type="button" class="ico" data-act="fg-kind" data-k="${k}" aria-pressed="${k === fgKind}">${forgeLogo(k)}${l}</button>`).join(''));
    setHTML($('#fg-access'), FG_ACCESS.map(([k, l, h]) => `<button type="button" data-act="fg-access" data-a="${k}" aria-pressed="${k === fgAccess}" title="${h}">${l}</button>`).join(''));
    $('#fg-help').innerHTML = fgHelp();
  };
  const drawForges = async () => {
    let list = [];
    try { list = await api('GET', '/api/forges'); } catch (e) { fail(e); }
    const box = $('#forge-list');
    if (!box) return;
    box.innerHTML = list.map((f) => `<article class="forge-card">
        <div class="row nowrap" style="gap:14px;align-items:center">
          ${f.avatar ? `<img class="forge-avatar" src="${esc(f.avatar)}" alt="" width="48" height="48" referrerpolicy="no-referrer">` : `<span class="lead sq">${forgeLogo(f.kind, 26)}</span>`}
          <span class="two" style="min-width:0"><span class="ellipsis"><b>${esc(f.user)}</b>${f.name ? ` <span class="muted">· ${esc(f.name)}</span>` : ''}</span><span class="sub row nowrap" style="gap:6px">${forgeLogo(f.kind, 14)}${esc(forgeName(f.kind))} · <span class="mono ellipsis">${esc(hostOf(f.url))}</span></span></span>
        </div>
        <div class="row" style="gap:6px"><span class="pill sm ${f.access === 'read' ? '' : f.access === 'full' ? 'warn' : 'accent'}">${ic('lock', 12, 2)}${esc((FG_ACCESS.find((x) => x[0] === f.access) || FG_ACCESS[1])[1])}</span></div>
        <div class="row" style="gap:8px;margin-top:auto">
          <a class="btn sm tonal" href="${esc(`${f.url.replace(/\/+$/, '')}/${f.user}`)}" target="_blank" rel="noopener">${ic('external', 16, 2)}${t('Voir les dépôts')}</a>
          <button type="button" class="btn sm danger" data-act="forge-del" data-id="${esc(f.id)}" data-label="${esc(`${forgeName(f.kind)} · ${f.user}`)}">${ic('trash', 16, 2)}${t('Supprimer')}</button>
        </div></article>`).join('');
  };
  $('#fg-url').value = FORGES[0][2];
  $('#fg-url').oninput = () => { $('#fg-help').innerHTML = fgHelp(); };
  for (const id of ['fg-url', 'fg-token']) $('#' + id).onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); $('[data-act=forge-add]').click(); } };
  drawForgeForm();
  drawForges();
  /* --- double authentification --- */
  let tfa = s.totp || { enabled: false, recovery_left: 0 };
  const recoveryBox = (codes) => `<div class="stack" style="gap:10px"><div class="notice warn">${t('{strong} : ils ne seront plus affichés. Chacun permet une connexion si tu n’as plus ton téléphone.', { strong: `<b>${t('Note ces codes de secours maintenant')}</b>` })}</div>
    <div class="codes mono">${codes.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
    <div class="row" style="gap:8px"><button type="button" class="btn" data-act="tfa-copy" data-codes="${esc(codes.join('\n'))}">${ic('copy', 18, 2)}${t('Copier les codes')}</button><button type="button" class="btn primary" data-act="tfa-done">${t('J’ai noté mes codes')}</button></div></div>`;
  const drawTfa = (mode = '', extra = null) => {
    const box = $('#tfa');
    if (!box) return;
    const head = `<h3 class="row" style="gap:10px">${t('Double authentification')} ${tfa.enabled ? `<span class="pill ok"><span class="dot"></span>${t('Activée')}</span>` : `<span class="pill">${t('Désactivée')}</span>`}</h3>`;
    if (mode === 'setup') {
      box.innerHTML = `${head}
        <div class="tfa-setup">
          <div class="qr" id="tfa-qr" role="img" aria-label="${t('QR code à scanner avec l’application d’authentification')}"></div>
          <div class="stack" style="gap:12px;min-width:0">
            <p class="small" style="margin:0"><b>1.</b> ${t('Dans Google Authenticator, Aegis, 2FAS ou Bitwarden, ajoute un compte en scannant ce QR code.')}</p>
            <div class="stack" style="gap:4px"><span class="small muted">${t('Ou saisis cette clé à la main :')}</span>
              <div class="row nowrap" style="gap:8px"><div class="pathbox grow" style="letter-spacing:1px">${esc(extra.secret.match(/.{1,4}/g).join(' '))}</div><button type="button" class="btn icon" data-act="tfa-copy" data-codes="${esc(extra.secret)}" aria-label="${t('Copier la clé')}">${ic('copy', 18)}</button></div></div>
            <p class="small" style="margin:0"><b>2.</b> ${t('Tape le code à 6 chiffres affiché par l’app.')}</p>
            <div class="row" style="gap:8px;align-items:flex-end"><label class="field" style="width:180px"><span class="sr">${t('Code')}</span><input id="tfa-code" class="mono" inputmode="numeric" autocomplete="one-time-code" placeholder="123 456" maxlength="7"></label>
              <button type="button" class="btn primary" data-act="tfa-enable">${t('Vérifier et activer')}</button><button type="button" class="btn ghost" data-act="tfa-cancel">${t('Annuler')}</button></div>
          </div></div>`;
      drawQr($('#tfa-qr'), extra.uri);
      const inp = $('#tfa-code');
      inp.focus();
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); $('[data-act=tfa-enable]').click(); } };
      return;
    }
    if (mode === 'codes') { box.innerHTML = head + recoveryBox(extra); return; }
    box.innerHTML = head + (tfa.enabled
      ? `<p class="small muted" style="margin:0">${t('Chaque connexion demande le code de ton application d’authentification. Codes de secours restants : {n}.', { n: `<b>${tfa.recovery_left}</b>` })}</p>
        <div class="row" style="gap:8px"><button type="button" class="btn" data-act="tfa-recovery">${ic('refresh', 18, 2)}${t('Nouveaux codes de secours')}</button><button type="button" class="btn danger" data-act="tfa-disable">${t('Désactiver')}</button></div>`
      : `<p class="small muted" style="margin:0">${t('En plus du mot de passe, chaque connexion demandera un code à 6 chiffres donné par une application comme Google Authenticator, Aegis, 2FAS ou Bitwarden.')}</p>
        <div><button type="button" class="btn tonal" data-act="tfa-setup">${ic('shield', 18, 2)}${t('Activer la double authentification')}</button></div>`);
  };
  drawTfa();
  /* --- application installable (PWA) --- */
  const drawPwa = () => {
    const box = $('#pwa-box');
    if (!box) return;
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    box.innerHTML = `<img src="/icone-192.png" alt="" width="48" height="48"><div class="stack" style="gap:4px;min-width:0;flex:1">
      ${standalone ? `<b>${t('Helmshell est ouvert comme application')}</b><span class="small muted">${t('Icône sur l’écran d’accueil, fenêtre à part, interface gardée en cache.')}</span>`
        : installPrompt ? `<b>${t('Installer Helmshell')}</b><span class="small muted">${t('Une icône sur l’écran d’accueil ou dans le menu des applications, une fenêtre à part, une page claire si le serveur est injoignable.')}</span>`
          : window.isSecureContext ? `<b>${t('Installation proposée par le navigateur')}</b><span class="small muted">${t('Sur Chrome et Edge : menu ⋮ › Installer Helmshell. Sur iPhone : Partager › Sur l’écran d’accueil.')}</span>`
            : `<b>${t('Installation : il faut une adresse en HTTPS')}</b><span class="small muted">${t('Les navigateurs n’installent une application web qu’en HTTPS. Ouvre Helmshell par un nom de domaine (Sécurité › Accès réseau) ou par le HTTPS de NetBird ou Tailscale. En HTTP, « Sur l’écran d’accueil » ajoute seulement un raccourci.')}</span>`}</div>
      ${installPrompt && !standalone ? `<button type="button" class="btn primary" data-act="pwa-install">${ic('download', 18, 2)}${t('Installer')}</button>` : ''}`;
  };
  drawPwa();
  /* --- accès réseau --- */
  const acc = Object.assign({ lan: false, vpn: false, vpn_cidrs: [], domain: false, domains: [], trusted_proxies: [], ips: [] }, s.access || {});
  const ainfo = s.access_info || { env: [], reset: false, vpn_default: ['100.64.0.0/10'] };
  let who = null;
  const chipsField = (key, label, ph, hint = '') => `<div class="field"><span>${label}</span>
      <div class="chipin" data-key="${key}">${acc[key].map((v, i) => `<span class="chipv mono">${esc(v)}<button type="button" data-act="acc-rm" data-key="${key}" data-i="${i}" aria-label="${t('Retirer {name}', { name: esc(v) })}">${ic('x', 14, 2.4)}</button></span>`).join('')}
        <input class="mono" data-key="${key}" placeholder="${esc(ph)}" autocomplete="off" enterkeyhint="done"></div>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const atile = (k, icon, title, sub) => `<label class="otile"><input type="checkbox" data-acc="${k}" ${acc[k] ? 'checked' : ''}>
      <span class="otile-ic">${ic(icon, 20, 2)}</span><span class="otile-t"><b>${title}</b><small>${sub}</small></span><span class="otile-ck" aria-hidden="true">${ic('check', 14, 3)}</span></label>`;
  const drawAccess = () => {
    const box = $('#access');
    if (!box) return;
    const on = acc.lan || acc.vpn || acc.domain || acc.ips.length;
    const src = who?.source;
    box.innerHTML = `<h3 class="sec-h">${t('Accès réseau')}</h3>
      <p class="small muted" style="margin:0">${t('Depuis où Helmshell répond. Tout ce qui n’est pas coché reçoit une page « non accessible ».')}</p>
      ${ainfo.reset ? `<div class="notice warn">${t('{var} : ce réglage est ignoré tant que la variable est définie.', { var: '<b>HELMSHELL_ACCESS_RESET=1</b>' })}</div>` : ''}
      ${!on && ainfo.env.length ? `<div class="notice">${t('Aujourd’hui, c’est la variable {var} qui s’applique : {value}. Dès qu’un accès est coché et appliqué ici, ce réglage la remplace.', { var: '<span class="mono">HELMSHELL_ALLOWED_NETWORKS</span>', value: `<span class="mono">${esc(ainfo.env.join(', '))}</span>` })}</div>` : ''}
      <div class="otiles acc-tiles">
        ${atile('lan', 'home', t('Réseau local'), t('192.168.x (un réseau 10.x ou 172.x : IP précises)'))}
        ${atile('vpn', 'shield', 'VPN', 'NetBird, Tailscale, WireGuard')}
        ${atile('domain', 'globe', t('Nom de domaine'), t('Derrière Traefik (Coolify, Dokploy)'))}
        ${atile('ipsOn', 'lock', t('IP précises'), t('Toujours autorisées'))}
      </div>
      ${acc.vpn ? `<div class="acc-sub">${chipsField('vpn_cidrs', t('Réseaux du VPN'), t('ex. 100.101.0.0/16'), t('Vide = {def} (plage de Tailscale et NetBird). Pour WireGuard, ajoute son sous-réseau.', { def: esc(ainfo.vpn_default.join(', ')) }))}</div>` : ''}
      ${acc.domain ? `<div class="acc-sub">
        ${chipsField('domains', t('Noms de domaine acceptés'), t('helmshell.exemple.fr'), `${t('Le domaine pointe vers le proxy, qui renvoie vers le port 8787 de Helmshell.')} ${t('{pattern} accepte les sous-domaines.', { pattern: `<span class="mono">*.${t('exemple.fr')}</span>` })}`)}
        ${chipsField('trusted_proxies', t('Proxy de confiance'), t('ex. 10.0.1.0/24'), t('Adresse ou réseau du proxy (le réseau Docker de Traefik). Seul lui peut annoncer l’adresse réelle du visiteur.'))}
      </div>` : ''}
      ${acc.ipsOn ? `<div class="acc-sub">${chipsField('ips', t('IP ou réseaux autorisés'), t('ex. 203.0.113.7'), acc.domain ? t('Avec le nom de domaine coché, seuls ces visiteurs passent par le domaine.') : '')}</div>` : ''}
      <div class="whoami">${who ? `<span class="small"><span class="muted">${t('Ce que voit le serveur :')}</span> <b class="mono">${esc(who.ip)}</b>${who.via_proxy ? ` ${t('(via le proxy)')}` : ''}${who.host ? ` · ${t('hôte')} <span class="mono">${esc(who.host)}</span>` : ''}${who.forwarded_for ? ` · X-Forwarded-For <span class="mono">${esc(who.forwarded_for)}</span>` : ''} · ${t('direct')} <span class="mono">${esc(who.direct)}</span><br><span class="muted">${t('Autorisé par :')}</span> ${esc(src === 'settings' ? who.rule : src === 'env' ? 'HELMSHELL_ALLOWED_NETWORKS' : t('aucune restriction'))}</span>` : `<span class="small muted">${t('Lecture de ton adresse…')}</span>`}
        ${who ? `<button type="button" class="btn sm ghost" data-act="acc-me">${ic('plus', 16, 2)}${t('Ajouter mon adresse')}</button>` : ''}</div>
      <div class="row" style="gap:12px"><button type="button" class="btn tonal" data-act="acc-save">${ic('check', 18, 2)}${t('Appliquer l’accès réseau')}</button><span class="small" id="acc-res"></span></div>`;
    for (const inp of $$('.chipin input', box)) {
      inp.onkeydown = (ev) => {
        if (ev.key !== 'Enter' && ev.key !== ',' && ev.key !== ' ') return;
        ev.preventDefault();
        addChip(inp.dataset.key, inp.value);
      };
      inp.onblur = () => { if (inp.value.trim()) addChip(inp.dataset.key, inp.value); };
    }
    for (const cb of $$('[data-acc]', box)) cb.onchange = () => { acc[cb.dataset.acc] = cb.checked; drawAccess(); };
  };
  const addChip = (key, raw) => {
    for (const v of raw.split(/[\s,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)) if (!acc[key].includes(v)) acc[key].push(v);
    drawAccess();
    $(`.chipin input[data-key="${key}"]`)?.focus();
  };
  acc.ipsOn = acc.ips.length > 0;
  /* --- connexion OIDC --- */
  const drawOidc = () => {
    const box = $('#oidc');
    if (!box) return;
    const o = s.oidc || {};
    const pill = o.only ? `<span class="pill ok"><span class="dot"></span>${t('OIDC seul')}</span>`
      : o.tested ? `<span class="pill">${t('Testé · mot de passe encore actif')}</span>` : o.configured ? `<span class="pill warn">${t('À tester')}</span>` : `<span class="pill">${t('Désactivé')}</span>`;
    box.innerHTML = `<h3 class="sec-h row" style="gap:10px">${t('Connexion OIDC')} ${pill}</h3>
      <p class="small muted" style="margin:0">${t('Authentik, Keycloak, Pocket ID, Authelia, Zitadel, Google… Helmshell utilise le flux « code d’autorisation » avec PKCE. Une fois activé, seule la connexion OIDC est acceptée : la double authentification se règle chez le fournisseur.')}</p>
      ${o.env_disabled ? `<div class="notice warn">${t('{var} : l’OIDC est ignoré et le mot de passe accepté tant que la variable est définie.', { var: '<b>HELMSHELL_OIDC_DISABLE=1</b>' })}</div>` : ''}
      <div class="field"><span>${t('URI de redirection à déclarer chez le fournisseur')}</span>
        <div class="row nowrap" style="gap:8px"><div class="pathbox grow">${esc(s.oidc_redirect)}</div><button type="button" class="btn icon" data-act="oidc-copy" aria-label="${t('Copier l’URI')}">${ic('copy', 18)}</button></div>
        <span class="hint">${t('Construite à partir de l’« Adresse de Helmshell » (onglet Notifications). Ouvre Helmshell à cette même adresse pour te connecter.')}</span></div>
      <div class="fgrid">
        <label class="field"><span>${t('Émetteur (issuer)')}</span><input id="oi-issuer" class="mono" value="${esc(s.oidc_issuer)}" placeholder="${t('https://auth.exemple.fr/application/o/helmshell/')}"></label>
        <label class="field"><span>${t('Nom du bouton')}</span><input id="oi-label" value="${esc(s.oidc_label)}" placeholder="Authentik"></label>
        <label class="field"><span>Client ID</span><input id="oi-client" class="mono" value="${esc(s.oidc_client_id)}" autocomplete="off"></label>
        <label class="field"><span>Client secret</span><input id="oi-secret" type="password" autocomplete="off" placeholder="${s.oidc_client_secret_set ? t('•••••••• (déjà enregistré)') : t('Vide pour un client public (PKCE seul)')}"></label>
        <label class="field"><span>${t('Adresses e-mail autorisées')}</span><input id="oi-emails" class="mono" value="${esc(s.oidc_allowed_emails)}" placeholder="${t('moi@exemple.fr, autre@exemple.fr')}"></label>
        <label class="field"><span>${t('Ou groupe autorisé (claim groups)')}</span><input id="oi-group" value="${esc(s.oidc_group)}" placeholder="helmshell-admins"></label>
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="button" class="btn tonal" data-act="oidc-save">${ic('check', 18, 2)}${t('Enregistrer')}</button>
        <button type="button" class="btn" data-act="oidc-test" ${o.configured ? '' : 'disabled'}>${ic('external', 18, 2)}${t('Tester la connexion')}</button>
        <span class="small" id="oi-res"></span></div>
      <label class="check ${o.tested ? '' : 'disabled'}"><span><b>${t('N’autoriser que l’OIDC')}</b><small>${o.tested ? t('Le mot de passe sera refusé. Secours : définir HELMSHELL_OIDC_DISABLE=1 et redémarrer Helmshell.') : t('Disponible après un test réussi : évite de t’enfermer dehors.')}</small></span>
        <input type="checkbox" role="switch" class="switch" id="oi-only" ${o.enabled ? 'checked' : ''} ${o.tested || o.enabled ? '' : 'disabled'}></label>`;
    $('#oi-only').onchange = async (ev) => {
      const want = ev.target.checked;
      if (want && !(await confirmBox(t('N’autoriser que l’OIDC ?'), t('La connexion par mot de passe sera refusée sur tous les appareils. En cas de problème avec le fournisseur, il faudra définir HELMSHELL_OIDC_DISABLE=1 sur le serveur.'), t('Activer')))) { ev.target.checked = false; return; }
      try {
        await api('PUT', '/api/settings', { oidc_enabled: want });
        s.oidc = { ...s.oidc, enabled: want, only: want && !s.oidc.env_disabled };
        toast(want ? t('Connexion OIDC seule activée') : t('Mot de passe de nouveau accepté'));
        viewSettings(main);
      } catch (e) { ev.target.checked = !want; fail(e); }
    };
  };
  drawOidc();
  const loadWho = async () => { try { who = await api('GET', '/api/access/whoami'); } catch (_) { who = null; } drawAccess(); };
  drawAccess();
  loadWho();
  bind(main, {
    'fg-kind': (el) => {
      fgKind = el.dataset.k;
      $('#fg-url').value = FORGES.find((f) => f[0] === fgKind)[2];
      $('#fg-url').placeholder = t('https://git.exemple.fr');
      drawForgeForm();
      $(fgKind === 'forgejo' || fgKind === 'gitea' ? '#fg-url' : '#fg-token').focus();
    },
    'fg-access': (el) => { fgAccess = el.dataset.a; drawForgeForm(); },
    'forge-add': async (el) => {
      const out = $('#fg-res');
      el.disabled = true;
      out.textContent = t('Vérification du jeton…');
      out.className = 'small muted';
      try {
        const f = await api('POST', '/api/forges', { kind: fgKind, url: $('#fg-url').value.trim(), token: $('#fg-token').value.trim(), access: fgAccess });
        $('#fg-token').value = '';
        out.textContent = t('Compte {name} lié', { name: f.user });
        out.className = 'small c-ok';
        drawForges();
      } catch (e) { out.textContent = e.message; out.className = 'small c-err'; }
      el.disabled = false;
    },
    'forge-del': async (el) => {
      if (!await confirmBox(t('Supprimer le compte {name} ?', { name: el.dataset.label }), t('Helmshell oublie le jeton : tu ne pourras plus importer depuis ce compte, ni pousser en HTTPS avec lui. Pense à révoquer aussi le jeton sur la forge si tu ne t’en sers plus.'), t('Supprimer'))) return;
      try { await api('DELETE', `/api/forges/${el.dataset.id}`); toast(t('Compte délié')); drawForges(); } catch (e) { fail(e); }
    },
    'tfa-setup': async () => { try { drawTfa('setup', await api('POST', '/api/2fa/setup')); } catch (e) { fail(e); } },
    'tfa-cancel': () => drawTfa(),
    'tfa-enable': async (el) => {
      const code = $('#tfa-code').value.trim();
      if (!code) { $('#tfa-code').focus(); return; }
      el.disabled = true;
      try {
        const r = await api('POST', '/api/2fa/enable', { code });
        tfa = { enabled: true, recovery_left: r.recovery.length };
        toast(t('Double authentification activée'));
        drawTfa('codes', r.recovery);
      } catch (e) { fail(e); el.disabled = false; $('#tfa-code').select(); }
    },
    'tfa-copy': (el) => copyText(el.dataset.codes, t('Copié')),
    'tfa-done': () => drawTfa(),
    'tfa-recovery': async () => {
      const code = await ask({ title: t('Nouveaux codes de secours'), text: t('Les anciens codes ne marcheront plus.'), label: t('Code de l’application'), placeholder: '123 456', inputmode: 'numeric', okLabel: t('Générer') });
      if (!code) return;
      try { const r = await api('POST', '/api/2fa/recovery', { code }); tfa.recovery_left = r.recovery.length; drawTfa('codes', r.recovery); } catch (e) { fail(e); }
    },
    'tfa-disable': async () => {
      const password = await ask({ title: t('Désactiver la double authentification'), label: t('Mot de passe'), type: 'password', okLabel: t('Suivant') });
      if (!password) return;
      const code = await ask({ title: t('Désactiver la double authentification'), label: t('Code de l’application ou code de secours'), placeholder: '123 456', okLabel: t('Désactiver'), danger: true });
      if (!code) return;
      try { tfa = await api('POST', '/api/2fa/disable', { password, code }); toast(t('Double authentification désactivée')); drawTfa(); } catch (e) { fail(e); }
    },
    lang: async (el) => {
      const l = el.dataset.l;
      if (l === LANG) return;
      try { await api('PUT', '/api/settings', { language: l }); } catch (_) { /* ignoré : le choix reste dans ce navigateur */ }
      setLang(l);
    },
    theme: (el) => { applyTheme(el.dataset.t); $$('[data-act=theme]').forEach((b) => b.setAttribute('aria-pressed', b === el)); },
    seed: (el) => { applySeed(el.dataset.s); $$('[data-act=seed]').forEach((b) => b.setAttribute('aria-checked', b === el)); },
    style: (el) => { applyStyle(el.dataset.s); for (const b of $$('[data-act=style]', main)) b.setAttribute('aria-checked', String(b.dataset.s === stylePref)); },
    stab: (el) => {
      settingsTab = el.dataset.t;
      try { localStorage.setItem('helmshell.stab', settingsTab); } catch (_) { /* rien */ }
      $$('[data-act=stab]').forEach((b) => b.setAttribute('aria-selected', String(b === el)));
      $$('#settings [data-pane]').forEach((sec) => { sec.hidden = sec.dataset.pane !== settingsTab; });
    },
    nsvc: (el) => {
      const svc = el.dataset.s;
      form.notify_service.value = svc;
      $$('[data-act=nsvc]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
      $$('#settings [data-svc]').forEach((x) => { x.hidden = x.dataset.svc !== svc; });
      $$('#settings [data-svc-any]').forEach((x) => { x.hidden = svc === 'off'; });
    },
    'ntfy-test': async () => {
      const out = $('#ntfy-res');
      out.textContent = t('Envoi…');
      try {
        await api('PUT', '/api/settings', notifBody());
        await api('POST', '/api/notify/test');
        out.innerHTML = `<span class="c-ok">${t('Envoyée : regarde ton téléphone.')}</span>`;
      } catch (e) { out.innerHTML = `<span class="c-err">${esc(e.message)}</span>`; }
    },
    'logout-all': async () => {
      if (!await confirmBox(t('Déconnecter tous les appareils ?'), t('Téléphones, autres navigateurs et applications installées devront se reconnecter. Cet appareil reste connecté.'), t('Déconnecter'))) return;
      try { await api('POST', '/api/logout-all'); toast(t('Tous les autres appareils sont déconnectés')); } catch (e) { fail(e); }
    },
    'pwa-install': async () => { await installApp(); drawPwa(); },
    'oidc-copy': async () => { try { await navigator.clipboard.writeText(s.oidc_redirect); toast(t('URI copiée')); } catch (_) { /* refusé */ } },
    'oidc-save': async () => {
      const out = $('#oi-res');
      const body = { oidc_issuer: $('#oi-issuer').value, oidc_label: $('#oi-label').value, oidc_client_id: $('#oi-client').value,
        oidc_allowed_emails: $('#oi-emails').value, oidc_group: $('#oi-group').value };
      if ($('#oi-secret').value) body.oidc_client_secret = $('#oi-secret').value;
      out.textContent = t('Enregistrement…');
      try {
        await api('PUT', '/api/settings', body);
        const fresh = await api('GET', '/api/settings');
        Object.assign(s, fresh);
        drawOidc();
        $('#oi-res').innerHTML = `<span class="c-ok">${t('Enregistré.')}${s.oidc.tested ? '' : ` ${t('Teste maintenant la connexion.')}`}</span>`;
      } catch (e) { out.innerHTML = `<span class="c-err">${esc(e.message)}</span>`; }
    },
    'oidc-test': () => {
      window.open('/auth/oidc/start?test=1', '_blank', 'noopener');
      $('#oi-res').innerHTML = `<span class="muted">${t('Connecte-toi dans l’onglet ouvert, puis reviens ici.')}</span>`;
      const back = async () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', back);
        try { Object.assign(s, await api('GET', '/api/settings')); drawOidc(); if (s.oidc.tested) $('#oi-res').innerHTML = `<span class="c-ok">${t('Test réussi : tu peux activer « N’autoriser que l’OIDC ».')}</span>`; } catch (_) { /* ignoré */ }
      };
      document.addEventListener('visibilitychange', back);
    },
    'acc-rm': (el) => { acc[el.dataset.key].splice(Number(el.dataset.i), 1); drawAccess(); },
    'acc-me': () => {
      if (!who) return;
      const key = acc.domain && who.via_proxy ? 'ips' : acc.ipsOn ? 'ips' : null;
      if (key) addChip(key, who.ip);
      else { acc.ipsOn = true; addChip('ips', who.ip); }
    },
    'acc-save': async () => {
      const out = $('#acc-res');
      // Les champs encore en cours de saisie comptent aussi
      for (const inp of $$('#access .chipin input')) if (inp.value.trim()) for (const v of inp.value.split(/[\s,]+/).filter(Boolean)) if (!acc[inp.dataset.key].includes(v)) acc[inp.dataset.key].push(v.toLowerCase());
      const body = { lan: acc.lan, vpn: acc.vpn, vpn_cidrs: acc.vpn ? acc.vpn_cidrs : [], domain: acc.domain,
        domains: acc.domain ? acc.domains : [], trusted_proxies: acc.domain ? acc.trusted_proxies : [], ips: acc.ipsOn ? acc.ips : [] };
      out.textContent = t('Vérification…');
      try {
        await api('PUT', '/api/settings', { access: body });
        await loadWho();
        $('#acc-res').innerHTML = `<span class="c-ok">${body.lan || body.vpn || body.domain || body.ips.length ? t('Accès réseau appliqué.') : t('Plus de restriction propre à Helmshell.')}</span>`;
      } catch (e) { out.innerHTML = `<span class="c-err">${esc(e.message)}</span>`; }
    },
    'codex-sbx': async (el) => {
      el.disabled = true;
      try {
        agentsInfo = await api('GET', '/api/agents?recheck=1');
        const sb = agentDef('codex')?.sandbox;
        toast(sb?.ok ? t('Bac à sable de Codex opérationnel.') : t('Le bac à sable de Codex ne démarre toujours pas.'), !sb?.ok);
        if (sb?.ok) $('#codex-sbx')?.remove();
      } catch (e) { fail(e); } finally { el.disabled = false; }
    },
    dprov: (el) => {
      const p = el.dataset.p;
      form.deploy_provider.value = p;
      for (const b of $$('[data-act=dprov]', form)) b.setAttribute('aria-pressed', String(b.dataset.p === p));
      for (const box of $$('[data-prov]', form)) box.hidden = box.dataset.prov !== p;
      for (const box of $$('[data-prov-any]', form)) box.hidden = !p;
    },
    'dk-test': async () => {
      const out = $('#dk-test');
      out.textContent = t('Connexion…');
      try {
        const body = { dokploy_url: form.dokploy_url.value };
        if (form.dokploy_token.value) body.dokploy_token = form.dokploy_token.value;
        await api('PUT', '/api/settings', body);
        const m = await api('GET', '/api/deploy/meta?provider=dokploy');
        fillDokploy(m);
        out.innerHTML = `<span class="c-ok">${t('Connecté : {projects}, {envs}', { projects: tp(m.projects.length, '{n} projet', '{n} projets'), envs: tp(m.environments.length, '{n} environnement', '{n} environnements') })}</span>`;
        form.dokploy_token.value = '';
      } catch (e) { out.innerHTML = `<span class="c-err">${esc(e.message)}</span>`; }
    },
    'browser-notif': async () => { try { await Notification.requestPermission(); } catch (_) { /* refusé */ } drawBrowserNotif(); },
    test: async () => {
      const out = $('#cf-test');
      out.textContent = t('Connexion…');
      try {
        const body = { coolify_url: form.coolify_url.value };
        if (form.coolify_token.value) body.coolify_token = form.coolify_token.value;
        await api('PUT', '/api/settings', body);
        const m = await api('GET', '/api/deploy/meta?provider=coolify');
        const fill = (sel, items, cur) => { sel.innerHTML = `<option value="">${t('Le premier trouvé')}</option>` + items.map((i) => `<option value="${esc(i.uuid)}" ${i.uuid === cur ? 'selected' : ''}>${esc(i.name)}${i.ip ? ` (${esc(i.ip)})` : ''}</option>`).join(''); };
        fill($('#cf-proj'), m.projects, s.coolify_project_uuid);
        fill($('#cf-srv'), m.servers, s.coolify_server_uuid);
        out.innerHTML = `<span class="c-ok">${t('Connecté : {projects}, {servers}', { projects: tp(m.projects.length, '{n} projet', '{n} projets'), servers: tp(m.servers.length, '{n} serveur', '{n} serveurs') })}</span>`;
        form.coolify_token.value = '';
        refreshOverview();
      } catch (e) { out.innerHTML = `<span class="c-err">${esc(e.message)}</span>`; }
    },
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const body = {};
    for (const k of ['projects_root', 'claude_bin', 'default_mode', 'default_agent', 'codex_bin', 'codex_default_mode', 'coolify_url', 'coolify_public_url', 'coolify_project_uuid', 'coolify_server_uuid', 'coolify_environment', 'domain_suffix', 'ntfy_url', 'public_url',
      'deploy_provider', 'dokploy_url', 'dokploy_public_url', 'dokploy_environment_id', 'dokploy_server_id']) body[k] = form[k].value;
    if (form.dokploy_token.value) body.dokploy_token = form.dokploy_token.value;
    body.usage_every = Number(form.usage_every.value);
    if (form.codex_usage_every) body.codex_usage_every = Number(form.codex_usage_every.value);
    body.update_check = form.update_check.checked;
    if (form.coolify_token.value) body.coolify_token = form.coolify_token.value;
    Object.assign(body, notifBody());
    if (form.new_password?.value) { body.new_password = form.new_password.value; body.current_password = form.current_password.value; }
    try {
      await api('PUT', '/api/settings', body);
      defaultModeCache = null;
      loadAgents(true);
      checkVersion();
      toast(t('Paramètres enregistrés'));
      await refreshOverview();
      viewSettings(main);
    } catch (err) { fail(err); }
  };
  const fillDokploy = (m) => {
    const sel = (el, items, cur, first) => { if (el) el.innerHTML = `<option value="">${first}</option>` + items.map((i) => `<option value="${esc(i.uuid)}" ${i.uuid === cur ? 'selected' : ''}>${esc(i.name)}${i.ip ? ` (${esc(i.ip)})` : ''}</option>`).join(''); };
    sel($('#dk-env'), m.environments || [], s.dokploy_environment_id, t('Le premier trouvé'));
    sel($('#dk-srv'), m.servers || [], s.dokploy_server_id, t('Celui de Dokploy'));
  };
  if (s.dokploy_token_set) api('GET', '/api/deploy/meta?provider=dokploy').then(fillDokploy).catch(() => { /* injoignable */ });
  try {
    if (s.coolify_token_set) {
      const m = await api('GET', '/api/deploy/meta?provider=coolify');
      const fill = (sel, items, cur) => { sel.innerHTML = `<option value="">${t('Le premier trouvé')}</option>` + items.map((i) => `<option value="${esc(i.uuid)}" ${i.uuid === cur ? 'selected' : ''}>${esc(i.name)}</option>`).join(''); };
      fill($('#cf-proj'), m.projects, s.coolify_project_uuid);
      fill($('#cf-srv'), m.servers, s.coolify_server_uuid);
    }
  } catch (_) { /* Coolify injoignable : on garde les valeurs */ }
}

/* -------------------------------------------------------------- application (PWA) */
// Le navigateur n'accepte un service worker (et donc l'installation) qu'en HTTPS ou sur localhost.
let installPrompt = null;
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* navigation sans cache, rien de grave */ });
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
window.addEventListener('appinstalled', () => { installPrompt = null; toast(t('Helmshell est installé')); });
async function installApp() {
  if (!installPrompt) return;
  installPrompt.prompt();
  try { await installPrompt.userChoice; } catch (_) { /* fermé */ }
  installPrompt = null;
}

/* -------------------------------------------------------------------- départ */
window.addEventListener('hashchange', route);
(async () => {
  try {
    await api('GET', '/api/me');
    renderShell();
    route();
  } catch (_) { /* renderLogin déjà appelé sur 401 */ }
})();
