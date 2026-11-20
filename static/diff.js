// Affichage d'un diff unifié Git : vue « unifiée » ou « côte à côte », avec numéros de ligne.
import { esc } from './load.js';
import { t } from './i18n.js';

function parse(text) {
  const files = [];
  let file = null, hunk = null, a = 0, b = 0;
  for (const line of (text || '').split('\n')) {
    if (line.startsWith('diff --git ')) {
      file = { name: line.replace(/^diff --git a\/(.*) b\/.*$/, '$1'), hunks: [], meta: [] };
      files.push(file); hunk = null;
      continue;
    }
    if (!file) { file = { name: '', hunks: [], meta: [] }; files.push(file); }
    const m = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
    if (m) {
      a = +m[1]; b = +m[2];
      hunk = { head: line, ctx: m[3].trim(), rows: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (!hunk) {
      if (line.startsWith('+++ ') && !file.name) file.name = line.slice(4).replace(/^b\//, '');
      if (/^(new|deleted) file|^rename|^Binary/.test(line)) file.meta.push(line);
      continue;
    }
    if (line.startsWith('+')) hunk.rows.push({ t: 'add', b: b++, s: line.slice(1) });
    else if (line.startsWith('-')) hunk.rows.push({ t: 'del', a: a++, s: line.slice(1) });
    else if (line.startsWith('\\')) continue;
    else hunk.rows.push({ t: 'ctx', a: a++, b: b++, s: line.slice(1) });
  }
  return files.filter((f) => f.hunks.length || f.meta.length);
}

function unified(f) {
  return f.hunks.map((h) => `<tr class="hunk"><td colspan="3">${esc(h.head)}</td></tr>${h.rows.map((r) => `<tr class="${r.t}">
    <td class="n">${r.a ?? ''}</td><td class="n">${r.b ?? ''}</td><td class="s">${r.t === 'add' ? '+' : r.t === 'del' ? '−' : ' '}${esc(r.s)}</td></tr>`).join('')}`).join('');
}

function split(f) {
  return f.hunks.map((h) => {
    const out = [`<tr class="hunk"><td colspan="4">${esc(h.head)}</td></tr>`];
    let dels = [], adds = [];
    const flush = () => {
      for (let i = 0; i < Math.max(dels.length, adds.length); i++) {
        const d = dels[i], a = adds[i];
        out.push(`<tr><td class="n ${d ? 'del' : 'none'}">${d ? d.a : ''}</td><td class="s ${d ? 'del' : 'none'}">${d ? esc(d.s) : ''}</td>
          <td class="n ${a ? 'add' : 'none'}">${a ? a.b : ''}</td><td class="s ${a ? 'add' : 'none'}">${a ? esc(a.s) : ''}</td></tr>`);
      }
      dels = []; adds = [];
    };
    for (const r of h.rows) {
      if (r.t === 'del') { if (adds.length) flush(); dels.push(r); } else if (r.t === 'add') adds.push(r);
      else { flush(); out.push(`<tr class="ctx"><td class="n">${r.a}</td><td class="s">${esc(r.s)}</td><td class="n">${r.b}</td><td class="s">${esc(r.s)}</td></tr>`); }
    }
    flush();
    return out.join('');
  }).join('');
}

/** HTML du diff. mode = 'unified' | 'split'. */
export function renderDiff(text, mode = 'unified', { showNames = true } = {}) {
  const files = parse(text);
  if (!files.length) return `<div class="empty small">${esc(text || t('Pas de différence affichable.'))}</div>`;
  return files.map((f) => `<div class="dfile">
    ${showNames && f.name ? `<div class="dfile-name mono">${esc(f.name)}${f.meta.length ? ` <span class="muted">· ${esc(f.meta.join(' · '))}</span>` : ''}</div>` : ''}
    <div class="dscroll"><table class="dtable ${mode}">${mode === 'split' ? split(f) : unified(f)}</table></div></div>`).join('');
}
