// Stockage « local d'abord » : tout est lu/écrit instantanément sur l'appareil,
// puis synchronisé avec la base de l'artefact claude.ai quand elle est disponible
// (même données sur téléphone et ordinateur). Hors claude.ai : stockage local + sauvegarde manuelle.

const LOCAL_KEY = 'avispro.data.v1';
const KINDS = ['restaurants', 'history'];

function safeRead(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function safeWrite(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

function clean(obj) {
  // la base n'accepte que du JSON simple
  return JSON.parse(JSON.stringify(obj, (k, v) => (v === undefined ? null : v)));
}

export function createStore({ onChange } = {}) {
  const saved = safeRead(LOCAL_KEY) || {};
  const data = {
    restaurants: saved.restaurants || {},
    history: saved.history || {},
  };
  const dirty = new Set(saved.dirty || []); // « kind/id » à envoyer à la base
  let db = null;
  let status = 'local'; // local | sync | readonly | error
  let pushing = false;
  let retryTimer = null;
  const listeners = [];

  function persist() {
    safeWrite(LOCAL_KEY, { restaurants: data.restaurants, history: data.history, dirty: [...dirty] });
  }
  function emit(what) {
    if (onChange) onChange(what);
    for (const l of listeners) l(what);
  }

  function list(kind) {
    return Object.values(data[kind]).filter((x) => x && !x.deleted);
  }
  function get(kind, id) {
    const x = data[kind][id];
    return x && !x.deleted ? x : null;
  }
  function put(kind, obj) {
    const now = Date.now();
    const rec = { ...obj, updatedAt: now, createdAt: obj.createdAt || now };
    data[kind][rec.id] = rec;
    dirty.add(kind + '/' + rec.id);
    persist();
    emit(kind);
    schedulePush();
    return rec;
  }
  function remove(kind, id) {
    const old = data[kind][id];
    if (!old) return;
    data[kind][id] = { id, deleted: true, updatedAt: Date.now(), createdAt: old.createdAt || Date.now() };
    dirty.add(kind + '/' + id);
    persist();
    emit(kind);
    schedulePush();
  }

  // ---------------------------------------------------------------- synchronisation
  function schedulePush(delay) {
    if (!db || status === 'readonly') return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(pushDirty, delay == null ? 300 : delay);
  }

  async function pushDirty() {
    if (!db || pushing || status === 'readonly') return;
    pushing = true;
    try {
      for (const key of [...dirty]) {
        const [kind, id] = key.split('/');
        const rec = data[kind] && data[kind][id];
        if (!rec) { dirty.delete(key); continue; }
        try {
          const ref = db.collection(kind).doc(id);
          // ne jamais écraser une version plus récente faite sur un autre appareil
          const remote = await ref.get();
          const rdata = remote && remote.exists ? remote.data() : null;
          if (rdata && (Number(rdata.updatedAt) || 0) > (Number(rec.updatedAt) || 0)) {
            data[kind][id] = { ...rdata, id };
            emit(kind);
          } else {
            await ref.set(clean(rec));
          }
          dirty.delete(key);
          persist();
        } catch (e) {
          const code = e && e.code;
          if (code === 'invalid_argument' || code === 'not_granted') { status = 'readonly'; emit('status'); break; }
          if (code === 'quota_exceeded') { status = 'error'; emit('status'); break; }
          // transitoire : on réessaiera
          status = 'error'; emit('status');
          retryTimer = setTimeout(pushDirty, 8000);
          break;
        }
      }
      if (!dirty.size && status !== 'readonly') { status = 'sync'; emit('status'); }
    } finally {
      pushing = false;
    }
  }

  function mergeRemote(kind, docs, fromCache) {
    let changed = false;
    const remoteIds = new Set();
    for (const d of docs) {
      remoteIds.add(d.id);
      const r = d.data && d.data();
      if (!r) continue;
      const local = data[kind][d.id];
      if (!local || (Number(r.updatedAt) || 0) > (Number(local.updatedAt) || 0)) {
        data[kind][d.id] = { ...r, id: d.id };
        dirty.delete(kind + '/' + d.id);
        changed = true;
      }
    }
    // ce qui n'existe qu'ici (créé hors ligne ou avant la synchro) part vers la base
    if (!fromCache) for (const id of Object.keys(data[kind])) if (!remoteIds.has(id)) dirty.add(kind + '/' + id);
    if (changed) { persist(); emit(kind); }
    schedulePush(0);
  }

  function connect(dbNs) {
    if (!dbNs) return;
    db = dbNs;
    status = 'sync';
    emit('status');
    for (const kind of KINDS) {
      try {
        db.collection(kind).onSnapshot(
          (snap) => mergeRemote(kind, snap.docs || [], !!(snap.metadata && snap.metadata.fromCache)),
          (err) => { status = err && (err.code === 'revoked' || err.code === 'not_granted') ? 'readonly' : 'error'; emit('status'); },
        );
      } catch (e) {
        status = 'error';
        emit('status');
      }
    }
  }

  // ---------------------------------------------------------------- sauvegarde / restauration
  function exportAll() {
    return {
      app: 'AvisPro', version: 1, exportedAt: new Date().toISOString(),
      restaurants: list('restaurants'), history: list('history'),
    };
  }
  function importAll(json) {
    const obj = typeof json === 'string' ? JSON.parse(json) : json;
    if (!obj || (!Array.isArray(obj.restaurants) && !Array.isArray(obj.history))) throw new Error('Fichier de sauvegarde non reconnu');
    let n = 0;
    for (const kind of KINDS) {
      for (const rec of obj[kind] || []) {
        if (!rec || !rec.id) continue;
        const cur = data[kind][rec.id];
        if (!cur || (rec.updatedAt || 0) >= (cur.updatedAt || 0)) {
          data[kind][rec.id] = rec;
          dirty.add(kind + '/' + rec.id);
          n++;
        }
      }
    }
    persist();
    emit('restaurants'); emit('history');
    schedulePush(0);
    return n;
  }
  function wipe() {
    for (const kind of KINDS) for (const id of Object.keys(data[kind])) remove(kind, id);
  }

  return {
    list, get, put, remove, connect, exportAll, importAll, wipe,
    get status() { return status; },
    get pending() { return dirty.size; },
    subscribe(fn) { listeners.push(fn); },
  };
}

// ---------------------------------------------------------------- réglages (propres à l'appareil, jamais synchronisés)
const SETTINGS_KEY = 'avispro.settings.v1';
export const DEFAULT_SETTINGS = {
  provider: 'auto',
  modelTier: 'quick',
  apiKey: '',
  model: 'claude-sonnet-5-5',
  openaiKey: '', openaiBaseUrl: 'https://api.mistral.ai/v1', openaiModel: 'mistral-small-latest',
  safetyFallback: true,
  me: { prenom: '', telephone: '', marque: 'Réponse Maison' },
  demo: { nom: '', ton: 'chaleureux', tutoiement: false },
  lastRestaurantId: '',
};

export function loadSettings() {
  const s = safeRead(SETTINGS_KEY) || {};
  return {
    ...DEFAULT_SETTINGS, ...s,
    me: { ...DEFAULT_SETTINGS.me, ...(s.me || {}) },
    demo: { ...DEFAULT_SETTINGS.demo, ...(s.demo || {}) },
  };
}
export function saveSettings(s) {
  return safeWrite(SETTINGS_KEY, s);
}
