import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDemoReply, analyzeReview, splitSentences, SAMPLE_PROFILES, SAMPLE_REVIEWS, seededRandom } from '../src/core/index.js';

const FRAGMENTS = [
  'Top', 'Bof.', '!!!', '😡😡😡', '🔥🔥', '<script>alert(1)</script>', 'NUL NUL NUL', 'pizza', 'les frites étaient froides',
  'merci à Julie', 'service rapide', 'trop cher', 'jamais venu', 'je vais porter plainte', '45 min', 'accueil glacial',
  'Amazing food!', 'The waiter was rude', 'Muy bueno', 'Sehr lecker', '(Translated by Google) Super', 'a'.repeat(300),
  'Le tiramisu maison !!!', '1h30 pour une pizza', 'cafard dans la salle', 'anniversaire', 'en famille', "c'est de la merde",
  '', ' ', '\n\n', '★★★★★', 'Réservé à 20h, table pas prête', 'livré froid par Uber Eats', 'rapport qualité-prix imbattable',
];

test('robustesse : 400 avis aléatoires (vides, très longs, emoji, HTML, langues mélangées) → jamais d\'erreur', () => {
  const rng = seededRandom(42);
  const profiles = Object.values(SAMPLE_PROFILES);
  for (let i = 0; i < 400; i++) {
    const n = Math.floor(rng() * 6);
    let text = Array.from({ length: n }, () => FRAGMENTS[Math.floor(rng() * FRAGMENTS.length)]).join(rng() < 0.5 ? ' ' : '. ');
    if (rng() < 0.05) text = SAMPLE_REVIEWS[Math.floor(rng() * SAMPLE_REVIEWS.length)].text.repeat(30);
    const stars = rng() < 0.2 ? null : 1 + Math.floor(rng() * 5);
    const p = profiles[Math.floor(rng() * profiles.length)];
    if (!text.trim() && !stars) continue;
    const variant = ['normal', 'shorter', 'warmer'][Math.floor(rng() * 3)];
    const out = generateDemoReply({ review: { text, stars, author: rng() < 0.5 ? 'Jean Dupont' : '' }, profile: p, variant, attempt: i % 3 });
    assert.ok(out.text && out.text.length > 20, 'réponse vide pour : ' + text);
    const body = out.text.split('\n')[0];
    const nb = splitSentences(body.replace(/«[^»]*»/g, 'X')).length;
    assert.ok(nb >= 1 && nb <= 6, `${nb} phrases : ${out.text}`);
    assert.ok(!/<script/i.test(out.text), 'HTML recopié dans la réponse');
    assert.ok(!/undefined|null|NaN|%[A-Z_]+%|\{[^}]*\|/.test(out.text), 'gabarit mal rempli : ' + out.text);
    const a = analyzeReview({ text, stars }, p);
    assert.ok(a.category);
  }
});
