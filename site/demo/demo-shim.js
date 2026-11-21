/* Helmshell demo shim: makes the real, unmodified interface (static/) run without a server.
   Loaded as a classic script before theme-init.js and app.js (see tools/build_site.py). It:
   - answers every /api/… call from an in-memory state built from demo-data.js (same JSON shapes as server.py);
   - replaces EventSource for /api/events (live state) and /api/term/<id>/stream (fake terminals);
   - turns /api/… image URLs (project icons, image previews) into data: URIs;
   - stubs the service worker, browser notifications and the clipboard when the page is not a secure context;
   - applies ?lang=en|fr and ?theme=light|dark, and shows a small "Demo · sample data" badge.
   Nothing leaves the browser: no network call is ever made for /api/…. */
(function () {
  'use strict';

  const VERSION = '__HELMSHELL_VERSION__';
  const REPO = 'https://github.com/MrDDream/Helmshell';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* storage unavailable */ } },
  };

  /* ------------------------------------------------------------ URL parameters */
  const params = new URLSearchParams(location.search);
  const qLang = params.get('lang'), qTheme = params.get('theme');
  const SHOT = params.has('shot');  // captures d'écran du site : pas de badge « Démo »
  if (/^[a-z]+$/.test(params.get('stab') || '')) store.set('helmshell.stab', params.get('stab'));  // onglet des paramètres
  if (qLang === 'en' || qLang === 'fr') store.set('helmshell.lang', qLang);
  if (qTheme === 'light' || qTheme === 'dark' || qTheme === 'auto') store.set('helmshell.theme', qTheme);
  if (!store.get('helmshell.lang')) store.set('helmshell.lang', /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en');
  if (params.has('lang') || params.has('theme') || SHOT || params.has('stab')) {
    params.delete('lang'); params.delete('theme'); params.delete('shot'); params.delete('stab');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
  }
  const LANG = store.get('helmshell.lang') === 'fr' ? 'fr' : 'en';
  const L = (fr, en) => (LANG === 'fr' ? fr : en);
  const UNAVAILABLE = L('Indisponible dans la démo', 'Not available in the demo');

  /* ------------------------------------------------------------------- helpers */
  const now = () => Math.floor(Date.now() / 1000);
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const utf8 = new TextEncoder();
  const b64 = (s) => { const bytes = utf8.encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(bin); };
  const bytes = (s) => utf8.encode(s).length;
  const lines = (s) => (s ? s.replace(/\n$/, '').split('\n').length : 0);
  class ApiError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
  const err = (msg, status = 400) => { throw new ApiError(msg, status); };
  const slugify = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
  const ago = (s) => { const d = now() - s; return d < 3600 ? `${Math.max(1, Math.round(d / 60))} min` : `${Math.floor(d / 3600)} h`; };

  /* ===================================================================== state */
  let D = null;   // demo-data.js output
  let S = null;   // mutable state
  const MODES_CLAUDE = [
    ['default', 'Demander à chaque action', 'Ask before each action', 'Tu valides chaque modification et commande', 'You approve every edit and command'],
    ['acceptEdits', 'Accepter les modifications', 'Accept edits', 'Fichiers modifiés librement, commandes validées', 'Files are edited freely, commands need approval'],
    ['plan', 'Plan d’abord', 'Plan first', 'Claude propose un plan avant de toucher au code', 'Claude proposes a plan before touching the code'],
    ['auto', 'Automatique', 'Automatic', 'Claude avance seul, avec des garde-fous de sécurité', 'Claude works on its own, with safety guardrails'],
    ['dontAsk', 'Ne rien demander', 'Don\'t ask', 'Refuse ce qui n’est pas déjà autorisé, sans poser de question', 'Denies anything not already allowed, without asking'],
  ];
  const MODES_CODEX = [
    ['read-only', 'Lecture seule', 'Read only', 'Codex lit le projet et demande avant de modifier ou d’exécuter quoi que ce soit', 'Codex reads the project and asks before editing or running anything'],
    ['auto', 'Automatique', 'Automatic', 'Modifie et exécute dans le dossier du projet ; demande avant d’en sortir (réseau, autres dossiers)', 'Edits and runs commands inside the project folder; asks before going further (network, other folders)'],
    ['full-access', 'Accès complet', 'Full access', 'Ni bac à sable ni validation : Codex agit avec tous tes droits', 'No sandbox, no approvals: Codex acts with all your permissions'],
  ];
  const modeList = (list) => list.map(([id, lf, le, hf, he]) => ({ id, label_fr: lf, label_en: le, hint_fr: hf, hint_en: he, label: L(lf, le), hint: L(hf, he) }));
  const modeName = (agent, id) => { const m = (agent === 'codex' ? MODES_CODEX : MODES_CLAUDE).find((x) => x[0] === id); return m ? L(m[1], m[2]) : id; };

  function init() {
    if (S) return;
    if (typeof window.HelmshellDemoData !== 'function') throw new Error('demo-data.js missing');
    D = window.HelmshellDemoData(LANG);
    const t0 = D.now;
    S = { v: 1, projects: new Map(), tasks: [], activity: D.activity.slice(), apps: [], trash: [], terms: new Map(), termSeq: 1,
      shells: [], icons: new Map(), forges: [], settings: null, totp: { enabled: true, recovery_left: 8 }, deployRuns: [], started: t0 };
    for (const p of D.projects) S.projects.set(p.slug, makeProject(p));
    S.tasks = D.tasks.map((x) => ({ ...x, events: x.events.slice(), later: (x.later || []).slice() }));
    S.apps = D.apps.map((a) => ({ ...a, deployments: (D.deps[a.key] || []).map(([m, status, msg, commit], i) => ({
      uuid: D.hex(`dep-${a.key}-${i}`, 24), status, commit, message: msg, created: D.iso(m), finished: D.iso(Math.max(0, m - 2)), rollback: false })),
    envs: (D.envs[a.key] || []).map(([key, value, build], i) => ({ uuid: D.hex(`env-${a.key}-${i}`, 24), key, value, build, literal: false, multiline: false })) }));
    for (const p of S.projects.values()) {
      const a = S.apps.find((x) => x.key === p.appKey);
      p.app_id = a ? a.uuid : '';
    }
    S.trash = [
      { id: `${t0 - 2 * 86400}-a3f9c1`, slug: 'atlas-web', path: 'components/OldHeader.tsx', name: 'OldHeader.tsx', deleted: t0 - 2 * 86400, dir: false, size: 1834,
        restore: { content: 'export function OldHeader() {\n  return <header className="p-4">Atlas</header>;\n}\n' } },
      { id: `${t0 - 6 * 86400}-77b0e2`, slug: 'old-blog', path: '', name: 'old-blog', deleted: t0 - 6 * 86400, project: true, meta: { name: 'Old blog' }, dir: true, size: 48 * 1024 * 1024 },
    ];
    S.shells = [
      { name: 'helmshell-serveur', created: t0 - 3 * 86400, attached: 0, path: D.home, command: 'zsh', slug: null, kind: 'shell', agent: null, claude: false },
      { name: 'helmshell-homelab-stack', created: t0 - 26 * 3600, attached: 0, path: `${D.root}/homelab-stack`, command: 'zsh', slug: 'homelab-stack', kind: 'shell', agent: null, claude: false },
    ];
    S.forges = [
      { id: '3fa1c0de', kind: 'forgejo', url: 'https://git.example.com', user: 'alex', name: 'Alex Martin', avatar: '', access: 'write', token_set: true },
      { id: '9b27e4a1', kind: 'gitlab', url: 'https://gitlab.example.com', user: 'alex', name: 'Alex Martin', avatar: '', access: 'read', token_set: true },
    ];
    S.settings = {
      projects_root: D.root, coolify_url: 'http://localhost:8000', coolify_public_url: 'https://coolify.example.com', coolify_project_uuid: '',
      coolify_server_uuid: '', coolify_environment: 'production', domain_suffix: 'example.com', default_mode: 'acceptEdits',
      claude_bin: `${D.home}/.local/bin/claude`, dokploy_url: '', dokploy_public_url: '', dokploy_project_id: '', dokploy_environment_id: '',
      dokploy_server_id: '', ntfy_url: 'https://ntfy.example.com/helmshell-7f3k9q2m', public_url: 'https://helmshell.example.com',
      notify_service: 'ntfy', gotify_url: '', default_agent: '', codex_bin: '/usr/local/bin/codex', codex_default_mode: 'auto', codex_usage_every: 5, language: LANG,
      deploy_provider: 'coolify', notify_done: true, usage_every: 5, update_check: true,
      access: { lan: true, vpn: true, vpn_cidrs: [], domain: true, domains: ['helmshell.example.com'], trusted_proxies: ['10.0.1.0/24'], ips: [] },
      oidc_issuer: '', oidc_client_id: '', oidc_allowed_emails: '', oidc_group: '', oidc_label: '', oidc_enabled: false, oidc_tested: false,
    };
    startLoops();
  }

  function makeProject(p) {
    const files = new Map();
    const mt = p.mtime;
    let i = 0;
    for (const [path, v] of Object.entries(p.files)) {
      const f = typeof v === 'string' ? { content: v } : { ...v };
      if (typeof v === 'object' && v.text != null) f.content = v.text;
      f.size = f.size || bytes(f.content || '');
      f.mtime = mt - 3600 * (2 + (i++ % 9)) - 600 * i;
      files.set(path, f);
    }
    const proj = { slug: p.slug, name: p.name, description: p.description, tags: p.tags.slice(), platforms: p.platforms.slice(),
      tags_manual: false, platforms_manual: false, mtime: p.mtime, size: p.size, iconDef: p.icon, icon: p.icon ? 1 : 0, remote: p.remote || '',
      appKey: p.app || '', files, heavy: (p.heavy || []).slice(), commands: (p.commandsSaved || []).map((c) => ({ ...c })),
      git: null, repo: {}, headless: null, copies: [], history: { claude: [], codex: [] } };
    if (p.git) {
      const g = p.git;
      proj.git = { branch: g.branch, ahead: g.ahead, behind: g.behind, upstream: g.upstream, fetched: g.fetched,
        changes: g.changes.map((c) => ({ ...c })), log: g.log.map((c) => ({ ...c })),
        local: g.local.map(([name, current, upstream, m]) => ({ name, current, upstream, when: D.min(m) })), remote: g.remoteBranches.slice() };
      for (const c of proj.git.changes) {
        const f = files.get(c.path);
        if (f) f.mtime = D.min(5 + proj.git.changes.indexOf(c) * 3);
      }
    }
    for (const [agent, r] of Object.entries(p.repo || {})) proj.repo[agent] = { ...r };
    if (p.headless) proj.headless = { ...p.headless, running: true, exit_code: null, spawn: 'same-dir' };
    proj.copies = (p.copies || []).map((c) => ({ ...c }));
    for (const agent of ['claude', 'codex']) {
      proj.history[agent] = ((p.history || {})[agent] || []).map((h, n) => ({
        id: agent === 'codex' ? `0199${D.hex(`cx-${p.slug}-${n}`, 4)}-${D.hex(`cx2-${p.slug}-${n}`, 4)}-7${D.hex(`cx3-${p.slug}-${n}`, 3)}-a${D.hex(`cx4-${p.slug}-${n}`, 3)}-${D.hex(`cx5-${p.slug}-${n}`, 12)}` : D.uuid(`conv-${p.slug}-${n}`),
        title: h.title, mtime: D.min(h.m), prompts: h.prompts, size: 18000 + h.prompts * 9100 + n * 1300 }));
    }
    return proj;
  }

  const proj = (slug) => S.projects.get(slug) || err(L('Projet introuvable', 'Project not found'), 404);
  const projPath = (p) => `${D.root}/${p.slug}`;
  const appOf = (p) => S.apps.find((a) => a.uuid === p.app_id) || null;
  const log = (text, kind, project = null) => { S.activity.unshift({ t: now(), text, kind, project }); bump(); };
  const bump = () => { S.v++; };

  /* ---------------------------------------------------------------- projects */
  const ICON_GLYPHS = {
    atlas: '<path d="M32 15 49 47H15z" fill="none" stroke="#fff" stroke-width="4.5" stroke-linejoin="round"/><circle cx="32" cy="37" r="4.5" fill="#fff"/>',
    ledger: '<rect x="19" y="13" width="26" height="36" rx="4" fill="none" stroke="#fff" stroke-width="4"/><path d="M25 24h14M25 31h14M25 38h8" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>',
    tidy: '<path d="M14 22a4 4 0 0 1 4-4h9l4 4h15a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z" fill="none" stroke="#fff" stroke-width="4"/><path d="M26 33h12m-5-5 5 5-5 5" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
    book: '<path d="M32 21c-5-4-11-4-17-3v26c6-1 12-1 17 3 5-4 11-4 17-3V18c-6-1-12-1-17 3z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M32 21v26" stroke="#fff" stroke-width="3.5"/>',
    stack: '<path d="M32 14 50 23 32 32 14 23z" fill="#fff"/><path d="M14 32l18 9 18-9M14 41l18 9 18-9" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>',
    leaf: '<path d="M47 16C27 16 16 27 17 46c19 1 30-10 30-30z" fill="#fff"/><path d="M19 45 36 28" stroke-width="3.5" stroke-linecap="round"/>',
    dot: '<circle cx="32" cy="32" r="10" fill="#fff"/>',
  };
  function iconSvg(def) {
    const [a, b] = def.color;
    const g = ICON_GLYPHS[def.glyph] || ICON_GLYPHS.dot;
    const glyph = def.glyph === 'leaf' ? g.replace('stroke-width="3.5"', `stroke="${b}" stroke-width="3.5"`) : g;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/>${glyph}</svg>`;
  }
  const svgUri = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;
  function iconUri(slug) {
    const p = S && S.projects.get(slug);
    if (!p) return svgUri(iconSvg({ color: ['#4F616D', '#2c3a43'], glyph: 'dot' }));
    if (S.icons.has(slug)) return S.icons.get(slug);
    return svgUri(iconSvg(p.iconDef || { color: ['#4F616D', '#2c3a43'], glyph: 'dot' }));
  }
  function fileUri(slug, path) {
    const p = S && S.projects.get(slug);
    const f = p && p.files.get(path);
    if (f && f.content && /\.svg$/i.test(path)) return svgUri(f.content);
    if (f && f.dataUri) return f.dataUri;
    if (p && /icon|logo/i.test(path)) return svgUri(iconSvg(p.iconDef || { color: ['#4F616D', '#2c3a43'], glyph: 'dot' }));
    return svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"><rect width="64" height="48" rx="6" fill="#d7e3df"/><circle cx="20" cy="17" r="6" fill="#9fb3ad"/><path d="M6 42l18-16 12 10 8-6 14 12z" fill="#7d958e"/></svg>');
  }

  function lastActivity(p) {
    let t = p.mtime;
    if (p.git && p.git.log[0]) t = Math.max(t, p.git.log[0].when);
    for (const a of S.activity) if (a.project === p.slug) { t = Math.max(t, a.t); break; }
    return t;
  }
  function headlessLight(p) {
    if (!p.headless) return { running: false };
    const h = p.headless;
    return { phase: h.phase, url: h.phase === 'starting' ? '' : h.url, question: h.phase === 'question' ? h.question : '', exit_code: h.exit_code,
      running: true, tmux: `claude-${p.slug}`, started: h.started, mode: h.mode, spawn: h.spawn };
  }
  function summary(p) {
    const a = appOf(p);
    return { slug: p.slug, name: p.name, path: projPath(p), description: p.description, tags: p.tags.slice(), platforms: p.platforms.slice(),
      tags_manual: p.tags_manual, platforms_manual: p.platforms_manual,
      git: p.git ? { branch: p.git.branch, changes: p.git.changes.length } : null,
      claude: headlessLight(p), app_id: p.app_id, icon: p.icon, mtime: p.mtime, last_activity: lastActivity(p),
      size: p.size, app: S.settings.deploy_provider === 'coolify' && a ? appView(a) : null };
  }
  function details(p) {
    return { ...summary(p), remote: p.git ? p.remote : '', has_claude_md: p.files.has('CLAUDE.md') };
  }

  function dirSet(p) {
    const dirs = new Set(['']);
    for (const path of p.files.keys()) {
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
    }
    for (const d of p.extraDirs || []) dirs.add(d);
    return dirs;
  }
  function modifiedSet(p) {
    const mod = new Set();
    if (!p.git) return mod;
    for (const c of p.git.changes) {
      mod.add(c.path);
      const parts = c.path.split('/');
      for (let i = 1; i < parts.length; i++) mod.add(parts.slice(0, i).join('/'));
    }
    return mod;
  }
  function tree(p, rel) {
    rel = (rel || '').replace(/^\/+|\/+$/g, '');
    const heavyRoot = rel.split('/')[0];
    if (rel && (p.heavy.includes(heavyRoot) || heavyRoot === '.git')) return heavyChildren(p, rel);
    const dirs = dirSet(p);
    if (!dirs.has(rel)) err(L('Ce n\'est pas un dossier', 'This is not a folder'));
    const mod = modifiedSet(p);
    const out = new Map();
    const pre = rel ? `${rel}/` : '';
    for (const d of dirs) {
      if (!d || !d.startsWith(pre) || d === rel) continue;
      const rest = d.slice(pre.length);
      if (rest.includes('/')) continue;
      out.set(rest, { name: rest, path: d, dir: true, size: 0, modified: mod.has(d), heavy: false });
    }
    for (const [path, f] of p.files) {
      if (!path.startsWith(pre)) continue;
      const rest = path.slice(pre.length);
      if (rest.includes('/')) continue;
      out.set(rest, { name: rest, path, dir: false, size: f.size, modified: mod.has(path), heavy: false });
    }
    if (!rel) {
      for (const h of [...(p.git ? ['.git'] : []), ...p.heavy]) out.set(h, { name: h, path: h, dir: true, size: 0, modified: false, heavy: true });
    }
    return [...out.values()].sort((a, b) => (a.dir === b.dir ? a.name.toLowerCase().localeCompare(b.name.toLowerCase()) : a.dir ? -1 : 1));
  }
  function heavyChildren(p, rel) {
    const KIDS = {
      '.git': [['HEAD', 0, 21], ['config', 0, 312], ['hooks', 1], ['objects', 1], ['refs', 1]],
      node_modules: [['@prisma', 1], ['next', 1], ['react', 1], ['react-dom', 1], ['typescript', 1], ['vitest', 1], ['zod', 1]],
      '.venv': [['bin', 1], ['lib', 1], ['pyvenv.cfg', 0, 182]],
    };
    if (rel.includes('/')) return [];
    const list = KIDS[rel] || [];
    return list.map(([name, dir, size]) => ({ name, path: `${rel}/${name}`, dir: !!dir, size: size || 0, modified: false, heavy: false }));
  }
  function readFile(p, rel) {
    const f = p.files.get(rel);
    if (!f) err(L('Fichier introuvable', 'File not found'), 404);
    return { path: rel, size: f.size, binary: !!f.binary, content: f.binary ? null : (f.content || ''), truncated: false, mtime: f.mtime };
  }

  /* --------------------------------------------------------------------- git */
  function mutate(line) {
    if (/\d/.test(line)) return line.replace(/\d+/, (n) => String(Math.max(0, Number(n) - 1)));
    if (/[,;]\s*$/.test(line)) return line.replace(/[,;]\s*$/, '');
    const words = line.trimEnd().split(' ');
    return words.length > 2 ? words.slice(0, -1).join(' ') : `${line.trimEnd()} // old`;
  }
  function synthDiff(p, path, add, del, hint = "") {
    const f = p.files.get(path);
    const head = `diff --git a/${path} b/${path}\nindex ${D.hex(`i1${path}${add}`, 7)}..${D.hex(`i2${path}${del}`, 7)} 100644\n--- a/${path}\n+++ b/${path}\n`;
    if (f && f.binary) return `diff --git a/${path} b/${path}\nindex ${D.hex(`i1${path}`, 7)}..${D.hex(`i2${path}`, 7)} 100644\nBinary files a/${path} and b/${path} differ\n`;
    let src = (f && f.content ? f.content : '').replace(/\n$/, '').split('\n');
    if (src.length < 3) src = [`# ${path}`, '', ...Array.from({ length: Math.max(add, 4) }, (_, i) => `line ${i + 1}`)];
    const nAdd = Math.min(add, 24, src.length), nDel = Math.min(del, 12);
    const words = (hint.match(/[A-Za-z_][\w.()]{4,}/g) || []).map((w) => w.replace(/[().]/g, "").toLowerCase()).filter((w) => w.length > 4 && !/^(update|first|initial|commit|version|dependenc|should|their|about|which|using|support|while)/.test(w));
    const hit = words.length ? src.findIndex((l) => words.some((w) => l.toLowerCase().includes(w))) : -1;
    const start = Math.max(0, Math.min(src.length - nAdd, hit >= 0 ? hit : Math.floor(src.length / 3)));
    const ctxA = src.slice(Math.max(0, start - 3), start), ctxB = src.slice(start + nAdd, start + nAdd + 3);
    const added = src.slice(start, start + nAdd);
    const removed = added.slice(0, nDel).map(mutate);
    while (removed.length < nDel) removed.push(`${(added[0] || '').replace(/\S.*/, '')}// removed`);
    const oldStart = Math.max(1, start - ctxA.length + 1);
    const body = [...ctxA.map((l) => ` ${l}`), ...removed.map((l) => `-${l}`), ...added.map((l) => `+${l}`), ...ctxB.map((l) => ` ${l}`)];
    return `${head}@@ -${oldStart},${ctxA.length + removed.length + ctxB.length} +${oldStart},${ctxA.length + added.length + ctxB.length} @@\n${body.join('\n')}\n`;
  }
  function newFileDiff(p, path) {
    const f = p.files.get(path);
    if (!f || f.binary) return `diff --git a/${path} b/${path}\nnew file mode 100644\nindex 0000000..${D.hex(`n${path}`, 7)}\nBinary files /dev/null and b/${path} differ\n`;
    const ls = (f.content || '').replace(/\n$/, '').split('\n');
    return `diff --git a/${path} b/${path}\nnew file mode 100644\nindex 0000000..${D.hex(`n${path}`, 7)}\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${ls.length} @@\n${ls.map((l) => `+${l}`).join('\n')}\n`;
  }
  function simpleDiff(path, before, after) {
    const a = (before || '').replace(/\n$/, '').split('\n'), b = (after || '').replace(/\n$/, '').split('\n');
    let s = 0;
    while (s < a.length && s < b.length && a[s] === b[s]) s++;
    let ea = a.length - 1, eb = b.length - 1;
    while (ea >= s && eb >= s && a[ea] === b[eb]) { ea--; eb--; }
    const c0 = Math.max(0, s - 3), cA = Math.min(a.length - 1, ea + 3), cB = Math.min(b.length - 1, eb + 3);
    const body = [...a.slice(c0, s).map((l) => ` ${l}`), ...a.slice(s, ea + 1).map((l) => `-${l}`), ...b.slice(s, eb + 1).map((l) => `+${l}`), ...a.slice(ea + 1, cA + 1).map((l) => ` ${l}`)];
    return { diff: `diff --git a/${path} b/${path}\nindex ${D.hex(`e1${path}${before.length}`, 7)}..${D.hex(`e2${path}${after.length}`, 7)} 100644\n--- a/${path}\n+++ b/${path}\n@@ -${c0 + 1},${cA - c0 + 1} +${c0 + 1},${cB - c0 + 1} @@\n${body.join('\n')}\n`,
      add: Math.max(0, eb - s + 1), del: Math.max(0, ea - s + 1) };
  }
  function changeDiff(p, c) {
    if (c.diff) return c.diff;
    const key = `${p.slug}:${c.path}`;
    if (D.diffs[key]) return D.diffs[key];
    if (c.kind === 'A') return newFileDiff(p, c.path);
    if (c.kind === 'D') return `diff --git a/${c.path} b/${c.path}\ndeleted file mode 100644\n--- a/${c.path}\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-(deleted)\n`;
    return synthDiff(p, c.path, c.add || 3, c.del || 1);
  }
  function gitInfo(p) {
    const g = p.git;
    if (!g) return { repo: false };
    return { repo: true, branch: g.branch, remote: p.remote, ahead: g.ahead, behind: g.behind, upstream: p.remote ? g.upstream : false, fetched: g.fetched,
      changes: g.changes.map((c) => ({ kind: c.kind, path: c.path, add: c.add, del: c.del })),
      log: g.log.slice(0, 8).map((c) => ({ hash: c.short, msg: c.msg, when: String(c.when) })) };
  }
  function commitShow(p, c) {
    const files = (c.files || [[Object.keys(p.files)[0], 3, 1]]).map(([path, add, del]) => ({ path, add, del }));
    const diff = c.diff || files.map((f) => synthDiff(p, f.path, f.add, f.del, c.msg)).join('');
    const body = c.body ? `\n\n${c.body}` : '';
    return { hash: c.hash, author: `${c.author} <${c.email || 'alex@example.com'}>`, when: c.when, message: c.msg + body, files, diff };
  }
  function addChange(p, path, kind, before, after) {
    if (!p.git) return;
    const existing = p.git.changes.find((c) => c.path === path);
    if (kind === 'D') {
      if (existing && existing.kind === 'A') p.git.changes = p.git.changes.filter((c) => c !== existing);
      else if (existing) { existing.kind = 'D'; existing.diff = null; } else p.git.changes.push({ kind: 'D', path, add: 0, del: lines(before) });
      return;
    }
    if (kind === 'A' || (existing && existing.kind === 'A')) {
      const c = existing || { kind: 'A', path };
      c.add = lines(after); c.del = 0; c.diff = null;
      if (!existing) p.git.changes.push(c);
      return;
    }
    const base = existing && existing.base != null ? existing.base : before;
    const d = simpleDiff(path, base, after);
    if (existing) Object.assign(existing, { kind: 'M', add: d.add, del: d.del, diff: d.diff, base });
    else p.git.changes.push({ kind: 'M', path, add: d.add, del: d.del, diff: d.diff, base });
  }

  /* ------------------------------------------------------- agents & sessions */
  function agentsInfo() {
    return { default_agent: S.settings.default_agent || 'claude', setting: S.settings.default_agent || '',
      agents: [
        { id: 'claude', label: 'Claude Code', available: true, bin: S.settings.claude_bin, modes: modeList(MODES_CLAUDE), default_mode: S.settings.default_mode },
        { id: 'codex', label: 'Codex', available: true, bin: S.settings.codex_bin, modes: modeList(MODES_CODEX), default_mode: S.settings.codex_default_mode },
      ] };
  }
  const repoName = (slug, agent, branch) => `${agent === 'codex' ? 'codex-' : ''}${slug}${branch ? `@${branch.replace(/[^A-Za-z0-9_-]/g, '_')}` : ''}`;
  const repoKey = (slug, agent, branch) => `${agent === 'codex' ? 'codex:' : ''}${slug}${branch ? `@${branch}` : ''}`;
  function repoSession(p, agent, branch) {
    if (!branch) return p.repo[agent] || null;
    const c = p.copies.find((x) => x.branch === branch);
    if (!c) err(L('Copie de travail introuvable', 'Working copy not found'), 404);
    return (c.repo || {})[agent] || null;
  }
  function setRepoSession(p, agent, branch, value) {
    if (!branch) { if (value) p.repo[agent] = value; else delete p.repo[agent]; return; }
    const c = p.copies.find((x) => x.branch === branch);
    if (!c) err(L('Copie de travail introuvable', 'Working copy not found'), 404);
    c.repo = c.repo || {};
    if (value) c.repo[agent] = value; else delete c.repo[agent];
  }
  function repoState(p, branch, agent) {
    agent = agent === 'codex' ? 'codex' : 'claude';
    const name = repoName(p.slug, agent, branch);
    const r = repoSession(p, agent, branch);
    if (!r) return { exists: false, name, claude: false, alive: false, url: '', rc: false, branch: branch || null, agent };
    if (agent === 'codex') return { exists: true, name, branch: branch || null, agent, claude: r.alive, alive: r.alive, command: r.alive ? 'codex' : 'zsh', created: r.created, url: '', rc: false, status: '', since: 0, context: null };
    const url = r.rc ? (r.url || `https://claude.ai/code/session_01${D.hex(`rc-${p.slug}`, 22)}`) : '';
    return { exists: true, name, branch: branch || null, agent, claude: r.alive, alive: r.alive, command: r.alive ? 'claude' : 'zsh', created: r.created,
      url, rc: r.alive && r.rc, status: r.alive ? r.status : '', since: r.alive ? r.since : 0, context: r.alive ? r.context : null };
  }
  function listRepoSessions(withPreview, onlyAgent) {
    const items = [];
    const ps = [...S.projects.values()].sort((a, b) => a.slug.toLowerCase().localeCompare(b.slug.toLowerCase()));
    for (const p of ps) {
      for (const agent of onlyAgent ? [onlyAgent] : ['claude', 'codex']) {
        for (const branch of [null, ...p.copies.filter((c) => c.repo && c.repo[agent]).map((c) => c.branch)]) {
          const st = repoState(p, branch, agent);
          if (!st.exists) continue;
          const item = { slug: p.slug, branch, key: repoKey(p.slug, agent, branch), agent, name: p.name + (branch ? ` · ${branch}` : ''),
            path: branch ? `${D.root}/.branches/${p.slug}/${branch.replace(/[^A-Za-z0-9_-]/g, '_')}` : projPath(p), tmux: st.name,
            started: st.created, claude: st.claude, alive: st.alive, rc: st.rc, url: st.url, status: st.status || '', since: st.since || 0 };
          if (withPreview) item.preview = previewOf(p, agent, branch);
          items.push(item);
        }
      }
    }
    return items;
  }
  function listSessions() {
    return [...S.projects.values()].filter((p) => p.headless).map((p) => ({ ...headlessLight(p), slug: p.slug, name: p.name, path: projPath(p) }));
  }
  function terminalsList() {
    const items = S.shells.map((x) => ({ ...x }));
    for (const p of S.projects.values()) {
      if (p.headless) items.push({ name: `claude-${p.slug}`, created: p.headless.started, attached: 0, path: projPath(p), command: 'claude', slug: p.slug, kind: 'remote', agent: 'claude', claude: true });
      for (const r of listRepoSessions(false).filter((x) => x.slug === p.slug)) {
        items.push({ name: r.tmux, created: r.started, attached: S.live.has(r.tmux) ? 1 : 0, path: r.path, command: r.alive ? (r.agent === 'codex' ? 'codex' : 'claude') : 'zsh',
          slug: p.slug, kind: 'repo', agent: r.agent, claude: r.alive });
      }
    }
    return items.sort((a, b) => a.created - b.created);
  }

  /* -------------------------------------------------------------------- tasks */
  function taskState(tk, full) {
    const out = { id: tk.id, slug: tk.slug, name: (S.projects.get(tk.slug) || { name: tk.slug }).name, prompt: tk.prompt, agent: tk.agent, mode: tk.mode,
      kind: tk.kind || '', started: tk.started, running: tk.status === 'running', finished: tk.status === 'running' ? null : (tk.finished || now()),
      exit_code: tk.status === 'running' ? null : tk.status === 'ok' ? 0 : 1, status: tk.status, result: tk.status === 'running' ? null : (tk.result || null) };
    const ev = tk.events.slice(full ? -400 : -40);
    const last = [...ev].reverse().find((e) => e.k === 'text' || e.k === 'tool');
    out.last = last ? (last.k === 'text' ? last.t : `${last.name} ${last.detail}`).slice(0, 200) : '';
    if (full) out.events = ev;
    return out;
  }
  const taskList = (slug, limit) => S.tasks.filter((x) => !slug || x.slug === slug).sort((a, b) => b.started - a.started).slice(0, limit).map((x) => taskState(x, false));
  function newTask(p, prompt, mode, kind, agent) {
    const id = `${now()}-${Math.random().toString(16).slice(2, 8)}`;
    const files = [...p.files.keys()].filter((x) => !p.files.get(x).binary);
    const pick = (i) => files[(i * 7 + prompt.length) % files.length] || 'README.md';
    const tool = agent === 'codex' ? ['shell', 'apply_patch'] : ['Read', 'Edit'];
    const script = [
      { k: 'text', t: L('Je commence par lire le code concerné.', 'Let me start by reading the relevant code.') },
      { k: 'tool', name: tool[0], detail: agent === 'codex' ? `rg -n "${prompt.split(/\s+/)[1] || 'TODO'}"` : pick(1) },
      { k: 'tool', name: agent === 'codex' ? 'shell' : 'Grep', detail: agent === 'codex' ? `sed -n 1,80p ${pick(2)}` : (prompt.split(/\s+/).slice(-1)[0] || 'TODO').replace(/[^\w-]/g, '') || 'TODO' },
      { k: 'tool', name: tool[1], detail: pick(3) },
      { k: 'text', t: L('Modification faite, je vérifie avec les tests.', 'Change done, checking with the tests.') },
      { k: 'tool', name: agent === 'codex' ? 'shell' : 'Bash', detail: p.files.has('package.json') ? 'npm test' : p.files.has('go.mod') ? 'go test ./...' : p.files.has('pyproject.toml') ? 'uv run pytest -q' : 'make test' },
    ];
    const tk = { id, slug: p.slug, agent, mode, kind: kind || '', started: now(), status: 'running', prompt, events: [], later: script, user: true,
      result: { error: false, turns: 6, duration: 0, text: L(
        `**(Démo)** Dans la vraie console, ${agent === 'codex' ? 'Codex' : 'Claude'} aurait travaillé ici sur « ${prompt.slice(0, 80)} » et décrirait ce qu’il a changé. Les modifications attendraient ta relecture dans l’onglet Git.`,
        `**(Demo)** In the real console, ${agent === 'codex' ? 'Codex' : 'Claude'} would have worked here on "${prompt.slice(0, 80)}" and would describe what it changed. The changes would wait for your review in the Git tab.`) } };
    S.tasks.unshift(tk);
    log(L(`Tâche confiée à ${agent === 'codex' ? 'Codex' : 'Claude'} sur ${p.name} : ${prompt.split('\n')[0].slice(0, 60)}`, `Task given to ${agent === 'codex' ? 'Codex' : 'Claude'} on ${p.name}: ${prompt.split('\n')[0].slice(0, 60)}`), 'claude', p.slug);
    return taskState(tk, false);
  }

  /* -------------------------------------------------------------- deployments */
  function appView(a) {
    const image = a.build_pack === 'dockerimage' || a.build_pack === 'dockerfile';
    const repo = image || !a.repo ? '' : a.repo;
    const source = a.build_pack === 'dockerimage' ? `Image ${a.image}` : a.build_pack === 'dockerfile' ? 'Dockerfile' : repo ? `${repo}${a.branch ? ` · ${a.branch}` : ''}` : a.build_pack;
    return { uuid: a.uuid, name: a.name, status: a.status, fqdn: a.fqdn, repo, source, branch: a.branch, build_pack: a.build_pack, updated: a.updated };
  }
  const STATUS_LABEL = { finished: ['Terminé', 'Finished'], failed: ['Échec', 'Failed'], in_progress: ['En cours', 'In progress'], queued: ['En attente', 'Queued'], 'cancelled-by-user': ['Annulé', 'Cancelled'], cancelled: ['Annulé', 'Cancelled'] };
  function depView(d) {
    const st = STATUS_LABEL[d.status];
    const label = d.message || (d.rollback ? L('Retour en arrière', 'Rollback') : d.restart ? L('Redémarrage', 'Restart') : d.force ? L('Reconstruction sans cache', 'Rebuild without cache')
      : d.commit ? L(`Commit ${d.commit}`, `Commit ${d.commit}`) : d.api ? L('Déploiement lancé depuis Helmshell', 'Deployment started from Helmshell') : L('Déploiement manuel', 'Manual deployment'));
    return { uuid: d.uuid, status: d.status, status_label: st ? L(st[0], st[1]) : d.status, commit: d.commit || '', message: d.message || '', label, created: d.created, finished: d.finished };
  }
  const appByUuid = (uuid) => S.apps.find((a) => a.uuid === uuid) || err(L('Application introuvable', 'Application not found'), 404);
  function startDeployment(a, opts = {}) {
    const p = [...S.projects.values()].find((x) => x.app_id === a.uuid);
    const head = p && p.git && p.git.log[0];
    const d = { uuid: Math.random().toString(16).slice(2, 14) + Math.random().toString(16).slice(2, 14), status: 'in_progress', commit: opts.rollback ? opts.commit : head ? head.short : '',
      message: opts.rollback || opts.force ? '' : head ? head.msg : '', created: new Date().toISOString(), finished: null, api: true, force: !!opts.force, rollback: !!opts.rollback };
    a.deployments.unshift(d);
    a.status = a.status.startsWith('exited') ? 'starting:unknown' : a.status;
    bump();
    setTimeout(() => {
      d.status = 'finished'; d.finished = new Date().toISOString(); a.status = 'running:healthy'; a.updated = d.finished; bump();
    }, 14000);
    return { message: 'Deployment request queued.', deployment_uuid: d.uuid, resource_uuid: a.uuid };
  }
  function appLogs(a, n) {
    const out = [];
    const ts = (m) => new Date((now() - m * 60) * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    const t = now();
    if (a.status.startsWith('exited')) {
      out.push(`${ts(60 * 11 + 2)} Listening on port 3001`, `${ts(60 * 11 + 1)} [MONITOR] WARN: Failing: Ledger API (https://api.example.com/health) | timeout of 48000ms exceeded`,
        `${ts(60 * 11)} [SERVER] INFO: Shutdown requested`, `${ts(60 * 11)} [SERVER] INFO: Closing the database`, `${ts(60 * 11)} [SERVER] INFO: Graceful shutdown successful!`);
      return out.join('\n');
    }
    const routes = a.key === 'ledger' ? ['GET /health 200 1ms', 'GET /invoices?page=1 200 18ms', 'POST /invoices 201 24ms', 'GET /invoices/482 200 6ms', 'POST /invoices/482/pay 200 11ms']
      : a.key === 'docs' ? ['GET / 200', 'GET /getting-started/ 200', 'GET /backups/ 200', 'GET /_astro/index.css 200', 'GET /networking/ 200']
        : ['GET /projects?page=2 200 in 41ms', 'GET / 200 in 23ms', 'GET /api/stats 200 in 12ms', 'GET /projects 200 in 37ms', 'GET /_next/static/chunks/app.js 200 in 3ms'];
    if (a.key === 'ledger') out.push(`INFO:     Started server process [1]`, `INFO:     Application startup complete.`, `INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)`);
    else if (a.key === 'atlas') out.push(`    ▲ Next.js 15.1.3`, `    - Local:        http://localhost:3000`, `  ✓ Ready in 412ms`);
    const count = Math.min(n || 200, 60);
    for (let i = count; i > 0; i--) {
      const r = routes[(i * 7 + Math.floor(t / 20)) % routes.length];
      out.push(a.key === 'ledger' ? `INFO:     192.168.1.${(i * 13) % 200 + 20}:5${(i * 311) % 9000 + 1000} - "${r.split(' ').slice(0, 2).join(' ')} HTTP/1.1" ${r.split(' ')[2]}` : r);
    }
    return out.join('\n');
  }

  /* ------------------------------------------------------------------- health */
  const GB = 1024 ** 3;
  const noise = (seed) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
  function cpuAt(ts) {
    const h = (ts / 3600) % 24;
    const day = 9 + 7 * Math.max(0, Math.sin(((h - 7) / 24) * Math.PI * 2));
    const spike = noise(Math.floor(ts / 900)) > 0.93 ? 30 * noise(ts / 900 + 1) : 0;
    return Math.max(2, Math.min(97, day + 6 * noise(Math.floor(ts / 60)) + spike));
  }
  const memAt = (ts) => 34 + 4 * Math.sin(ts / 86400 * Math.PI * 2) + 2.5 * noise(Math.floor(ts / 300));
  function stats() {
    const t = now();
    const memTotal = 32 * GB;
    return { hostname: D.hostname, os: 'Debian GNU/Linux 12 (bookworm)', cpu: Math.round(cpuAt(t) * 10) / 10, cores: 8, load: Math.round((cpuAt(t) / 100) * 8 * 100) / 100,
      mem_total: memTotal, mem_used: Math.round(memTotal * memAt(t) / 100), disk_total: Math.round(931.5 * GB), disk_used: Math.round(386.2 * GB), uptime: 23 * 86400 + 4 * 3600 + (t - S.started) };
  }
  function metrics(hours) {
    hours = Math.max(1, Math.min(hours || 24, 720));
    const t = now(), t0 = t - hours * 3600, buckets = 180, width = hours * 3600 / buckets;
    const pts = [];
    for (let i = 0; i < buckets; i++) {
      const c = t0 + (i + 0.5) * width;
      const cpu = Math.round(cpuAt(c) * 10) / 10, mem = Math.round(memAt(c) * 10) / 10, disk = Math.round((41.2 + (c - t0) / (hours * 3600) * 0.3) * 10) / 10;
      pts.push([Math.round(c), cpu, mem, disk, Math.round(Math.min(100, Math.min(92, cpu + 5 + 9 * noise(c))) * 10) / 10, Math.round(Math.min(100, mem + 2 + 3 * noise(c + 3)) * 10) / 10]);
    }
    const per = hours > 168 ? 'day' : 'hour';
    const step = per === 'day' ? 86400 : 3600;
    const groups = new Map();
    for (const p of pts) { const k = Math.floor(p[0] / step) * step; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    const agg = (g) => ({ cpu: Math.round(g.reduce((a, p) => a + p[1], 0) / g.length * 10) / 10, cpu_max: Math.max(...g.map((p) => p[4])),
      mem: Math.round(g.reduce((a, p) => a + p[2], 0) / g.length * 10) / 10, mem_max: Math.max(...g.map((p) => p[5])), disk: Math.round(g.reduce((a, p) => a + p[3], 0) / g.length * 10) / 10 });
    const hourly = [...groups].sort((a, b) => b[0] - a[0]).map(([k, g]) => ({ t: k, n: g.length * Math.round(width / 60), ...agg(g) }));
    return { hours, per, points: pts, hourly, summary: { n: hours * 60, from: t0, ...agg(pts) } };
  }
  function usage() {
    const t = now();
    const nextWeek = (() => { const d = new Date(); d.setDate(d.getDate() + ((4 - d.getDay() + 7) % 7 || 7)); d.setHours(9, 0, 0, 0); return Math.floor(d / 1000); })();
    const sessions = [];
    for (const r of listRepoSessions(false, 'claude')) {
      const p = S.projects.get(r.slug), rs = repoSession(p, 'claude', r.branch);
      if (!r.alive || !rs || !rs.context) continue;
      sessions.push({ id: D.uuid(`live-${r.key}`), slug: r.slug, project: p.name, session: '', where: 'Helmshell', status: r.status, model: 'claude-opus',
        used: rs.context.used, size: rs.context.size, tokens: rs.context.tokens, t: t - 40 });
    }
    return { limits: [
      { id: 'session', label: L('Session (5 h)', 'Session (5 h)'), used: 42, resets_at: t + 2 * 3600 + 13 * 60, window: 5 * 3600 },
      { id: 'week', label: L('Semaine · tous les modèles', 'Week · all models'), used: 36, resets_at: nextWeek, window: 7 * 86400 },
      { id: 'week_opus', label: L('Semaine · Opus', 'Week · Opus'), used: 22, resets_at: nextWeek, window: 7 * 86400 },
    ], updated: t - 160, sessions, refreshing: false, every: S.settings.usage_every };
  }

  // Codex : forfait et contexte des sessions Codex ouvertes, comme /api/codex/usage
  function codexUsage() {
    const t = now();
    const sessions = [];
    for (const r of listRepoSessions(false, 'codex')) {
      if (!r.alive) continue;
      const p = S.projects.get(r.slug);
      sessions.push({ project: p.name, slug: r.slug, branch: r.branch || null, used: 18, tokens: 46500, size: 258400 });
    }
    return { limits: [
      { id: 'codex_primary', label: L('Session (5 h)', 'Session (5 h)'), used: 27, resets_at: t + 3 * 3600 + 20 * 60, window: 5 * 3600 },
      { id: 'codex_secondary', label: L('Semaine', 'Week'), used: 31, resets_at: t + 4 * 86400, window: 7 * 86400 },
    ], plan: 'plus', updated: t - 300, sessions, refreshing: false };
  }

  /* ------------------------------------------------------------- transcripts */
  function transcriptOf(p, h, agent) {
    const t0 = h.mtime - 20 * 60;
    const at = (m) => new Date((t0 + m * 60) * 1000).toISOString();
    const files = [...p.files.keys()].filter((x) => !p.files.get(x).binary && !/lock|\.sum$/.test(x));
    const f1 = files[2 % files.length], f2 = files[5 % files.length], f3 = files[7 % files.length];
    const who = agent === 'codex' ? 'Codex' : 'Claude';
    const tool = agent === 'codex' ? ['shell', 'apply_patch', 'shell'] : ['Read', 'Edit', 'Bash'];
    const test = p.files.has('package.json') ? 'npm test' : p.files.has('go.mod') ? 'go test ./...' : p.files.has('pyproject.toml') ? 'uv run pytest -q' : 'make';
    const msgs = [
      { role: 'user', text: h.title, when: at(0) },
      { role: 'assistant', text: L(`Je regarde d’abord comment c’est organisé dans \`${f1}\`.`, `Let me first look at how this is organised in \`${f1}\`.`), when: at(1) },
      { role: 'tool', text: tool[0], detail: agent === 'codex' ? `sed -n 1,120p ${f1}` : f1, when: at(1) },
      { role: 'tool', text: tool[0], detail: agent === 'codex' ? `rg -n "func |def |export" ${f2}` : f2, when: at(2) },
      { role: 'assistant', text: L(`Voici ce que je propose :\n\n1. Adapter \`${f2}\`\n2. Ajouter un test\n3. Lancer \`${test}\``, `Here is the plan:\n\n1. Update \`${f2}\`\n2. Add a test\n3. Run \`${test}\``), when: at(3) },
      { role: 'user', text: L('Vas-y', 'Go ahead'), when: at(5) },
      { role: 'tool', text: tool[1], detail: f2, when: at(6) },
      { role: 'tool', text: tool[1], detail: f3, when: at(8) },
      { role: 'tool', text: tool[2], detail: test, when: at(10) },
      { role: 'assistant', text: L(`C’est fait. **${test}** passe.\n\n- \`${f2}\` : la modification demandée\n- \`${f3}\` : un test de plus\n\nRien n’est validé : tout est dans l’onglet Git.`, `Done. **${test}** passes.\n\n- \`${f2}\`: the requested change\n- \`${f3}\`: one more test\n\nNothing is committed: everything is in the Git tab.`), when: at(12) },
    ];
    for (let i = 2; i < h.prompts; i++) {
      msgs.push({ role: 'user', text: L('Merci. Tu peux aussi mettre à jour le README ?', 'Thanks. Can you also update the README?'), when: at(12 + i) });
      msgs.push({ role: 'tool', text: tool[1], detail: 'README.md', when: at(13 + i) });
      msgs.push({ role: 'assistant', text: L('README mis à jour (section « Utilisation »).', 'README updated ("Usage" section).'), when: at(13 + i) });
    }
    return { id: h.id, title: agent === 'codex' ? '' : h.title, messages: msgs, total: msgs.length, agent };
  }

  /* ============================================================== API routes */
  const R = [];
  const route = (method, pattern, fn) => R.push([method, new RegExp(`^${pattern}$`), fn]);
  const SL = '(?<slug>[A-Za-z0-9][A-Za-z0-9._-]*)';
  const PP = `/api/projects/${SL}`;

  route('GET', '/api/me', () => ({ ok: true, language: LANG }));
  route('GET', '/api/auth-info', () => ({ password: true, oidc: null, language: LANG }));
  route('POST', '/api/login', () => ({ ok: true }));
  route('POST', '/api/logout', () => ({ ok: true }));
  route('POST', '/api/logout-all', () => ({ ok: true }));
  route('GET', '/api/version', () => ({ current: VERSION, latest: VERSION, url: `${REPO}/releases`, notes: '', available: false, kind: 'docker', checked: now() - 7200, version: VERSION, repo: REPO }));
  route('GET', '/api/overview', () => ({ root: D.root, user: D.user, stats: { ...stats(), projects_size: [...S.projects.values()].reduce((a, p) => a + (p.size || 0), 0) },
    sessions: listSessions(), repos: listRepoSessions(false), activity: S.activity.slice(0, 12), deploy: deployInfo() }));
  function deployInfo() {
    const pid = S.settings.deploy_provider;
    const FEAT = { coolify: { logs: true, envs: true, domains: true, rollback: true, create: true, resources: true }, dokploy: { logs: true, envs: true, domains: true, rollback: false, create: true, resources: true } };
    return { provider: pid, name: { coolify: 'Coolify', dokploy: 'Dokploy' }[pid] || '', url: pid ? (S.settings[`${pid}_public_url`] || S.settings[`${pid}_url`] || '') : '',
      configured: pid === 'coolify', features: FEAT[pid] || {} };
  }

  /* --- projects --- */
  route('GET', '/api/projects', () => [...S.projects.values()].sort((a, b) => a.slug.toLowerCase().localeCompare(b.slug.toLowerCase())).map(summary));
  route('POST', '/api/projects', (q, b) => createProject(b));
  route('POST', '/api/folders', (q, b) => {
    const name = String(b.name || '').trim() || err(L('Nom vide', 'Empty name'));
    const slug = uniqueSlug(slugify(name));
    S.projects.set(slug, makeProject({ slug, name, description: '', tags: [], platforms: [], mtime: now(), size: 4096, files: {}, heavy: [] }));
    log(L(`Dossier ${slug} créé`, `Folder ${slug} created`), 'create', slug);
    return { slug };
  });
  route('GET', PP, (q, b, m) => details(proj(m.slug)));
  route('DELETE', PP, (q, b, m) => {
    const p = proj(m.slug);
    if (b.confirm !== p.slug) err(L('Confirmation manquante', 'Missing confirmation'));
    const id = `${now()}-${Math.random().toString(16).slice(2, 8)}`;
    S.trash.unshift({ id, slug: p.slug, path: '', name: p.slug, deleted: now(), project: true, meta: { name: p.name }, dir: true, size: p.size || 0, restoreProject: p });
    S.projects.delete(p.slug);
    log(L(`Projet ${p.name} mis à la corbeille`, `Project ${p.name} moved to the trash`), 'stop', p.slug);
    return { trash_id: id };
  });
  route('PATCH', PP, (q, b, m) => {
    const p = proj(m.slug);
    if ('name' in b) p.name = String(b.name || '').trim() || p.slug;
    if ('description' in b) p.description = String(b.description || '');
    if ('app_id' in b) p.app_id = String(b.app_id || '');
    if ('tags' in b) { p.tags_manual = !!(b.tags && b.tags.length); if (b.tags) p.tags = b.tags.map((x) => String(x).slice(0, 30)).slice(0, 12); }
    if ('platforms' in b) { p.platforms_manual = b.platforms !== null; if (b.platforms) p.platforms = b.platforms.slice(); }
    bump();
    return { ok: true };
  });
  route('GET', `${PP}/icon/candidates`, (q, b, m) => {
    const p = proj(m.slug);
    return [...p.files.entries()].filter(([path]) => /\.(png|jpe?g|gif|webp|svg|ico|avif)$/i.test(path) && /(icon|logo|favicon|ic_launcher|apple-touch|brand|appicon)/i.test(path))
      .map(([path, f]) => ({ path, size: f.size, strong: true }));
  });
  route('POST', `${PP}/icon`, (q, b, m) => {
    const p = proj(m.slug);
    if (!p.files.has(b.path)) err(L('Fichier introuvable', 'File not found'), 404);
    S.icons.set(p.slug, fileUri(p.slug, b.path));
    p.icon = (p.icon || 0) + 1;
    return { icon: p.icon };
  });
  route('PUT', `${PP}/icon`, async (q, b, m, raw) => {
    const p = proj(m.slug);
    if (!(raw instanceof Blob)) err(L('Image vide', 'Empty image'));
    if (raw.size > 2 * 1024 * 1024) err(L('Image trop grosse (2 Mo max)', 'Image too large (2 MB max)'), 413);
    S.icons.set(p.slug, await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(raw); }));
    p.icon = (p.icon || 0) + 1;
    return { icon: p.icon };
  });
  route('DELETE', `${PP}/icon`, (q, b, m) => { const p = proj(m.slug); S.icons.delete(p.slug); p.icon = 0; return { icon: 0 }; });
  route('GET', `${PP}/tree`, (q, b, m) => tree(proj(m.slug), q.get('path')));
  route('GET', `${PP}/file`, (q, b, m) => readFile(proj(m.slug), q.get('path') || ''));
  route('PUT', `${PP}/file`, (q, b, m) => {
    const p = proj(m.slug), path = q.get('path') || '';
    const f = p.files.get(path);
    const content = String(b.content || '');
    if (!f) { p.files.set(path, { content, size: bytes(content), mtime: now() }); addChange(p, path, 'A', '', content); }
    else { const before = f.content || ''; f.content = content; f.size = bytes(content); f.mtime = now(); if (before !== content) addChange(p, path, 'M', before, content); }
    bump();
    return { ok: true };
  });
  route('POST', `${PP}/mkdir`, (q, b, m) => {
    const p = proj(m.slug), path = String(b.path || '').replace(/^\/+|\/+$/g, '');
    if (!path) err(L('Nom vide', 'Empty name'));
    if (dirSet(p).has(path) || p.files.has(path)) err(L('Existe déjà', 'Already exists'));
    p.extraDirs = (p.extraDirs || []).concat(path);
    return { ok: true };
  });
  route('POST', `${PP}/newfile`, (q, b, m) => {
    const p = proj(m.slug), path = String(b.path || '').replace(/^\/+/, '');
    if (!path) err(L('Nom vide', 'Empty name'));
    if (p.files.has(path)) err(L('Existe déjà', 'Already exists'));
    p.files.set(path, { content: '', size: 0, mtime: now() });
    addChange(p, path, 'A', '', '');
    return { ok: true };
  });
  route('POST', `${PP}/rename`, (q, b, m) => {
    const p = proj(m.slug), from = String(b.from || ''), to = String(b.to || '').replace(/^\/+/, '');
    if (!to) err(L('Nom vide', 'Empty name'));
    if (p.files.has(to)) err(L('Existe déjà', 'Already exists'));
    const moved = [...p.files.keys()].filter((x) => x === from || x.startsWith(`${from}/`));
    if (!moved.length && !dirSet(p).has(from)) err(L('Fichier introuvable', 'File not found'), 404);
    for (const x of moved) {
      const nx = to + x.slice(from.length);
      const f = p.files.get(x);
      p.files.delete(x); p.files.set(nx, f);
      addChange(p, x, 'D', f.content || '', ''); addChange(p, nx, 'A', '', f.content || '');
    }
    p.extraDirs = (p.extraDirs || []).map((d) => (d === from || d.startsWith(`${from}/`) ? to + d.slice(from.length) : d));
    return { ok: true };
  });
  route('POST', `${PP}/delete`, (q, b, m) => {
    const p = proj(m.slug), path = String(b.path || '');
    const gone = [...p.files.keys()].filter((x) => x === path || x.startsWith(`${path}/`));
    if (!gone.length && !dirSet(p).has(path)) err(L('Fichier introuvable', 'File not found'), 404);
    const id = `${now()}-${Math.random().toString(16).slice(2, 8)}`;
    const saved = gone.map((x) => [x, p.files.get(x)]);
    for (const x of gone) { addChange(p, x, 'D', p.files.get(x).content || '', ''); p.files.delete(x); }
    p.extraDirs = (p.extraDirs || []).filter((d) => d !== path && !d.startsWith(`${path}/`));
    S.trash.unshift({ id, slug: p.slug, path, name: path.split('/').pop(), deleted: now(), dir: gone.length !== 1 || gone[0] !== path,
      size: saved.reduce((a, [, f]) => a + f.size, 0), restoreFiles: saved });
    log(L(`${p.slug}/${path} mis à la corbeille`, `${p.slug}/${path} moved to the trash`), 'file', p.slug);
    return { trash_id: id };
  });
  route('GET', `${PP}/files`, (q, b, m) => [...proj(m.slug).files.keys()].sort());
  route('GET', `${PP}/search`, (q, b, m) => {
    const p = proj(m.slug);
    const s = (q.get('q') || '').trim();
    if (s.length < 2) err(L('Tape au moins 2 caractères', 'Type at least 2 characters'));
    const cs = q.get('case') === '1';
    let test;
    if (q.get('regex') === '1') { let rx; try { rx = new RegExp(s, cs ? '' : 'i'); } catch (e) { err(e.message); } test = (l) => rx.test(l); }
    else { const n = cs ? s : s.toLowerCase(); test = (l) => (cs ? l : l.toLowerCase()).includes(n); }
    const results = [], files = new Set();
    for (const [path, f] of [...p.files].sort((a, b2) => a[0].localeCompare(b2[0]))) {
      if (f.binary || !f.content) continue;
      f.content.split('\n').forEach((l, i) => { if (results.length < 400 && test(l)) { results.push({ path, line: i + 1, text: l.slice(0, 300) }); files.add(path); } });
    }
    return { results, files: files.size, truncated: results.length >= 400 };
  });
  route('GET', `${PP}/commands`, (q, b, m) => {
    const p = proj(m.slug);
    const known = new Set(p.commands.map((c) => c.cmd));
    return { saved: p.commands.map((c) => ({ ...c })), suggested: commandSuggestions(p).filter((c) => !known.has(c.cmd)) };
  });
  route('PUT', `${PP}/commands`, (q, b, m) => {
    const p = proj(m.slug);
    p.commands = (Array.isArray(b.commands) ? b.commands : []).filter((c) => c && String(c.cmd || '').trim()).slice(0, 30)
      .map((c) => ({ label: String(c.label || c.cmd).trim().slice(0, 60), cmd: String(c.cmd).trim().slice(0, 500) }));
    return p.commands.map((c) => ({ ...c }));
  });
  route('POST', `${PP}/run`, (q, b, m) => {
    const p = proj(m.slug), cmd = String(b.cmd || '').trim();
    if (!cmd) err(L('Commande vide', 'Empty command'));
    const name = `helmshell-${p.slug}`;
    if (!S.shells.some((x) => x.name === name)) S.shells.push({ name, created: now(), attached: 0, path: projPath(p), command: 'zsh', slug: p.slug, kind: 'shell', agent: null, claude: false });
    const live = [...S.terms.values()].find((t) => t.name === name && t.alive);
    if (live) live.typeCommand(cmd); else (S.pending[name] = S.pending[name] || []).push(cmd);
    return { ok: true };
  });
  function commandSuggestions(p) {
    const out = [];
    const pkg = p.files.get('package.json');
    if (pkg) {
      try {
        const scripts = JSON.parse(pkg.content).scripts || {};
        if (!p.heavy.includes('node_modules')) out.push({ label: 'npm install', cmd: 'npm install' });
        for (const name of Object.keys(scripts).slice(0, 12)) out.push({ label: `npm run ${name}`, cmd: `npm run ${name}` });
      } catch (_) { /* invalid JSON */ }
    }
    const mk = p.files.get('Makefile');
    if (mk) for (const mm of mk.content.matchAll(/^([A-Za-z][\w-]*):(?!=)/gm)) out.push({ label: `make ${mm[1]}`, cmd: `make ${mm[1]}` });
    if (p.files.has('docker-compose.yml') || p.files.has('compose.yaml')) out.push({ label: 'docker compose up', cmd: 'docker compose up' });
    if (p.files.has('pyproject.toml')) out.push({ label: 'pytest', cmd: 'python3 -m pytest' });
    return out.slice(0, 20);
  }

  /* --- trash --- */
  route('GET', '/api/trash', () => S.trash.map(({ restore, restoreFiles, restoreProject, ...x }) => ({ ...x })));
  route('POST', '/api/trash/(?<id>[\\w-]+)/restore', (q, b, m) => {
    const it = S.trash.find((x) => x.id === m.id) || err(L('Élément introuvable', 'Item not found'), 404);
    if (it.project) {
      if (S.projects.has(it.slug)) err(L('Un projet porte déjà ce nom', 'A project already has this name'));
      S.projects.set(it.slug, it.restoreProject || makeProject({ slug: it.slug, name: it.meta.name, description: L('Ancien blog statique (archivé).', 'Old static blog (archived).'),
        tags: ['HTML', 'CSS'], platforms: ['Web'], mtime: it.deleted, size: it.size, files: { 'index.html': '<!doctype html>\n<title>Old blog</title>\n<h1>Old blog</h1>\n', 'style.css': 'body { font-family: serif; }\n' }, heavy: [] }));
    } else {
      const p = proj(it.slug);
      if (it.restoreFiles) for (const [path, f] of it.restoreFiles) { p.files.set(path, f); addChange(p, path, 'A', '', f.content || ''); }
      else { const content = (it.restore && it.restore.content) || ''; p.files.set(it.path, { content, size: bytes(content), mtime: now() }); addChange(p, it.path, 'A', '', content); }
    }
    S.trash = S.trash.filter((x) => x !== it);
    bump();
    return { path: it.path, slug: it.slug };
  });
  route('DELETE', '/api/trash/(?<id>[\\w-]+)', (q, b, m) => { S.trash = S.trash.filter((x) => x.id !== m.id); return { ok: true }; });
  route('DELETE', '/api/trash', () => { S.trash = []; log(L('Corbeille vidée', 'Trash emptied'), 'file'); return { ok: true }; });
  route('PUT', `${PP}/upload`, (q, b, m, raw) => {
    const p = proj(m.slug), path = (q.get('path') || '').replace(/^\/+/, '');
    if (!path) err(L('Chemin vide', 'Empty path'));
    p.files.set(path, { binary: true, size: raw && raw.size ? raw.size : 0, mtime: now() });
    addChange(p, path, 'A', '', '');
    return { ok: true };
  });

  /* --- git --- */
  const needGit = (p) => p.git || err(L('Ce dossier n’est pas un dépôt Git', 'This folder is not a Git repository'));
  route('GET', `${PP}/git`, (q, b, m) => gitInfo(proj(m.slug)));
  route('GET', `${PP}/git/diff`, (q, b, m) => {
    const p = proj(m.slug), g = needGit(p), path = q.get('path') || '';
    const c = g.changes.find((x) => x.path === path);
    return { diff: c ? changeDiff(p, c) : '' };
  });
  route('POST', `${PP}/git/commit`, (q, b, m) => {
    const p = proj(m.slug), g = needGit(p);
    const msg = String(b.message || '').trim() || err(L('Message de commit vide', 'Empty commit message'));
    const chosen = Array.isArray(b.paths) ? g.changes.filter((c) => b.paths.includes(c.path)) : g.changes.slice();
    if (!chosen.length) err(L('Rien à valider', 'Nothing to commit'));
    const hash = (Math.random().toString(16).slice(2) + D.hex(msg + now(), 40)).slice(0, 40);
    for (const c of g.log) c.refs = c.refs.replace(/^HEAD -> [^,]+(, )?/, '');
    const pushed = !!b.push && !!p.remote;
    const commit = { hash, short: hash.slice(0, 7), author: 'Alex Martin', email: 'alex@example.com', when: now(), refs: `HEAD -> ${g.branch}${pushed ? `, origin/${g.branch}` : ''}`,
      msg: msg.split('\n')[0], body: msg.split('\n').slice(1).join('\n').trim(), files: chosen.map((c) => [c.path, c.add, c.del]), diff: chosen.map((c) => changeDiff(p, c)).join('') };
    if (pushed) for (const c of g.log) c.refs = c.refs.split(', ').filter((r) => r && r !== `origin/${g.branch}` && r !== "origin/HEAD").join(', ');
    g.log.unshift(commit);
    g.changes = g.changes.filter((c) => !chosen.includes(c));
    const ins = chosen.reduce((a, c) => a + c.add, 0), dels = chosen.reduce((a, c) => a + c.del, 0);
    let out = `[${g.branch} ${commit.short}] ${commit.msg}\n ${chosen.length} file${chosen.length > 1 ? 's' : ''} changed, ${ins} insertion${ins === 1 ? '' : 's'}(+), ${dels} deletion${dels === 1 ? '' : 's'}(-)`;
    if (b.push) {
      if (p.remote) { const prev = g.log[1] ? g.log[1].short : '0000000'; out += `\nTo ${p.remote}\n   ${prev}..${commit.short}  ${g.branch} -> ${g.branch}`; g.ahead = 0; g.upstream = true; }
      else out += `\n${L('Pas de dépôt distant : rien à pousser.', 'No remote repository: nothing to push.')}`;
    } else g.ahead += 1;
    log(L(`Commit « ${commit.msg.slice(0, 60)} » sur ${p.slug}`, `Commit "${commit.msg.slice(0, 60)}" on ${p.slug}`), 'git', p.slug);
    return { output: out };
  });
  route('GET', `${PP}/git/branches`, (q, b, m) => {
    const p = proj(m.slug);
    if (!p.git) return { current: null, local: [], remote: [] };
    const names = new Set(p.git.local.map((x) => x.name));
    return { current: p.git.branch, local: p.git.local.map((x) => ({ ...x, current: x.name === p.git.branch })), remote: p.git.remote.filter((r) => !names.has(r.split('/').slice(1).join('/'))) };
  });
  route('POST', `${PP}/git/checkout`, (q, b, m) => {
    const p = proj(m.slug), g = needGit(p);
    let branch = String(b.branch || '').trim();
    if (!/^[A-Za-z0-9._/-]{1,120}$/.test(branch) || branch.includes('..')) err(L('Nom de branche invalide', 'Invalid branch name'));
    if (branch.startsWith('origin/') && !b.create) { branch = branch.slice(7); g.remote = g.remote.filter((r) => r !== `origin/${branch}`); }
    if (b.create || !g.local.some((x) => x.name === branch)) {
      if (b.create && g.local.some((x) => x.name === branch)) err(`fatal: a branch named '${branch}' already exists`);
      g.local.push({ name: branch, current: false, upstream: '', when: now() });
    }
    for (const c of g.log) c.refs = c.refs.replace(/^HEAD -> [^,]+(, )?/, '');
    if (g.log[0]) g.log[0].refs = `HEAD -> ${branch}${g.log[0].refs ? `, ${g.log[0].refs}` : ''}`;
    g.branch = branch; g.ahead = 0; g.behind = 0; g.upstream = !b.create;
    log(b.create ? L(`${p.slug} : branche ${branch} créée`, `${p.slug}: branch ${branch} created`) : L(`${p.slug} : branche ${branch}`, `${p.slug}: branch ${branch}`), 'git', p.slug);
    return { output: b.create ? `Switched to a new branch '${branch}'` : `Switched to branch '${branch}'` };
  });
  route('GET', `${PP}/git/log`, (q, b, m) => {
    const p = proj(m.slug);
    if (!p.git) return [];
    const skip = Number(q.get('skip') || 0), n = Math.max(1, Math.min(Number(q.get('n') || 30), 100));
    return p.git.log.slice(skip, skip + n).map((c) => ({ hash: c.hash, short: c.short, author: c.author, when: c.when, refs: c.refs, msg: c.msg }));
  });
  route('GET', `${PP}/git/show`, (q, b, m) => {
    const p = proj(m.slug), g = needGit(p), rev = q.get('rev') || '';
    if (!/^[0-9a-f]{4,40}$/.test(rev)) err(L('Commit invalide', 'Invalid commit'));
    const c = g.log.find((x) => x.hash.startsWith(rev)) || err(`fatal: bad object ${rev}`, 404);
    return commitShow(p, c);
  });
  route('POST', `${PP}/git/init`, (q, b, m) => {
    const p = proj(m.slug);
    if (!p.git) {
      p.git = { branch: 'main', ahead: 0, behind: 0, upstream: false, fetched: 0, changes: [...p.files.keys()].map((path) => ({ kind: 'A', path, add: lines(p.files.get(path).content || ''), del: 0 })),
        log: [], local: [{ name: 'main', current: true, upstream: '', when: now() }], remote: [] };
    }
    return { output: `Initialized empty Git repository in ${projPath(p)}/.git/` };
  });
  route('POST', `${PP}/git/fetch`, (q, b, m) => {
    const p = proj(m.slug);
    if (!p.git || !p.remote) return { ok: false, skipped: true };
    if (!b.force) return { ok: true, skipped: true };
    p.git.fetched = now();
    return { ok: true, output: '' };
  });
  route('POST', `${PP}/git/remote`, (q, b, m) => {
    const p = proj(m.slug), g = needGit(p);
    const url = String(b.url || '').trim();
    if (!/^(https?:\/\/[^\s/@]+(:\d+)?\/\S+|ssh:\/\/\S+|[\w.-]+@[\w.-]+:\S+)$/.test(url)) err(L('Adresse de dépôt invalide', 'Invalid repository address'));
    p.remote = url; g.upstream = false; g.fetched = now();
    log(L(`${p.slug} relié à ${url}`, `${p.slug} linked to ${url}`), 'git', p.slug);
    return { ...gitInfo(p), unrelated: false, tracking: false };
  });
  route('POST', `${PP}/git/pull`, (q, b, m) => {
    const p = proj(m.slug), g = needGit(p);
    if (!p.remote) err(L('Pas de dépôt distant', 'No remote repository'));
    if (!g.behind) return { output: 'Already up to date.' };
    const n = g.behind;
    const msgs = [['Add GET /customers/{id}', [['app/routers/invoices.py', 12, 0]]], ['Bump fastapi to 0.115.6', [['pyproject.toml', 1, 1]]], ['Docs: endpoints table', [['README.md', 8, 2]]]];
    for (let i = n - 1; i >= 0; i--) {
      const [msg, files] = msgs[i % msgs.length];
      const hash = D.hex(`pull-${p.slug}-${i}-${now()}`, 40);
      g.log.unshift({ hash, short: hash.slice(0, 7), author: 'Sam Rivera', email: 'sam@example.com', when: now() - 3600 * (i + 1), refs: '', msg, files });
    }
    for (const c of g.log) c.refs = c.refs.replace(/(^|, )HEAD -> [^,]+/, '').replace(/(^|, )origin\/[^,]+/, '').replace(/^, /, '');
    g.log[0].refs = `HEAD -> ${g.branch}, origin/${g.branch}`;
    g.behind = 0;
    log(L(`${p.slug} : ${n} commits récupérés`, `${p.slug}: ${n} commits pulled`), 'git', p.slug);
    return { output: `Updating ${g.log[n].short}..${g.log[0].short}\nFast-forward\n ${n} files changed` };
  });
  route('POST', `${PP}/git/suggest`, (q, b, m) => {
    const p = proj(m.slug), g = needGit(p);
    if (!g.changes.length) err(L('Rien à décrire : aucune modification', 'Nothing to describe: no changes'));
    if (p.slug === 'atlas-web') return { message: 'Paginate the projects page (20 per page)\n\n- getProjects() takes page/perPage and returns the page count\n- New <Pagination> component\n- Tests for skip/take and the 100 cap' };
    const first = g.changes[0].path;
    return { message: `Update ${first.split('/').pop()}${g.changes.length > 1 ? ` and ${g.changes.length - 1} more file${g.changes.length > 2 ? 's' : ''}` : ''}` };
  });

  /* --- branches in parallel (working copies) --- */
  function copyView(p, c) {
    const st = repoState(p, c.branch, 'claude'), cx = repoState(p, c.branch, 'codex');
    return { branch: c.branch, path: `${D.root}/.branches/${p.slug}/${c.branch.replace(/[^A-Za-z0-9_-]/g, '_')}`, changes: c.changes || 0, ahead: c.ahead || 0, behind: c.behind || 0,
      base: p.git ? p.git.branch : '', when: c.when || now(), subject: c.subject || '', session: st.exists, claude: st.claude, status: st.status || '', tmux: st.name,
      codex_session: cx.exists, codex: cx.alive, codex_tmux: cx.name };
  }
  route('GET', `${PP}/branches`, (q, b, m) => { const p = proj(m.slug); return p.copies.map((c) => copyView(p, c)); });
  route('POST', `${PP}/branches`, (q, b, m) => {
    const p = proj(m.slug), g = needGit(p), branch = String(b.branch || '').trim();
    if (!/^[A-Za-z0-9._/-]{1,120}$/.test(branch)) err(L('Nom de branche invalide', 'Invalid branch name'));
    if (branch === g.branch) err(L('C’est la branche du dossier principal', 'This is the branch of the main folder'));
    if (p.copies.some((c) => c.branch === branch)) err(L('Cette branche a déjà sa copie de travail', 'This branch already has a working copy'));
    const existing = g.local.some((x) => x.name === branch);
    if (!existing) g.local.push({ name: branch, current: false, upstream: '', when: now() });
    p.copies.push({ branch, changes: 0, ahead: 0, behind: 0, when: now(), subject: g.log[0] ? g.log[0].msg : '' });
    log(L(`${p.slug} : copie de travail de ${branch}`, `${p.slug}: working copy of ${branch}`), 'git', p.slug);
    return { branch, path: copyView(p, p.copies[p.copies.length - 1]).path, existing };
  });
  route('POST', `${PP}/branches/merge`, (q, b, m) => {
    const p = proj(m.slug), g = needGit(p);
    const c = p.copies.find((x) => x.branch === b.branch) || err(L('Copie de travail introuvable', 'Working copy not found'), 404);
    if (!c.ahead) return { output: 'Already up to date.', into: g.branch };
    const hash = D.hex(`merge-${c.branch}-${now()}`, 40);
    for (const x of g.log) x.refs = x.refs.replace(/^HEAD -> [^,]+(, )?/, '');
    g.log.unshift({ hash, short: hash.slice(0, 7), author: 'Alex Martin', email: 'alex@example.com', when: now(), refs: `HEAD -> ${g.branch}`, msg: `Merge branch '${c.branch}'`, files: [[[...p.files.keys()][1] || 'README.md', 4, 1]] });
    g.ahead += c.ahead; c.ahead = 0;
    log(L(`${p.slug} : ${c.branch} fusionnée dans ${g.branch}`, `${p.slug}: ${c.branch} merged into ${g.branch}`), 'git', p.slug);
    return { output: `Merge made by the 'ort' strategy.`, into: g.branch };
  });
  route('POST', `${PP}/branches/remove`, (q, b, m) => {
    const p = proj(m.slug), g = needGit(p);
    const c = p.copies.find((x) => x.branch === b.branch) || err(L('Copie de travail introuvable', 'Working copy not found'), 404);
    if (c.changes && !b.force) err(L('Des fichiers ne sont pas validés dans cette copie', 'Some files are not committed in this copy'));
    p.copies = p.copies.filter((x) => x !== c);
    if (b.delete_branch) g.local = g.local.filter((x) => x.name !== c.branch);
    bump();
    return { deleted_branch: !!b.delete_branch, note: '' };
  });

  /* --- agents and Claude sessions --- */
  route('GET', '/api/agents', () => agentsInfo());
  route('GET', '/api/sessions', () => listSessions());
  route('GET', '/api/repo-sessions', (q) => listRepoSessions(q.get('preview') === '1', q.get('agent') || null));
  route('GET', `${PP}/agents/history`, (q, b, m) => {
    const p = proj(m.slug), agent = q.get('agent') === 'codex' ? 'codex' : 'claude';
    const limit = Math.min(Number(q.get('limit') || 8), 60);
    return p.history[agent].slice(0, limit).map((h) => ({ ...h, agent }));
  });
  route('GET', `${PP}/agents/history/(?<sid>[\\w-]+)`, (q, b, m) => {
    const p = proj(m.slug), agent = q.get('agent') === 'codex' ? 'codex' : 'claude';
    const h = p.history[agent].find((x) => x.id === m.sid) || err(L('Session introuvable', 'Session not found'), 404);
    return transcriptOf(p, h, agent);
  });
  route('GET', '/api/claude/usage', () => usage());
  route('GET', '/api/codex/usage', () => codexUsage());
  route('GET', '/api/claude/history', (q) => {
    const limit = Math.min(Number(q.get('limit') || 20), 60);
    const out = [];
    const only = q.get('agent');
    for (const p of S.projects.values()) {
      for (const agent of ['claude', 'codex']) {
        if (only && only !== agent) continue;
        for (const h of p.history[agent]) if (h.prompts) out.push({ ...h, agent, slug: p.slug, project: p.name, icon: p.icon });
      }
    }
    return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
  });
  route('GET', `${PP}/claude/history`, (q, b, m) => proj(m.slug).history.claude.slice(0, 8));
  route('GET', `${PP}/claude/history/(?<sid>[\\w-]+)`, (q, b, m) => {
    const p = proj(m.slug);
    const h = p.history.claude.find((x) => x.id === m.sid) || err(L('Session introuvable', 'Session not found'), 404);
    const tr = transcriptOf(p, h, 'claude');
    delete tr.agent;
    return tr;
  });
  const agentQ = (q) => (q.get('agent') === 'codex' ? 'codex' : 'claude');
  route('GET', `${PP}/claude/repo`, (q, b, m) => repoState(proj(m.slug), q.get('branch') || null, agentQ(q)));
  route('POST', `${PP}/claude/repo/open`, (q, b, m) => {
    const p = proj(m.slug), agent = agentQ(q), branch = q.get('branch') || null;
    const cur = repoSession(p, agent, branch);
    if (cur && cur.alive) err(branch ? L(`${agent === 'codex' ? 'Codex' : 'Claude'} est déjà ouvert sur la branche ${branch}`, `${agent === 'codex' ? 'Codex' : 'Claude'} is already open on branch ${branch}`)
      : L(`${agent === 'codex' ? 'Codex' : 'Claude'} est déjà ouvert dans ce projet`, `${agent === 'codex' ? 'Codex' : 'Claude'} is already open in this project`));
    setRepoSession(p, agent, branch, { alive: true, status: 'idle', rc: agent === 'claude' && !!b.rc, created: cur ? cur.created : now(), since: now(), fresh: true,
      context: agent === 'claude' ? { used: 3.1, size: 200000, tokens: 6200 } : null, mode: b.mode || '' });
    log(L(`Session tmux « ${repoName(p.slug, agent, branch)} » ouverte (${p.name})`, `tmux session "${repoName(p.slug, agent, branch)}" opened (${p.name})`), 'claude', p.slug);
    return repoState(p, branch, agent);
  });
  route('POST', `${PP}/claude/repo/resume`, (q, b, m) => {
    const p = proj(m.slug), agent = agentQ(q);
    const h = p.history[agent].find((x) => x.id === b.id) || err(L('Conversation introuvable pour ce projet', 'Conversation not found for this project'));
    const cur = repoSession(p, agent, null);
    if (cur && cur.alive) err(agent === 'codex' ? L('Codex tourne déjà dans ce projet : ferme-le avant de reprendre une conversation', 'Codex is already running in this project: close it before resuming a conversation')
      : L('Claude tourne déjà dans ce projet : ferme-le (/exit) avant de reprendre une conversation', 'Claude is already running in this project: close it (/exit) before resuming a conversation'), 409);
    setRepoSession(p, agent, null, { alive: true, status: 'idle', rc: false, created: cur ? cur.created : now(), since: now(), resumed: h.title,
      context: agent === 'claude' ? { used: 24, size: 200000, tokens: 48000 } : null });
    log(L(`Conversation reprise dans tmux « ${repoName(p.slug, agent)} » (${p.name})`, `Conversation resumed in tmux "${repoName(p.slug, agent)}" (${p.name})`), 'claude', p.slug);
    return repoState(p, null, agent);
  });
  route('POST', `${PP}/claude/repo/(?<act>rc|restart|kill)`, (q, b, m) => {
    const p = proj(m.slug), agent = agentQ(q), branch = q.get('branch') || null;
    let r = repoSession(p, agent, branch);
    if (m.act === 'rc') {
      if (agent !== 'claude') err(L('Remote Control n\'existe que pour Claude Code', 'Remote Control only exists for Claude Code'));
      if (!r) { r = { alive: true, status: 'idle', created: now(), since: now(), context: { used: 3.1, size: 200000, tokens: 6200 } }; setRepoSession(p, agent, branch, r); }
      r.alive = true; r.rc = true;
      pushToLive(repoName(p.slug, agent, branch), `\r\n\x1b[38;5;209m⏺\x1b[0m /remote-control\r\n  ⎿  Remote Control active · https://claude.ai/code/session_01${D.hex(`rc-${p.slug}`, 22)}\r\n`);
    } else if (m.act === 'restart') {
      if (!r) { r = { created: now() }; setRepoSession(p, agent, branch, r); }
      Object.assign(r, { alive: true, status: 'idle', since: now(), context: agent === 'claude' ? { used: 3.1, size: 200000, tokens: 6200 } : null });
    } else {
      if (r) log(L(`Session tmux « ${repoName(p.slug, agent, branch)} » fermée (${p.name})`, `tmux session "${repoName(p.slug, agent, branch)}" closed (${p.name})`), 'stop', p.slug);
      setRepoSession(p, agent, branch, null);
      for (const t of S.terms.values()) if (t.name === repoName(p.slug, agent, branch)) t.exit();
    }
    bump();
    return repoState(p, branch, agent);
  });
  route('POST', `${PP}/claude/repo/send`, (q, b, m) => {
    const p = proj(m.slug), agent = agentQ(q), branch = q.get('branch') || null;
    const r = repoSession(p, agent, branch) || err(L('Aucune session ouverte pour ce projet', 'No session open for this project'), 404);
    const name = repoName(p.slug, agent, branch);
    if (b.text) {
      const text = String(b.text);
      if (text.length > 2000) err(L('Message trop long (2000 caractères au plus)', 'Message too long (2000 characters max)'));
      r.lastSent = text;
      if (r.alive) { r.status = 'busy'; r.since = now(); setTimeout(() => { r.status = 'idle'; r.since = now(); bump(); }, 9000); }
      const live = [...S.terms.values()].filter((t) => t.name === name && t.alive);
      for (const t of live) t.submit(text);
    }
    if (b.key && !['Enter', 'C-c', 'Escape', 'Up', 'Down', 'Tab'].includes(b.key)) err(L('Touche non autorisée', 'Key not allowed'));
    if (b.key === 'C-c' || b.key === 'Escape') { if (r.status === 'busy') { r.status = 'idle'; r.since = now(); } pushToLive(name, b.key === 'C-c' ? '^C' : ''); }
    bump();
    return repoState(p, branch, agent);
  });
  route('GET', `${PP}/claude`, (q, b, m) => {
    const p = proj(m.slug);
    if (!p.headless) return { running: false };
    return { ...headlessLight(p), output: headlessOutput(p).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '') };
  });
  route('POST', `${PP}/claude/start`, (q, b, m) => {
    const p = proj(m.slug);
    if (p.headless) err(L('Une session tourne déjà pour ce projet', 'A session is already running for this project'));
    p.headless = { phase: 'starting', question: '', started: now(), mode: b.mode || S.settings.default_mode, spawn: b.spawn || 'same-dir', running: true, exit_code: null,
      url: `https://claude.ai/code/session_01${D.hex(`hl-${p.slug}-${now()}`, 22)}` };
    setTimeout(() => { if (p.headless && p.headless.phase === 'starting') { p.headless.phase = 'ready'; bump(); } }, 6000);
    log(L(`Session Claude démarrée sur ${p.name} (mode ${modeName('claude', p.headless.mode)})`, `Claude session started on ${p.name} (mode ${modeName('claude', p.headless.mode)})`), 'claude', p.slug);
    return headlessLight(p);
  });
  route('POST', `${PP}/claude/stop`, (q, b, m) => {
    const p = proj(m.slug);
    if (p.headless) log(L(`Session Claude arrêtée (${p.name})`, `Claude session stopped (${p.name})`), 'stop', p.slug);
    p.headless = null;
    for (const t of S.terms.values()) if (t.name === `claude-${p.slug}`) t.exit();
    bump();
    return { ok: true };
  });
  route('POST', `${PP}/claude/send`, (q, b, m) => {
    const p = proj(m.slug);
    if (b.text != null) {
      if (!['y', 'n'].includes(b.text) || typeof b.question !== 'string') err(L('Réponse attendue : Oui ou Non, à une question précise', 'Expected answer: Yes or No, to a specific question'));
      if (!p.headless || p.headless.phase !== 'question' || p.headless.question !== b.question) err(L('Cette question n\'attend plus de réponse', 'This question is no longer waiting for an answer'), 409);
      p.headless.phase = 'running';
      p.headless.answer = b.text;
      pushToLive(`claude-${p.slug}`, `${b.text}\r\n${b.text === 'y' ? '\x1b[32m✓\x1b[0m Running…\r\n  INFO  [alembic.runtime.migration] Running upgrade 0006 -> 0007, refunds\r\n' : '\x1b[33mSkipped.\x1b[0m\r\n'}`);
      log(b.text === 'y' ? L('Réponse « Oui » envoyée à Claude', 'Answer "Yes" sent to Claude') : L('Réponse « Non » envoyée à Claude', 'Answer "No" sent to Claude'), 'claude', p.slug);
    }
    bump();
    return headlessLight(p);
  });

  /* --- background tasks --- */
  route('GET', '/api/tasks', (q) => taskList(q.get('project') || null, Number(q.get('limit') || 20)));
  route('POST', `${PP}/tasks`, (q, b, m) => {
    const p = proj(m.slug);
    const prompt = String(b.prompt || '').trim() || err(L('Écris la consigne de la tâche', 'Write the task instructions'));
    const agent = b.agent === 'codex' ? 'codex' : 'claude';
    return newTask(p, prompt, b.mode || (agent === 'codex' ? S.settings.codex_default_mode : S.settings.default_mode), b.kind || '', agent);
  });
  route('GET', '/api/tasks/(?<id>[\\w-]+)', (q, b, m) => taskState(S.tasks.find((x) => x.id === m.id) || err(L('Tâche inconnue', 'Unknown task'), 404), true));
  route('POST', '/api/tasks/(?<id>[\\w-]+)/retry', (q, b, m) => {
    const tk = S.tasks.find((x) => x.id === m.id) || err(L('Tâche inconnue', 'Unknown task'), 404);
    return newTask(proj(tk.slug), tk.prompt, tk.mode, tk.kind, tk.agent);
  });
  route('DELETE', '/api/tasks', (q) => {
    if (q.get('done') !== '1') err(L('Précise ?done=1', 'Add ?done=1'));
    const before = S.tasks.length;
    S.tasks = S.tasks.filter((x) => x.status === 'running');
    bump();
    return { deleted: before - S.tasks.length };
  });
  route('POST', '/api/tasks/(?<id>[\\w-]+)/stop', (q, b, m) => {
    const tk = S.tasks.find((x) => x.id === m.id) || err(L('Tâche inconnue', 'Unknown task'), 404);
    if (tk.status === 'running') { tk.status = 'error'; tk.finished = now(); tk.later = []; tk.result = { error: true, turns: tk.events.length, duration: now() - tk.started, text: L('Tâche arrêtée.', 'Task stopped.') }; }
    bump();
    return { ok: true };
  });
  route('DELETE', '/api/tasks/(?<id>[\\w-]+)', (q, b, m) => {
    const tk = S.tasks.find((x) => x.id === m.id) || err(L('Tâche inconnue', 'Unknown task'), 404);
    if (tk.status === 'running') err(L('Arrête la tâche avant de la supprimer', 'Stop the task before deleting it'));
    S.tasks = S.tasks.filter((x) => x !== tk);
    bump();
    return { ok: true };
  });
  route('GET', '/api/metrics', (q) => metrics(Number(q.get('hours') || 24)));

  /* --- terminals --- */
  route('POST', '/api/term', (q, b) => openTerm(b));
  route('GET', '/api/terminals', () => terminalsList());
  route('DELETE', '/api/terminals/(?<name>[\\w.@-]+)', (q, b, m) => {
    const name = m.name;
    const it = terminalsList().find((x) => x.name === name) || err(L('Session inconnue', 'Unknown session'), 404);
    if (it.kind === 'repo') { const p = proj(it.slug); setRepoSession(p, it.agent, null, null); for (const c of p.copies) if (c.repo) delete c.repo[it.agent]; }
    else if (it.kind === 'remote') proj(it.slug).headless = null;
    else S.shells = S.shells.filter((x) => x.name !== name);
    for (const t of S.terms.values()) if (t.name === name) t.exit();
    bump();
    return { ok: true };
  });
  route('POST', '/api/term/(?<id>[\\w-]+)/input', (q, b, m) => { const t = S.terms.get(m.id) || err(L('Terminal fermé', 'Terminal closed'), 404); t.input(String(b.data || '')); return { ok: true }; });
  route('POST', '/api/term/(?<id>[\\w-]+)/resize', (q, b, m) => { const t = S.terms.get(m.id); if (t) { t.cols = Number(b.cols) || t.cols; t.rows = Number(b.rows) || t.rows; } return { ok: true }; });
  route('DELETE', '/api/term/(?<id>[\\w-]+)', (q, b, m) => { const t = S.terms.get(m.id); if (t) t.dispose(); return { ok: true }; });

  /* --- deployment (Coolify) --- */
  const needDeploy = () => { if (S.settings.deploy_provider !== 'coolify') err(L('Aucun outil de déploiement n\'est configuré (Paramètres › Déploiement)', 'No deployment tool is configured (Settings › Deployment)'), 404); };
  route('GET', '/api/deploy/apps', () => {
    needDeploy();
    const links = {};
    for (const p of S.projects.values()) if (p.app_id) links[p.app_id] = p.slug;
    return S.apps.map((a) => ({ ...appView(a), project: links[a.uuid] || null }));
  });
  route('GET', '/api/deploy/apps/(?<uuid>[\\w-]+)/deployments', (q, b, m) => { needDeploy(); return appByUuid(m.uuid).deployments.slice(0, 10).map(depView); });
  route('POST', '/api/deploy/deploy', (q, b) => {
    needDeploy();
    const a = appByUuid(b.uuid);
    log(L(`Déploiement de ${a.name} lancé sur Coolify`, `Deployment of ${a.name} started on Coolify`), 'deploy');
    return { deployments: [startDeployment(a, { force: !!b.force })] };
  });
  route('DELETE', '/api/deploy/apps/(?<uuid>[\\w-]+)', (q, b, m) => {
    needDeploy();
    const a = appByUuid(m.uuid);
    if (b.confirm !== a.uuid) err(L('Confirmation manquante', 'Missing confirmation'));
    S.apps = S.apps.filter((x) => x !== a);
    for (const p of S.projects.values()) if (p.app_id === a.uuid) p.app_id = '';
    log(L(`Application ${a.name} supprimée de Coolify`, `Application ${a.name} deleted from Coolify`), 'stop');
    return { message: 'Application deletion request queued.' };
  });
  route('POST', '/api/deploy/apps/(?<uuid>[\\w-]+)/(?<act>start|stop|restart)', (q, b, m) => {
    needDeploy();
    const a = appByUuid(m.uuid);
    if (m.act === 'stop') { a.status = 'exited:unhealthy'; log(L(`Application ${a.name} arrêtée sur Coolify`, `Application ${a.name} stopped on Coolify`), 'stop'); }
    else {
      a.status = 'starting:unknown';
      a.deployments.unshift({ uuid: D.hex(`st-${a.key}-${now()}`, 24), status: 'in_progress', commit: '', message: '', created: new Date().toISOString(), finished: null, restart: true });
      setTimeout(() => { a.status = 'running:healthy'; a.deployments[0].status = 'finished'; a.deployments[0].finished = new Date().toISOString(); bump(); }, 6000);
      log(m.act === 'start' ? L(`Application ${a.name} démarrée sur Coolify`, `Application ${a.name} started on Coolify`) : L(`Application ${a.name} redémarrée sur Coolify`, `Application ${a.name} restarted on Coolify`), 'deploy');
    }
    return { message: `${m.act} request queued.` };
  });
  route('GET', '/api/deploy/deployments', () => {
    needDeploy();
    const out = [];
    for (const a of S.apps) for (const d of a.deployments) if (d.status === 'in_progress' || d.status === 'queued') out.push({ uuid: d.uuid, app: a.name, app_uuid: a.uuid, status: d.status, created: d.created });
    return out;
  });
  route('POST', '/api/deploy/apps/(?<uuid>[\\w-]+)/domains', (q, b, m) => {
    needDeploy();
    const a = appByUuid(m.uuid);
    a.fqdn = String(b.domains || '').trim();
    log(L(`Domaine mis à jour : ${a.fqdn}`, `Domain updated: ${a.fqdn}`), 'domain');
    if (b.redeploy) startDeployment(a);
    return { ok: true };
  });
  route('GET', '/api/deploy/apps/(?<uuid>[\\w-]+)/logs', (q, b, m) => { needDeploy(); return { logs: appLogs(appByUuid(m.uuid), Number(q.get('lines') || 200)) }; });
  route('GET', '/api/deploy/apps/(?<uuid>[\\w-]+)/envs', (q, b, m) => { needDeploy(); return appByUuid(m.uuid).envs.slice().sort((x, y) => x.key.localeCompare(y.key)); });
  route('POST', '/api/deploy/apps/(?<uuid>[\\w-]+)/envs', (q, b, m) => {
    needDeploy();
    const a = appByUuid(m.uuid), key = String(b.key || '').trim();
    if (!key || !/^\w+$/.test(key)) err(L('Nom de variable invalide (lettres, chiffres et _)', 'Invalid variable name (letters, digits and _)'));
    const e = a.envs.find((x) => x.key === key);
    if (e) e.value = String(b.value || '');
    else a.envs.push({ uuid: D.hex(`env-${key}-${now()}`, 24), key, value: String(b.value || ''), build: false, literal: false, multiline: false });
    log(e ? L(`Variable ${key} modifiée dans Coolify`, `Variable ${key} changed in Coolify`) : L(`Variable ${key} ajoutée dans Coolify`, `Variable ${key} added in Coolify`), 'deploy');
    return { ok: true };
  });
  route('DELETE', '/api/deploy/apps/(?<uuid>[\\w-]+)/envs/(?<env>[\\w-]+)', (q, b, m) => {
    needDeploy();
    const a = appByUuid(m.uuid);
    a.envs = a.envs.filter((x) => x.uuid !== m.env);
    log(L('Variable supprimée dans Coolify', 'Variable deleted in Coolify'), 'deploy');
    return { ok: true };
  });
  route('GET', '/api/deploy/apps/(?<uuid>[\\w-]+)/rollback', (q, b, m) => {
    needDeploy();
    const a = appByUuid(m.uuid);
    const seen = new Set();
    const imgs = [];
    for (const d of a.deployments) {
      if (d.status !== 'finished' || !d.commit || seen.has(d.commit)) continue;
      seen.add(d.commit);
      imgs.push({ tag: d.commit + D.hex(`full-${d.commit}`, 33), created_at: d.created, is_current: !imgs.length });
    }
    return { images: imgs, current_tag: imgs[0] ? imgs[0].tag : '' };
  });
  route('POST', '/api/deploy/apps/(?<uuid>[\\w-]+)/rollback', (q, b, m) => {
    needDeploy();
    const a = appByUuid(m.uuid), commit = String(b.commit || '');
    if (!commit || !/^[\w.-]+$/.test(commit)) err(L('Version invalide', 'Invalid version'));
    log(L(`Retour à la version ${commit.slice(0, 12)} demandé sur Coolify`, `Rollback to version ${commit.slice(0, 12)} requested on Coolify`), 'deploy');
    return startDeployment(a, { rollback: true, commit: commit.slice(0, 7) });
  });
  route('GET', '/api/deploy/resources', () => {
    needDeploy();
    return [...S.apps.map((a) => ({ uuid: a.uuid, name: a.name, type: 'application', status: a.status, updated: a.updated })),
      { uuid: D.hex('res-pg', 24), name: 'postgres-main', type: 'standalone-postgresql', status: 'running:healthy', updated: D.iso(60 * 24 * 3) },
      { uuid: D.hex('res-redis', 24), name: 'redis-cache', type: 'standalone-redis', status: 'running:healthy', updated: D.iso(60 * 24 * 3) },
      { uuid: D.hex('res-grafana', 24), name: 'grafana', type: 'service', status: 'running:healthy', updated: D.iso(60 * 24 * 6) },
      { uuid: D.hex('res-umami', 24), name: 'umami', type: 'service', status: 'running:unhealthy', updated: D.iso(60 * 5) }];
  });
  route('GET', '/api/deploy/meta', (q) => {
    if ((q.get('provider') || S.settings.deploy_provider) !== 'coolify') err(UNAVAILABLE, 502);
    return { projects: [{ uuid: D.hex('cp-homelab', 24), name: 'Homelab' }, { uuid: D.hex('cp-side', 24), name: 'Side projects' }],
      servers: [{ uuid: D.hex('cs-local', 24), name: 'localhost', ip: '192.168.1.10' }] };
  });

  /* --- notifications, forges, 2FA, settings --- */
  route('POST', '/api/notify/test', () => err(L('Indisponible dans la démo : aucune notification n’est envoyée.', 'Not available in the demo: no notification is sent.'), 400));
  route('GET', '/api/forges', () => S.forges.map((f) => ({ ...f })));
  route('POST', '/api/forges', () => err(L('Indisponible dans la démo : aucun jeton n’est vérifié ni enregistré.', 'Not available in the demo: no token is checked or saved.')));
  route('DELETE', '/api/forges/(?<id>[0-9a-f]{8})', (q, b, m) => { S.forges = S.forges.filter((f) => f.id !== m.id); return { ok: true }; });
  route('GET', '/api/forges/(?<id>[0-9a-f]{8})/repos', (q, b, m) => {
    const f = S.forges.find((x) => x.id === m.id) || err(L('Compte introuvable', 'Account not found'), 404);
    const mine = [...S.projects.values()].filter((p) => p.remote).map((p, i) => ({ name: p.remote.split('/').pop().replace(/\.git$/, ''), full_name: `alex/${p.remote.split('/').pop().replace(/\.git$/, '')}`,
      description: p.description, private: i % 2 === 0, clone_url: `${f.url}/alex/${p.remote.split('/').pop()}`, ssh_url: `git@${f.url.replace(/^https?:\/\//, '')}:alex/${p.remote.split('/').pop()}`,
      web_url: `${f.url}/alex/${p.remote.split('/').pop().replace(/\.git$/, '')}`, updated: new Date(lastActivity(p) * 1000).toISOString(), fork: false, archived: false,
      language: p.tags.find((x) => ['TypeScript', 'Python', 'Go', 'Dart', 'Shell'].includes(x)) || '' }));
    const extra = [['dotfiles', L('Mes fichiers de configuration (zsh, tmux, nvim)', 'My dotfiles (zsh, tmux, nvim)'), 'Shell', 60 * 24 * 9, false, false],
      ['recipes', L('Recettes de cuisine en Markdown', 'Cooking recipes in Markdown'), '', 60 * 24 * 40, true, false],
      ['infra-terraform', L('Ancienne infra (remplacée par Coolify)', 'Old infrastructure (replaced by Coolify)'), 'HCL', 60 * 24 * 200, true, true],
      ['ha-config', L('Configuration Home Assistant', 'Home Assistant configuration'), 'YAML', 60 * 24 * 3, true, false]]
      .map(([name, description, language, m2, priv, archived]) => ({ name, full_name: `alex/${name}`, description, private: priv, clone_url: `${f.url}/alex/${name}.git`,
        ssh_url: `git@${f.url.replace(/^https?:\/\//, '')}:alex/${name}.git`, web_url: `${f.url}/alex/${name}`, updated: D.iso(m2), fork: false, archived, language }));
    return f.kind === 'gitlab' ? extra.slice(1).map(({ language, ...x }) => x) : [...mine, ...extra].sort((a, b2) => b2.updated.localeCompare(a.updated));
  });
  route('GET', '/api/2fa', () => ({ ...S.totp }));
  route('POST', '/api/2fa/setup', () => {
    if (S.totp.enabled) err(L('La double authentification est déjà active', 'Two-factor authentication is already enabled'));
    return { secret: 'JBSWY3DPEHPK3PXPDEMO2FAK', uri: 'otpauth://totp/Helmshell:alex?secret=JBSWY3DPEHPK3PXPDEMO2FAK&issuer=Helmshell%20demo' };
  });
  const codes = () => Array.from({ length: 8 }, () => `${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 6)}`);
  route('POST', '/api/2fa/enable', (q, b) => {
    if (!/^\d{6}$/.test(String(b.code || '').replace(/\s/g, ''))) err(L('Code incorrect', 'Incorrect code'), 403);
    const c = codes();
    S.totp = { enabled: true, recovery_left: c.length };
    return { recovery: c };
  });
  route('POST', '/api/2fa/recovery', (q, b) => {
    if (!/^\d{6}$/.test(String(b.code || '').replace(/\s/g, ''))) err(L('Code incorrect ou déjà utilisé', 'Incorrect or already used code'), 403);
    const c = codes();
    S.totp.recovery_left = c.length;
    return { recovery: c };
  });
  route('POST', '/api/2fa/disable', () => err(UNAVAILABLE, 403));
  route('GET', '/api/activity', (q) => {
    const pr = q.get('project');
    return S.activity.filter((a) => !pr || a.project === pr).slice(0, Number(q.get('limit') || 30));
  });
  route('GET', '/api/access/whoami', () => ({ direct: '192.168.1.23', forwarded_for: '', real_ip: '', host: 'homelab:8787', proto: '', ip: '192.168.1.23',
    rule: L('Réseau local', 'Local network'), via_proxy: false, source: 'settings' }));
  const SETTING_KEYS = ['projects_root', 'coolify_url', 'coolify_public_url', 'coolify_project_uuid', 'coolify_server_uuid', 'coolify_environment', 'domain_suffix', 'default_mode', 'claude_bin',
    'dokploy_url', 'dokploy_public_url', 'dokploy_project_id', 'dokploy_environment_id', 'dokploy_server_id', 'ntfy_url', 'public_url', 'notify_service', 'gotify_url',
    'default_agent', 'codex_bin', 'codex_default_mode', 'language'];
  function oidcStatus() {
    const s = S.settings, configured = !!(s.oidc_issuer && s.oidc_client_id);
    return { configured, enabled: !!s.oidc_enabled, tested: !!s.oidc_tested, only: !!s.oidc_enabled, env_disabled: false, label: s.oidc_label || 'OIDC' };
  }
  route('GET', '/api/settings', () => {
    const s = S.settings;
    const out = {};
    for (const k of SETTING_KEYS) out[k] = s[k];
    Object.assign(out, { coolify_token_set: true, dokploy_token_set: false, deploy_provider: s.deploy_provider, ntfy_token_set: false, gotify_token_set: !!s.gotify_token,
      discord_webhook_set: !!s.discord_webhook, notify_service: s.notify_service || 'off', password_from_env: false, totp: { ...S.totp }, notify_done: s.notify_done !== false,
      usage_every: s.usage_every, modes: ['acceptEdits', 'auto', 'default', 'dontAsk', 'plan'], codex_default_mode: s.codex_default_mode, codex_modes: ['read-only', 'auto', 'full-access'],
      language: LANG, update_check: s.update_check !== false, agents: agentsInfo(), access: clone(s.access) });
    for (const k of ['oidc_issuer', 'oidc_client_id', 'oidc_allowed_emails', 'oidc_group', 'oidc_label']) out[k] = s[k] || '';
    out.oidc_client_secret_set = !!s.oidc_client_secret;
    out.oidc = oidcStatus();
    out.oidc_redirect = `${(s.public_url || 'https://helmshell.example.com').replace(/\/+$/, '')}/auth/oidc/callback`;
    out.access_info = { env: [], reset: false, lan: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'], vpn_default: ['100.64.0.0/10'] };
    return out;
  });
  route('PUT', '/api/settings', (q, b) => {
    const s = S.settings;
    if (b.new_password) err(L('Indisponible dans la démo : le mot de passe ne peut pas être changé.', 'Not available in the demo: the password cannot be changed.'), 403);
    if (b.default_mode && !MODES_CLAUDE.some((x) => x[0] === b.default_mode)) err(L('Mode inconnu', 'Unknown mode'));
    if (b.language && !['en', 'fr'].includes(b.language)) err(L('Langue inconnue', 'Unknown language'));
    for (const k of ['coolify_url', 'dokploy_url', 'coolify_public_url', 'dokploy_public_url']) if (b[k] && !/^https?:\/\/\S+$/.test(b[k])) err(L('Adresse attendue sous la forme http(s)://…', 'Address expected as http(s)://…'));
    if (b.oidc_enabled && !s.oidc_tested) err(L('Teste d\'abord la connexion OIDC : tant qu\'elle n\'a pas réussi, le mot de passe reste actif', 'Test the OIDC sign-in first: until it succeeds, the password stays active'));
    for (const k of SETTING_KEYS) if (k in b) s[k] = String(b[k]).trim();
    for (const k of ['notify_done', 'update_check', 'oidc_enabled']) if (k in b) s[k] = !!b[k];
    if ('usage_every' in b) s.usage_every = Number(b.usage_every);
    if ('deploy_provider' in b) s.deploy_provider = ['', 'coolify', 'dokploy'].includes(b.deploy_provider) ? b.deploy_provider : s.deploy_provider;
    for (const k of ['oidc_issuer', 'oidc_client_id', 'oidc_allowed_emails', 'oidc_group', 'oidc_label', 'oidc_client_secret', 'gotify_token', 'discord_webhook']) if (b[k]) s[k] = String(b[k]).trim();
    if (b.access) s.access = { lan: !!b.access.lan, vpn: !!b.access.vpn, vpn_cidrs: b.access.vpn_cidrs || [], domain: !!b.access.domain, domains: b.access.domains || [],
      trusted_proxies: b.access.trusted_proxies || [], ips: b.access.ips || [] };
    if (b.language) store.set('helmshell.lang', b.language);
    bump();
    return { ok: true };
  });

  /* --- project creation --- */
  function uniqueSlug(base) { let s = base, n = 2; while (S.projects.has(s)) s = `${base}-${n++}`; return s; }
  const TEMPLATES = {
    node: { 'package.json': (sl) => `{\n  "name": "${sl}",\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": {\n    "start": "node index.js"\n  }\n}\n`,
      'index.js': (sl, n) => `import http from 'node:http';\n\nconst port = process.env.PORT || 3000;\nhttp.createServer((req, res) => {\n  res.end('${L('Bonjour depuis', 'Hello from')} ${n}');\n}).listen(port, () => console.log(\`${L('Écoute sur', 'Listening on')} \${port}\`));\n`, '.gitignore': () => 'node_modules/\n.env\n' },
    python: { 'main.py': (sl, n) => `def main():\n    print("${L('Bonjour depuis', 'Hello from')} ${n}")\n\n\nif __name__ == "__main__":\n    main()\n`, 'requirements.txt': () => '', '.gitignore': () => '__pycache__/\n.venv/\n.env\n' },
    android: { '.gitignore': () => '*.iml\n.gradle/\nlocal.properties\n.idea/\nbuild/\n', 'README.md': (sl, n) => `# ${n}\n\n${L('Application Android (Kotlin). Demande à Claude de générer le squelette Gradle.', 'Android app (Kotlin). Ask Claude to generate the Gradle skeleton.')}\n` },
    static: { 'index.html': (sl, n) => `<!doctype html>\n<html lang="${LANG}">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>${n}</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>${n}</h1>\n</body>\n</html>\n`, 'style.css': () => 'body {\n  font-family: system-ui, sans-serif;\n  margin: 2rem;\n}\n' },
  };
  function createProject(b) {
    const name = String(b.name || '').trim() || err(L('Donne un nom au projet', 'Give the project a name'));
    const slug = uniqueSlug(slugify(name));
    const o = b.opts || {};
    const desc = String(b.description || '').trim();
    const files = {};
    const steps = [{ label: L('Dossier créé', 'Folder created'), ok: true, detail: `${D.root}/${slug}` }];
    let remote = '';
    if (b.source === 'git') {
      const repo = String(b.repo || '').trim() || err(L('Indique l’adresse du dépôt', 'Enter the repository address'));
      remote = repo;
      files['README.md'] = `# ${name}\n\n${desc || L('Dépôt cloné dans la démo.', 'Repository cloned in the demo.')}\n`;
      steps.push({ label: L('Dépôt cloné', 'Repository cloned'), ok: true, detail: `git clone ${repo} .` });
    } else {
      if (b.source === 'modele' && TEMPLATES[b.template]) {
        for (const [f, fn] of Object.entries(TEMPLATES[b.template])) files[f] = fn(slug, name);
        steps.push({ label: L(`Modèle ${b.template} copié`, `Template ${b.template} copied`), ok: true, detail: Object.keys(files).join(', ') });
      }
      const ctx = (agent) => `# ${name}\n\n${desc || L('(décris le projet ici)', '(describe the project here)')}\n\n## Rules\n\n- ${L('Réponds en français.', 'Answer in English.')}\n- ${L(`Explique ce que tu changes avant de valider.`, 'Explain what you change before committing.')}\n`;
      if (o.claudemd) { files['CLAUDE.md'] = ctx('Claude'); steps.push({ label: L('CLAUDE.md créé', 'CLAUDE.md created'), ok: true }); }
      if (o.agentsmd) { files['AGENTS.md'] = ctx('Codex'); steps.push({ label: L('AGENTS.md créé', 'AGENTS.md created'), ok: true }); }
    }
    const p = makeProject({ slug, name, description: desc, tags: b.template === 'node' ? ['JavaScript', 'Node.js'] : b.template === 'python' ? ['Python'] : b.template === 'android' ? ['Kotlin'] : b.template === 'static' ? ['HTML', 'CSS'] : [],
      platforms: b.template === 'android' ? ['Android'] : b.template === 'static' ? ['Web'] : [], mtime: now(), size: 64 * 1024, files, heavy: [], remote,
      icon: { color: ['#8B5000', '#5a3400'], glyph: 'dot' } });
    if (o.git || b.source === 'git') {
      const hash = D.hex(`init-${slug}-${now()}`, 40);
      p.git = { branch: 'main', ahead: 0, behind: 0, upstream: b.source === 'git', fetched: now(), changes: [],
        log: [{ hash, short: hash.slice(0, 7), author: 'Alex Martin', email: 'alex@example.com', when: now(), refs: b.source === 'git' ? 'HEAD -> main, origin/main' : 'HEAD -> main', msg: b.source === 'git' ? 'Initial commit' : L('Premier commit', 'First commit'),
          files: Object.keys(files).map((f) => [f, lines(files[f]), 0]) }],
        local: [{ name: 'main', current: true, upstream: b.source === 'git' ? 'origin/main' : '', when: now() }], remote: [] };
      if (b.source !== 'git') steps.push({ label: L('Git initialisé, premier commit', 'Git initialised, first commit'), ok: true });
    }
    if (o.deploy && S.settings.deploy_provider === 'coolify') {
      const key = `new-${slug}`;
      const a = { key, uuid: D.hex(`app-${key}`, 24), name: slug, status: 'exited:unhealthy', fqdn: o.domain ? `https://${slug}.${S.settings.domain_suffix}` : '', repo: remote ? `alex/${slug}` : '', branch: 'main', build_pack: 'nixpacks',
        updated: new Date().toISOString(), project: slug, deployments: [], envs: [] };
      S.apps.push(a); p.app_id = a.uuid;
      steps.push({ label: L('Application Coolify créée', 'Coolify application created'), ok: true, detail: a.fqdn || a.name });
    }
    S.projects.set(slug, p);
    if (o.agent === 'claude' || o.agent === 'codex') {
      p.repo[o.agent] = { alive: true, status: 'idle', rc: false, created: now(), since: now(), fresh: true, context: o.agent === 'claude' ? { used: 2.4, size: 200000, tokens: 4800 } : null };
      steps.push({ label: o.agent === 'codex' ? L('Codex ouvert dans le terminal du projet', 'Codex opened in the project terminal') : L('Claude ouvert dans le terminal du projet', 'Claude opened in the project terminal'), ok: true, detail: `tmux · ${repoName(slug, o.agent)}` });
    }
    log(L(`Projet ${name} créé`, `Project ${name} created`), 'create', slug);
    return { slug, steps };
  }

  /* ================================================================ dispatch */
  async function handle(method, url, body) {
    init();
    const q = url.searchParams;
    const path = url.pathname;
    for (const [m, rx, fn] of R) {
      if (m !== method) continue;
      const mm = rx.exec(path);
      if (!mm) continue;
      let json = {};
      let raw = null;
      if (body instanceof Blob || body instanceof ArrayBuffer) raw = body instanceof Blob ? body : new Blob([body]);
      else if (typeof body === 'string' && body) { try { json = JSON.parse(body); } catch (_) { throw new ApiError(L('JSON invalide', 'Invalid JSON')); } }
      const res = await fn(q, json || {}, mm.groups || {}, raw);
      return res === undefined || res === null ? { ok: true } : res;
    }
    throw new ApiError(L('Route inconnue', 'Unknown route'), 404);
  }

  const realFetch = window.fetch.bind(window);
  const BASE = new URL('./', location.href);
  window.fetch = async function demoFetch(input, opts = {}) {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/api/')) {
      const method = String(opts.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      await new Promise((ok) => setTimeout(ok, 40 + Math.random() * 110));
      let status = 200, payload;
      try { payload = await handle(method, url, opts.body); } catch (e) {
        if (!(e instanceof ApiError)) console.error('[demo]', e);
        status = e instanceof ApiError ? e.status : 500;
        payload = { error: e instanceof ApiError ? e.message : L('Erreur interne de la démo', 'Internal demo error') };
      }
      return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    // Safety net: a root-absolute static path (/x) is resolved against the demo folder
    if (typeof input === 'string' && input.startsWith('/') && !input.startsWith('//')) return realFetch(new URL(input.slice(1), BASE).href, opts);
    return realFetch(input, opts);
  };

  /* ===================================================== live state (SSE) */
  const listeners = new Set();
  function snapshot() {
    return { v: S.v, sessions: listSessions(), repos: listRepoSessions(false), tasks: taskList(null, 15).map((x) => ({ ...x, result: null, prompt: x.prompt.slice(0, 300) })), health: stats() };
  }
  function startLoops() {
    S.live = new Map();
    S.pending = {};
    // Background tasks: the demo task keeps working, tasks you start finish after ~20 s
    setInterval(() => {
      let changed = false;
      for (const tk of S.tasks) {
        if (tk.status !== 'running') continue;
        const step = tk.user ? 1 : (Math.random() < 0.3 ? 1 : 0);
        for (let i = 0; i < step && tk.later.length; i++) { tk.events.push(tk.later.shift()); changed = true; }
        if (tk.user && !tk.later.length) {
          tk.status = 'ok'; tk.finished = now(); tk.result.duration = now() - tk.started; changed = true;
          log(L(`${(S.projects.get(tk.slug) || {}).name || tk.slug} : tâche terminée`, `${(S.projects.get(tk.slug) || {}).name || tk.slug}: task finished`), 'claude', tk.slug);
        }
      }
      if (changed) bump();
    }, 3500);
  }

  const RealES = window.EventSource;
  class DemoEventSource extends EventTarget {
    constructor(url, opts) {
      super();
      this.url = new URL(url, location.href).href;
      this.withCredentials = !!(opts && opts.withCredentials);
      this.readyState = 0;
      this.onopen = null; this.onmessage = null; this.onerror = null;
      this._timers = [];
      const path = new URL(this.url).pathname;
      setTimeout(() => {
        if (this.readyState === 2) return;
        init();
        this.readyState = 1;
        this._emit('open');
        if (path === '/api/events') this._live();
        else {
          const m = path.match(/^\/api\/term\/([\w-]+)\/stream$/);
          const t = m && S.terms.get(m[1]);
          if (!t) { this._emit('exit', 'fin'); return; }
          t.attach(this);
        }
      }, 30);
    }
    _emit(type, data) {
      const ev = type === 'open' ? new Event('open') : new MessageEvent(type, { data });
      const h = this[`on${type}`];
      if (typeof h === 'function') { try { h.call(this, ev); } catch (e) { console.error(e); } }
      this.dispatchEvent(ev);
    }
    _live() {
      let last = '';
      const tick = () => {
        if (this.readyState === 2) return;
        const snap = snapshot();
        const key = JSON.stringify({ ...snap, health: null, v: 0 });
        if (key !== last || !this._n || this._n % 2 === 0) { last = key; snap.v = ++S.v; this._emit('message', JSON.stringify(snap)); }
        this._n = (this._n || 0) + 1;
      };
      tick();
      this._timers.push(setInterval(tick, 2500));
    }
    close() { this.readyState = 2; this._timers.forEach(clearInterval); this._timers = []; if (this._onclose) this._onclose(); }
  }
  DemoEventSource.CONNECTING = 0; DemoEventSource.OPEN = 1; DemoEventSource.CLOSED = 2;
  window.EventSource = function EventSource(url, opts) {
    const path = new URL(url, location.href).pathname;
    if (path.startsWith('/api/')) return new DemoEventSource(url, opts);
    return new RealES(url, opts);
  };
  window.EventSource.CONNECTING = 0; window.EventSource.OPEN = 1; window.EventSource.CLOSED = 2;

  /* ============================================================ terminals */
  const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', it: '\x1b[3m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', mag: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m',
    orange: '\x1b[38;5;209m', bgray: '\x1b[38;5;245m', bgreen: '\x1b[1;32m', bblue: '\x1b[1;34m' };
  function pushToLive(name, text) {
    if (!text) return;
    for (const t of S.terms.values()) if (t.name === name && t.alive) {
      const s = text.replace(/\r?\n/g, '\r\n');
      if (t.kind !== 'repo') { t.write(s); continue; }
      if (t.busy) t.flush();
      const wasBusy = !!t.anim;
      clearInterval(t.anim); t.anim = null;
      const codex = t.agent === 'codex';
      t.play([[`${codex ? '' : wasBusy ? '\x1b[3A' : '\x1b[1A'}\r\x1b[J${s}\r\n`, 'raw', 0], ...(codex ? codexInputBox(t) : claudeInputBox(t, false))]);
    }
  }

  function openTerm(b) {
    const target = b.target || 'server';
    let slug = b.slug || null, name = b.name || null, kind = 'shell', agent = null, branch = b.branch || null;
    if (target === 'server') name = 'helmshell-serveur';
    else if (target === 'new') {
      const base = slug ? `helmshell-${slug}` : 'helmshell-serveur';
      name = base; let n = 2;
      while (S.shells.some((x) => x.name === name)) name = `${base}-${n++}`;
    } else if (target === 'project') name = `helmshell-${slug}`;
    else if (target === 'repo') { kind = 'repo'; agent = b.agent === 'codex' ? 'codex' : 'claude'; const p = proj(slug); name = repoName(slug, agent, branch);
      if (!repoSession(p, agent, branch)) setRepoSession(p, agent, branch, { alive: true, status: 'idle', rc: false, created: now(), since: now(), fresh: true, context: agent === 'claude' ? { used: 2.4, size: 200000, tokens: 4800 } : null }); }
    else if (target === 'claude') { kind = 'remote'; name = `claude-${slug}`; if (!proj(slug).headless) err(L('Aucune session en arrière-plan', 'No background session'), 404); }
    else if (target === 'session') {
      const it = terminalsList().find((x) => x.name === name) || err(L('Session inconnue', 'Unknown session'), 404);
      kind = it.kind === 'remote' ? 'remote' : it.kind; slug = it.slug; agent = it.agent;
      if (kind === 'repo') { const mm = name.match(/@(.+)$/); branch = mm ? ((proj(slug).copies.find((c) => c.branch.replace(/[^A-Za-z0-9_-]/g, '_') === mm[1]) || {}).branch || null) : null; }
    }
    if (kind === 'shell' && !S.shells.some((x) => x.name === name)) {
      S.shells.push({ name, created: now(), attached: 1, path: slug ? `${D.root}/${slug}` : D.home, command: 'zsh', slug, kind: 'shell', agent: null, claude: false });
    }
    const id = Math.random().toString(16).slice(2, 14);
    const t = new Term(id, { name, kind, slug, agent, branch, cols: Number(b.cols) || 80, rows: Number(b.rows) || 24 });
    S.terms.set(id, t);
    bump();
    const p = slug && S.projects.get(slug);
    const title = kind === 'repo' ? `${agent === 'codex' ? 'Codex' : 'Claude'} · ${p ? p.name : slug}` : kind === 'remote' ? `Claude · ${p ? p.name : slug}` : (p ? p.name : D.hostname);
    return { id, title, name };
  }

  class Term {
    constructor(id, o) {
      Object.assign(this, o);
      this.id = id; this.alive = true; this.es = null; this.q = []; this.busy = false; this.line = ''; this.anim = null;
      this.cwd = o.slug ? `${D.root}/${o.slug}` : D.home;
    }
    attach(es) {
      this.es = es;
      es._onclose = () => this.dispose();
      S.live.set(this.name, (S.live.get(this.name) || 0) + 1);
      this.play(this.script());
      if (this.kind === 'shell') { const pend = S.pending[this.name]; if (pend) { delete S.pending[this.name]; pend.forEach((c) => this.typeCommand(c)); } }
    }
    dispose() {
      if (!this.alive) return;
      this.alive = false;
      clearInterval(this.anim);
      this.q = [];
      const n = (S.live.get(this.name) || 1) - 1;
      if (n > 0) S.live.set(this.name, n); else S.live.delete(this.name);
      S.terms.delete(this.id);
    }
    exit() { if (!this.alive) return; this.flush(); if (this.es) this.es._emit('exit', 'fin'); this.dispose(); }
    write(s) { if (this.alive && this.es && s) this.es._emit('message', b64(s)); }
    get W() { return Math.max(24, Math.min(this.cols - 1, 92)); }
    // Queue of [text, mode] : mode 'type' writes it character by character
    play(ops) { this.q.push(...ops); if (!this.busy) this.next(); }
    flush() { for (const [s] of this.q) this.write(typeof s === 'function' ? s() : s); this.q = []; }
    next() {
      if (!this.alive) return;
      const op = this.q.shift();
      if (!op) { this.busy = false; return; }
      this.busy = true;
      const [s0, mode, delay] = op;
      const s = typeof s0 === 'function' ? s0() : s0;
      if (mode === 'type') {
        let i = 0;
        const step = () => {
          if (!this.alive) return;
          const n = 2 + Math.floor(Math.random() * 4);
          this.write(s.slice(i, i + n)); i += n;
          if (i < s.length) setTimeout(step, 14 + Math.random() * 22); else setTimeout(() => this.next(), delay ?? 120);
        };
        step();
      } else {
        this.write(s);
        setTimeout(() => this.next(), delay ?? 60);
      }
    }
    /* --- scripts --- */
    script() {
      if (this.kind === 'shell') return this.shellIntro();
      if (this.kind === 'remote') return [[headlessOutput(S.projects.get(this.slug)), 'raw', 0]];
      if (this.agent === 'codex') return codexScript(this);
      return claudeScript(this);
    }
    prompt() {
      const short = this.cwd.replace(D.home, '~');
      return `${C.bgreen}alex@homelab${C.reset}:${C.bblue}${short}${C.reset}$ `;
    }
    shellIntro() {
      const t = new Date(Date.now() - 3 * 3600 * 1000);
      const intro = this.name === 'helmshell-serveur'
        ? `Linux homelab 6.1.0-28-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.119-1 x86_64\r\n\r\n${C.dim}${L('Démo Helmshell : shell simulé. Tape « help » pour la liste des commandes.', 'Helmshell demo: simulated shell. Type "help" for the list of commands.')}${C.reset}\r\nLast login: ${t.toDateString()} ${t.toTimeString().slice(0, 8)} from 192.168.1.23\r\n`
        : `${C.dim}${L('Démo Helmshell : shell simulé. Tape « help » pour la liste des commandes.', 'Helmshell demo: simulated shell. Type "help" for the list of commands.')}${C.reset}\r\n`;
      return [[intro, 'raw', 30], [() => this.prompt(), 'raw', 0]];
    }
    typeCommand(cmd) { this.play([[cmd, 'type', 150], [() => { this.line = cmd; return ''; }, 'raw', 0], [() => { const out = this.run(cmd); this.line = ''; return `\r\n${out}${this.prompt()}`; }, 'raw', 0]]); }
    input(data) {
      if (!this.alive) return;
      if (this.kind === 'shell') return this.shellInput(data);
      if (this.kind === 'remote') {
        const p = S.projects.get(this.slug);
        if (p && p.headless && p.headless.phase === 'question' && /^[yYnN]/.test(data)) {
          const v = data[0].toLowerCase();
          p.headless.phase = 'running';
          this.write(`${v}\r\n${v === 'y' ? `${C.green}✓${C.reset} Running…\r\n` : `${C.yellow}Skipped.${C.reset}\r\n`}`);
          bump();
        }
        return;
      }
      // Agent sessions: echo, Enter submits
      for (const ch of data.replace(/\x1b\[[0-9;]*[A-Za-z~]|\x1bO[A-Z]/g, '')) {
        if (ch === '\r') { const text = this.line.trim(); this.line = ''; if (text) this.submit(text, true); }
        else if (ch === '\x7f') { if (this.line) { this.line = this.line.slice(0, -1); this.write('\b \b'); } }
        else if (ch === '\x03') { this.line = ''; this.write(`${C.gray}^C${C.reset}`); }
        else if (ch >= ' ') { this.line += ch; this.write(ch); }
      }
    }
    submit(text, typed = false) {
      if (this.busy) this.flush();
      const wasBusy = !!this.anim;
      clearInterval(this.anim); this.anim = null;
      const codex = this.agent === 'codex';
      const reply = codex
        ? L('(Démo) Ici, Codex lirait le projet et proposerait des modifications. Dans la démo, rien n’est exécuté.', '(Demo) Here Codex would read the project and propose changes. In the demo, nothing is executed.')
        : L('(Démo) Dans la vraie console, Claude travaillerait ici sur ta demande, dans ce projet. Rien n’est exécuté dans la démo.', '(Demo) In the real console, Claude would work on your request here, in this project. Nothing is executed in the demo.');
      const ops = [[`${codex ? '' : wasBusy ? '\x1b[3A' : '\x1b[1A'}\r\x1b[J`, 'raw', typed ? 0 : 200]];
      ops.push([`${codex ? `${C.cyan}▌${C.reset} ${C.bold}${text}${C.reset}` : `${C.gray}>${C.reset} ${text}`}\r\n\r\n`, 'raw', 400]);
      ops.push([codex ? `${C.bold}•${C.reset} ` : `${C.orange}⏺${C.reset} `, 'raw', 200], [wrap(reply, this.W - 4).join('\r\n  '), 'type', 300], ['\r\n\r\n', 'raw', 0]);
      ops.push(...(codex ? codexInputBox(this) : claudeInputBox(this, false)));
      this.play(ops);
    }
    shellInput(data) {
      for (let i = 0; i < data.length; i++) {
        const ch = data[i];
        if (ch === '\x1b') { const m = data.slice(i).match(/^\x1b(\[[0-9;]*[A-Za-z~]|O[A-Z])/); if (m) i += m[0].length - 1; continue; }
        if (ch === '\r') { const cmd = this.line; this.line = ''; const out = this.run(cmd.trim()); if (out === null) return; this.write(`\r\n${out}${this.prompt()}`); }
        else if (ch === '\x7f') { if (this.line) { this.line = this.line.slice(0, -1); this.write('\b \b'); } }
        else if (ch === '\x03') { this.line = ''; this.write(`^C\r\n${this.prompt()}`); }
        else if (ch === '\x0c') { this.write(`\x1b[2J\x1b[H${this.prompt()}${this.line}`); }
        else if (ch === '\x04') { if (!this.line) { this.write('\r\nlogout\r\n'); this.exit(); return; } }
        else if (ch === '\t') { /* no completion */ }
        else if (ch >= ' ') { this.line += ch; this.write(ch); }
      }
    }
    run(cmd) {
      const nl = (a) => (a.length ? `${a.join('\r\n')}\r\n` : '');
      if (!cmd) return '';
      const [c, ...args] = cmd.split(/\s+/);
      const p = this.slug ? S.projects.get(this.slug) : (this.cwd.startsWith(`${D.root}/`) ? S.projects.get(this.cwd.slice(D.root.length + 1).split('/')[0]) : null);
      const inProject = p && this.cwd.startsWith(`${D.root}/${p.slug}`);
      switch (c) {
        case 'help': return nl([L('Commandes simulées dans la démo :', 'Commands simulated in the demo:'), '  ls  cd  pwd  cat  whoami  hostname  date  uptime  uname  df  free', '  docker ps  git status  git log  tmux ls  echo  clear  exit']);
        case 'pwd': return nl([this.cwd]);
        case 'whoami': return nl(['alex']);
        case 'hostname': return nl([D.hostname]);
        case 'date': return nl([new Date().toString().replace(/ \(.*\)$/, '')]);
        case 'echo': return nl([args.join(' ').replace(/^["']|["']$/g, '')]);
        case 'clear': return '\x1b[2J\x1b[H';
        case 'exit': case 'logout': setTimeout(() => this.exit(), 50); this.write('\r\nlogout\r\n'); return null;
        case 'uname': return nl([args.includes('-a') ? 'Linux homelab 6.1.0-28-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.119-1 x86_64 GNU/Linux' : 'Linux']);
        case 'uptime': { const s = stats(); return nl([` ${new Date().toTimeString().slice(0, 8)} up ${Math.floor(s.uptime / 86400)} days, ${Math.floor((s.uptime % 86400) / 3600)}:${String(Math.floor((s.uptime % 3600) / 60)).padStart(2, '0')},  2 users,  load average: ${s.load.toFixed(2)}, ${(s.load * 0.9).toFixed(2)}, ${(s.load * 0.8).toFixed(2)}`]); }
        case 'df': return nl(['Filesystem      Size  Used Avail Use% Mounted on', '/dev/nvme0n1p2  932G  387G  498G  44% /', '/dev/sda1       3.6T  2.1T  1.4T  61% /srv/data', 'tmpfs            16G  4.0K   16G   1% /dev/shm']);
        case 'free': { const s = stats(); const g = (x) => `${(x / GB).toFixed(1)}Gi`; return nl(['               total        used        free      shared  buff/cache   available', `Mem:          ${g(s.mem_total).padStart(6)}      ${g(s.mem_used).padStart(6)}      ${g(s.mem_total * 0.12).padStart(6)}       412Mi      ${g(s.mem_total * 0.41).padStart(6)}      ${g(s.mem_total - s.mem_used).padStart(6)}`, 'Swap:          4.0Gi          0B       4.0Gi']); }
        case 'docker':
          if (args[0] !== 'ps') return nl([L('démo : seule « docker ps » est simulée', 'demo: only "docker ps" is simulated')]);
          return nl(['CONTAINER ID   IMAGE                           STATUS                 NAMES', 'f3a91c2b7d10   atlas:a91c0f2                   Up 34 minutes          atlas-a91c0f2', '0be5f17c3e22   ledger-api:1f4b7aa              Up 2 hours (healthy)   ledger-api', '44a0d9e1aa31   handbook:44a0d9e                Up 6 hours             handbook', '9c2d0e4f5b66   postgres:17                     Up 3 days (healthy)    postgres-main', '7a1b2c3d4e5f   redis:7-alpine                  Up 3 days              redis-cache', '5e6f7a8b9c0d   ghcr.io/coollabsio/coolify:4    Up 3 days (healthy)    coolify']);
        case 'tmux':
          if (args[0] !== 'ls') return nl([L('démo : seule « tmux ls » est simulée', 'demo: only "tmux ls" is simulated')]);
          return nl(terminalsList().map((x) => `${x.name}: 1 windows (created ${new Date(x.created * 1000).toDateString()})${x.attached ? ' (attached)' : ''}`));
        case 'ls': {
          if (inProject) {
            const rel = this.cwd.slice(`${D.root}/${p.slug}`.length + 1);
            const items = tree(p, rel).filter((x) => args.some((a) => a.includes('a')) || !x.name.startsWith('.'));
            return nl([items.map((x) => (x.dir ? `${C.bblue}${x.name}${C.reset}` : x.name)).join('  ')]);
          }
          if (this.cwd === D.root) return nl([[...S.projects.keys()].sort().map((x) => `${C.bblue}${x}${C.reset}`).join('  ')]);
          if (this.cwd === D.home) return nl([`${C.bblue}backups${C.reset}  ${C.bblue}projects${C.reset}  ${C.bblue}scripts${C.reset}  notes.md`]);
          return '';
        }
        case 'cd': {
          const a = args[0] || '~';
          let target = a === '~' || a === '' ? D.home : a.startsWith('/') ? a : a.startsWith('~/') ? D.home + a.slice(1) : `${this.cwd}/${a}`;
          const parts = [];
          for (const x of target.split('/')) { if (x === '..') parts.pop(); else if (x && x !== '.') parts.push(x); }
          target = `/${parts.join('/')}`;
          const ok = target === D.home || target === D.root || target === '/home' || target === '/' || [...S.projects.values()].some((pp) => target === `${D.root}/${pp.slug}` || (target.startsWith(`${D.root}/${pp.slug}/`) && dirSet(pp).has(target.slice(D.root.length + pp.slug.length + 2))));
          if (!ok) return nl([`cd: ${L('aucun fichier ou dossier de ce nom', 'no such file or directory')}: ${a}`]);
          this.cwd = target;
          return '';
        }
        case 'cat': case 'less': case 'head': {
          if (!inProject || !args[0]) return nl([`${c}: ${args[0] || ''}: ${L('aucun fichier ou dossier de ce nom', 'No such file or directory')}`]);
          const rel = [this.cwd.slice(`${D.root}/${p.slug}`.length + 1), args[0]].filter(Boolean).join('/');
          const f = p.files.get(rel);
          if (!f) return nl([`${c}: ${args[0]}: ${L('aucun fichier ou dossier de ce nom', 'No such file or directory')}`]);
          if (f.binary) return nl([L('(fichier binaire)', '(binary file)')]);
          return `${(f.content || '').split('\n').slice(0, c === 'head' ? 10 : 200).join('\r\n')}\r\n`;
        }
        case 'git': {
          if (!inProject || !p.git) return nl(['fatal: not a git repository (or any of the parent directories): .git']);
          const g = p.git;
          if (args[0] === 'log') return nl(g.log.slice(0, 12).map((x) => `${C.yellow}${x.short}${C.reset} ${x.refs ? `${C.yellow}(${C.reset}${x.refs.replace('HEAD -> ', `${C.bcyan || C.cyan}HEAD -> ${C.bgreen}`)}${C.reset}${C.yellow})${C.reset} ` : ''}${x.msg}`));
          if (args[0] === 'branch') return nl(g.local.map((x) => (x.name === g.branch ? `* ${C.green}${x.name}${C.reset}` : `  ${x.name}`)));
          if (args[0] === 'status' || !args[0]) {
            const out = [`On branch ${g.branch}`];
            if (p.remote && g.upstream) out.push(g.ahead ? `Your branch is ahead of 'origin/${g.branch}' by ${g.ahead} commit${g.ahead > 1 ? 's' : ''}.` : g.behind ? `Your branch is behind 'origin/${g.branch}' by ${g.behind} commits, and can be fast-forwarded.` : `Your branch is up to date with 'origin/${g.branch}'.`);
            const mod = g.changes.filter((x) => x.kind !== 'A'), add = g.changes.filter((x) => x.kind === 'A');
            if (mod.length) out.push('', 'Changes not staged for commit:', ...mod.map((x) => `\t${C.red}${x.kind === 'D' ? 'deleted' : 'modified'}:   ${x.path}${C.reset}`));
            if (add.length) out.push('', 'Untracked files:', ...add.map((x) => `\t${C.red}${x.path}${C.reset}`));
            if (!g.changes.length) out.push('', 'nothing to commit, working tree clean');
            return nl(out);
          }
          return nl([L(`démo : « git ${args[0]} » n’est pas simulé`, `demo: "git ${args[0]}" is not simulated`)]);
        }
        case 'sudo': return nl([L('démo : pas de sudo ici 🙂', 'demo: no sudo here 🙂')]);
        case 'vim': case 'nano': case 'htop': case 'top': case 'claude': case 'codex': case 'ssh': case 'npm': case 'go': case 'make': case 'python3': case 'uv':
          return nl([`${C.yellow}${L(`démo : « ${c} » n’est pas exécuté (rien ne tourne vraiment ici)`, `demo: "${c}" is not executed (nothing really runs here)`)}${C.reset}`]);
        default: return nl([`zsh: command not found: ${c}  ${C.dim}(${L('démo : tape help', 'demo: type help')})${C.reset}`]);
      }
    }
  }

  function wrap(text, width) {
    const out = [];
    for (const para of text.split('\n')) {
      let cur = '';
      for (const w of para.split(' ')) {
        if (cur && (cur + ' ' + w).length > width) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
      }
      out.push(cur);
    }
    return out;
  }
  // Agent screens are drawn to the terminal width: nothing may wrap, the cursor moves are relative
  const vis = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;
  const narrow = (t) => t.cols < 62;
  function box(t, rowsIn, color = C.orange) {
    const w = t.W;
    const fitRow = (r) => (vis(r) <= w - 4 ? r : [...r.replace(/\x1b\[[0-9;]*m/g, '')].slice(0, w - 5).join('') + '…');
    const body = rowsIn.map((r0) => { const r = fitRow(r0); return `${color}│${C.reset} ${r}${' '.repeat(Math.max(0, w - 4 - vis(r)))} ${color}│${C.reset}`; });
    return `${color}╭${'─'.repeat(w - 2)}╮${C.reset}\r\n${body.join('\r\n')}\r\n${color}╰${'─'.repeat(w - 2)}╯${C.reset}\r\n`;
  }
  function spinnerLine(t, frame, word, secs) {
    const full = `${C.orange}${frame} ${word}${C.reset} ${C.gray}(${secs}s · esc to interrupt)${C.reset}`;
    if (vis(full) <= t.cols - 1) return full;
    const short = `${C.orange}${frame} ${word}${C.reset} ${C.gray}(${secs}s)${C.reset}`;
    return vis(short) <= t.cols - 1 ? short : `${C.orange}${frame} ${[...word].slice(0, Math.max(4, t.cols - 4)).join('')}${C.reset}`;
  }
  function claudeInputBox(t, busy) {
    const mode = (t.slug && repoSession(S.projects.get(t.slug), 'claude', t.branch) || {}).mode || S.settings.default_mode;
    const hint = () => (narrow(t) ? '' : ` ${C.gray}(shift+tab to cycle)${C.reset}`);
    const foot = () => (mode === 'acceptEdits' ? `  ${C.mag}⏵⏵ accept edits on${C.reset}${hint()}` : mode === 'plan' ? `  ${C.cyan}⏸ plan mode on${C.reset}${hint()}` : `  ${C.gray}? for shortcuts${C.reset}`);
    const ops = [];
    if (busy) ops.push([() => `${spinnerLine(t, '✻', L('Écriture du composant…', 'Writing the component…'), 47)}\r\n\r\n`, 'raw', 0]);
    ops.push([() => `${C.gray}╭${'─'.repeat(t.W - 2)}╮${C.reset}\r\n${C.gray}│${C.reset} > ${' '.repeat(t.W - 5)}${C.gray}│${C.reset}\r\n${C.gray}╰${'─'.repeat(t.W - 2)}╯${C.reset}\r\n${foot()}\x1b[2A\r\x1b[4C`, 'raw', 0]);
    if (busy) ops.push([() => { startSpinner(t); return ''; }, 'raw', 0]);
    return ops;
  }
  function startSpinner(t) {
    const frames = ['·', '✢', '✳', '∗', '✻', '✽'];
    const words = LANG === 'fr' ? ['Écriture du composant…', 'Vérification des tests…', 'Réflexion…'] : ['Writing the component…', 'Checking the tests…', 'Thinking…'];
    let i = 0;
    const t0 = Date.now();
    clearInterval(t.anim);
    t.anim = setInterval(() => {
      if (!t.alive) { clearInterval(t.anim); return; }
      i++;
      const secs = Math.floor((Date.now() - t0) / 1000) + 47;
      const w = words[Math.floor(i / 40) % words.length];
      t.write(`\x1b7\x1b[3A\r\x1b[2K${spinnerLine(t, frames[i % frames.length], w, secs)}\x1b8`);
    }, 180);
  }
  function codexInputBox(t) {
    const keys = () => (narrow(t) ? '⏎ send   ⌃C quit' : '⏎ send   ⌃J newline   ⌃T transcript   ⌃C quit');
    const ph = L('Demande quelque chose à Codex', 'Ask Codex to do anything');
    return [[() => `${C.cyan}▌${C.reset} ${C.gray}${[...ph].slice(0, t.cols - 3).join('')}${C.reset}\r\n\r\n  ${C.gray}${keys()}${C.reset}\x1b[2A\r\x1b[2C\x1b[K`, 'raw', 0]];
  }
  function welcome(t, p) {
    const cwd = (t.branch ? `${D.root}/.branches/${p.slug}/${t.branch}` : projPath(p)).replace(D.home, '~');
    const rows = narrow(t)
      ? [`${C.orange}✻${C.reset} ${C.bold}Welcome to Claude Code!${C.reset}`, '', `  ${C.gray}/help for help${C.reset}`, `  ${C.gray}${cwd.replace(/^~\/[^/]+\//, '~/…/')}${C.reset}`]
      : [`${C.orange}✻${C.reset} ${C.bold}Welcome to Claude Code!${C.reset}`, '', `  ${C.gray}/help for help, /status for your current setup${C.reset}`, '', `  ${C.gray}cwd: ${cwd}${C.reset}`];
    return box(t, rows);
  }
  const tool = (name, arg, out) => [[`${C.green}⏺${C.reset} ${C.bold}${name}${C.reset}(${arg})\r\n`, 'raw', 350], ...(out ? [[`  ${C.gray}⎿${C.reset}  ${out.split('\n').join('\r\n     ')}\r\n\r\n`, 'raw', 250]] : [['\r\n', 'raw', 0]])];
  const say = (t, text) => [[`${C.orange}⏺${C.reset} `, 'raw', 150], [wrap(text, t.W - 3).join('\r\n  '), 'type', 250], ['\r\n\r\n', 'raw', 0]];
  const user = (t, text) => [[`${C.gray}>${C.reset} `, 'raw', 0], [wrap(text, t.W - 3).join('\r\n  '), 'raw', 300], ['\r\n\r\n', 'raw', 0]];
  function claudeScript(t) {
    const p = S.projects.get(t.slug);
    const r = repoSession(p, 'claude', t.branch) || {};
    const ops = [[welcome(t, p) + '\r\n', 'raw', 200]];
    if (r.fresh || t.branch) return ops.concat(claudeInputBox(t, false));
    if (r.resumed) return ops.concat(user(t, r.resumed), say(t, L('Je reprends où on en était. Que veux-tu faire ensuite ?', 'Picking up where we left off. What would you like to do next?')), claudeInputBox(t, false));
    if (p.slug === 'atlas-web') {
      return ops.concat(
        user(t, L('Ajoute une pagination à la page /projects (20 par page) et couvre-la avec des tests', 'Add pagination to the /projects page (20 per page) and cover it with tests')),
        say(t, L('Je regarde d’abord comment la page récupère les projets.', 'Let me first look at how the page fetches the projects.')),
        tool('Read', 'app/projects/page.tsx', 'Read 15 lines'),
        tool('Read', 'lib/projects.ts', 'Read 13 lines'),
        tool('Update', 'lib/projects.ts', `Updated lib/projects.ts with 11 additions and 3 removals\n   ${C.red}3 - export async function getProjects() {${C.reset}\n   ${C.green}3 + export async function getProjects({ page = 1, perPage = 20 } = {}) {${C.reset}\n   ${C.green}4 +   const take = Math.min(Math.max(perPage, 1), 100);${C.reset}`),
        tool('Write', 'components/Pagination.tsx', 'Wrote 23 lines to components/Pagination.tsx'),
        tool('Update', 'app/projects/page.tsx', 'Updated app/projects/page.tsx with 9 additions and 4 removals'),
        tool('Bash', 'npm test -- projects', ` ${C.green}✓${C.reset} tests/projects.test.ts (3 tests) 14ms\n Test Files  ${C.green}1 passed${C.reset} (1)\n      Tests  ${C.green}3 passed${C.reset} (3)`),
        say(t, L('Pagination en place : `getProjects()` prend `page` et `perPage` (plafonné à 100), le composant `<Pagination>` affiche Précédent / Suivant, et 3 tests couvrent skip/take. Rien n’est validé.', 'Pagination is in: `getProjects()` takes `page` and `perPage` (capped at 100), the `<Pagination>` component shows Previous / Next, and 3 tests cover skip/take. Nothing is committed.')),
        user(t, L('Parfait. Affiche aussi le nombre total de projets sous le titre', 'Great. Also show the total number of projects under the title')),
        tool('Read', 'components/Pagination.tsx', 'Read 23 lines'),
        claudeInputBox(t, true),
      );
    }
    if (p.slug === 'ledger-api') {
      return ops.concat(
        user(t, L('Rends « payer une facture » idempotent : un deuxième appel ne doit rien changer', 'Make "pay invoice" idempotent: a second call must not change anything')),
        tool('Read', 'app/routers/invoices.py', 'Read 52 lines'),
        say(t, L('Aujourd’hui, chaque appel réécrit `paid_at`. Je ne le mets à jour que s’il est vide, et j’ajoute un test qui paie deux fois.', 'Today every call rewrites `paid_at`. I will only set it when it is empty, and add a test that pays twice.')),
        tool('Update', 'app/routers/invoices.py', 'Updated app/routers/invoices.py with 3 additions and 2 removals'),
        tool('Update', 'tests/test_invoices.py', 'Updated tests/test_invoices.py with 9 additions'),
        tool('Bash', 'uv run pytest -q', `${C.green}..............${C.reset}                                    [100%]\n14 passed in 1.92s`),
        say(t, L('C’est fait et validé (`Invoices: mark as paid is idempotent`). Les 14 tests passent.', 'Done and committed (`Invoices: mark as paid is idempotent`). All 14 tests pass.')),
        claudeInputBox(t, false),
      );
    }
    return ops.concat(claudeInputBox(t, false));
  }
  function codexScript(t) {
    const p = S.projects.get(t.slug);
    const r = repoSession(p, 'codex', t.branch) || {};
    const head = `${C.bold}>_ OpenAI Codex${C.reset}\r\n\r\n  ${C.gray}model:${C.reset}     gpt-5-codex\r\n  ${C.gray}directory:${C.reset} ${projPath(p).replace(D.home, '~')}\r\n  ${C.gray}approval:${C.reset}  on-request · ${C.gray}sandbox:${C.reset} workspace-write\r\n\r\n`;
    const ops = [[head, 'raw', 250]];
    const ask = (text) => [[`${C.cyan}▌${C.reset} ${C.bold}${text}${C.reset}\r\n\r\n`, 'raw', 400]];
    const bul = (text, sub) => [[`${C.bold}•${C.reset} ${text}\r\n${sub ? `  ${C.gray}└${C.reset} ${sub.split('\n').join('\r\n    ')}\r\n` : ''}`, 'raw', 350]];
    if (p.slug === 'tidy' && !r.fresh) {
      ops.push(...ask(L('Ajoute un mode --watch qui range le dossier dès qu’un fichier arrive', 'Add a --watch mode that tidies the folder as soon as a file arrives')),
        ...bul(L('Je regarde la commande racine et les règles.', 'Looking at the root command and the rules.')),
        ...bul('Explored', 'Read cmd/root.go\nRead internal/rules/rules.go'),
        ...bul(`Ran ${C.cyan}go get github.com/fsnotify/fsnotify@v1.8.0${C.reset}`, 'go: added github.com/fsnotify/fsnotify v1.8.0'),
        ...bul(`Edited cmd/watch.go ${C.green}(+38 -0)${C.reset}`),
        ...bul(`Edited cmd/root.go ${C.green}(+6${C.reset} ${C.red}-1)${C.reset}`),
        ...bul(`Ran ${C.cyan}go test ./...${C.reset}`, `ok   example.com/alex/tidy/internal/rules  0.004s`),
        [`${C.gray}─ Worked for 2m 11s ${'─'.repeat(Math.max(0, t.W - 22))}${C.reset}\r\n\r\n`, 'raw', 200],
        [`${C.bold}•${C.reset} `, 'raw', 0], [wrap(L('`tidy --watch ~/Downloads` surveille maintenant le dossier (fsnotify). Les événements sont regroupés (800 ms) pour ne pas ranger un fichier encore en cours de téléchargement.', '`tidy --watch ~/Downloads` now watches the folder (fsnotify). Events are debounced (800 ms) so a file still downloading is not moved.'), t.W - 4).join('\r\n  '), 'type', 200], ['\r\n\r\n', 'raw', 0]);
    }
    return ops.concat(codexInputBox(t));
  }
  function headlessOutput(p) {
    const h = p.headless;
    if (!h) return '';
    const W = 60;
    const lines2 = [`${C.orange}✻${C.reset} Claude Code ${C.gray}· remote-control${C.reset}`, `${C.gray}${'─'.repeat(W)}${C.reset}`,
      `Remote Control session: ${C.cyan}${h.url}${C.reset}`, `${C.gray}${L('Ouvre ce lien sur claude.ai ou dans l’app Claude pour piloter la session.', 'Open this link on claude.ai or in the Claude app to drive the session.')}${C.reset}`, ''];
    if (p.slug === 'ledger-api') {
      lines2.push(`${C.gray}>${C.reset} ${L('Ajoute un modèle Refund et la migration Alembic, puis applique-la en dev', 'Add a Refund model and the Alembic migration, then apply it on dev')}`, '',
        `${C.green}⏺${C.reset} ${C.bold}Update${C.reset}(app/models.py)`, `  ${C.gray}⎿${C.reset}  Updated app/models.py with 14 additions`, '',
        `${C.green}⏺${C.reset} ${C.bold}Bash${C.reset}(uv run alembic revision --autogenerate -m "refunds")`, `  ${C.gray}⎿${C.reset}  Generating alembic/versions/0007_refunds.py ...  done`, '',
        `${C.orange}⏺${C.reset} ${L('La migration est prête. Je l’applique sur la base de dev :', 'The migration is ready. Applying it to the dev database:')}`, '');
    }
    if (h.phase === 'question') lines2.push(`${C.yellow}${h.question}${C.reset}`);
    else if (h.phase === 'running') lines2.push(`${C.green}✓${C.reset} ${L('Réponse reçue, Claude continue.', 'Answer received, Claude continues.')}`);
    return lines2.join('\r\n') + (h.phase === 'question' ? ' ' : '\r\n');
  }
  function previewOf(p, agent, branch) {
    const r = repoSession(p, agent, branch) || {};
    const strip = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    let out;
    if (agent === 'codex') {
      out = p.slug === 'tidy' && !r.fresh ? ['• Ran go test ./...', '  └ ok   example.com/alex/tidy/internal/rules  0.004s', '─ Worked for 2m 11s ─',
        L('• `tidy --watch ~/Downloads` surveille maintenant le dossier (fsnotify).', '• `tidy --watch ~/Downloads` now watches the folder (fsnotify).'), '', `▌ ${L('Demande quelque chose à Codex', 'Ask Codex to do anything')}`]
        : ['>_ OpenAI Codex', `  directory: ${projPath(p).replace(D.home, '~')}`, '', `▌ ${L('Demande quelque chose à Codex', 'Ask Codex to do anything')}`];
    } else if (p.slug === 'atlas-web' && !r.fresh && !branch) {
      out = ['⏺ Bash(npm test -- projects)', '  ⎿   ✓ tests/projects.test.ts (3 tests) 14ms', L('⏺ Pagination en place : getProjects() prend page et perPage…', '⏺ Pagination is in: getProjects() takes page and perPage…'),
        L('> Parfait. Affiche aussi le nombre total de projets sous le titre', '> Great. Also show the total number of projects under the title'), '⏺ Read(components/Pagination.tsx)',
        `${['✻', '✽', '✶'][Math.floor(Date.now() / 1000) % 3]} ${L('Écriture du composant…', 'Writing the component…')} (${60 + (now() - S.started)}s · esc to interrupt)`];
    } else if (p.slug === 'ledger-api' && !r.fresh && !branch) {
      out = ['⏺ Bash(uv run pytest -q)', '  ⎿  14 passed in 1.92s', L('⏺ C’est fait et validé (Invoices: mark as paid is idempotent).', '⏺ Done and committed (Invoices: mark as paid is idempotent).'), L('  Les 14 tests passent.', '  All 14 tests pass.'), '>', '  ? for shortcuts'];
    } else out = ['✻ Welcome to Claude Code!', '  /help for help, /status for your current setup', `  cwd: ${projPath(p).replace(D.home, '~')}`, '>', '  ? for shortcuts'];
    if (r.lastSent) out = out.slice(-4).concat([`> ${r.lastSent}`, L('⏺ (Démo) Rien n’est exécuté dans la démo.', '⏺ (Demo) Nothing is executed in the demo.')]);
    return out.map(strip).join('\n');
  }

  /* ====================================================== images from /api */
  function apiImage(url) {
    try {
      init();
      const u = new URL(url.replace(/&amp;/g, '&'), location.origin);
      const m = u.pathname.match(/^\/api\/projects\/([^/]+)\/(icon|download)$/);
      if (!m) return url;
      const slug = decodeURIComponent(m[1]);
      return m[2] === 'icon' ? iconUri(slug) : fileUri(slug, u.searchParams.get('path') || '');
    } catch (_) { return url; }
  }
  const fixHtml = (html) => (typeof html === 'string' && html.includes('/api/projects/') ? html.replace(/(src=["'])(\/api\/projects\/[^"']+)/g, (all, a, url) => a + apiImage(url).replace(/"/g, '%22')) : html);
  for (const [proto, prop] of [[Element.prototype, 'innerHTML'], [Element.prototype, 'outerHTML']]) {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (d && d.set) Object.defineProperty(proto, prop, { ...d, set(v) { d.set.call(this, fixHtml(v)); } });
  }
  const iah = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (pos, html) { return iah.call(this, pos, fixHtml(html)); };
  const setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if ((name === 'src' || name === 'href') && typeof value === 'string' && value.startsWith('/api/projects/') && (this.tagName === 'IMG' || this.tagName === 'SOURCE')) value = apiImage(value);
    return setAttr.call(this, name, value);
  };
  const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (srcDesc && srcDesc.set) Object.defineProperty(HTMLImageElement.prototype, 'src', { ...srcDesc, set(v) { srcDesc.set.call(this, typeof v === 'string' && v.startsWith('/api/') ? apiImage(v) : v); } });

  /* ========================================== browser APIs that need a server */
  if (navigator.serviceWorker) {
    try { navigator.serviceWorker.register = () => Promise.resolve({ scope: BASE.href, unregister: () => Promise.resolve(true), update: () => Promise.resolve() }); } catch (_) { /* read-only */ }
  }
  try {
    let perm = 'default';
    const N = function Notification() { /* demo: no real notification */ };
    Object.defineProperty(N, 'permission', { get: () => perm });
    N.requestPermission = (cb) => { perm = 'granted'; if (cb) cb(perm); return Promise.resolve(perm); };
    N.prototype.close = function () {};
    window.Notification = N;
  } catch (_) { /* keep the native one */ }
  if (!navigator.clipboard || !window.isSecureContext) {
    const fallback = { writeText: (text) => new Promise((ok, ko) => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.append(ta); ta.select();
      let done = false;
      try { done = document.execCommand('copy'); } catch (_) { done = false; }
      ta.remove();
      if (done) ok(); else ko(new Error('copy'));
    }) };
    try { Object.defineProperty(navigator, 'clipboard', { value: fallback, configurable: true }); } catch (_) { /* ignore */ }
  }
  function demoToast(msg) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast';
    const s = document.createElement('span'); s.className = 'grow'; s.textContent = msg;
    el.append(s); box.append(el);
    setTimeout(() => el.remove(), 4000);
  }
  const realOpen = window.open;
  window.open = function (url, ...rest) {
    if (typeof url === 'string' && /^\/(api|auth|hook)\//.test(url)) { demoToast(UNAVAILABLE); return null; }
    return realOpen.call(window, url, ...rest);
  };
  // "Download" (location.href = /api/projects/<slug>/download?path=…): served from the demo state
  if (window.navigation && typeof window.navigation.addEventListener === 'function') {
    window.navigation.addEventListener('navigate', (e) => {
      let u;
      try { u = new URL(e.destination.url); } catch (_) { return; }
      if (u.origin !== location.origin || !u.pathname.startsWith('/api/')) return;
      if (e.cancelable) e.preventDefault();
      const m = u.pathname.match(/^\/api\/projects\/([^/]+)\/download$/);
      const p = m && S && S.projects.get(decodeURIComponent(m[1]));
      const f = p && p.files.get(u.searchParams.get('path') || '');
      if (!f) { demoToast(UNAVAILABLE); return; }
      const blob = new Blob([f.binary ? '' : (f.content || '')], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = (u.searchParams.get('path') || 'file').split('/').pop();
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }

  /* =========================================================== demo badge */
  // In the page flow, right under the app's top bar (it scrolls away and never covers a control).
  // Before the app shell exists (login screen), it floats at the top of the page.
  function badge() {
    if (SHOT) return;
    if (!document.getElementById('demo-badge-css')) {
      const st = document.createElement('style');
      st.id = 'demo-badge-css';
      st.textContent = `#demo-badge{display:flex;justify-content:center;margin:0 0 10px;pointer-events:none}
        #demo-badge.float{position:fixed;z-index:30;top:calc(8px + env(safe-area-inset-top));left:0;right:0;margin:0}
        #demo-badge .pill-demo{pointer-events:auto;display:inline-flex;align-items:center;gap:8px;padding:3px 4px 3px 12px;border-radius:999px;white-space:nowrap;
          font:500 12px/1.4 'Roboto Flex',system-ui,sans-serif;letter-spacing:.1px;color:var(--m-on-tertiary-container,#001E31);background:var(--m-tertiary-container,#CCE5FF)}
        #demo-badge b{font-weight:700}
        #demo-badge a{color:inherit;text-decoration:none;border-radius:999px;padding:2px 10px;background:color-mix(in srgb,currentColor 12%,transparent)}
        #demo-badge a:hover,#demo-badge a:focus-visible{background:color-mix(in srgb,currentColor 22%,transparent)}`;
      document.head.append(st);
    }
    let el = document.getElementById('demo-badge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'demo-badge';
      el.setAttribute('role', 'note');
      el.innerHTML = `<span class="pill-demo"><span><b>${L('Démo', 'Demo')}</b> · ${L('données fictives', 'sample data')}</span><a href="../">${L('← Le site', '← Website')}</a></span>`;
    }
    const bar = document.querySelector('.content > .topbar');
    if (bar) {
      if (bar.nextElementSibling !== el) { el.classList.remove('float'); bar.after(el); }
    } else if (el.parentNode !== document.body) { el.classList.add('float'); document.body.append(el); }
  }
  const watchBadge = () => { badge(); new MutationObserver(() => { const el = document.getElementById('demo-badge'); const bar = document.querySelector('.content > .topbar'); if (!el || (bar ? bar.nextElementSibling !== el : el.parentNode !== document.body)) badge(); }).observe(document.body, { childList: true, subtree: true }); };
  if (document.body) watchBadge(); else document.addEventListener('DOMContentLoaded', watchBadge);
})();
