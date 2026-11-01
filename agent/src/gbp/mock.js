// Client SIMULÉ de Google Business Profile : même interface que le client réel,
// pour tester toute la boucle avant d'avoir l'accès API. Peut simuler des pannes (429, 500).
import { normalizeReview } from './parse.js';
import { GbpError } from './google.js';

const STAR_ENUM = { 1: 'ONE', 2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE' };

export class MockGbpClient {
  constructor({ now } = {}) {
    this.locations = new Map(); // name → { title, reviews: Map(reviewId → raw v4 review) }
    this.calls = [];
    this.failures = []; // file d'erreurs à renvoyer : { method, status }
    this.now = now || (() => Date.now());
    this.seq = 0;
  }

  addLocation(name, title) {
    this.locations.set(name, { title, reviews: new Map() });
    return name;
  }

  /** Ajoute un avis comme le ferait un client sur Google. */
  addReview(locationName, { author = 'Client', stars = 5, text = '', createdAt, reply = null, anonymous = false }) {
    const loc = this.locations.get(locationName);
    const id = 'rv' + (++this.seq).toString().padStart(4, '0');
    const t = new Date(createdAt || this.now()).toISOString();
    loc.reviews.set(id, {
      name: `${locationName}/reviews/${id}`, reviewId: id,
      reviewer: { displayName: author, isAnonymous: anonymous }, starRating: STAR_ENUM[stars],
      comment: text, createTime: t, updateTime: t,
      reviewReply: reply ? { comment: reply, updateTime: t } : undefined,
    });
    return `${locationName}/reviews/${id}`;
  }

  /** Le patron répond lui-même depuis Google (pour tester qu'on n'écrase jamais sa réponse). */
  ownerRepliesDirectly(reviewKey, comment) {
    const raw = this.raw(reviewKey);
    raw.reviewReply = { comment, updateTime: new Date(this.now()).toISOString() };
  }

  failNext(method, status) { this.failures.push({ method, status }); }

  raw(reviewKey) {
    const [loc, id] = reviewKey.split('/reviews/');
    const l = this.locations.get(loc);
    return l && l.reviews.get(id);
  }

  maybeFail(method) {
    const i = this.failures.findIndex((f) => f.method === method);
    if (i !== -1) {
      const f = this.failures.splice(i, 1)[0];
      throw new GbpError(f.status, `Erreur simulée ${f.status}`);
    }
  }

  async listLocations() {
    this.calls.push(['listLocations']);
    return [...this.locations.entries()].map(([name, l]) => ({ name, title: l.title }));
  }

  async listReviews(locationName, { since } = {}) {
    this.calls.push(['listReviews', locationName]);
    this.maybeFail('listReviews');
    const l = this.locations.get(locationName);
    if (!l) throw new GbpError(404, 'Fiche inconnue');
    return [...l.reviews.values()]
      .map((r) => normalizeReview(r, locationName))
      .filter((r) => !since || r.updateTime >= since)
      .sort((a, b) => (a.updateTime < b.updateTime ? 1 : -1));
  }

  async getReview(reviewKey) {
    this.calls.push(['getReview', reviewKey]);
    const raw = this.raw(reviewKey);
    if (!raw) throw new GbpError(404, 'Avis introuvable');
    return normalizeReview(raw, reviewKey.split('/reviews/')[0]);
  }

  async replyToReview(reviewKey, comment) {
    this.calls.push(['replyToReview', reviewKey]);
    this.maybeFail('replyToReview');
    const raw = this.raw(reviewKey);
    if (!raw) throw new GbpError(404, 'Avis introuvable');
    if (!comment || comment.length > 4096) throw new GbpError(400, 'Réponse vide ou trop longue');
    raw.reviewReply = { comment, updateTime: new Date(this.now()).toISOString() };
    return { text: comment, updateTime: raw.reviewReply.updateTime };
  }

  async deleteReply(reviewKey) {
    const raw = this.raw(reviewKey);
    if (raw) delete raw.reviewReply;
  }
}
