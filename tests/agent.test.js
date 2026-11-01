import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '../agent/src/agent.js';
import { StateStore } from '../agent/src/store.js';
import { MockGbpClient } from '../agent/src/gbp/mock.js';
import { GoogleGbpClient } from '../agent/src/gbp/google.js';
import { originalComment, normalizeReview } from '../agent/src/gbp/parse.js';
import { MockWhatsApp, WhatsAppCloud, parseWebhook } from '../agent/src/approval/whatsapp.js';
import { interpretOwnerReply, parseButtonPayload } from '../agent/src/approval/parse.js';
import { buildRestaurantReport, reportHtml } from '../agent/src/report.js';
import * as core from '../src/core/index.js';

function setup({ tacit = null } = {}) {
  let clock = Date.parse('2026-10-05T09:00:00Z');
  const now = () => clock;
  const advance = (h) => { clock += h * 3600e3; };
  const gbp = new MockGbpClient({ now });
  const wa = new MockWhatsApp();
  const store = new StateStore(null);
  const config = {
    operator: { prenom: 'Karim', whatsapp: '06 00 00 00 01', marque: 'Réponse Maison' },
    restaurants: [{ id: 'marco', location: gbp.addLocation('accounts/1/locations/9', 'Chez Marco'), profile: core.SAMPLE_PROFILES.marco, owner: { prenom: 'Marco', whatsapp: '06 12 34 56 78' }, autoApprovePositiveAfterHours: tacit }],
  };
  const edits = [];
  const generate = async (o) => {
    if (o.variant === 'edit') { edits.push(o.instruction); return { text: 'Version modifiée.\nMarco et toute l\'équipe', provider: 'test', alerts: [] }; }
    return { ...core.generateDemoReply({ review: o.review, profile: o.profile }), provider: 'demo' };
  };
  const agent = new Agent({ config, gbp, channel: wa, store, generate, now });
  return { agent, gbp, wa, store, config, advance, edits, loc: config.restaurants[0].location, now };
}

test('agent : nouvel avis → brouillon → validation WhatsApp → « OK » → publié sur Google', async () => {
  const { agent, gbp, wa, store, loc } = setup();
  const key = gbp.addReview(loc, { author: 'Thomas', stars: 5, text: 'Les pâtes à la truffe étaient divines !' });
  const s = await agent.runCycle();
  assert.equal(s.nouveaux, 1);
  const rec = store.get(key);
  assert.equal(rec.state, 'en_validation');
  const msg = wa.last('33612345678');
  assert.equal(msg.kind, 'validation');
  assert.ok(msg.text.includes('Les pâtes à la truffe') && msg.text.includes('Réponse proposée') && msg.text.includes(rec.code));
  assert.equal(gbp.raw(key).reviewReply, undefined, 'rien n\'est publié sans accord');
  await agent.handleIncoming({ from: '+33 6 12 34 56 78', text: 'OK' });
  assert.equal(store.get(key).state, 'publie');
  assert.equal(gbp.raw(key).reviewReply.comment, rec.draft.text);
  assert.ok(wa.last('33612345678').text.includes('Publiée'));
  // idempotence : un nouveau cycle ne renvoie rien et ne republie rien
  const before = wa.outbox.length;
  const s2 = await agent.runCycle();
  assert.equal(s2.nouveaux, 0);
  assert.equal(wa.outbox.length, before);
});

test('agent : bouton « Publier » (code) et réponse citée retrouvent le bon avis parmi plusieurs', async () => {
  const { agent, gbp, wa, store, loc } = setup();
  const k1 = gbp.addReview(loc, { author: 'A', stars: 5, text: 'Super pizza.' });
  const k2 = gbp.addReview(loc, { author: 'B', stars: 4, text: 'Très bon tiramisu.' });
  await agent.runCycle();
  await agent.handleIncoming({ from: '33612345678', payload: 'OK:' + store.get(k1).code });
  assert.equal(store.get(k1).state, 'publie');
  assert.equal(store.get(k2).state, 'en_validation');
  const msgId = Object.entries(store.state.messages).find(([, k]) => k === k2)[0];
  await agent.handleIncoming({ from: '33612345678', text: 'oui', contextId: msgId });
  assert.equal(store.get(k2).state, 'publie');
});

test('agent : consigne de modification → nouvelle version renvoyée → OK → publiée', async () => {
  const { agent, gbp, wa, store, loc, edits } = setup();
  const key = gbp.addReview(loc, { author: 'Sophie', stars: 2, text: "45 minutes d'attente, plats tièdes." });
  await agent.runCycle();
  await agent.handleIncoming({ from: '33612345678', text: 'Enlève la dernière phrase' });
  assert.deepEqual(edits, ['Enlève la dernière phrase']);
  assert.equal(store.get(key).state, 'en_validation');
  assert.ok(wa.last('33612345678').text.includes('version modifiée'));
  await agent.handleIncoming({ from: '33612345678', text: 'ok merci' });
  assert.equal(gbp.raw(key).reviewReply.comment, "Version modifiée.\nMarco et toute l'équipe");
  assert.equal(store.get(key).versions.length, 2);
});

test('agent : le patron envoie son propre texte → publié tel quel (signature ajoutée)', async () => {
  const { agent, gbp, store, loc } = setup();
  const key = gbp.addReview(loc, { author: 'Paul', stars: 3, text: 'Bon mais un peu cher.' });
  await agent.runCycle();
  const own = 'Merci Paul pour votre retour honnête. Nous avons revu notre carte ce mois-ci et serions ravis de vous la faire découvrir lors de votre prochaine venue.';
  await agent.handleIncoming({ from: '33612345678', text: own });
  assert.equal(store.get(key).state, 'publie');
  assert.ok(gbp.raw(key).reviewReply.comment.startsWith('Merci Paul pour votre retour honnête'));
  assert.ok(gbp.raw(key).reviewReply.comment.endsWith("Marco et toute l'équipe"));
});

test('agent : refus du patron, alerte à l\'opérateur pour un avis insultant, rien publié', async () => {
  const { agent, gbp, wa, store, loc } = setup();
  const key = gbp.addReview(loc, { author: 'X', stars: 1, text: "Bande d'escrocs et de voleurs, je vais vous faire fermer." });
  await agent.runCycle();
  const alert = wa.outbox.find((m) => m.to === '33600000001');
  assert.ok(alert && alert.text.includes('avis sensible'), 'l\'opérateur est prévenu tout de suite');
  await agent.handleIncoming({ from: '33612345678', text: 'non surtout pas' });
  assert.equal(store.get(key).state, 'rejete');
  assert.equal(gbp.raw(key).reviewReply, undefined);
});

test('agent : ne remplace jamais une réponse que le patron a publiée lui-même', async () => {
  const { agent, gbp, store, loc } = setup();
  const key = gbp.addReview(loc, { author: 'Claire', stars: 4, text: 'Très bonnes pâtes.' });
  await agent.runCycle();
  gbp.ownerRepliesDirectly(key, 'Merci Claire ! Marco');
  await agent.handleIncoming({ from: '33612345678', text: 'OK' });
  assert.equal(store.get(key).state, 'deja_repondu');
  assert.equal(gbp.raw(key).reviewReply.comment, 'Merci Claire ! Marco');
});

test('agent : erreur Google temporaire → nouvel essai au cycle suivant ; avis déjà répondus et anciens ignorés', async () => {
  const { agent, gbp, store, loc, now } = setup();
  gbp.addReview(loc, { author: 'Vieux', stars: 5, text: 'Top', createdAt: now() - 40 * 24 * 3600e3 });
  const answered = gbp.addReview(loc, { author: 'Déjà', stars: 5, text: 'Top', reply: 'Merci !' });
  const key = gbp.addReview(loc, { author: 'Inès', stars: 5, text: 'Meilleur burger du quartier.' });
  const s = await agent.runCycle();
  assert.equal(s.nouveaux, 1, 'seul le nouvel avis sans réponse est traité');
  assert.equal(store.get(answered).state, 'deja_repondu');
  gbp.failNext('replyToReview', 503);
  await agent.handleIncoming({ from: '33612345678', text: 'ok' });
  assert.equal(store.get(key).state, 'approuve');
  assert.equal(store.get(key).publishAttempts, 1);
  await agent.runCycle();
  assert.equal(store.get(key).state, 'publie');
  gbp.failNext('listReviews', 500);
  const s3 = await agent.runCycle();
  assert.equal(s3.erreurs.length, 1, 'une panne de lecture est signalée sans planter le cycle');
});

test('agent : rappel après 24 h, validation tacite seulement si activée et avis positif sans alerte', async () => {
  const t = setup({ tacit: 48 });
  const pos = t.gbp.addReview(t.loc, { author: 'Hugo', stars: 5, text: 'Burgers énormes, accueil au top.' });
  const neg = t.gbp.addReview(t.loc, { author: 'Léo', stars: 2, text: 'Attente interminable, plats froids.' });
  await t.agent.runCycle();
  t.advance(25);
  const s = await t.agent.runCycle();
  assert.equal(s.relances, 2);
  assert.ok(t.wa.outbox.some((m) => m.text.includes('Petit rappel')));
  t.advance(24);
  await t.agent.runCycle();
  assert.equal(t.store.get(pos).state, 'publie');
  assert.equal(t.store.get(pos).approvedBy, 'tacite');
  assert.equal(t.store.get(neg).state, 'en_validation', 'un avis négatif n\'est jamais publié sans accord explicite');
  const u = setup({ tacit: null });
  const k = u.gbp.addReview(u.loc, { author: 'Hugo', stars: 5, text: 'Super.' });
  await u.agent.runCycle(); u.advance(100); await u.agent.runCycle();
  assert.equal(u.store.get(k).state, 'en_validation', 'sans option au contrat : jamais de publication tacite');
});

test('agent : consigne impossible à appliquer sans IA → l\'opérateur est prévenu, rien n\'est inventé', async () => {
  const t = setup();
  const failing = new Agent({ ...t, config: t.config, gbp: t.gbp, channel: t.wa, store: t.store, now: t.now,
    generate: async (o) => { if (o.variant === 'edit') throw new Error('IA requise'); return { ...core.generateDemoReply({ review: o.review, profile: o.profile }), provider: 'demo' }; } });
  const key = t.gbp.addReview(t.loc, { author: 'Sam', stars: 3, text: 'Correct.' });
  await failing.runCycle();
  await failing.handleIncoming({ from: '33612345678', text: 'Ajoute qu\'on est fermés le lundi' });
  assert.equal(t.store.get(key).state, 'a_modifier');
  assert.ok(t.wa.outbox.some((m) => m.to === '33600000001' && m.text.includes('à faire à la main')));
});

test('compréhension des réponses du patron', () => {
  for (const ok of ['OK', 'ok', 'Oui', 'oui c\'est parfait', '👍', '✅', 'ok merci', 'Vas-y', 'go', 'C\'est bon', 'Parfait !', 'ok publie'])
    assert.equal(interpretOwnerReply(ok).action, 'approve', ok);
  for (const no of ['non', 'Non merci', 'stop', 'laisse tomber', 'pas de réponse'])
    assert.equal(interpretOwnerReply(no).action, 'reject', no);
  for (const ed of ['Enlève la dernière phrase', 'ok mais enlève le numéro', 'Mets plutôt « à bientôt »', 'change le prénom'])
    assert.equal(interpretOwnerReply(ed).action, 'edit', ed);
  assert.equal(interpretOwnerReply('Merci Paul pour votre retour. Nous serions ravis de vous accueillir à nouveau pour vous faire découvrir notre nouvelle carte. À bientôt !').action, 'replace');
  assert.deepEqual(parseButtonPayload('OK:AB12'), { action: 'approve', code: 'AB12' });
  assert.deepEqual(parseButtonPayload('EDIT:AB12'), { action: 'edit-request', code: 'AB12' });
  assert.equal(parseButtonPayload('nimporte'), null);
});

test('Google : avis traduits par Google → on garde le texte original', () => {
  assert.equal(originalComment('(Translated by Google) Super repas !\n\n(Original)\nGreat meal!'), 'Great meal!');
  assert.equal(originalComment('Great meal!\n\n(Translated by Google)\nSuper repas !'), 'Great meal!');
  assert.equal(originalComment('Très bon'), 'Très bon');
  const n = normalizeReview({ name: 'accounts/1/locations/2/reviews/r9', reviewId: 'r9', reviewer: { displayName: 'Ana', isAnonymous: false }, starRating: 'FOUR', comment: 'Bien', createTime: '2026-10-01T10:00:00Z', reviewReply: { comment: 'Merci', updateTime: '2026-10-01T12:00:00Z' } });
  assert.equal(n.stars, 4); assert.equal(n.author, 'Ana'); assert.equal(n.location, 'accounts/1/locations/2'); assert.equal(n.reply.text, 'Merci');
});

test('Google (client réel) : bons endpoints, jeton OAuth renouvelé, corps de la réponse', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body, auth: init.headers && init.headers.authorization });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    if (url.includes('/v1/accounts') && !url.includes('/locations')) return new Response(JSON.stringify({ accounts: [{ name: 'accounts/1' }] }), { status: 200 });
    if (url.includes('mybusinessbusinessinformation')) return new Response(JSON.stringify({ locations: [{ name: 'locations/9', title: 'Chez Marco' }] }), { status: 200 });
    if (url.includes('/reviews?')) return new Response(JSON.stringify({ reviews: [{ name: 'accounts/1/locations/9/reviews/r1', reviewId: 'r1', starRating: 'FIVE', comment: 'Top', createTime: '2026-10-04T10:00:00Z', updateTime: '2026-10-04T10:00:00Z', reviewer: { displayName: 'Léa' } }] }), { status: 200 });
    if (url.endsWith('/reply')) return new Response(JSON.stringify({ comment: JSON.parse(init.body).comment, updateTime: '2026-10-05T10:00:00Z' }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const g = new GoogleGbpClient({ clientId: 'id', clientSecret: 's', refreshToken: 'rt', fetchImpl });
  const locs = await g.listLocations();
  assert.deepEqual(locs[0], { name: 'accounts/1/locations/9', title: 'Chez Marco', account: 'accounts/1', address: undefined });
  const reviews = await g.listReviews(locs[0].name);
  assert.equal(reviews[0].stars, 5);
  const rep = await g.replyToReview(reviews[0].key, 'Merci Léa !');
  assert.equal(rep.text, 'Merci Léa !');
  const put = calls.find((c) => c.method === 'PUT');
  assert.equal(put.url, 'https://mybusiness.googleapis.com/v4/accounts/1/locations/9/reviews/r1/reply');
  assert.deepEqual(JSON.parse(put.body), { comment: 'Merci Léa !' });
  assert.ok(calls.some((c) => c.url.startsWith('https://mybusiness.googleapis.com/v4/accounts/1/locations/9/reviews?pageSize=50')));
  assert.equal(calls.filter((c) => c.url.startsWith('https://oauth2')).length, 1, 'jeton réutilisé tant qu\'il est valide');
  assert.ok(calls.filter((c) => !c.url.startsWith('https://oauth2')).every((c) => c.auth === 'Bearer tok'));
});

test('WhatsApp Cloud : modèle hors fenêtre de 24 h (paramètres sans retour à la ligne), boutons, webhook', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 }); };
  const wa = new WhatsAppCloud({ phoneNumberId: '123', token: 't', fetchImpl });
  const r = await wa.send('33612345678', { kind: 'validation', inWindow: false, code: 'AB12', restaurant: 'Chez Marco', stars: '★★', review: 'Attente\ntrop longue', reply: "Bonjour,\nDésolés.\nMarco et toute l'équipe" });
  assert.equal(r.id, 'wamid.X');
  const b = sent[0].body;
  assert.equal(sent[0].url, 'https://graph.facebook.com/v21.0/123/messages');
  assert.equal(b.type, 'template');
  assert.ok(b.template.components[0].parameters.every((p) => !/\n|\t/.test(p.text)), 'aucun retour à la ligne dans les paramètres');
  assert.equal(b.template.components[1].parameters[0].payload, 'OK:AB12');
  await wa.send('33612345678', { kind: 'validation', inWindow: true, code: 'AB12', text: 'Bonjour…' });
  assert.equal(sent[1].body.interactive.action.buttons[1].reply.id, 'EDIT:AB12');
  const msgs = parseWebhook({ entry: [{ changes: [{ value: { messages: [
    { from: '33612345678', id: 'm1', timestamp: '1791200000', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'OK:AB12', title: 'Publier ✅' } } },
    { from: '33612345678', id: 'm2', timestamp: '1791200100', type: 'text', text: { body: 'enlève la fin' }, context: { id: 'wamid.X' } },
  ] } }] }] });
  assert.equal(msgs[0].payload, 'OK:AB12');
  assert.equal(msgs[1].contextId, 'wamid.X');
  assert.equal(msgs[1].text, 'enlève la fin');
});

test('état de l\'agent : sauvegardé sur disque et rechargé', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'avispro-'));
  const path = join(dir, 'state.json');
  const s1 = new StateStore(path);
  const code = s1.newCode('accounts/1/locations/9/reviews/r1');
  s1.put({ key: 'accounts/1/locations/9/reviews/r1', state: 'en_validation', code });
  const s2 = new StateStore(path);
  assert.equal(s2.byCode(code).state, 'en_validation');
  assert.ok(JSON.parse(readFileSync(path, 'utf8')).reviews);
});

test('bilan mensuel de l\'agent : sur tous les avis Google, délai de réponse, page HTML', async () => {
  const { gbp, loc, config } = setup();
  const t0 = Date.parse('2026-09-10T12:00:00Z');
  gbp.addReview(loc, { author: 'A', stars: 5, text: 'Pâtes à la truffe divines, accueil adorable.', createdAt: t0, reply: 'Merci !' });
  gbp.addReview(loc, { author: 'B', stars: 2, text: "Une heure d'attente, plats tièdes.", createdAt: t0 + 86400e3 });
  gbp.addReview(loc, { author: 'C', stars: 4, text: 'Bonnes pâtes, service un peu lent.', createdAt: t0 + 2 * 86400e3 });
  gbp.addReview(loc, { author: 'D', stars: 5, text: 'Top', createdAt: Date.parse('2026-08-20T12:00:00Z') });
  const rep = await buildRestaurantReport({ gbp, resto: config.restaurants[0], month: '2026-09' });
  assert.equal(rep.count, 3);
  assert.equal(rep.prevCount, 1);
  assert.equal(rep.complaints[0].key, 'attente');
  assert.equal(rep.responseRate.toFixed(2), (1 / 3).toFixed(2));
  const html = reportHtml(rep, config.restaurants[0], config.operator);
  assert.ok(html.includes('Bilan de septembre 2026') && html.includes('Chez Marco') && html.includes("l'attente"));
});
