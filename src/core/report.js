// Bilan mensuel par restaurant : volume, note moyenne, plaintes récurrentes, points forts.
import { ASPECT_LABELS } from './analyze.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function monthKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key) {
  const [y, m] = String(key).split('-').map(Number);
  return `${MOIS[(m || 1) - 1]} ${y}`;
}

export function previousMonth(key) {
  const [y, m] = String(key).split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** « de septembre 2026 », « d'octobre 2026 », « d'août 2026 » */
export function deMois(label) {
  return (/^[aeiouyàâéèêîôû]/i.test(label) ? "d'" : 'de ') + label;
}

function fr1(n) {
  return n == null || Number.isNaN(n) ? '–' : n.toFixed(1).replace('.', ',');
}

/**
 * @param {Array<{createdAt:number|string, review:{stars?:number,text?:string}, status?:string, complaints?:string[], praise?:string[], dishes?:string[], alerts?:Array}>} entries
 * @param {string} month  « 2026-09 »
 */
export function buildMonthlyReport(entries, month) {
  const inMonth = (e, key) => monthKey(e.createdAt) === key;
  const cur = (entries || []).filter((e) => !e.deleted && inMonth(e, month));
  const prev = (entries || []).filter((e) => !e.deleted && inMonth(e, previousMonth(month)));
  const rated = cur.filter((e) => e.review && e.review.stars);
  const avg = rated.length ? rated.reduce((s, e) => s + Number(e.review.stars), 0) / rated.length : null;
  const prevRated = prev.filter((e) => e.review && e.review.stars);
  const prevAvg = prevRated.length ? prevRated.reduce((s, e) => s + Number(e.review.stars), 0) / prevRated.length : null;
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const e of rated) distribution[Math.round(e.review.stars)]++;
  const count = (key) => {
    const m = {};
    for (const e of cur) for (const a of e[key] || []) m[a] = (m[a] || 0) + 1;
    return Object.entries(m).sort((x, y) => y[1] - x[1]);
  };
  const complaints = count('complaints').map(([k, n]) => ({ key: k, label: ASPECT_LABELS.neg[k] || k, count: n }));
  const praise = count('praise').map(([k, n]) => ({ key: k, label: ASPECT_LABELS.pos[k] || k, count: n }));
  // les plats sont regroupés par mot principal : « pâtes » et « pâtes à la truffe » comptent ensemble
  const groups = {};
  for (const e of cur) {
    if (!e.review || (e.review.stars || 0) < 4) continue;
    for (const d of e.dishes || []) {
      const label = String(d).toLowerCase().replace(/^(le|la|les|l'|un|une|des|du|notre|nos|mon|ma|mes)\s+/, '');
      const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[\s-]/)[0];
      const g = groups[key] || (groups[key] = { label, count: 0 });
      g.count++;
      if (label.length < g.label.length) g.label = label;
    }
  }
  const dishes = Object.values(groups).sort((a, b) => b.count - a.count).slice(0, 3);
  const published = cur.filter((e) => e.status === 'publie').length;
  const pending = cur.filter((e) => e.status !== 'publie').length;
  const alerts = cur.filter((e) => (e.alerts || []).some((a) => a.level === 'rouge')).length;
  return {
    month, label: monthLabel(month), count: cur.length, prevCount: prev.length,
    avg, prevAvg, distribution, complaints: complaints.slice(0, 4), praise: praise.slice(0, 4), dishes,
    published, pending, alerts,
  };
}

/** Texte prêt à envoyer au patron (WhatsApp). */
export function reportText(report, profile, me) {
  const r = report;
  const nom = (profile && profile.nom) || '';
  const lines = [`📊 Bilan ${deMois(r.label)}${nom ? ' · ' + nom : ''}`];
  if (!r.count) {
    lines.push('Aucun nouvel avis ce mois-ci.');
    return lines.join('\n');
  }
  let trend = '';
  if (r.prevAvg != null && r.avg != null) {
    const d = r.avg - r.prevAvg;
    trend = Math.abs(d) < 0.05 ? ' (stable)' : d > 0 ? ` (▲ +${fr1(d)})` : ` (▼ ${fr1(d)})`;
  }
  lines.push(`• ${r.count} avis${r.prevCount ? ` (${r.prevCount} le mois d'avant)` : ''} · note moyenne ${fr1(r.avg)}/5${trend}`);
  const dist = [5, 4, 3, 2, 1].filter((k) => r.distribution[k]).map((k) => `${k}★ ×${r.distribution[k]}`).join(' · ');
  if (dist) lines.push('• Répartition : ' + dist);
  if (r.complaints.length) lines.push('• Ce qui revient dans les critiques : ' + r.complaints.map((c) => `${c.label} (${c.count})`).join(', '));
  else lines.push('• Aucune plainte récurrente 👏');
  const good = r.praise.slice(0, 3).map((p) => `${p.label} (${p.count})`).concat(r.dishes.map((d) => `${d.label} (${d.count})`));
  if (good.length) lines.push('• Ce que les clients adorent : ' + good.slice(0, 4).join(', '));
  lines.push(`• Réponses publiées : ${r.published}/${r.count}${r.pending ? ` · ${r.pending} en attente` : ''}`);
  if (r.alerts) lines.push(`• ${r.alerts} avis sensible${r.alerts > 1 ? 's' : ''} signalé${r.alerts > 1 ? 's' : ''} ce mois-ci`);
  if (me && (me.prenom || me.marque)) lines.push('— ' + [me.prenom, me.marque].filter(Boolean).join(', '));
  return lines.join('\n');
}
