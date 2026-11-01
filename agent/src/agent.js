// L'agent : détecte les nouveaux avis, rédige, demande la validation au patron sur WhatsApp,
// publie après accord. Il ne publie JAMAIS sans accord (sauf validation tacite activée pour un restaurant,
// avis 4-5★ sans alerte, après le délai prévu au contrat), et n'écrase JAMAIS une réponse déjà présente sur Google.
import * as core from '../../src/core/index.js';
import { interpretOwnerReply, parseButtonPayload } from './approval/parse.js';

const H = 3600 * 1000;

export const STATES = {
  en_validation: 'en attente du patron',
  a_modifier: 'modification à faire à la main',
  approuve: 'validée, à publier',
  publie: 'publiée',
  rejete: 'refusée par le patron',
  deja_repondu: 'déjà une réponse sur Google',
  erreur: 'erreur de publication',
};

export class Agent {
  /**
   * @param {object} deps
   * @param {object} deps.config     configuration (restaurants, opérateur, délais…)
   * @param {object} deps.gbp        client Google (réel ou simulé)
   * @param {object} deps.channel    canal WhatsApp (réel ou simulé)
   * @param {import('./store.js').StateStore} deps.store
   * @param {Function} [deps.generate]  rédaction ({review, profile, history, variant, previous, instruction}) → {text, alerts, provider, fallback, templateIds}
   * @param {Function} [deps.now]
   */
  constructor({ config, gbp, channel, store, generate, now }) {
    this.config = { backfillDays: 14, reminderHours: 24, maxPublishAttempts: 5, ...config };
    this.gbp = gbp;
    this.channel = channel;
    this.store = store;
    this.now = now || (() => Date.now());
    this.generate = generate || defaultGenerator(this.config);
  }

  restaurantFor(location) {
    return this.config.restaurants.find((r) => r.location === location) || null;
  }

  // ------------------------------------------------------------------ cycle principal
  async runCycle() {
    const summary = { nouveaux: 0, envoyes: 0, publies: 0, relances: 0, erreurs: [] };
    const since = new Date(this.now() - this.config.backfillDays * 24 * H).toISOString();
    for (const resto of this.config.restaurants) {
      let reviews = [];
      try {
        reviews = await this.gbp.listReviews(resto.location, { since });
      } catch (e) {
        summary.erreurs.push(`${resto.profile.nom} : lecture des avis impossible (${e.message})`);
        continue;
      }
      for (const rv of reviews) {
        const rec = this.store.get(rv.key);
        if (!rec) {
          if (rv.reply) {
            this.store.put({ key: rv.key, restaurantId: resto.id, location: rv.location, author: rv.author, stars: rv.stars, text: rv.text, createTime: rv.createTime, state: 'deja_repondu', seenAt: this.iso() });
            continue;
          }
          summary.nouveaux++;
          try {
            await this.draftAndSend(resto, rv);
            summary.envoyes++;
          } catch (e) {
            summary.erreurs.push(`${resto.profile.nom} : rédaction/envoi impossible (${e.message})`);
          }
        } else if (rec.state === 'publie' && rv.text !== rec.text && !rec.changeNotified) {
          // le client a modifié son avis après notre réponse : on prévient l'opérateur
          await this.notifyOperator(`✏️ ${resto.profile.nom} : ${rv.author || 'un client'} a modifié son avis après notre réponse. Nouveau texte : « ${core.clampText(rv.text, 300)} »`);
          this.store.put({ ...rec, changeNotified: true });
        }
      }
    }
    summary.publies = await this.publishApproved();
    summary.relances = await this.remindPending();
    this.store.log({ type: 'cycle', ...summary });
    return summary;
  }

  iso() { return new Date(this.now()).toISOString(); }

  history(restaurantId) {
    return this.store.all().filter((r) => r.restaurantId === restaurantId && r.draft)
      .sort((a, b) => (a.seenAt < b.seenAt ? 1 : -1)).slice(0, 6)
      .map((r) => ({ reply: r.draft.text, templateIds: r.draft.templateIds || [] }));
  }

  async draftAndSend(resto, rv) {
    const review = { text: rv.text, stars: rv.stars, author: rv.author };
    const out = await this.generate({ review, profile: resto.profile, history: this.history(resto.id) });
    const rec = {
      key: rv.key, code: this.store.newCode(rv.key), restaurantId: resto.id, location: rv.location,
      author: rv.author, stars: rv.stars, text: rv.text, createTime: rv.createTime, seenAt: this.iso(),
      state: 'en_validation',
      draft: { text: out.text, provider: out.provider, fallback: !!out.fallback, alerts: out.alerts || [], templateIds: out.templateIds || [], category: out.category },
      versions: [{ text: out.text, at: this.iso(), by: out.provider }],
      ownerMessages: [],
    };
    this.store.put(rec);
    await this.sendValidation(resto, rec);
    const rouges = (out.alerts || []).filter((a) => a.level === 'rouge');
    if (rouges.length) {
      await this.notifyOperator(`🚨 ${resto.profile.nom} — avis sensible (${rv.stars || '?'}★, code ${rec.code}) : ${rouges.map((a) => a.message).join(' / ')}\n« ${core.clampText(rv.text, 280)} »`);
    }
    this.store.log({ type: 'brouillon', key: rv.key, code: rec.code, provider: out.provider });
    return rec;
  }

  async sendValidation(resto, rec, intro) {
    const owner = resto.owner || {};
    const inWindow = this.now() - Date.parse(this.store.owner(core.normalizePhone(owner.whatsapp)).lastInboundAt || 0) < 24 * H;
    const text = (intro ? intro + '\n\n' : '') + core.ownerMessage({
      profile: { ...resto.profile, prenomPatron: owner.prenom, tutoiePatron: owner.tutoiement },
      review: { text: rec.text, stars: rec.stars, author: rec.author }, reply: rec.draft.text, alerts: rec.draft.alerts,
      me: this.config.operator,
    }) + `\n(réf. ${rec.code})`;
    const res = await this.channel.send(core.normalizePhone(owner.whatsapp), {
      kind: 'validation', text, code: rec.code, inWindow,
      restaurant: resto.profile.nom, stars: rec.stars ? '★'.repeat(rec.stars) : 'sans note', review: rec.text || '(sans texte)', reply: rec.draft.text,
    });
    this.store.linkMessage(res && res.id, rec.key);
    this.store.put({ ...this.store.get(rec.key), sentAt: this.iso(), remindedAt: null });
  }

  async notifyOperator(text) {
    const op = this.config.operator || {};
    if (!op.whatsapp) return;
    await this.channel.send(core.normalizePhone(op.whatsapp), { kind: 'text', text });
  }

  // ------------------------------------------------------------------ réponses du patron
  /**
   * @param {{from:string, text?:string, payload?:string, contextId?:string, at?:string}} msg
   */
  async handleIncoming(msg) {
    const from = core.normalizePhone(msg.from);
    this.store.ownerSeen(from, msg.at || this.iso());
    const restos = this.config.restaurants.filter((r) => core.normalizePhone(r.owner && r.owner.whatsapp) === from);
    if (!restos.length) return { ignored: 'numéro inconnu' };
    const ids = new Set(restos.map((r) => r.id));

    // 1) quel avis ? bouton (code) > message cité > code « réf. XXXX » dans le texte > dernier en attente
    const btn = parseButtonPayload(msg.payload);
    let rec = btn ? this.store.byCode(btn.code) : null;
    if (!rec && msg.contextId) rec = this.store.byMessage(msg.contextId);
    const refMatch = String(msg.text || '').match(/\b(?:ref\.?|réf\.?)\s*([A-Z0-9]{4})\b/i);
    if (!rec && refMatch) rec = this.store.byCode(refMatch[1]);
    if (!rec) {
      rec = this.store.all().filter((r) => ids.has(r.restaurantId) && (r.state === 'en_validation' || r.awaitingEdit))
        .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))[0] || null;
    }
    if (!rec || !ids.has(rec.restaurantId)) return { ignored: 'aucun avis en attente' };
    const resto = restos.find((r) => r.id === rec.restaurantId);
    const vous = !(resto.owner && resto.owner.tutoiement);
    rec = { ...rec, ownerMessages: [...(rec.ownerMessages || []), { at: this.iso(), text: msg.text || msg.payload }] };
    this.store.put(rec);
    if (['publie', 'rejete', 'deja_repondu'].includes(rec.state)) {
      await this.channel.send(from, { kind: 'text', text: `Cette réponse est déjà traitée (${STATES[rec.state]}).` });
      return { action: 'deja_traite', key: rec.key };
    }

    // 2) que veut-il ?
    let intent;
    if (btn && btn.action === 'edit-request') intent = { action: 'edit-request' };
    else if (btn) intent = { action: btn.action };
    else intent = interpretOwnerReply(String(msg.text || '').replace(/\b(?:ref\.?|réf\.?)\s*[A-Z0-9]{4}\b/i, '').trim(), rec.draft && rec.draft.text);

    if (intent.action === 'edit-request') {
      this.store.put({ ...rec, awaitingEdit: true });
      await this.channel.send(from, { kind: 'text', text: vous
        ? 'Que voulez-vous changer ? Écrivez-le simplement (ex. « enlève la dernière phrase »), ou envoyez directement votre texte.'
        : 'Qu\'est-ce que tu veux changer ? Écris-le simplement (ex. « enlève la dernière phrase »), ou envoie directement ton texte.' });
      return { action: 'edit-request', key: rec.key };
    }
    if (intent.action === 'approve') {
      this.store.put({ ...rec, state: 'approuve', approvedAt: this.iso(), approvedBy: 'patron', awaitingEdit: false });
      await this.publishOne(this.store.get(rec.key), resto);
      return { action: 'approve', key: rec.key, state: this.store.get(rec.key).state };
    }
    if (intent.action === 'reject') {
      this.store.put({ ...rec, state: 'rejete', awaitingEdit: false });
      await this.channel.send(from, { kind: 'text', text: vous ? 'Compris, je ne publie rien sur cet avis.' : 'Compris, je ne publie rien sur cet avis.' });
      await this.notifyOperator(`ℹ️ ${resto.profile.nom} : le patron a refusé la réponse (réf. ${rec.code}).`);
      return { action: 'reject', key: rec.key };
    }
    if (intent.action === 'replace') {
      const text = core.ensureSignature(intent.text, resto.profile, core.analyzeReview({ text: rec.text }, resto.profile).lang);
      const draft = { ...rec.draft, text, provider: 'patron' };
      this.store.put({ ...rec, draft, versions: [...rec.versions, { text, at: this.iso(), by: 'patron' }], state: 'approuve', approvedAt: this.iso(), approvedBy: 'patron', awaitingEdit: false });
      await this.publishOne(this.store.get(rec.key), resto);
      return { action: 'replace', key: rec.key, state: this.store.get(rec.key).state };
    }
    // consigne de modification
    try {
      const out = await this.generate({
        review: { text: rec.text, stars: rec.stars, author: rec.author }, profile: resto.profile, history: this.history(resto.id),
        variant: 'edit', previous: { text: rec.draft.text, templateIds: rec.draft.templateIds }, instruction: intent.instruction,
      });
      const draft = { ...rec.draft, text: out.text, provider: out.provider, alerts: out.alerts || rec.draft.alerts };
      this.store.put({ ...rec, draft, versions: [...rec.versions, { text: out.text, at: this.iso(), by: out.provider, instruction: intent.instruction }], state: 'en_validation', awaitingEdit: false });
      await this.sendValidation(resto, this.store.get(rec.key), vous ? '✏️ Voici la version modifiée :' : '✏️ Voici la version modifiée :');
      return { action: 'edit', key: rec.key };
    } catch (e) {
      this.store.put({ ...rec, state: 'a_modifier', pendingInstruction: intent.instruction, awaitingEdit: false });
      await this.channel.send(from, { kind: 'text', text: vous ? 'Bien noté, je modifie la réponse et je vous la renvoie.' : 'Bien noté, je modifie la réponse et je te la renvoie.' });
      await this.notifyOperator(`✏️ ${resto.profile.nom} (réf. ${rec.code}) : modification demandée par le patron, à faire à la main : « ${intent.instruction} »`);
      return { action: 'edit-manual', key: rec.key };
    }
  }

  // ------------------------------------------------------------------ publication
  async publishApproved() {
    let n = 0;
    for (const rec of this.store.all().filter((r) => r.state === 'approuve')) {
      const resto = this.config.restaurants.find((r) => r.id === rec.restaurantId);
      if (!resto) continue;
      if (await this.publishOne(rec, resto)) n++;
    }
    return n;
  }

  async publishOne(rec, resto) {
    // Sécurité : on relit l'avis juste avant. Si une réponse existe déjà (le patron a répondu lui-même), on n'écrase pas.
    try {
      const current = await this.gbp.getReview(rec.key);
      if (current.reply && current.reply.text && current.reply.text !== rec.draft.text) {
        this.store.put({ ...rec, state: 'deja_repondu' });
        await this.notifyOperator(`ℹ️ ${resto.profile.nom} (réf. ${rec.code}) : une réponse existe déjà sur Google, je n'ai rien publié.`);
        return false;
      }
      await this.gbp.replyToReview(rec.key, rec.draft.text);
      this.store.put({ ...this.store.get(rec.key), state: 'publie', publishedAt: this.iso(), lastError: null });
      const owner = resto.owner || {};
      await this.channel.send(core.normalizePhone(owner.whatsapp), { kind: 'text', text: '✅ Publiée sur Google. Merci !' });
      this.store.log({ type: 'publie', key: rec.key, code: rec.code });
      return true;
    } catch (e) {
      const attempts = (rec.publishAttempts || 0) + 1;
      const retryable = e.retryable !== false && attempts < this.config.maxPublishAttempts;
      this.store.put({ ...this.store.get(rec.key), state: retryable ? 'approuve' : 'erreur', publishAttempts: attempts, lastError: e.message });
      if (!retryable) await this.notifyOperator(`❌ ${resto.profile.nom} (réf. ${rec.code}) : publication impossible (${e.message}). À publier à la main.`);
      return false;
    }
  }

  // ------------------------------------------------------------------ relances et validation tacite
  async remindPending() {
    let n = 0;
    for (const rec of this.store.all().filter((r) => r.state === 'en_validation')) {
      const resto = this.config.restaurants.find((r) => r.id === rec.restaurantId);
      if (!resto) continue;
      const hours = (this.now() - Date.parse(rec.sentAt)) / H;
      const tacit = resto.autoApprovePositiveAfterHours;
      const clean = !(rec.draft.alerts || []).some((a) => a.level === 'rouge' || a.level === 'orange');
      if (tacit && hours >= tacit && (rec.stars || 0) >= 4 && clean) {
        this.store.put({ ...rec, state: 'approuve', approvedAt: this.iso(), approvedBy: 'tacite' });
        await this.publishOne(this.store.get(rec.key), resto);
        n++;
        continue;
      }
      if (hours >= this.config.reminderHours && !rec.remindedAt) {
        const owner = resto.owner || {};
        const ton = owner.tutoiement ? 'ton' : 'votre';
        await this.channel.send(core.normalizePhone(owner.whatsapp), { kind: 'text', text: `🔔 Petit rappel : une réponse attend ${ton} « OK » (réf. ${rec.code}, avis ${rec.stars || '?'}★ de ${rec.author || 'un client'}).` });
        this.store.put({ ...rec, remindedAt: this.iso() });
        n++;
      }
    }
    return n;
  }
}

/** Rédaction par défaut : le cœur partagé avec l'appli (Claude via clé API, sinon moteur démo). */
export function defaultGenerator(config) {
  const ai = (config && config.ai) || {};
  return async ({ review, profile, history, variant, previous, instruction }) => core.generateReply({
    review, profile, history, variant: variant || 'normal', previous, instruction,
    settings: { provider: ai.provider || 'anthropic', apiKey: ai.apiKey || process.env.ANTHROPIC_API_KEY || '', model: ai.model || 'claude-sonnet-5-5' },
    env: {}, firstTokenTimeoutMs: 20000, totalTimeoutMs: 60000,
  });
}
