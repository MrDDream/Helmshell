// Applique le thème et la couleur source avant l'affichage, pour éviter un flash de couleurs.
(function () {
  var t = 'auto', s = 'sarcelle', st = 'material';
  try { t = localStorage.getItem('helmshell.theme') || 'auto'; s = localStorage.getItem('helmshell.seed') || 'sarcelle'; st = localStorage.getItem('helmshell.style') || 'material'; } catch (e) { /* stockage indisponible */ }
  if (t === 'auto') t = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  document.documentElement.dataset.seed = s;
  // Langue de l'interface (anglais par défaut, voir i18n.js)
  var lang = 'en';
  try { lang = localStorage.getItem('helmshell.lang') === 'fr' ? 'fr' : 'en'; } catch (e) { /* défaut */ }
  document.documentElement.lang = lang;
  // Style d'apparence (et sa police, chargée seulement s'il est choisi)
  var fonts = { epure: 'Inter:wght@400;500;600;700', doux: 'Nunito:wght@400;500;600;700;800' };
  if (st && st !== 'material') {
    document.documentElement.dataset.style = st;
    if (fonts[st]) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.setAttribute('data-font', st);
      l.href = 'https://fonts.googleapis.com/css2?family=' + fonts[st] + '&display=swap';
      document.head.appendChild(l);
    }
  }
})();
