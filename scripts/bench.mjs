// Banc d'essai : passe les avis de test dans le moteur démo pour relecture humaine.
// Usage : node scripts/bench.mjs [--variants]   → écrit docs/RESULTATS_TESTS_DEMO.md
import { writeFileSync } from 'node:fs';
import { generateDemoReply, bodySentenceCount } from '../src/core/demo-engine.js';
import { SAMPLE_PROFILES as PROFILES, SAMPLE_REVIEWS as REVIEWS } from "../src/core/samples.js";
import { categoryLabel } from '../src/core/analyze.js';

const withVariants = process.argv.includes('--variants');
const lines = ['# Banc d\'essai — moteur démo (hors-ligne)', ''];
for (const r of REVIEWS) {
  const p = PROFILES[r.profile];
  const out = generateDemoReply({ review: r, profile: p });
  lines.push(`## ${r.id} — ${r.kind}`, `**${p.nom}** (${p.ton}, ${p.tutoiement ? 'tu' : 'vous'}) · ${r.stars ? r.stars + '★' : 'note auto'} · ${r.author}`, '',
    `> ${r.text || '(aucun texte)'}`, '', '**Réponse** (' + categoryLabel(out.category) + ', ' + bodySentenceCount(out.text) + ' phrases) :', '', out.text.split('\n').map((l) => l).join('  \n'), '');
  if (out.alerts.length) lines.push('**Alertes** : ' + out.alerts.map((a) => `[${a.level}] ${a.message}`).join(' / '), '');
  if (withVariants) {
    const prev = out.templateIds;
    const regen = generateDemoReply({ review: r, profile: p, attempt: 1, avoidIds: prev });
    const short = generateDemoReply({ review: r, profile: p, variant: 'shorter' });
    const warm = generateDemoReply({ review: r, profile: p, variant: 'warmer' });
    lines.push('*Régénérer* : ' + regen.text.replace(/\n/g, ' — '), '', '*Plus court* : ' + short.text.replace(/\n/g, ' — '), '', '*Plus chaleureux* : ' + warm.text.replace(/\n/g, ' — '), '');
  }
}
const md = lines.join('\n');
writeFileSync(new URL('../docs/RESULTATS_TESTS_DEMO.md', import.meta.url), md);
console.log(md);
