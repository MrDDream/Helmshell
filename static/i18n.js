// Langue de l'interface : anglais par défaut, français au choix (localStorage « helmshell.lang »).
// Le texte source est le français : t(« Texte français ») renvoie la traduction anglaise de /locales/en.json
// quand la langue est l'anglais, sinon le texte tel quel. Les clés doivent rester des chaînes littérales
// entre apostrophes simples (tests/check_i18n.py les extrait du code).

const STORE = 'helmshell.lang';
let stored = null;
try { stored = localStorage.getItem(STORE); } catch (_) { /* stockage indisponible : anglais */ }

/** Langue courante : 'en' (défaut) ou 'fr'. */
export const LANG = stored === 'fr' ? 'fr' : 'en';
/** Locale pour Intl et toLocale…() : 'en-US' ou 'fr-FR'. */
export const LOCALE = LANG === 'fr' ? 'fr-FR' : 'en-US';

let DICT = {};
if (LANG === 'en') {
  try {
    const r = await fetch('/locales/en.json', { cache: 'no-cache' });
    const d = r.ok ? await r.json() : null;
    if (d && typeof d === 'object' && !Array.isArray(d)) DICT = d;
  } catch (_) { DICT = {}; }
  if (!Object.keys(DICT).length) console.warn('[i18n] /locales/en.json unavailable: French text shown');
}

const warned = new Set();
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m)) : s);

/**
 * Traduit `key` (texte français) et remplace les {variables} par String(vars[nom]).
 * Aucun échappement HTML : l'appelant échappe les valeurs qu'il insère dans du HTML.
 */
export function t(key, vars) {
  let s = key;
  if (LANG === 'en') {
    if (Object.hasOwn(DICT, key) && typeof DICT[key] === 'string') s = DICT[key];
    else if (Object.keys(DICT).length && !warned.has(key)) { warned.add(key); console.warn('[i18n] missing English text for:', key); }
  }
  return fill(s, vars);
}

/**
 * Pluriel : `one` et `many` sont les deux formes françaises (avec {n}).
 * Français : n <= 1 → one ; anglais : n === 1 → one. Puis t(forme, { n, ...vars }).
 */
export function tp(n, one, many, vars) {
  const pick = (LANG === 'fr' ? n <= 1 : n === 1) ? one : many;
  return t(pick, { n, ...(vars || {}) });
}

/** Change de langue (mémorisée sur cet appareil) et recharge la page. */
export function setLang(l) {
  if (l !== 'en' && l !== 'fr') return;
  let saved = false;
  try { localStorage.setItem(STORE, l); saved = localStorage.getItem(STORE) === l; } catch (_) { /* stockage indisponible */ }
  // Sans stockage, recharger ne changerait rien (et bouclerait avec syncLang)
  if (saved && l !== LANG) location.reload();
}

/** Langue choisie côté serveur (réglage du compte) : appliquée si elle diffère de celle de l'appareil. */
export function syncLang(serverLang) {
  if ((serverLang === 'en' || serverLang === 'fr') && serverLang !== LANG) setLang(serverLang);
}

/* ---------------------------------------------------------------- formats */
/** Nombre selon la locale (options Intl.NumberFormat). */
export const fmtNum = (n, opts) => new Intl.NumberFormat(LOCALE, opts).format(n);

/** Pourcentage d'une valeur entre 0 et 100 : « 42 % » en français, « 42% » en anglais. */
export const fmtPct = (v, digits = 0) => new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: digits }).format((Number(v) || 0) / 100);

const UNITS = LANG === 'fr' ? ['o', 'Ko', 'Mo', 'Go', 'To'] : ['B', 'KB', 'MB', 'GB', 'TB'];
/** Taille en octets, en base 1024 : « 1,5 Mo » / « 1.5 MB ». Chaîne vide si n est absent. */
export function fmtBytes(n) {
  if (!n && n !== 0) return '';
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) { n /= 1024; i++; }
  const d = n < 10 && i ? 1 : 0;
  return `${fmtNum(n, { minimumFractionDigits: d, maximumFractionDigits: d })} ${UNITS[i]}`;
}

/**
 * Date relative courte : à l’instant / il y a 5 min / il y a 3 h / hier / 12 mars.
 * ts : secondes depuis l'époque (nombre) ou date ISO (chaîne).
 */
export function ago(ts) {
  if (!ts) return '';
  const ms = typeof ts === 'number' ? ts * 1000 : Date.parse(ts);
  if (Number.isNaN(ms)) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 45) return t('à l’instant');
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto', style: LANG === 'fr' ? 'short' : 'long' });
  if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
  if (s < 172800) return rtf.format(-1, 'day');
  return new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

/**
 * Date (et heure) selon la locale. date : Date, millisecondes ou chaîne ISO.
 * opts : options Intl.DateTimeFormat (défaut : date moyenne et heure courte).
 */
export function fmtDate(date, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE, opts).format(d);
}

/** Comparaison de textes pour les tris (ordre alphabétique de la langue). */
export const cmp = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), LOCALE);
