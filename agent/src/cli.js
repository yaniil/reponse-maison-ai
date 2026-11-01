#!/usr/bin/env node
// Ligne de commande de l'agent.
//   node agent/src/cli.js simulate                 → toute la boucle avec Google et WhatsApp simulés (aucun compte requis)
//   node agent/src/cli.js discover  --config f.json → liste les fiches accessibles (API réelle)
//   node agent/src/cli.js run       --config f.json → un cycle réel (à lancer toutes les 30 min par cron)
//   node agent/src/cli.js webhook   --config f.json --port 8080 → reçoit les réponses WhatsApp du patron
//   node agent/src/cli.js report    --config f.json --month 2026-09 [--mock] → bilans HTML + texte WhatsApp
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { Agent } from './agent.js';
import { StateStore } from './store.js';
import { MockGbpClient } from './gbp/mock.js';
import { GoogleGbpClient } from './gbp/google.js';
import { MockWhatsApp, WhatsAppCloud, parseWebhook } from './approval/whatsapp.js';
import { buildRestaurantReport, reportHtml, reportWhatsApp } from './report.js';
import * as core from '../../src/core/index.js';

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (name, def) => { const i = args.indexOf('--' + name); return i !== -1 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };
const root = new URL('../', import.meta.url).pathname;

function loadConfig(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const resolve = (v) => (typeof v === 'string' && v.startsWith('env:') ? process.env[v.slice(4)] || '' : v);
  const walk = (o) => (Array.isArray(o) ? o.map(walk) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)])) : resolve(o));
  return walk(raw);
}

function realDeps(config) {
  const gbp = new GoogleGbpClient(config.google);
  const channel = new WhatsAppCloud(config.whatsapp);
  const store = new StateStore(config.statePath || root + 'data/state.json');
  return { gbp, channel, store };
}

// ---------------------------------------------------------------- simulation narrée
async function simulate() {
  let clock = Date.parse('2026-10-05T09:00:00Z');
  const now = () => clock;
  const advance = (h) => { clock += h * 3600 * 1000; };
  const gbp = new MockGbpClient({ now });
  const wa = new MockWhatsApp();
  const store = new StateStore(null);
  const P = core.SAMPLE_PROFILES;
  const config = {
    operator: { prenom: 'Karim', whatsapp: '06 00 00 00 01', marque: 'Réponse Maison' },
    backfillDays: 14, reminderHours: 24,
    restaurants: [
      { id: 'marco', location: gbp.addLocation('accounts/111/locations/901', 'Chez Marco'), profile: P.marco, owner: { prenom: 'Marco', whatsapp: '06 12 34 56 78' } },
      { id: 'smash', location: gbp.addLocation('accounts/111/locations/902', 'Big Smash'), profile: P.smash, owner: { prenom: 'Yanis', whatsapp: '07 11 22 33 44', tutoiement: true }, autoApprovePositiveAfterHours: 48 },
    ],
  };
  // En simulation, une consigne simple (« enlève la dernière phrase ») est appliquée par une règle ; en réel, c'est Claude.
  const generate = async (o) => {
    if (o.variant === 'edit') {
      const [body, sig] = o.previous.text.split('\n');
      const sentences = core.splitSentences(body);
      if (/derni[eè]re phrase/i.test(o.instruction)) sentences.pop();
      return { text: sentences.join(' ') + '\n' + sig, provider: 'simulation', alerts: [] };
    }
    const out = core.generateDemoReply({ review: o.review, profile: o.profile, avoidIds: (o.history || []).flatMap((h) => h.templateIds || []) });
    return { ...out, provider: 'moteur démo' };
  };
  const agent = new Agent({ config, gbp, channel: wa, store, generate, now });
  const [marco, smash] = config.restaurants;
  const line = (s) => console.log(s);
  const showOutbox = (from) => { for (const m of wa.outbox.slice(from)) line(`   📤 → ${m.to} : ${m.text.split('\n').slice(0, 2).join(' / ').slice(0, 140)}…`); return wa.outbox.length; };
  let seen = 0;

  line('\n=== Simulation de l\'agent (Google et WhatsApp simulés) ===');
  gbp.addReview(marco.location, { author: 'Ancien client', stars: 5, text: 'Toujours parfait.', createdAt: Date.parse('2026-08-01T12:00:00Z'), reply: 'Merci !' });
  const r1 = gbp.addReview(marco.location, { author: 'Thomas Martin', stars: 5, text: core.SAMPLE_REVIEWS[0].text, createdAt: clock - 3 * 3600e3 });
  const r2 = gbp.addReview(marco.location, { author: 'Sophie', stars: 2, text: "45 minutes d'attente pour deux plats du jour, servis tièdes. Dommage, le lieu est joli.", createdAt: clock - 2 * 3600e3 });
  const r3 = gbp.addReview(marco.location, { author: 'Gros Mangeur', stars: 1, text: "Bande d'escrocs et de voleurs, votre bouffe c'est de la merde.", createdAt: clock - 3600e3 });
  const r4 = gbp.addReview(smash.location, { author: 'Hugo', stars: 4, text: 'Les burgers sont énormes et les frites maison 🔥', createdAt: clock - 1800e3 });

  line('\n[lun. 11:00] Cycle 1 : lecture des avis des 2 fiches');
  let s = await agent.runCycle();
  line(`   ${s.nouveaux} nouveaux avis, ${s.envoyes} réponses envoyées pour validation (l'avis d'août déjà répondu est ignoré)`);
  seen = showOutbox(seen);

  line('\n[11:20] Marco appuie sur « Publier » pour l\'avis de Thomas');
  await agent.handleIncoming({ from: '33612345678', payload: 'OK:' + store.get(r1).code });
  line(`   → avis de Thomas : ${core.clampText(gbp.raw(r1).reviewReply.comment, 90)} (publié ✅)`);
  seen = showOutbox(seen);

  line('\n[11:25] Marco répond « Enlève la dernière phrase » sur l\'avis de Sophie');
  await agent.handleIncoming({ from: '33612345678', text: 'Enlève la dernière phrase stp' });
  seen = showOutbox(seen);
  line('[11:27] Marco : « ok parfait »');
  await agent.handleIncoming({ from: '33612345678', text: 'ok parfait' });
  line(`   → publié : ${gbp.raw(r2).reviewReply.comment.replace(/\n/g, ' / ')}`);
  seen = showOutbox(seen);

  line('\n[11:30] Marco, sur l\'avis insultant : « non je préfère pas répondre à ça »');
  await agent.handleIncoming({ from: '33612345678', payload: '', text: `non je préfère pas répondre à ça réf. ${store.get(r3).code}` });
  line(`   → état : ${store.get(r3).state} (rien n'est publié)`);
  seen = showOutbox(seen);

  line('\n[mar. 11:00] +24 h : Yanis (Big Smash) n\'a pas répondu → rappel');
  advance(24); s = await agent.runCycle(); seen = showOutbox(seen);
  line('[mer. 11:00] +48 h : validation tacite activée pour Big Smash (avis 4★ sans alerte) → publication');
  advance(24); s = await agent.runCycle();
  line(`   → avis de Hugo : ${store.get(r4).state} (${store.get(r4).approvedBy})`);
  seen = showOutbox(seen);

  line('\n[mer. 15:00] Nouvel avis ; Marco y répond lui-même sur Google avant de valider');
  advance(4);
  const r5 = gbp.addReview(marco.location, { author: 'Claire', stars: 4, text: 'Très bonnes pâtes, service un peu lent.', createdAt: clock });
  await agent.runCycle();
  gbp.ownerRepliesDirectly(r5, 'Merci Claire ! — Marco');
  await agent.handleIncoming({ from: '33612345678', text: 'OK' });
  line(`   → état : ${store.get(r5).state} : la réponse de Marco n'est pas écrasée`);
  seen = showOutbox(seen);

  line('\n[jeu. 10:00] Google renvoie une erreur 503 pendant une publication → nouvel essai au cycle suivant');
  advance(19);
  const r6 = gbp.addReview(smash.location, { author: 'Inès', stars: 5, text: 'Meilleur burger du quartier, accueil au top !', createdAt: clock });
  await agent.runCycle();
  gbp.failNext('replyToReview', 503);
  await agent.handleIncoming({ from: '33711223344', text: 'ok' });
  line(`   → après l'erreur : ${store.get(r6).state} (tentatives : ${store.get(r6).publishAttempts})`);
  advance(0.5); await agent.runCycle();
  line(`   → cycle suivant : ${store.get(r6).state}`);

  line('\n[1er nov.] Bilan d\'octobre pour Chez Marco');
  const rep = await buildRestaurantReport({ gbp, resto: marco, month: '2026-10', store });
  line(reportWhatsApp(rep, marco, config.operator).split('\n').map((l) => '   ' + l).join('\n'));
  mkdirSync(root + 'out', { recursive: true });
  writeFileSync(root + 'out/bilan-exemple-chez-marco-2026-10.html', reportHtml(rep, marco, config.operator));
  line('   → page imprimable : agent/out/bilan-exemple-chez-marco-2026-10.html');
  line('\nÉtat final des avis :');
  for (const r of store.all()) line(`   ${(r.author || '?').padEnd(14)} ${String(r.stars || '-')}★  ${r.state}`);
  line('\nFin de la simulation ✔\n');
}

// ---------------------------------------------------------------- commandes réelles
async function main() {
  if (cmd === 'simulate' || !cmd) return simulate();
  const config = loadConfig(opt('config', root + 'config.json'));
  if (cmd === 'discover') {
    const locs = await new GoogleGbpClient(config.google).listLocations();
    for (const l of locs) console.log(`${l.name}\t${l.title}\t${l.address || ''}`);
    return;
  }
  if (cmd === 'run') {
    const { gbp, channel, store } = realDeps(config);
    const agent = new Agent({ config, gbp, channel, store });
    console.log(JSON.stringify(await agent.runCycle(), null, 2));
    return;
  }
  if (cmd === 'webhook') {
    const { gbp, channel, store } = realDeps(config);
    const agent = new Agent({ config, gbp, channel, store });
    const port = Number(opt('port', 8080));
    createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET') {
        // vérification Meta : hub.mode=subscribe & hub.verify_token & hub.challenge
        const ok = url.searchParams.get('hub.verify_token') === config.whatsapp.verifyToken;
        res.writeHead(ok ? 200 : 403); res.end(ok ? url.searchParams.get('hub.challenge') : 'interdit');
        return;
      }
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', async () => {
        res.writeHead(200); res.end('ok');
        try { for (const m of parseWebhook(JSON.parse(body || '{}'))) await agent.handleIncoming(m); } catch (e) { console.error('webhook :', e.message); }
      });
    }).listen(port, () => console.log('Webhook WhatsApp à l\'écoute sur le port ' + port));
    return;
  }
  if (cmd === 'report') {
    const month = opt('month', core.monthKey(Date.now() - 15 * 24 * 3600e3));
    const { gbp, store } = realDeps(config);
    mkdirSync(root + 'out', { recursive: true });
    for (const resto of config.restaurants) {
      const rep = await buildRestaurantReport({ gbp, resto, month, store });
      const file = `${root}out/bilan-${resto.id}-${month}.html`;
      writeFileSync(file, reportHtml(rep, resto, config.operator));
      console.log(`\n${file}\n${reportWhatsApp(rep, resto, config.operator)}`);
    }
    return;
  }
  console.log('Commandes : simulate | discover | run | webhook | report (voir README)');
}

main().catch((e) => { console.error(e); process.exit(1); });
