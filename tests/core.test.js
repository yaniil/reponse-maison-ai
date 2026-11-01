import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeReview, generateDemoReply, buildPrompt, parseModelOutput, visiblePart, ensureSignature, checkReply,
  resolveProvider, generateReply, normalizePhone, waLink, ownerMessage, prospectMessage, buildMonthlyReport, reportText,
  fold, splitSentences, similarity, FOOD_FR, defaultSignature, deRestaurant,
} from '../src/core/index.js';
import { PROFILES, REVIEWS } from './fixtures/data.js';

const byId = Object.fromEntries(REVIEWS.map((r) => [r.id, r]));
const body = (t) => String(t).split('\n')[0];
const countSentences = (t) => splitSentences(body(t).replace(/«[^»]*»/g, 'X')).length;

// ---------------------------------------------------------------- analyse
test('analyse : catégories attendues sur les 23 avis de test', () => {
  const expected = {
    'pos-detail': 'positif', 'pos-tres-court': 'positif', 'pos-reserve': 'positif_reserve', mitige: 'mitige',
    'neg-attente': 'negatif', 'neg-accueil': 'negatif', 'agressif-majuscules': 'negatif', 'abusif-insultes': 'abusif',
    'vide-1etoile': 'suspect', 'faux-concurrent': 'suspect', 'en-positif': 'positif', 'en-negatif': 'negatif',
    famille: 'positif_reserve', habitue: 'positif', sante: 'negatif', 'court-mitige': 'mitige', bof: 'negatif',
    livraison: 'positif', 'tutoiement-burger': 'positif_reserve', 'en-abusif': 'abusif', espagnol: 'positif',
    'sujet-evite': 'mitige', 'sans-note': 'positif',
  };
  for (const r of REVIEWS) {
    const a = analyzeReview(r, PROFILES[r.profile]);
    assert.equal(a.category, expected[r.id], `${r.id} → ${a.category}`);
  }
});

test('analyse : alertes pour le patron', () => {
  const codes = (id) => analyzeReview(byId[id], PROFILES[byId[id].profile]).alerts.map((a) => a.code);
  assert.ok(codes('abusif-insultes').includes('insultes'));
  assert.ok(codes('abusif-insultes').includes('menace'));
  assert.ok(codes('vide-1etoile').includes('faux'));
  assert.ok(codes('faux-concurrent').includes('faux'));
  assert.ok(codes('sante').includes('sante'));
  assert.ok(codes('agressif-majuscules').includes('agressif'));
  assert.ok(codes('sujet-evite').includes('sujet_evite'));
  assert.ok(codes('en-abusif').includes('insultes'));
  assert.deepEqual(codes('pos-detail'), []);
});

test('analyse : détails repris (plats, prénoms, durées, occasion, langue)', () => {
  const a = analyzeReview(byId['pos-detail'], PROFILES.marco);
  assert.equal(a.dishes[0].text, 'pâtes à la truffe');
  assert.equal(a.dishes[0].plural, true);
  assert.equal(a.staff[0].name, 'Julie');
  assert.equal(a.author, 'Thomas');
  assert.equal(a.occasion.label, 'cet anniversaire');
  assert.equal(analyzeReview(byId['neg-attente'], PROFILES.marco).durations[0], '45 minutes');
  assert.equal(analyzeReview(byId['agressif-majuscules'], PROFILES.marco).durations[0], '1h30');
  assert.equal(analyzeReview(byId['en-positif'], PROFILES.bistrot).lang, 'en');
  assert.equal(analyzeReview(byId.espagnol, PROFILES.marco).lang, 'es');
  assert.equal(analyzeReview(byId['abusif-insultes'], PROFILES.smash).author, '', 'un pseudo n\'est pas un prénom');
  assert.equal(analyzeReview(byId['neg-accueil'], PROFILES.bistrot).willReturn, false, '« je ne reviendrai pas »');
  assert.equal(analyzeReview(byId['sans-note'], PROFILES.bistrot).stars, 5, 'note estimée');
});

// ---------------------------------------------------------------- règles de rédaction (moteur démo)
const CLICHES = ['votre satisfaction est notre priorite', 'agreable moment', "n'hesitez pas a revenir nous voir",
  'prenons bonne note', 'experience culinaire', 'dans notre etablissement', 'gene occasionnee', 'mettons tout en oeuvre'];
const GENERIC_FOOD = new Set(['plat', 'plats', 'menu', 'assiette', 'assiettes', 'repas', 'cuisine', 'carte', 'boisson', 'boissons']);

function checkRules(r, out, label) {
  const p = PROFILES[r.profile];
  const a = out.analysis;
  const text = out.text;
  const b = fold(body(text));
  const n = countSentences(text);
  assert.ok(n >= 2 && n <= 5, `${label} : ${n} phrases → ${text}`);
  // signature
  const last = text.split('\n').pop();
  if (a.lang === 'fr') assert.equal(last, p.signature, `${label} : signature`);
  else assert.ok(last.length > 3 && last !== p.signature || /Marco/.test(last), `${label} : signature traduite (${last})`);
  // aucune invention de plat
  for (const { term, weight } of (a.lang === 'fr' ? FOOD_FR : [])) {
    if (weight < 2 || GENERIC_FOOD.has(term)) continue;
    const inReply = b.indexOf(term) !== -1 && new RegExp('(^|[^a-z])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(b);
    if (inReply) assert.ok(fold(r.text).indexOf(term) !== -1 || fold(p.infos).indexOf(term) !== -1, `${label} : plat inventé « ${term} »`);
  }
  // tutoiement / vouvoiement cohérents (réponses en français)
  if (a.lang === 'fr') {
    // \b de JavaScript ignore les lettres accentuées : on teste sur le texte « plié »
    const fb = fold(body(text).replace(/«[^»]*»/g, ''));
    if (p.tutoiement) assert.ok(!/\b(vous|votre|vos|votre)\b/.test(fb), `${label} : vouvoiement dans un profil tutoiement → ${text}`);
    else assert.ok(!/\b(tu|ton|ta|tes|toi|tien|t'as)\b/.test(fb), `${label} : tutoiement dans un profil vouvoiement → ${text}`);
  }
  // pas de formules creuses
  for (const c of CLICHES) assert.ok(b.indexOf(c) === -1, `${label} : cliché « ${c} »`);
  // ton sobre : aucun point d'exclamation hors citation
  if (p.ton === 'sobre' && a.lang === 'fr' && out.variant !== 'warmer') assert.ok(!/!/.test(body(text).replace(/«[^»]*»/g, '')), `${label} : « ! » en ton sobre`);
  // jamais de geste commercial
  assert.ok(!/(offert|gratuit|remise|reduction|code promo|% )/.test(b), `${label} : geste commercial`);
  // les insultes ne sont jamais reprises
  assert.ok(!/(escroc|voleur|merde|thieves|scam)/.test(b), `${label} : insulte reprise`);
  // pas de prénom d'équipe dans une réponse négative
  if ((a.stars || 3) <= 2) for (const s of a.staff) assert.ok(b.indexOf(fold(s.name)) === -1, `${label} : prénom ${s.name} cité dans un avis négatif`);
  // sujets à éviter
  const avoid = String(p.aEviter || '').split(/[,;\n]+/).map((x) => fold(x)).flatMap((x) => x.split(/\s+/)).filter((w) => w.length >= 4);
  for (const w of avoid) assert.ok(b.indexOf(w) === -1, `${label} : sujet à éviter « ${w} » abordé`);
  // anglais → réponse en anglais
  if (a.lang === 'en') assert.ok(/\b(we|thank|thanks|our)\b/i.test(body(text)), `${label} : réponse pas en anglais`);
  // typographie propre
  assert.ok(!/ {2,}| ,|\.\.(?!\.)|\s\./.test(body(text).replace(/ /g, ' ').replace(/ ([!?;:»])/g, '$1').replace(/« /g, '«')), `${label} : typographie → ${text}`);
}

test('moteur démo : règles de rédaction respectées sur tous les avis (normal, régénérer, plus court, plus chaleureux)', () => {
  for (const r of REVIEWS) {
    const p = PROFILES[r.profile];
    const normal = generateDemoReply({ review: r, profile: p });
    checkRules(r, normal, r.id + '/normal');
    const regen = generateDemoReply({ review: r, profile: p, attempt: 1, avoidIds: normal.templateIds });
    checkRules(r, regen, r.id + '/régénérer');
    const short = generateDemoReply({ review: r, profile: p, variant: 'shorter' });
    checkRules(r, short, r.id + '/plus court');
    assert.ok(countSentences(short.text) <= 3, `${r.id} : « plus court » a ${countSentences(short.text)} phrases`);
    const warm = { ...generateDemoReply({ review: r, profile: p, variant: 'warmer' }), variant: 'warmer' };
    checkRules(r, warm, r.id + '/plus chaleureux');
  }
});

test('moteur démo : un détail précis de l\'avis est repris', () => {
  const skip = new Set(['abusif-insultes', 'vide-1etoile', 'faux-concurrent', 'en-abusif', 'espagnol']);
  for (const r of REVIEWS) {
    if (skip.has(r.id)) continue;
    const p = PROFILES[r.profile];
    const out = generateDemoReply({ review: r, profile: p });
    const a = out.analysis;
    const b = fold(body(out.text));
    const candidates = [
      ...a.dishes.map((d) => fold(d.head)), ...a.staff.map((s) => fold(s.name)), ...a.durations.map(fold),
      a.quote && fold(a.quote.replace(/[.!\s]+$/, '')), a.occasion && fold(a.occasion.label),
      a.regular && 'fidel', a.delivery && 'commande', a.terrace && 'terrasse',
      ...a.praise.map((x) => ({ accueil: 'accueil', service: 'service', cuisine: 'cuisine', cadre: 'cadre', rapidite: 'rapidit', portions: 'assiettes', enfants: 'enfants', prix: 'qualite-prix' }[x])),
      ...a.complaints.map((x) => ({ attente: 'attente', accueil: 'accueil', bruit: 'bruit', portions: 'portions', sante: 'malade', temperature: 'froid', cuisson: 'cuisson', prix: 'prix' }[x])),
      a.timeOfDay === 'midi' && 'dejeuner', a.isShort && fold(r.text).replace(/[.!\s]+$/, ''),
      // ou un mot marquant de l'avis (racine de 6 lettres), ex. « dérangeait » → « déranger »
      ...fold(r.text).split(/[^a-z']+/).filter((w) => w.length >= 7 && !['restaurant', 'vraiment', 'toujours', 'pourtant', 'service'].includes(w)).map((w) => w.slice(0, 6)),
    ].filter(Boolean);
    assert.ok(candidates.some((c) => b.indexOf(c) !== -1), `${r.id} : aucun détail repris → ${out.text}`);
  }
});

test('moteur démo : pas de répétition d\'un avis à l\'autre pour un même restaurant', () => {
  const p = PROFILES.marco;
  const texts = [
    'Super pizza margherita, pâte parfaite, on reviendra !', 'Le tiramisu maison est une tuerie, bravo.',
    'Excellent accueil et service rapide, merci.', 'Très bonnes lasagnes, portion généreuse.',
    'Une soirée parfaite en terrasse avec des amis.', 'Les gnocchis au pesto étaient délicieux.',
    'Repas en famille au top, les enfants ont adoré.', 'Burrata incroyable et vin italien parfait.',
    'Accueil chaleureux de Marco, comme toujours.', 'Le risotto aux cèpes était divin !',
  ];
  const history = [];
  const outs = [];
  for (const [i, t] of texts.entries()) {
    const out = generateDemoReply({ review: { text: t, stars: 5, author: '' }, profile: p, avoidIds: history.slice(0, 5).flatMap((h) => h) });
    history.unshift(out.templateIds);
    outs.push(out.text);
    if (i > 0) assert.notEqual(splitSentences(body(out.text))[0], splitSentences(body(outs[i - 1]))[0], `même ouverture deux fois de suite : ${out.text}`);
  }
  let total = 0; let pairs = 0;
  for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) { total += similarity(body(outs[i]), body(outs[j])); pairs++; }
  assert.ok(total / pairs < 0.2, 'réponses trop semblables : ' + (total / pairs).toFixed(2));
  assert.equal(new Set(outs).size, outs.length, 'deux réponses identiques');
});

test('signature par défaut et article du restaurant', () => {
  assert.equal(deRestaurant('Le Bistrot du Marché'), 'du Bistrot du Marché');
  assert.equal(deRestaurant('La Table de Lucie'), 'de la Table de Lucie');
  assert.equal(deRestaurant('Les Halles'), 'des Halles');
  assert.equal(deRestaurant("L'Atelier"), "de l'Atelier");
  assert.equal(deRestaurant('Oh Sushi'), "d'Oh Sushi");
  assert.equal(defaultSignature({ nom: 'Chez Marco' }), "L'équipe de Chez Marco");
});

// ---------------------------------------------------------------- prompt du mode IA réel
test('prompt : contient la fiche, les règles, les réponses récentes et la consigne de variante', () => {
  const p = { ...PROFILES.smash };
  const r = byId['tutoiement-burger'];
  const a = analyzeReview(r, p);
  const prompt = buildPrompt({ review: r, profile: p, analysis: a, recentReplies: ['Hello Léo, merci pour ce message !\nLa team Big Smash'], variant: 'shorter', previous: 'Hello Hugo, ravis…' });
  for (const s of ['Big Smash', 'Tutoie toujours', 'La team Big Smash', 'contact@bigsmash.fr', "N'invente RIEN", '###', 'ALERTE']) assert.ok(prompt.system.includes(s), 'système : ' + s);
  for (const s of ['4/5', 'Hugo', 'musique un peu forte', 'Hello Léo', 'Raccourcis', 'Hello Hugo, ravis']) assert.ok(prompt.user.includes(s), 'utilisateur : ' + s);
  assert.ok(prompt.combined.startsWith(prompt.system));
  const sobre = buildPrompt({ review: byId.mitige, profile: PROFILES.bistrot, analysis: analyzeReview(byId.mitige, PROFILES.bistrot) });
  assert.ok(sobre.system.includes('aucun point d\'exclamation'));
  assert.ok(sobre.system.includes('Vouvoie toujours'));
  assert.ok(sobre.system.includes('les prix'), 'sujet à éviter');
  assert.ok(sobre.user.includes('Rédige la réponse.'));
});

test('lecture de la réponse IA : bloc alerte, guillemets, signature', () => {
  const raw = '« Bonjour Sophie, désolés pour ces 45 minutes d\'attente. Appelez-nous au 01 42 00 00 00.\nMarco et toute l\'équipe »\n###\nALERTE : client très remonté contre le service';
  const out = parseModelOutput(raw);
  assert.ok(out.reply.startsWith('Bonjour Sophie'));
  assert.ok(out.reply.endsWith("Marco et toute l'équipe"));
  assert.equal(out.alert, 'client très remonté contre le service');
  assert.equal(parseModelOutput('Merci !\nMarco\n###\nALERTE : aucune').alert, null);
  assert.equal(visiblePart('Bonjour, merci pour tout.\n##'), 'Bonjour, merci pour tout.');
  assert.equal(visiblePart('Bonjour.\n###\nALERTE'), 'Bonjour.');
  assert.equal(ensureSignature('Merci pour votre avis !', PROFILES.marco, 'fr'), "Merci pour votre avis !\nMarco et toute l'équipe");
  assert.equal(ensureSignature("Merci !\nMarco et toute l'équipe", PROFILES.marco, 'fr'), "Merci !\nMarco et toute l'équipe");
  assert.equal(ensureSignature('Thanks a lot!\nThe team at Chez Marco', PROFILES.marco, 'en'), 'Thanks a lot!\nThe team at Chez Marco');
});

test('contrôle de sécurité : geste commercial, sujet à éviter, prénom dans un avis négatif', () => {
  const a = analyzeReview({ text: 'Julie a été désagréable, accueil glacial.', stars: 1 }, PROFILES.marco);
  const alerts = checkReply('Désolés ! Pour nous excuser, le dessert vous sera offert. Julie sera recadrée. Les travaux seront finis.', PROFILES.marco, a);
  const codes = alerts.map((x) => x.code);
  assert.ok(codes.includes('geste_commercial'));
  assert.ok(codes.includes('sujet_evite_reponse'));
  assert.ok(codes.includes('personnel_cite'));
});

// ---------------------------------------------------------------- couche IA : choix du moteur et bascule
test('choix du moteur selon les réglages et l\'environnement', () => {
  assert.equal(resolveProvider({ provider: 'auto' }, { sampleAvailable: true }), 'claude');
  assert.equal(resolveProvider({ provider: 'auto', apiKey: 'sk-ant-api03-xxxxxxxxxxxx' }, {}), 'anthropic');
  assert.equal(resolveProvider({ provider: 'auto' }, {}), 'demo');
  assert.equal(resolveProvider({ provider: 'claude' }, {}), 'demo');
  assert.equal(resolveProvider({ provider: 'anthropic' }, { sampleAvailable: true }), 'claude');
  assert.equal(resolveProvider({ provider: 'demo', apiKey: 'sk-ant-api03-xxxxxxxxxxxx' }, { sampleAvailable: true }), 'demo');
  assert.equal(resolveProvider({ provider: 'openai', openaiKey: 'k', openaiBaseUrl: 'https://api.mistral.ai/v1', openaiModel: 'mistral-small-latest' }, {}), 'openai');
});

function sseResponse(chunks, { status = 200, delayMs = 0 } = {}) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const c of chunks) {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        controller.enqueue(enc.encode(c));
      }
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
}
const delta = (t) => `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } })}\n\n`;

test('mode réel (clé API) : flux streamé, alerte IA lue, signature vérifiée', async () => {
  let sentBody = null; let sentHeaders = null;
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    sentHeaders = init.headers; sentBody = JSON.parse(init.body);
    return sseResponse([
      'event: message_start\ndata: {"type":"message_start","message":{}}\n\n',
      delta('Bonjour Sophie, 45 minutes d\'attente, '), delta('c\'est trop : toutes nos excuses. '),
      delta('Appelez-nous au 01 42 00 00 00.\nMarco et toute l\'équipe\n###\nALERTE : aucune'),
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]);
  };
  const seen = [];
  const out = await generateReply({
    review: byId['neg-attente'], profile: PROFILES.marco, settings: { provider: 'anthropic', apiKey: 'sk-ant-api03-test-key-123', model: 'claude-sonnet-5-5' },
    fetchImpl, onText: (t) => seen.push(t),
  });
  assert.equal(out.provider, 'anthropic');
  assert.equal(out.fallback, false);
  assert.ok(out.text.endsWith("Marco et toute l'équipe"));
  assert.ok(!out.text.includes('###'));
  assert.ok(seen.length >= 3 && seen.every((t) => !t.includes('###')), 'le bloc ALERTE ne s\'affiche jamais');
  assert.equal(sentHeaders['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(sentHeaders['x-api-key'], 'sk-ant-api03-test-key-123');
  assert.equal(sentBody.model, 'claude-sonnet-5-5');
  assert.equal(sentBody.stream, true);
  assert.ok(sentBody.system.includes('Chez Marco'));
});

test('bascule automatique en démo : pas de réseau, clé refusée, délai dépassé — jamais de plantage', async () => {
  const base = { review: byId['pos-detail'], profile: PROFILES.marco, settings: { provider: 'anthropic', apiKey: 'sk-ant-api03-test-key-123' } };
  const noNet = await generateReply({ ...base, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal(noNet.provider, 'demo'); assert.equal(noNet.fallback, true); assert.equal(noNet.fallbackReason, 'pas de réseau');
  assert.ok(noNet.text.includes('pâtes à la truffe'));
  const badKey = await generateReply({ ...base, fetchImpl: async () => new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 }) });
  assert.equal(badKey.fallbackReason, 'clé API refusée');
  const slow = await generateReply({
    ...base, firstTokenTimeoutMs: 80,
    fetchImpl: async (url, init) => new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(sseResponse([delta('trop tard')])), 2000);
      init.signal.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    }),
  });
  assert.equal(slow.provider, 'demo'); assert.equal(slow.fallbackReason, 'délai dépassé');
  const empty = await generateReply({ ...base, fetchImpl: async () => sseResponse([delta('\n###\nALERTE : aucune')]) });
  assert.equal(empty.fallback, true);
});

test('mode Claude (compte claude.ai) : appel « sample » en streaming', async () => {
  let gotPrompt = '';
  const sample = async (prompt, opts) => {
    gotPrompt = prompt;
    assert.equal(opts.modelTier, 'quick');
    assert.equal(opts.cache, false);
    opts.onText({ text: 'Merci Thomas ! Ravis que nos pâtes à la truffe vous aient plu.', delta: '' });
    return { text: "Merci Thomas ! Ravis que nos pâtes à la truffe vous aient plu.\nMarco et toute l'équipe\n###\nALERTE : aucune", truncated: false };
  };
  const out = await generateReply({ review: byId['pos-detail'], profile: PROFILES.marco, settings: { provider: 'auto' }, env: { sampleAvailable: true, sample } });
  assert.equal(out.provider, 'claude');
  assert.ok(gotPrompt.includes('Chez Marco') && gotPrompt.includes('pâtes à la truffe'));
  const refused = await generateReply({ review: byId['pos-detail'], profile: PROFILES.marco, settings: {}, env: { sampleAvailable: true, sample: async () => { throw { code: 'not_granted', message: 'no' }; } } });
  assert.equal(refused.provider, 'demo'); assert.equal(refused.fallbackReason, 'IA non autorisée ici');
});

test('annulation volontaire : l\'erreur remonte (pas de bascule silencieuse)', async () => {
  const ctl = new AbortController();
  const p = generateReply({
    review: byId['pos-detail'], profile: PROFILES.marco, settings: { provider: 'anthropic', apiKey: 'sk-ant-api03-test-key-123' },
    signal: ctl.signal,
    fetchImpl: async (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    }),
  });
  setTimeout(() => ctl.abort(), 20);
  await assert.rejects(p, (e) => e.name === 'AbortError');
});

// ---------------------------------------------------------------- WhatsApp
test('WhatsApp : numéros français normalisés et lien wa.me pré-rempli', () => {
  assert.equal(normalizePhone('06 12 34 56 78'), '33612345678');
  assert.equal(normalizePhone('+33 6 98 76 54 32'), '33698765432');
  assert.equal(normalizePhone('0033 7 11 22 33 44'), '33711223344');
  assert.equal(normalizePhone('+33 (0)6 12 34 56 78'), '33612345678');
  assert.equal(normalizePhone('+32 470 12 34 56'), '32470123456');
  assert.equal(normalizePhone('12'), '');
  const link = waLink('06 12 34 56 78', 'Bonjour & merci ?');
  assert.equal(link, 'https://wa.me/33612345678?text=Bonjour%20%26%20merci%20%3F');
  assert.ok(waLink('', 'x').startsWith('https://wa.me/?text='));
  const msg = ownerMessage({
    profile: PROFILES.marco, review: byId.sante, reply: 'Bonjour Isabelle…\nMarco et toute l\'équipe',
    alerts: analyzeReview(byId.sante, PROFILES.marco).alerts, me: { prenom: 'Karim', marque: 'Réponse Maison' },
  });
  for (const s of ['Bonjour Marco', 'Isabelle', '★☆☆☆☆', 'Malade toute la nuit', 'Réponse proposée', 'À savoir', 'Répondez « OK »', '— Karim, Réponse Maison']) assert.ok(msg.includes(s), s);
  const tu = ownerMessage({ profile: { ...PROFILES.smash, tutoiePatron: true }, review: byId.bof, reply: 'x', alerts: [] });
  assert.ok(tu.includes('Réponds « OK »'));
  assert.ok(prospectMessage({ review: byId['neg-attente'], reply: 'Bonjour Sophie…', me: { marque: 'Réponse Maison', prenom: 'Karim', telephone: '06 00 00 00 00' } }).includes('Premier mois offert'));
});

// ---------------------------------------------------------------- bilan mensuel
test('bilan mensuel : volume, note moyenne, plaintes récurrentes, tendance', () => {
  const mk = (id, date, status = 'publie') => {
    const r = byId[id];
    const a = analyzeReview(r, PROFILES[r.profile]);
    return { createdAt: date, review: { text: r.text, stars: r.stars || a.stars }, status, complaints: a.complaints, praise: a.praise, dishes: a.dishes.map((d) => d.text), alerts: a.alerts };
  };
  const entries = [
    mk('pos-detail', '2026-09-02T12:00:00'), mk('pos-reserve', '2026-09-05T12:00:00'), mk('neg-attente', '2026-09-09T12:00:00'),
    mk('agressif-majuscules', '2026-09-12T12:00:00', 'envoye'), mk('famille', '2026-09-20T12:00:00'), mk('sante', '2026-09-28T12:00:00', 'brouillon'),
    mk('habitue', '2026-08-15T12:00:00'), mk('mitige', '2026-08-20T12:00:00'),
  ];
  const r = buildMonthlyReport(entries, '2026-09');
  assert.equal(r.count, 6);
  assert.equal(r.prevCount, 2);
  assert.equal(r.avg.toFixed(2), ((5 + 4 + 2 + 1 + 4 + 1) / 6).toFixed(2));
  assert.equal(r.complaints[0].key, 'attente');
  assert.equal(r.complaints[0].count, 3);
  assert.equal(r.published, 4);
  assert.equal(r.pending, 2);
  assert.equal(r.alerts, 1);
  const txt = reportText(r, PROFILES.marco, { prenom: 'Karim', marque: 'Réponse Maison' });
  for (const s of ['Bilan de septembre 2026', 'Chez Marco', '6 avis', "l'attente (3)", 'Réponses publiées : 4/6', '▼']) assert.ok(txt.includes(s), s + '\n' + txt);
  assert.ok(reportText(buildMonthlyReport([], '2026-10'), PROFILES.marco).includes('Aucun nouvel avis'));
});

test('polishReply : formules creuses remplacées et typographie française', async () => {
  const { polishReply } = await import('../src/core/prompt.js');
  assert.equal(polishReply("Merci Léa! N'hésitez pas à nous appeler.", 'fr'), 'Merci Léa ! Appelez-nous.');
  assert.equal(polishReply("Please don't hesitate to call us.", 'en'), 'Please call us.');
  assert.ok(!/ /.test(polishReply('Great, thanks!', 'en')));
});
