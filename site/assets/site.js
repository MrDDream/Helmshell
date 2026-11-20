/* Helmshell landing page: language (EN/FR), theme (auto/light/dark), screenshot tabs, copy buttons.
   No dependency, no network request. The inline script in <head> already applied the language and the
   theme before the first paint; this file wires the controls and keeps everything in sync. */
(function () {
  'use strict';

  var root = document.documentElement;
  var KEY_LANG = 'helmshell-site.lang';
  var KEY_THEME = 'helmshell-site.theme';
  var REPO = 'https://github.com/MrDDream/Helmshell';
  var mqDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } }
  };

  var META = {
    en: {
      title: 'Helmshell · Drive your Linux server from any browser',
      desc: 'Helmshell is a self-hosted web console to drive your Linux server from a browser or a phone: projects, Git, terminals, Claude Code and OpenAI Codex sessions in tmux, Coolify and Dokploy deployments.'
    },
    fr: {
      title: 'Helmshell · Pilote ton serveur Linux depuis n’importe quel navigateur',
      desc: 'Helmshell est une console web auto-hébergée pour piloter ton serveur Linux depuis le navigateur ou le téléphone : projets, Git, terminaux, sessions Claude Code et OpenAI Codex dans tmux, déploiements Coolify et Dokploy.'
    }
  };

  function lang() { return root.lang === 'fr' ? 'fr' : 'en'; }
  function themePref() { var p = root.getAttribute('data-theme-pref'); return p === 'light' || p === 'dark' ? p : 'auto'; }
  function effectiveTheme() {
    var p = themePref();
    if (p !== 'auto') return p;
    return mqDark && mqDark.matches ? 'dark' : 'light';
  }
  /* "English|Français" -> the part for the current language */
  function pick(pair) {
    var parts = String(pair).split('|');
    return lang() === 'fr' && parts.length > 1 ? parts[1] : parts[0];
  }
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }

  /* ------------------------------------------------------------------ language */
  function applyLang(l, persist) {
    root.lang = l;
    if (persist) {
      store.set(KEY_LANG, l);
      // An explicit ?lang= in the address wins over the saved choice: keep it in sync.
      try {
        var u = new URL(window.location.href);
        if (u.searchParams.has('lang')) { u.searchParams.set('lang', l); history.replaceState(null, '', u.toString()); }
      } catch (e) { /* old browser */ }
    }
    document.title = META[l].title;
    var d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute('content', META[l].desc);
    ['alt', 'title', 'aria-label'].forEach(function (attr) {
      each('[data-t-' + attr + ']', function (el) { el.setAttribute(attr, pick(el.getAttribute('data-t-' + attr))); });
    });
    // README links: English README on the repository page, French one in README.fr.md
    each('a[data-readme]', function (a) {
      var parts = a.getAttribute('data-readme').split('|');
      a.href = l === 'fr' ? REPO + '/blob/main/README.fr.md' + (parts[1] || '') : REPO + (parts[0] || '');
    });
    each('[data-set-lang]', function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === l)); });
    syncShotAlts();
    syncDemoLinks();
  }

  /* --------------------------------------------------------------------- theme */
  function applyTheme(pref, persist) {
    root.setAttribute('data-theme-pref', pref);
    var eff = effectiveTheme();
    root.setAttribute('data-theme', eff);
    if (persist) store.set(KEY_THEME, pref);
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', eff === 'dark' ? '#0A1520' : '#F6F9FC');
    each('[data-set-theme]', function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-theme') === pref)); });
    // <picture> sources: follow the system in auto mode, otherwise force the variant
    var media = pref === 'auto' ? '(prefers-color-scheme: dark)' : (eff === 'dark' ? 'all' : 'not all');
    each('source[data-shot-dark]', function (s) { s.setAttribute('media', media); });
    syncDemoLinks();
  }

  function syncDemoLinks() {
    var href = 'demo/?lang=' + lang() + '&theme=' + effectiveTheme();
    each('a[data-demo]', function (a) { a.setAttribute('href', href); });
  }

  /* --------------------------------------------------------------- screenshots */
  function setShot(img, name) {
    var pic = img.parentNode;
    var src = pic && pic.querySelector('source[data-shot-dark]');
    if (src) src.setAttribute('srcset', 'screens/' + name + '-dark.png');
    img.setAttribute('src', 'screens/' + name + '-light.png');
  }

  var shotImg = document.querySelector('img[data-shot]');
  var phoneImg = document.querySelector('img[data-mshot]');

  function syncShotAlts() {
    var t = document.querySelector('.shot-tabs [aria-selected="true"]');
    if (shotImg && t) shotImg.alt = pick(t.getAttribute('data-alt'));
    var m = document.querySelector('[data-mview][aria-pressed="true"]');
    if (phoneImg && m) phoneImg.alt = pick(m.getAttribute('data-alt'));
  }

  /* Accessible tabs (roving tabindex, arrows / Home / End). onSelect(tab) does the actual switch. */
  function tabs(list, onSelect) {
    if (!list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      items.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
      });
      if (focus) tab.focus();
      onSelect(tab);
    }
    items.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t, false); });
      t.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = items[(i + 1) % items.length];
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = items[(i - 1 + items.length) % items.length];
        else if (e.key === 'Home') n = items[0];
        else if (e.key === 'End') n = items[items.length - 1];
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
  }

  tabs(document.querySelector('.shot-tabs'), function (tab) {
    var view = tab.getAttribute('data-view');
    var panel = document.getElementById('shot-panel');
    if (panel) panel.setAttribute('aria-labelledby', tab.id);
    if (shotImg) {
      shotImg.classList.remove('in');
      setShot(shotImg, view);
      // force a reflow so the fade-in restarts
      void shotImg.offsetWidth;
      shotImg.classList.add('in');
    }
    each('[data-caption]', function (c) { c.hidden = c.getAttribute('data-caption') !== view; });
    syncShotAlts();
  });

  tabs(document.querySelector('.inst-tabs'), function (tab) {
    each('.ipanel', function (p) { p.hidden = p.id !== tab.getAttribute('aria-controls'); });
  });

  each('[data-mview]', function (b) {
    b.addEventListener('click', function () {
      each('[data-mview]', function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      if (phoneImg) setShot(phoneImg, b.getAttribute('data-mview'));
      syncShotAlts();
    });
  });

  /* ---------------------------------------------------------------------- copy */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  each('.code .copy', function (btn) {
    btn.addEventListener('click', function () {
      var pres = btn.parentNode.querySelectorAll('pre');
      var pre = null;
      for (var i = 0; i < pres.length; i++) { if (pres[i].offsetParent !== null) { pre = pres[i]; break; } }
      if (!pre) pre = pres[0];
      copyText(pre.textContent.replace(/\s+$/, '')).then(function () {
        btn.classList.add('done');
        clearTimeout(btn._t);
        btn._t = setTimeout(function () { btn.classList.remove('done'); }, 1800);
      }, function () { /* clipboard refused: the text stays selectable */ });
    });
  });

  /* ----------------------------------------------------------------- controls */
  each('[data-set-lang]', function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-set-lang'), true); });
  });
  each('[data-set-theme]', function (b) {
    b.addEventListener('click', function () { applyTheme(b.getAttribute('data-set-theme'), true); });
  });
  if (mqDark) {
    var onSystem = function () { if (themePref() === 'auto') applyTheme('auto', false); };
    if (mqDark.addEventListener) mqDark.addEventListener('change', onSystem);
    else if (mqDark.addListener) mqDark.addListener(onSystem);
  }
  // Another tab changed the choice
  window.addEventListener('storage', function (e) {
    if (e.key === KEY_LANG && (e.newValue === 'en' || e.newValue === 'fr')) applyLang(e.newValue, false);
    if (e.key === KEY_THEME && (e.newValue === 'auto' || e.newValue === 'light' || e.newValue === 'dark')) applyTheme(e.newValue, false);
  });

  applyLang(lang(), false);
  applyTheme(themePref(), false);
  if (shotImg) shotImg.classList.add('in');
})();
