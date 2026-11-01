// Client RÉEL de l'API Google Business Profile.
// Prérequis : accès API accordé par Google (quota 300 requêtes/min sur le projet), APIs activées,
// identifiants OAuth « Application Web » et un refresh token obtenu avec le scope business.manage
// (voir docs/ACCES_API_GOOGLE.md).
//
// Endpoints utilisés :
//   comptes      GET  https://mybusinessaccountmanagement.googleapis.com/v1/accounts
//   fiches       GET  https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations?readMask=name,title
//   avis         GET  https://mybusiness.googleapis.com/v4/{account}/{location}/reviews
//   répondre     PUT  https://mybusiness.googleapis.com/v4/{account}/{location}/reviews/{id}/reply   {"comment": "…"}
//   supprimer    DEL  https://mybusiness.googleapis.com/v4/{account}/{location}/reviews/{id}/reply
import { normalizeReview } from './parse.js';

export class GbpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.retryable = status === 429 || status >= 500;
  }
}

export class GoogleGbpClient {
  /**
   * @param {{clientId:string, clientSecret:string, refreshToken:string, fetchImpl?:Function}} opts
   */
  constructor(opts) {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.refreshToken = opts.refreshToken;
    this.fetch = opts.fetchImpl || globalThis.fetch;
    this.token = null;
    this.tokenExpires = 0;
  }

  async accessToken() {
    if (this.token && Date.now() < this.tokenExpires - 60000) return this.token;
    const res = await this.fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId, client_secret: this.clientSecret,
        refresh_token: this.refreshToken, grant_type: 'refresh_token',
      }).toString(),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new GbpError(res.status, 'OAuth : ' + (j.error_description || j.error || res.status));
    this.token = j.access_token;
    this.tokenExpires = Date.now() + (Number(j.expires_in) || 3600) * 1000;
    return this.token;
  }

  async request(method, url, body, attempt = 0) {
    const token = await this.accessToken();
    const res = await this.fetch(url, {
      method,
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && attempt === 0) { this.token = null; return this.request(method, url, body, 1); }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return this.request(method, url, body, attempt + 1);
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new GbpError(res.status, (json.error && json.error.message) || 'Erreur ' + res.status);
    return json;
  }

  /** Toutes les fiches accessibles (comptes personnels + groupes d'établissements). */
  async listLocations() {
    const out = [];
    let pageToken = '';
    const accounts = [];
    do {
      const j = await this.request('GET', 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts' + (pageToken ? '?pageToken=' + encodeURIComponent(pageToken) : ''));
      accounts.push(...(j.accounts || []));
      pageToken = j.nextPageToken || '';
    } while (pageToken);
    for (const acc of accounts) {
      let pt = '';
      do {
        const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${acc.name}/locations?readMask=name,title,storefrontAddress&pageSize=100${pt ? '&pageToken=' + encodeURIComponent(pt) : ''}`;
        const j = await this.request('GET', url);
        for (const l of j.locations || []) {
          out.push({ name: `${acc.name}/${l.name}`, title: l.title, account: acc.name, address: l.storefrontAddress && (l.storefrontAddress.addressLines || []).join(', ') });
        }
        pt = j.nextPageToken || '';
      } while (pt);
    }
    return out;
  }

  /** Avis d'une fiche, du plus récent au plus ancien. `since` (ISO) arrête la pagination. */
  async listReviews(locationName, { since, max = 200 } = {}) {
    const out = [];
    let pageToken = '';
    do {
      const url = `https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50&orderBy=${encodeURIComponent('updateTime desc')}${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
      const j = await this.request('GET', url);
      for (const r of j.reviews || []) {
        const n = normalizeReview(r, locationName);
        if (since && n.updateTime < since) return out;
        out.push(n);
      }
      pageToken = j.nextPageToken || '';
    } while (pageToken && out.length < max);
    return out;
  }

  async getReview(reviewKey) {
    const j = await this.request('GET', `https://mybusiness.googleapis.com/v4/${reviewKey}`);
    return normalizeReview(j, reviewKey.split('/reviews/')[0]);
  }

  async replyToReview(reviewKey, comment) {
    const j = await this.request('PUT', `https://mybusiness.googleapis.com/v4/${reviewKey}/reply`, { comment });
    return { text: j.comment, updateTime: j.updateTime };
  }

  async deleteReply(reviewKey) {
    await this.request('DELETE', `https://mybusiness.googleapis.com/v4/${reviewKey}/reply`);
  }
}
