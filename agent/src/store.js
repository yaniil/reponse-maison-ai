// État de l'agent : un fichier JSON (écriture atomique). Sans chemin : en mémoire (tests, simulation).
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class StateStore {
  constructor(path) {
    this.path = path || null;
    this.state = { reviews: {}, codes: {}, messages: {}, owners: {}, log: [] };
    if (this.path && existsSync(this.path)) {
      this.state = { ...this.state, ...JSON.parse(readFileSync(this.path, 'utf8')) };
    }
  }

  save() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = this.path + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.path);
  }

  get(key) { return this.state.reviews[key] || null; }
  put(rec) { this.state.reviews[rec.key] = rec; this.save(); return rec; }
  all() { return Object.values(this.state.reviews); }
  byCode(code) { const k = this.state.codes[String(code || '').toUpperCase()]; return k ? this.get(k) : null; }
  byMessage(id) { const k = this.state.messages[id]; return k ? this.get(k) : null; }
  linkMessage(id, key) { if (id) { this.state.messages[id] = key; this.save(); } }

  newCode(key) {
    let code;
    do {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    } while (this.state.codes[code]);
    this.state.codes[code] = key;
    return code;
  }

  ownerSeen(phone, at) { this.state.owners[phone] = { ...(this.state.owners[phone] || {}), lastInboundAt: at }; this.save(); }
  owner(phone) { return this.state.owners[phone] || {}; }

  log(event) {
    this.state.log.push({ at: new Date().toISOString(), ...event });
    if (this.state.log.length > 2000) this.state.log.splice(0, this.state.log.length - 2000);
    this.save();
  }
}
