// Canal de validation par WhatsApp.
//  - MockWhatsApp : boîte d'envoi en mémoire, pour les tests et la simulation.
//  - WhatsAppCloud : API WhatsApp Business (Meta). Rappel des règles Meta :
//      * hors de la « fenêtre de 24 h » (le patron ne vous a pas écrit depuis 24 h), seul un MODÈLE validé
//        par Meta peut être envoyé : on utilise donc un modèle « validation_avis » avec boutons ;
//      * les paramètres d'un modèle ne peuvent contenir ni retour à la ligne ni tabulation : on les aplatit.

export class MockWhatsApp {
  constructor() {
    this.outbox = [];
    this.seq = 0;
  }
  async send(to, message) {
    const id = 'wamid.mock' + (++this.seq);
    this.outbox.push({ id, to, ...message, at: new Date().toISOString() });
    return { id };
  }
  last(to) {
    for (let i = this.outbox.length - 1; i >= 0; i--) if (!to || this.outbox[i].to === to) return this.outbox[i];
    return null;
  }
}

const flat = (s, max = 900) => String(s || '').replace(/\s*\n+\s*/g, ' — ').replace(/\t/g, ' ').replace(/ {4,}/g, '   ').slice(0, max);

export class WhatsAppCloud {
  /**
   * @param {{phoneNumberId:string, token:string, apiVersion?:string, templateName?:string, language?:string, fetchImpl?:Function}} opts
   */
  constructor(opts) {
    this.opts = { apiVersion: 'v21.0', templateName: 'validation_avis', language: 'fr', ...opts };
    this.fetch = opts.fetchImpl || globalThis.fetch;
  }

  async post(payload) {
    const { apiVersion, phoneNumberId, token } = this.opts;
    const res = await this.fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('WhatsApp : ' + ((j.error && j.error.message) || res.status));
    return { id: j.messages && j.messages[0] && j.messages[0].id };
  }

  /**
   * message = { kind: 'validation'|'text', text, code, restaurant, stars, review, reply, inWindow }
   * - validation hors fenêtre 24 h → modèle avec 2 boutons (Publier / Modifier)
   * - validation dans la fenêtre   → message interactif à boutons
   * - text                          → message texte libre (fenêtre 24 h requise)
   */
  async send(to, message) {
    if (message.kind === 'validation' && !message.inWindow) {
      return this.post({
        to, type: 'template',
        template: {
          name: this.opts.templateName, language: { code: this.opts.language },
          components: [
            { type: 'body', parameters: [
              { type: 'text', text: flat(message.restaurant, 60) },
              { type: 'text', text: flat(message.stars, 20) },
              { type: 'text', text: flat(message.review, 300) },
              { type: 'text', text: flat(message.reply, 600) },
            ] },
            { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'OK:' + message.code }] },
            { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'EDIT:' + message.code }] },
          ],
        },
      });
    }
    if (message.kind === 'validation') {
      return this.post({
        to, type: 'interactive',
        interactive: {
          type: 'button', body: { text: String(message.text).slice(0, 1024) },
          action: { buttons: [
            { type: 'reply', reply: { id: 'OK:' + message.code, title: 'Publier ✅' } },
            { type: 'reply', reply: { id: 'EDIT:' + message.code, title: 'Modifier ✏️' } },
          ] },
        },
      });
    }
    return this.post({ to, type: 'text', text: { body: String(message.text).slice(0, 4000), preview_url: false } });
  }
}

/** Webhook Meta → liste de messages entrants { from, id, text, payload, contextId, at } */
export function parseWebhook(body) {
  const out = [];
  for (const entry of (body && body.entry) || []) {
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      for (const m of v.messages || []) {
        out.push({
          from: m.from, id: m.id, at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
          text: (m.text && m.text.body) || (m.button && m.button.text) || (m.interactive && m.interactive.button_reply && m.interactive.button_reply.title) || '',
          payload: (m.button && m.button.payload) || (m.interactive && m.interactive.button_reply && m.interactive.button_reply.id) || '',
          contextId: m.context && m.context.id,
        });
      }
    }
  }
  return out;
}
