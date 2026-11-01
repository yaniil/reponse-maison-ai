// Messages WhatsApp (liens wa.me pré-remplis) pour le patron, le prospect et le bilan mensuel.
import { starsLabel, clampText } from './text.js';

/** « 06 12 34 56 78 », « +33 6… », « 0033 6… » → « 33612345678 ». Renvoie '' si invalide. */
export function normalizePhone(input) {
  let d = String(input || '').trim();
  if (!d) return '';
  const plus = d.startsWith('+');
  d = d.replace(/[^\d]/g, '');
  if (!d) return '';
  if (!plus && d.startsWith('00')) d = d.slice(2);
  else if (!plus && d.length === 10 && d.startsWith('0')) d = '33' + d.slice(1);
  if (d.startsWith('330') && d.length === 12) d = '33' + d.slice(3); // « +33 0 6… »
  if (d.length < 8 || d.length > 15) return '';
  return d;
}

export function waLink(phone, text) {
  const n = normalizePhone(phone);
  const q = 'text=' + encodeURIComponent(String(text || ''));
  return n ? `https://wa.me/${n}?${q}` : `https://wa.me/?${q}`;
}

function vous(profile) {
  return !(profile && profile.tutoiePatron);
}

/** Message de validation envoyé au patron : l'avis, la réponse proposée, les alertes. */
export function ownerMessage({ profile, review, reply, alerts, me }) {
  const p = profile || {};
  const v = vous(p);
  const hello = p.prenomPatron ? `Bonjour ${p.prenomPatron} 👋` : 'Bonjour 👋';
  const who = review && review.author ? ` de ${String(review.author).trim()}` : '';
  const stars = review && review.stars ? starsLabel(review.stars) : 'sans note';
  const lines = [
    hello,
    `Nouvel avis Google${who} (${stars}) :`,
    `« ${clampText((review && review.text) || '(pas de texte)', 600)} »`,
    '',
    '✍️ Réponse proposée :',
    String(reply || '').trim(),
  ];
  const important = (alerts || []).filter((a) => a.level === 'rouge' || a.level === 'orange');
  if (important.length) {
    lines.push('', '⚠️ À savoir :');
    for (const a of important.slice(0, 3)) lines.push('• ' + a.message);
  }
  lines.push('', v
    ? '👉 Répondez « OK » et je la publie, ou dites-moi ce que vous voulez changer.'
    : '👉 Réponds « OK » et je la publie, ou dis-moi ce que tu veux changer.');
  const sig = [me && me.prenom, me && me.marque].filter(Boolean).join(', ');
  if (sig) lines.push('— ' + sig);
  return lines.join('\n');
}

/** Message au prospect après la démo : la réponse proposée + un mot. */
export function prospectMessage({ restaurant, review, reply, me }) {
  const m = me || {};
  const lines = [
    'Bonjour,',
    `Comme promis, voici la réponse proposée pour votre avis Google${review && review.author ? ' de ' + review.author : ''} :`,
    '',
    String(reply || '').trim(),
    '',
    `Avec ${m.marque || 'mon service'}, chaque nouvel avis reçoit une réponse comme celle-ci : vous validez d'un « OK » sur WhatsApp, je publie. Premier mois offert, sans engagement.`,
  ];
  const sig = [m.prenom, m.telephone].filter(Boolean).join(' · ');
  if (sig) lines.push('', sig);
  return lines.join('\n');
}
