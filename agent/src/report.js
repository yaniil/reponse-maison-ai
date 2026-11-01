// Bilan mensuel par restaurant, calculé sur TOUS les avis Google de la fiche (pas seulement ceux traités).
import * as core from '../../src/core/index.js';

export async function buildRestaurantReport({ gbp, resto, month, store }) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 2, 1)).toISOString(); // depuis le mois précédent (pour la tendance)
  const reviews = await gbp.listReviews(resto.location, { since: start });
  const entries = reviews.map((rv) => {
    const a = core.analyzeReview({ text: rv.text, stars: rv.stars, author: rv.author }, resto.profile);
    return {
      createdAt: rv.createTime, review: { text: rv.text, stars: rv.stars },
      status: rv.reply ? 'publie' : 'brouillon', complaints: a.complaints, praise: a.praise,
      dishes: a.dishes.map((d) => d.text), alerts: a.alerts,
      replyDelayH: rv.reply && rv.reply.updateTime ? (Date.parse(rv.reply.updateTime) - Date.parse(rv.createTime)) / 3600000 : null,
    };
  });
  const rep = core.buildMonthlyReport(entries, month);
  const delays = entries.filter((e) => core.monthKey(e.createdAt) === month && e.replyDelayH != null).map((e) => e.replyDelayH).sort((a, b) => a - b);
  rep.medianReplyHours = delays.length ? delays[Math.floor(delays.length / 2)] : null;
  rep.responseRate = rep.count ? rep.published / rep.count : null;
  const handled = store ? store.all().filter((r) => r.restaurantId === resto.id && r.publishedAt && core.monthKey(r.publishedAt) === month) : [];
  rep.handledByAgent = handled.length;
  return rep;
}

export function reportWhatsApp(rep, resto, operator) {
  let txt = core.reportText(rep, resto.profile, null);
  if (rep.medianReplyHours != null) txt += `\n• Délai de réponse médian : ${formatDelay(rep.medianReplyHours)}`;
  if (operator && (operator.prenom || operator.marque)) txt += '\n— ' + [operator.prenom, operator.marque].filter(Boolean).join(', ');
  return txt;
}

function formatDelay(h) {
  if (h < 1) return 'moins d\'une heure';
  if (h < 48) return Math.round(h) + ' h';
  return Math.round(h / 24) + ' jours';
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Page HTML imprimable (à envoyer en PDF ou en lien au restaurateur). */
export function reportHtml(rep, resto, operator) {
  const max = Math.max(1, ...Object.values(rep.distribution));
  const avg = rep.avg == null ? '–' : rep.avg.toFixed(1).replace('.', ',');
  const trend = rep.prevAvg != null && rep.avg != null ? (rep.avg - rep.prevAvg >= 0.05 ? '▲' : rep.avg - rep.prevAvg <= -0.05 ? '▼' : '=') : '';
  const rows = [5, 4, 3, 2, 1].map((k) => `<tr><th>${k}★</th><td><div class="bar"><span style="width:${(rep.distribution[k] / max) * 100}%"></span></div></td><td class="n">${rep.distribution[k]}</td></tr>`).join('');
  const list = (items) => items.length ? `<ul>${items.map((i) => `<li>${esc(i.label)} <b>(${i.count})</b></li>`).join('')}</ul>` : '<p class="muted">Rien de récurrent.</p>';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bilan ${esc(core.deMois(rep.label))} · ${esc(resto.profile.nom)}</title>
<style>
:root{--ink:#15241d;--muted:#5a6a62;--line:#d5ddd7;--green:#1f5a43;--brass:#a4761a;--red:#b0381c;--bg:#fbfbf6}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 20px}
h1{font:400 28px/1.15 Georgia,serif;margin:0 0 4px} .sub{color:var(--muted);margin:0 0 24px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.kpi{border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff}.kpi b{display:block;font:400 26px Georgia,serif}.kpi span{color:var(--muted);font-size:13px}
section{border:1px solid var(--line);border-radius:12px;padding:16px;background:#fff;margin-bottom:14px}
h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
table{width:100%;border-collapse:collapse}th{width:40px;text-align:left;font-weight:600}td.n{width:30px;text-align:right}
.bar{height:10px;background:#eef1ee;border-radius:5px;overflow:hidden}.bar span{display:block;height:100%;background:var(--brass)}
tr:nth-child(4) .bar span,tr:nth-child(5) .bar span{background:var(--red)}
ul{margin:0;padding-left:18px}.muted{color:var(--muted)} footer{color:var(--muted);font-size:13px;margin-top:20px}
@media (max-width:560px){.kpis{grid-template-columns:repeat(2,1fr)}}
</style></head><body><main>
<h1>Bilan ${esc(core.deMois(rep.label))}</h1><p class="sub">${esc(resto.profile.nom)} · avis Google</p>
<div class="kpis"><div class="kpi"><b>${rep.count}</b><span>avis reçus${rep.prevCount ? ` (${rep.prevCount} le mois d'avant)` : ''}</span></div>
<div class="kpi"><b>${avg} ${trend}</b><span>note moyenne du mois</span></div>
<div class="kpi"><b>${rep.responseRate == null ? '–' : Math.round(rep.responseRate * 100) + ' %'}</b><span>avis avec réponse</span></div>
<div class="kpi"><b>${rep.medianReplyHours == null ? '–' : formatDelay(rep.medianReplyHours)}</b><span>délai de réponse médian</span></div></div>
<section><h2>Répartition des notes</h2><table>${rows}</table></section>
<section><h2>Ce qui revient dans les critiques</h2>${list(rep.complaints)}</section>
<section><h2>Ce que les clients aiment</h2>${list(rep.praise.concat(rep.dishes))}</section>
<footer>${rep.alerts ? `${rep.alerts} avis sensible(s) signalé(s) ce mois-ci. ` : ''}Préparé par ${esc([operator && operator.prenom, operator && operator.marque].filter(Boolean).join(', ') || 'votre gestionnaire d\'avis')}.</footer>
</main></body></html>`;
}
