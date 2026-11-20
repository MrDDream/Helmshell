// Rendu Markdown (marked) nettoyé par DOMPurify : un README ne peut pas exécuter de script dans Helmshell.
import { CDN, loadScript } from './load.js';

let ctx = { base: '', dir: '' };

// Chemin relatif au fichier Markdown -> URL de téléchargement dans le projet (les URL absolues restent telles quelles)
const dec = (x) => { try { return decodeURIComponent(x); } catch (_) { return x; } };
function local(src) {
  if (!src || /^(https?:|data:|blob:|\/|#)/i.test(src)) return src;
  const parts = (ctx.dir ? `${ctx.dir}/${src}` : src).split(/[?#]/)[0].split('/');
  const out = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
  return `${ctx.base}/download?inline=1&path=${encodeURIComponent(dec(out.join('/')))}`;
}
let ready = null;

function libs() {
  if (!ready) {
    ready = Promise.all([loadScript(`${CDN}marked@18.2.1/lib/marked.umd.js`), loadScript(`${CDN}dompurify@3.4.18/dist/purify.min.js`)])
      .then(() => {
        window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
          if (node.tagName === 'A' && node.getAttribute('href')) {
            const href = node.getAttribute('href');
            if (!href.startsWith('#')) { node.setAttribute('target', '_blank'); node.setAttribute('rel', 'noopener noreferrer'); }
          }
          // Images relatives (src, et srcset de <img> / <source>) : servies depuis le dossier du projet
          if ((node.tagName === 'IMG' || node.tagName === 'SOURCE') && ctx.base) {
            const src = node.getAttribute('src') || '';
            if (src) node.setAttribute('src', local(src));
            const set = node.getAttribute('srcset');
            if (set) node.setAttribute('srcset', set.split(',').map((part) => { const [u, ...rest] = part.trim().split(/\s+/); return [local(u), ...rest].join(' '); }).join(', '));
            if (node.tagName === 'IMG') node.setAttribute('loading', 'lazy');
          }
          // <picture> clair / sombre (README GitHub) : on suit le thème de Helmshell, pas celui du système
          if (node.tagName === 'SOURCE' && /prefers-color-scheme/i.test(node.getAttribute('media') || '')) {
            const want = /prefers-color-scheme:\s*dark/i.test(node.getAttribute('media')) ? 'dark' : 'light';
            node.setAttribute('media', document.documentElement.dataset.theme === want ? 'all' : 'not all');
          }
        });
      })
      .catch((e) => { ready = null; throw e; });
  }
  return ready;
}

/** Renvoie le HTML (sûr) du Markdown. `base` = /api/projects/<slug>, `path` = chemin du fichier. */
export async function renderMarkdown(text, { base = '', path = '' } = {}) {
  await libs();
  ctx = { base, dir: path.split('/').slice(0, -1).join('/') };
  const html = window.marked.parse(text || '', { gfm: true, breaks: false });
  // Ni attributs data-* (ils piloteraient les actions de l'appli), ni id/name bruts (ils masqueraient ses éléments)
  return window.DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input', 'button'], FORBID_ATTR: ['style'],
    ALLOW_DATA_ATTR: false, SANITIZE_NAMED_PROPS: true });
}

export const isMarkdown = (path) => /\.(md|markdown|mdx)$/i.test(path || '');
