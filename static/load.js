// Outils partagés entre les modules : échappement HTML et chargement des bibliothèques.
// Les bibliothèques sont servies par Helmshell lui-même (static/vendor, voir tools/vendor.py) : pas de CDN,
// la CSP n'autorise que 'self'.

export const CDN = '/vendor/';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const scripts = new Map();
export function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => { scripts.delete(src); s.remove(); ko(new Error(`Chargement impossible : ${src}`)); };
      document.head.append(s);
    }));
  }
  return scripts.get(src);
}

export function loadStyle(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.append(l);
}
