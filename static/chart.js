// Petit graphique en aire (SVG) pour l'historique CPU / mémoire sur 24 h.
import { esc } from './load.js';
import { t, LOCALE, fmtPct } from './i18n.js';

/**
 * points : [[t, valeur], …] (t en secondes, valeur en %)
 * Renvoie le SVG. Les couleurs viennent du thème (currentColor + variables CSS).
 */
export function areaChart(points, { label = '', height = 180, width = 600, gap = 300, caption = true, peaks = null, from = null, to = null } = {}) {
  const W = Math.max(240, Math.round(width)), H = height, top = 10, bottom = 26, left = 34, right = 10;
  if (points.length < 2) {
    return `<div class="empty small">${t('Pas encore assez de mesures : une par minute, l’historique se remplit tout seul.')}</div>`;
  }
  // Période affichée : celle demandée (la partie sans mesure reste vide), sinon celle des mesures
  const t0 = from ?? points[0][0], t1 = to ?? points[points.length - 1][0];
  const span = Math.max(1, t1 - t0);
  const x = (t) => left + ((t - t0) / span) * (W - left - right);
  const y = (v) => top + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - top - bottom);
  // Trous (serveur arrêté) : on coupe la courbe si plus de 5 minutes sans mesure
  const segs = [];
  let cur = [];
  points.forEach((p, i) => {
    if (i && p[0] - points[i - 1][0] > gap) { segs.push(cur); cur = []; }
    cur.push(p);
  });
  segs.push(cur);
  const paths = segs.filter((s) => s.length > 1).map((s) => {
    const line = s.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    const area = `${line}L${x(s[s.length - 1][0]).toFixed(1)},${y(0)}L${x(s[0][0]).toFixed(1)},${y(0)}Z`;
    return `<path d="${area}" class="ch-area"/><path d="${line}" class="ch-line"/>`;
  }).join('');
  // Pics de chaque intervalle (facultatif) : ligne fine en pointillés au-dessus de la moyenne
  const peakPath = peaks && peaks.length > 1
    ? `<path d="${peaks.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')}" class="ch-peak"/>` : '';
  const grid = [0, 50, 100].map((v) => `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}" class="ch-grid"/><text x="${left - 6}" y="${y(v) + 4}" text-anchor="end" class="ch-txt">${v}</text>`).join('');
  const ticks = [];
  const days = span > 2 * 86400;
  // Pas des graduations : le plus fin qui laisse environ 90 px entre deux libellés
  const room = Math.max(2, Math.floor((W - left - right) / 90));
  const step = [900, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86400, 2 * 86400, 7 * 86400]
    .find((st) => (!days || st >= 86400) && span / st <= room) || 7 * 86400;
  const tz = new Date().getTimezoneOffset() * 60; // graduations alignées sur l'heure locale
  for (let t = Math.ceil((t0 - tz) / step) * step + tz; t <= t1; t += step) {
    const d = new Date(t * 1000);
    const txt = days ? d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' }) : d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
    ticks.push(`<text x="${x(t)}" y="${H - 6}" text-anchor="middle" class="ch-txt">${txt}</text>`);
  }
  const vals = points.map((p) => p[1]);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const max = Math.max(...vals);
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${t('{label} : moyenne {avg}, maximum {max}', { label: esc(label), avg: fmtPct(avg), max: fmtPct(max) })}">${grid}${peakPath}${paths}${ticks.join('')}</svg>
    ${caption ? `<figcaption class="small muted">${t('Moyenne {avg} · pic {max}', { avg: fmtPct(avg), max: fmtPct(max) })}</figcaption>` : ''}</figure>`;
}
