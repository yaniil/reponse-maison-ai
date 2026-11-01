// AvisPro — appli mobile une page (Phase 1) + écran Démo (Phase 2).
import * as core from '../core/index.js';
import { createStore, loadSettings, saveSettings } from './store.js';
import { createDemoScreen } from './demo.js';
import { ICONS } from './icons.js';
import { createTypewriter } from './typewriter.js';

const VERSION = '1.0.0';
const $ = (sel, root) => (root || document).querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS_LABEL = { brouillon: 'Brouillon', envoye: 'Envoyé au patron', publie: 'Publié' };
const PROVIDER_LABEL = { claude: 'IA Claude', anthropic: 'IA Claude (clé)', openai: 'IA (clé)', demo: 'Hors-ligne' };
const TONES = [
  { id: 'chaleureux', label: 'Chaleureux', ex: '« Ravis que nos pâtes vous aient plu ! Au plaisir de vous revoir très vite. »' },
  { id: 'sobre', label: 'Sobre', ex: '« Nous vous remercions pour ce retour. Au plaisir de vous accueillir à nouveau. »' },
  { id: 'familial', label: 'Familial', ex: '« Ça nous fait chaud au cœur, merci ! Vous êtes ici chez vous. »' },
];

// ------------------------------------------------------------------ état
const settings = loadSettings();
const env = { inClaude: !!(window.claude && typeof window.claude.use === 'function'), sample: null, sampleAvailable: false, sampleWarm: false, downloads: null, dbChecked: false };
const store = createStore({ onChange: (what) => (what === 'status' ? renderTop() : scheduleRender()) });

function loadDraft() {
  try { return JSON.parse(localStorage.getItem('avispro.draft') || 'null') || null; } catch (e) { return null; }
}
function saveDraft() {
  try { localStorage.setItem('avispro.draft', JSON.stringify(ui.draft)); } catch (e) { /* stockage indisponible */ }
}

const ui = {
  tab: 'repondre',
  draft: loadDraft() || { text: '', stars: null, author: '' },
  current: null, // { entryId, text, alerts, provider, fallback, fallbackReason, analysis, templateIds, attempt, status }
  busy: false,
  phase: '',
  controller: null,
  historyFilter: 'all',
  sheet: null,
  bench: { running: false, results: [], stop: false },
};

// ------------------------------------------------------------------ utilitaires
function toast(msg) {
  const old = $('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}

async function copyWithFallback(text, label) {
  if (await copyText(text)) { toast(label || 'Copié'); return; }
  openSheet({ type: 'copy', text, title: label || 'Copier' });
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
function starsText(n) {
  return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : 'sans note';
}
function restaurants() {
  return store.list('restaurants').sort((a, b) => String(a.nom).localeCompare(String(b.nom), 'fr'));
}
function currentRestaurant() {
  const list = restaurants();
  return list.find((r) => r.id === settings.lastRestaurantId) || list[0] || null;
}
function entriesFor(restaurantId) {
  return store.list('history').filter((h) => !restaurantId || restaurantId === 'all' || h.restaurantId === restaurantId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
function providerNow() {
  return core.resolveProvider(providerSettings(), env);
}
function providerSettings() {
  return {
    provider: settings.provider, apiKey: settings.apiKey, model: settings.model, modelTier: settings.modelTier,
    openaiKey: settings.openaiKey, openaiBaseUrl: settings.openaiBaseUrl, openaiModel: settings.openaiModel,
  };
}
function persistSettings() { saveSettings(settings); }
function isTyping() {
  const a = document.activeElement;
  return a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type !== 'button')) && !!a.closest('#view, .sheet');
}

// ------------------------------------------------------------------ rendu
let renderPending = false;
function scheduleRender() {
  if (isTyping()) { renderPending = true; return; }
  if (renderPending === 'raf') return;
  renderPending = 'raf';
  requestAnimationFrame(() => { renderPending = false; render(); });
}
document.addEventListener('focusout', () => { if (renderPending === true) setTimeout(() => { if (!isTyping()) { renderPending = false; render(); } }, 120); });

function render() {
  renderTop();
  const view = $('#view');
  const scroll = window.scrollY;
  view.innerHTML = ({ repondre: viewRepondre, historique: viewHistorique, restaurants: viewRestaurants, reglages: viewReglages }[ui.tab] || viewRepondre)();
  document.querySelectorAll('.nav button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === ui.tab ? 'page' : 'false'));
  window.scrollTo(0, scroll);
  renderSheet();
  autosize();
}

function renderTop() {
  const p = providerNow();
  const el = $('#ia-status');
  if (!el) return;
  const sync = store.status === 'sync' ? ' · synchro ✓' : '';
  el.innerHTML = `<span class="dot ${p === 'demo' ? 'is-off' : 'is-ok'}"></span>${esc(PROVIDER_LABEL[p])}${sync}`;
}

function autosize() {
  document.querySelectorAll('textarea[data-autosize]').forEach((ta) => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(Math.max(ta.scrollHeight + 2, 120), 520) + 'px';
  });
}

// ------------------------------------------------------------------ vue « Répondre »
function viewRepondre() {
  const list = restaurants();
  const r = currentRestaurant();
  if (!list.length) {
    return `
      <h2>Bienvenue dans ton outil</h2>
      <div class="empty">
        <b>Ajoute ton premier restaurant</b>
        <span>Nom, ton, tutoiement, signature, sujets à éviter, WhatsApp du patron : 1 minute, sur place avec lui.</span>
        <button class="btn primary" data-act="new-restaurant">Ajouter un restaurant</button>
        <button class="linkish" data-act="example-restaurant">ou essayer avec un restaurant d'exemple</button>
      </div>
      <div class="card"><h3>Pour une démo devant un prospect</h3><p class="hint">Le bouton « Démo » en haut ouvre l'écran épuré : on colle son avis, la réponse s'écrit en direct. Aucun réglage nécessaire.</p>
      <button class="btn block" data-act="open-demo">${ICONS.spark} Ouvrir l'écran démo</button></div>`;
  }
  const d = ui.draft;
  if (ui.current && ui.current.entryId) {
    const ce = store.get('history', ui.current.entryId);
    if (!ce || ce.restaurantId !== r.id) ui.current = null;
  }
  const chips = list.map((x) => `<button class="chip" aria-pressed="${r && x.id === r.id}" data-act="pick-restaurant" data-id="${esc(x.id)}">${esc(x.nom)}</button>`).join('');
  const stars = [1, 2, 3, 4, 5].map((n) => `<button class="star ${d.stars && n <= d.stars ? 'on' : ''}" data-act="star" data-n="${n}" aria-label="${n} étoile${n > 1 ? 's' : ''}">★</button>`).join('');
  return `
    <div class="chips" role="group" aria-label="Restaurant">${chips}<button class="chip add" data-act="new-restaurant">+ Ajouter</button></div>
    <section class="card" aria-labelledby="t-avis">
      <div class="row" style="justify-content:space-between"><span class="label" id="t-avis">Avis à traiter · ${esc(r.nom)}</span>
      <button class="linkish" data-act="load-example">Exemple</button></div>
      <label class="field"><span class="sr">Texte de l'avis</span>
        <textarea id="review-text" data-autosize placeholder="Colle ici le texte de l'avis Google (appui long → Coller)">${esc(d.text)}</textarea></label>
      <div class="row">
        <div class="stars" role="group" aria-label="Nombre d'étoiles">${stars}<span class="auto">${d.stars ? `<button class="linkish" data-act="star" data-n="0">note auto</button>` : 'note auto'}</span></div>
      </div>
      <label class="field"><span>Prénom du client <em>(facultatif)</em></span>
        <input type="text" id="review-author" autocomplete="off" placeholder="ex. Sophie M." value="${esc(d.author)}"></label>
      <button class="btn primary block" data-act="generate" ${ui.busy ? 'disabled' : ''}>${ICONS.pen} Rédiger la réponse</button>
    </section>
    ${resultCard(r)}`;
}

function resultCard(r) {
  const c = ui.current;
  if (!c && !ui.busy) return '';
  const a = c && c.analysis;
  const meta = [];
  if (a) {
    meta.push(`<span>Avis <b>${a.stars ? a.stars + '★' : '—'}${a.starsEstimated ? ' (estimée)' : ''}</b></span>`);
    meta.push(`<span><b>${esc(core.categoryLabel(a.category))}</b></span>`);
    if (a.lang !== 'fr') meta.push(`<span>langue <b>${esc(a.lang)}</b></span>`);
  }
  if (c && c.provider) meta.push(`<span>rédigé par <b>${c.provider === 'demo' ? 'moteur hors-ligne' : 'Claude'}</b></span>`);
  const alerts = (c && c.alerts) || [];
  const alertsHtml = alerts.length ? `<ul class="alerts">${alerts.map((x) => `<li class="alert ${esc(x.level)}"><b>${x.level === 'rouge' ? '⚠ Urgent' : x.level === 'orange' ? '⚠ À voir' : 'ℹ'}</b><span>${esc(x.message)}</span></li>`).join('')}</ul>` : '';
  const fb = c && c.fallback ? `<p class="fallback-note">Rédigé hors IA (${esc(c.fallbackReason || 'IA indisponible')}). Relis-la, ou réessaie avec « Régénérer ».</p>` : '';
  const replyArea = ui.busy
    ? `<div class="phase" id="phase">${esc(phaseLabel(ui.phase))}</div><div class="reply-box caret" id="reply-stream" aria-live="polite"></div>`
    : `<label class="field"><span class="sr">Réponse proposée (modifiable)</span><textarea id="reply-edit" class="reply-edit" data-autosize>${esc(c.text)}</textarea></label>`;
  const owner = r && r.whatsapp ? '' : '<p class="hint">Astuce : ajoute le WhatsApp du patron dans sa fiche pour l\'envoyer en un geste.</p>';
  const actions = ui.busy
    ? `<button class="btn block" data-act="cancel">Arrêter</button>`
    : `<div class="btn-grid">
        <button class="btn" data-act="variant" data-v="regenerate">${ICONS.refresh} Régénérer</button>
        <button class="btn" data-act="variant" data-v="shorter">Plus court</button>
        <button class="btn" data-act="variant" data-v="warmer">Plus chaleureux</button>
        <button class="btn" data-act="copy-reply">${ICONS.copy} Copier</button>
      </div>
      <a class="btn wa block" id="wa-owner" data-act="wa-owner" href="${esc(ownerLink(r, c))}" target="_blank" rel="noopener">${ICONS.wa} Envoyer au patron sur WhatsApp</a>
      ${owner}
      <div class="status-row" role="group" aria-label="Statut">${['brouillon', 'envoye', 'publie'].map((s) => `<button data-act="set-status" data-s="${s}" aria-pressed="${c.status === s}">${STATUS_LABEL[s]}</button>`).join('')}</div>`;
  return `<section class="ticket" aria-label="Réponse proposée">
      <div class="ticket-meta">${meta.join('')}</div>
      ${alertsHtml}${replyArea}${fb}${actions}
    </section>`;
}

function phaseLabel(p) {
  return { reading: "Lecture de l'avis…", writing: 'Rédaction…' }[p] || 'Préparation…';
}

function ownerLink(r, c) {
  if (!c) return '#';
  const entry = c.entryId ? store.get('history', c.entryId) : null;
  const review = entry ? entry.review : { text: ui.draft.text, stars: ui.draft.stars, author: ui.draft.author };
  return core.waLink(r && r.whatsapp, core.ownerMessage({ profile: r, review, reply: c.text, alerts: c.alerts, me: settings.me }));
}

// ------------------------------------------------------------------ génération
async function generate(variant) {
  const r = currentRestaurant();
  if (!r) { openRestaurantForm(); return; }
  const d = ui.draft;
  if (!d.text.trim() && !d.stars) { toast("Colle d'abord le texte de l'avis (ou choisis une note)."); $('#review-text') && $('#review-text').focus(); return; }
  if (ui.controller) ui.controller.abort();
  const ctl = new AbortController();
  ui.controller = ctl;
  const prev = ui.current && variant !== 'normal' ? { text: ui.current.text, templateIds: ui.current.templateIds } : null;
  const attempt = variant === 'regenerate' ? ((ui.current && ui.current.attempt) || 0) + 1 : 0;
  const keepEntry = variant !== 'normal' && ui.current ? ui.current.entryId : null;
  ui.busy = true;
  ui.phase = 'reading';
  render();
  const streamEl = () => $('#reply-stream');
  const typer = createTypewriter((t) => { const el = streamEl(); if (el) el.textContent = t; });
  const history = entriesFor(r.id).filter((h) => h.id !== keepEntry).slice(0, 6).map((h) => ({ reply: h.reply, templateIds: h.templateIds || [] }));
  try {
    const out = await core.generateReply({
      review: { text: d.text, stars: d.stars, author: d.author },
      profile: r, history, variant: variant === 'regenerate' ? 'normal' : variant, previous: prev, attempt,
      settings: providerSettings(), env: { ...env },
      onText: (t) => typer.set(t),
      onPhase: (p) => { ui.phase = p; const el = $('#phase'); if (el) el.textContent = phaseLabel(p); },
      signal: ctl.signal, typingSpeed: 22, firstTokenTimeoutMs: settings.safetyFallback ? 9000 : 90000,
    });
    await typer.flush();
    if (out.provider === 'claude') env.sampleWarm = true;
    const entry = saveEntry(r, out, keepEntry);
    ui.current = {
      entryId: entry.id, text: out.text, alerts: out.alerts, provider: out.provider, fallback: out.fallback,
      fallbackReason: out.fallbackReason, analysis: out.analysis, templateIds: out.templateIds || [], attempt, status: entry.status,
    };
  } catch (e) {
    if (!(e && e.name === 'AbortError')) toast('Impossible de générer : ' + ((e && e.message) || 'erreur'));
  } finally {
    typer.stop();
    ui.busy = false;
    ui.controller = null;
    render();
    const t = $('.ticket');
    if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function saveEntry(r, out, entryId) {
  const a = out.analysis || {};
  const existing = entryId ? store.get('history', entryId) : null;
  const base = existing || { id: core.uid('h-'), restaurantId: r.id, status: 'brouillon', versions: 0 };
  return store.put('history', {
    ...base,
    restaurantId: r.id, restaurantName: r.nom,
    review: { text: ui.draft.text, stars: ui.draft.stars || null, author: ui.draft.author || '' },
    reply: out.text, category: a.category || '', starsEstimated: a.starsEstimated ? a.stars : null,
    complaints: a.complaints || [], praise: a.praise || [], dishes: (a.dishes || []).map((x) => x.text),
    alerts: out.alerts || [], provider: out.provider, fallback: !!out.fallback, templateIds: out.templateIds || [],
    versions: (base.versions || 0) + 1,
  });
}

let editTimer = null;
function onReplyEdited(value) {
  if (!ui.current) return;
  ui.current.text = value;
  const wa = $('#wa-owner');
  if (wa) wa.setAttribute('href', ownerLink(currentRestaurant(), ui.current));
  clearTimeout(editTimer);
  editTimer = setTimeout(() => {
    const e = ui.current && ui.current.entryId && store.get('history', ui.current.entryId);
    if (e) store.put('history', { ...e, reply: value, edited: true });
  }, 700);
}

function setStatus(status) {
  if (!ui.current || !ui.current.entryId) return;
  const e = store.get('history', ui.current.entryId);
  if (!e) return;
  store.put('history', { ...e, status });
  ui.current.status = status;
  document.querySelectorAll('.status-row button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === status));
}

// ------------------------------------------------------------------ vue « Historique »
function viewHistorique() {
  const list = restaurants();
  const f = ui.historyFilter;
  const entries = entriesFor(f);
  const chips = [`<button class="chip" aria-pressed="${f === 'all'}" data-act="filter" data-id="all">Tous</button>`]
    .concat(list.map((r) => `<button class="chip" aria-pressed="${f === r.id}" data-act="filter" data-id="${esc(r.id)}">${esc(r.nom)}</button>`)).join('');
  const reportBtn = f !== 'all' ? `<button class="btn block" data-act="open-report" data-id="${esc(f)}">${ICONS.chart} Bilan du mois pour ce restaurant</button>` : (list.length ? `<p class="hint">Choisis un restaurant pour voir son bilan du mois.</p>` : '');
  let body = '';
  if (!entries.length) {
    body = `<div class="empty"><b>Aucune réponse pour l'instant</b><span>Chaque réponse rédigée est enregistrée ici, avec son statut : brouillon, envoyée au patron, publiée.</span></div>`;
  } else {
    let month = '';
    for (const e of entries) {
      const m = core.monthLabel(core.monthKey(e.createdAt));
      if (m !== month) { month = m; body += `<div class="month-head">${esc(m)}</div>`; }
      const alert = (e.alerts || []).some((x) => x.level === 'rouge');
      body += `<button class="item" data-act="open-entry" data-id="${esc(e.id)}">
        <div class="item-top"><span class="item-title">${esc(f === 'all' ? e.restaurantName || '' : (e.review && e.review.author) || 'Client')}</span>
          <span class="row" style="gap:6px;flex-wrap:nowrap">${alert ? '<span class="pill alerte">alerte</span>' : ''}<span class="pill ${esc(e.status)}">${esc(STATUS_LABEL[e.status] || e.status)}</span></span></div>
        <div class="item-top"><span class="mini-stars">${esc(starsText(e.review && e.review.stars))}</span><span class="hint">${esc(fmtDate(e.createdAt))}</span></div>
        <div class="item-text">${esc((e.review && e.review.text) || '(note sans texte)')}</div>
      </button>`;
    }
  }
  return `<h2>Historique</h2><div class="chips" role="group" aria-label="Filtrer par restaurant">${chips}</div>${reportBtn}<div class="list">${body}</div>`;
}

// ------------------------------------------------------------------ vue « Restaurants »
function viewRestaurants() {
  const list = restaurants();
  const items = list.map((r) => {
    const n = entriesFor(r.id).length;
    return `<button class="item" data-act="edit-restaurant" data-id="${esc(r.id)}">
      <div class="item-top"><span class="item-title">${esc(r.nom)}</span><span class="pill">${n} réponse${n > 1 ? 's' : ''}</span></div>
      <div class="item-text">${esc([r.cuisine, r.ton, r.tutoiement ? 'tutoiement' : 'vouvoiement'].filter(Boolean).join(' · '))}</div>
      <div class="item-text">${r.whatsapp ? 'WhatsApp patron : ' + esc(r.whatsapp) : '<span style="color:var(--amber)">WhatsApp du patron à compléter</span>'}</div>
    </button>`;
  }).join('');
  return `<h2>Restaurants</h2><p class="lede">Une fiche par client : c'est elle qui donne le ton des réponses.</p>
    <button class="btn primary block" data-act="new-restaurant">+ Ajouter un restaurant</button>
    <div class="list">${items || '<div class="empty"><b>Aucun restaurant</b><span>Remplis la fiche avec le patron pendant l\'installation (10 minutes, checklist dans le kit).</span></div>'}</div>`;
}

// ------------------------------------------------------------------ vue « Réglages »
function viewReglages() {
  const p = providerNow();
  const opt = (id) => `<label class="tone-card ${settings.provider === id ? 'is-on' : ''}" style="display:flex;gap:10px;align-items:flex-start">
      <input type="radio" name="provider" value="${id}" ${settings.provider === id ? 'checked' : ''} data-bind="provider" style="margin-top:5px">
      <span style="display:grid;gap:2px;font-style:normal"><b>${esc(core.PROVIDERS[id].label)}</b><span>${esc(providerHint(id))}</span></span></label>`;
  const syncText = {
    sync: '☁️ Synchronisé avec ton compte claude.ai : mêmes fiches et historique sur téléphone et ordinateur.',
    local: '📱 Enregistré sur cet appareil uniquement. Pense à exporter une sauvegarde de temps en temps.',
    readonly: '🔒 Lecture seule ici : ouvre l\'outil depuis ton propre compte pour enregistrer.',
    error: '⏳ Synchronisation en pause, nouvel essai automatique. Rien n\'est perdu sur ce téléphone.',
  }[store.status] || '';
  const b = ui.bench;
  const benchHtml = b.results.length ? b.results.map((x) => `<div class="bench-item"><div class="row" style="justify-content:space-between"><b>${esc(x.kind)}</b><span class="hint">${esc(x.meta)}</span></div><q>${esc(x.review || '(sans texte)')}</q><div class="bench-reply">${esc(x.reply)}</div>${x.alerts ? `<div class="hint">⚠ ${esc(x.alerts)}</div>` : ''}</div>`).join('') : '';
  return `<h2>Réglages</h2>
    <section class="card"><h3>Moteur de rédaction</h3>
      <p class="hint">Utilisé maintenant : <b>${esc(PROVIDER_LABEL[p])}</b>${p === 'demo' ? ' (sans IA : correct, mais moins fin que Claude)' : ''}.</p>
      <div class="tone-cards">${['auto', 'claude', 'anthropic', 'openai', 'demo'].map(opt).join('')}</div>
      <div ${settings.provider === 'anthropic' || (settings.provider === 'auto' && !env.sampleAvailable) ? '' : 'hidden'} class="field-group" style="display:grid;gap:10px">
        <label class="field"><span>Clé API Claude <em>(console.anthropic.com → API Keys)</em></span>
          <input type="password" id="set-apikey" data-bind="apiKey" autocomplete="off" placeholder="sk-ant-…" value="${esc(settings.apiKey)}"></label>
        <label class="field"><span>Modèle</span><select id="set-model" data-bind="model">${core.ANTHROPIC_MODELS.map((m) => `<option value="${m.id}" ${settings.model === m.id ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select></label>
        <p class="hint">La clé reste sur cet appareil. Compter environ 0,5 centime par réponse.</p>
      </div>
      <div ${settings.provider === 'openai' ? '' : 'hidden'} style="display:grid;gap:10px">
        <label class="field"><span>Adresse de l'API</span><input type="url" data-bind="openaiBaseUrl" value="${esc(settings.openaiBaseUrl)}"></label>
        <label class="field"><span>Clé</span><input type="password" data-bind="openaiKey" autocomplete="off" value="${esc(settings.openaiKey)}"></label>
        <label class="field"><span>Modèle</span><input type="text" data-bind="openaiModel" value="${esc(settings.openaiModel)}"></label>
      </div>
      <div ${env.sampleAvailable ? '' : 'hidden'}><span class="label">Claude via ton compte</span>
        <div class="seg" role="group" aria-label="Vitesse">${[['quick', 'Rapide (démos)'], ['default', 'Plus soigné (plus lent)']].map(([v, l]) => `<button data-act="tier" data-v="${v}" aria-pressed="${settings.modelTier === v}">${l}</button>`).join('')}</div></div>
      <label class="toggle-row"><span>Si l'IA ne répond pas en 9 s, utiliser le moteur hors-ligne (recommandé en rendez-vous)</span>
        <input type="checkbox" data-bind="safetyFallback" ${settings.safetyFallback ? 'checked' : ''}></label>
      <button class="btn block" data-act="test-ai">Tester sur un avis</button>
      <div id="test-out"></div>
    </section>
    <section class="card"><h3>Toi</h3>
      <p class="hint">Sert à signer tes messages WhatsApp au patron et le bilan du mois.</p>
      <label class="field"><span>Ton prénom</span><input type="text" data-bind="me.prenom" value="${esc(settings.me.prenom)}" placeholder="ex. Karim"></label>
      <label class="field"><span>Ton téléphone</span><input type="tel" data-bind="me.telephone" value="${esc(settings.me.telephone)}" placeholder="06 …"></label>
      <label class="field"><span>Nom de ton offre</span><input type="text" data-bind="me.marque" value="${esc(settings.me.marque)}"></label>
    </section>
    <section class="card"><h3>Écran démo</h3>
      <div class="seg" role="group" aria-label="Ton de la démo">${TONES.map((t) => `<button data-act="demo-tone" data-v="${t.id}" aria-pressed="${settings.demo.ton === t.id}">${t.label}</button>`).join('')}</div>
      <div class="seg" role="group" aria-label="Tutoiement de la démo"><button data-act="demo-tu" data-v="0" aria-pressed="${!settings.demo.tutoiement}">Vouvoiement</button><button data-act="demo-tu" data-v="1" aria-pressed="${!!settings.demo.tutoiement}">Tutoiement</button></div>
      <p class="hint">Avant d'entrer chez un restaurateur : ouvre la démo et fais un essai, ça « réveille » l'IA (et valide l'autorisation la première fois).</p>
    </section>
    <section class="card"><h3>Banc d'essai</h3>
      <p class="hint">Passe ${core.SAMPLE_REVIEWS.length} avis types (positifs, négatifs, agressifs, faux, anglais…) dans le moteur actuel pour vérifier la qualité des réponses.</p>
      <button class="btn block" data-act="${b.running ? 'bench-stop' : 'bench-run'}">${b.running ? 'Arrêter' : 'Lancer le banc d\'essai'}</button>
      ${b.results.length ? `<button class="btn block small" data-act="bench-copy">Copier les résultats</button>` : ''}
      <div id="bench-out" style="display:grid;gap:10px">${benchHtml}</div>
    </section>
    <section class="card"><h3>Données</h3>
      <p class="hint">${esc(syncText)}${store.pending && (store.status === 'sync' || store.status === 'error') ? ` (${store.pending} en attente d'envoi)` : ''}</p>
      <div class="btn-grid"><button class="btn" data-act="export">Exporter</button><button class="btn" data-act="copy-backup">Copier la sauvegarde</button></div>
      <label class="btn block" style="position:relative;overflow:hidden">Importer une sauvegarde<input type="file" accept="application/json,.json" data-act-change="import" style="position:absolute;inset:0;opacity:0"></label>
      <button class="btn danger block" data-act="wipe">Tout effacer</button>
    </section>
    <p class="hint" style="text-align:center">AvisPro ${VERSION} · IA Claude + moteur hors-ligne de secours · ${esc(settings.me.marque || '')}</p>`;
}

function providerHint(id) {
  if (id === 'auto') return env.sampleAvailable ? 'Ici : Claude via ton compte, sinon la clé API, sinon le moteur hors-ligne.' : 'Claude via ton compte quand l\'outil est ouvert dans claude.ai, sinon la clé API, sinon le moteur hors-ligne.';
  if (id === 'claude') return env.sampleAvailable ? 'Disponible ici ✓ Aucune clé à gérer.' : 'Disponible quand l\'outil est ouvert depuis claude.ai.';
  if (id === 'anthropic') return 'Pour la version installée hors claude.ai, et pour l\'agent automatique.';
  if (id === 'openai') return 'Autre fournisseur avec la même interface (avancé).';
  return 'Aucune connexion nécessaire. Toujours disponible, y compris en secours.';
}

// ------------------------------------------------------------------ feuilles (fiches, détail, bilan, confirmation)
function openSheet(s) { ui.sheet = s; renderSheet(); }
function closeSheet() { ui.sheet = null; renderSheet(); }

function renderSheet() {
  const root = $('#sheet-root');
  const s = ui.sheet;
  if (!s) { root.innerHTML = ''; document.body.style.overflow = ''; return; }
  document.body.style.overflow = 'hidden';
  let html = '';
  if (s.type === 'restaurant') html = sheetRestaurant(s);
  else if (s.type === 'entry') html = sheetEntry(s);
  else if (s.type === 'report') html = sheetReport(s);
  else if (s.type === 'confirm') html = `<div class="sheet-head"><h2>${esc(s.title)}</h2></div><p>${esc(s.message)}</p>
      <div class="btn-grid"><button class="btn" data-act="close-sheet">Annuler</button><button class="btn ${s.danger ? 'danger' : 'primary'}" data-act="confirm-yes">${esc(s.yes || 'Confirmer')}</button></div>`;
  else if (s.type === 'copy') html = `<div class="sheet-head"><h2>${esc(s.title)}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">✕</button></div>
      <p class="hint">La copie automatique est bloquée ici : sélectionne le texte et copie-le.</p><textarea readonly style="min-height:240px">${esc(s.text)}</textarea>`;
  root.innerHTML = `<div class="sheet-backdrop" data-act="backdrop"><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div></div>`;
  autosize();
  const first = root.querySelector('input:not([type=hidden]), textarea');
  if (s.type === 'restaurant' && s.isNew && first) setTimeout(() => first.focus(), 60);
}

function openRestaurantForm(id) {
  const r = id ? store.get('restaurants', id) : null;
  openSheet({ type: 'restaurant', isNew: !r, form: r ? { ...r } : { id: core.uid('r-'), nom: '', cuisine: '', ton: 'chaleureux', tutoiement: false, signature: '', aEviter: '', whatsapp: '', prenomPatron: '', tutoiePatron: false, contact: '', infos: '' } });
}

function sheetRestaurant(s) {
  const f = s.form;
  const sigPh = f.nom ? core.defaultSignature(f) : "ex. Marco et toute l'équipe";
  return `<div class="sheet-head"><h2>${s.isNew ? 'Nouveau restaurant' : esc(f.nom || 'Restaurant')}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">✕</button></div>
    <form id="restaurant-form" style="display:grid;gap:14px" autocomplete="off">
      <label class="field"><span>Nom du restaurant</span><input type="text" id="f-nom" name="nom" required value="${esc(f.nom)}" placeholder="ex. Chez Marco"></label>
      <label class="field"><span>Type de cuisine</span><input type="text" id="f-cuisine" name="cuisine" value="${esc(f.cuisine)}" placeholder="ex. italienne, bistrot, burgers"></label>
      <div class="field"><span>Ton des réponses</span><div class="tone-cards">${TONES.map((t) => `<button type="button" class="tone-card" data-act="form-tone" data-v="${t.id}" aria-pressed="${f.ton === t.id}"><b>${t.label}</b><span>${esc(t.ex)}</span></button>`).join('')}</div></div>
      <div class="field"><span>Le restaurant s'adresse aux clients en…</span><div class="seg"><button type="button" data-act="form-tu" data-v="0" aria-pressed="${!f.tutoiement}">Vouvoiement</button><button type="button" data-act="form-tu" data-v="1" aria-pressed="${!!f.tutoiement}">Tutoiement</button></div></div>
      <label class="field"><span>Signature</span><input type="text" id="f-signature" name="signature" value="${esc(f.signature)}" placeholder="${esc(sigPh)}"></label>
      <label class="field"><span>Sujets à éviter <em>(séparés par des virgules)</em></span><textarea id="f-aEviter" name="aEviter" style="min-height:70px" placeholder="ex. les travaux, les prix, le parking">${esc(f.aEviter)}</textarea></label>
      <label class="field"><span>WhatsApp du patron</span><input type="tel" id="f-whatsapp" name="whatsapp" value="${esc(f.whatsapp)}" placeholder="06 12 34 56 78"></label>
      <div class="row"><label class="field grow"><span>Prénom du patron</span><input type="text" id="f-prenomPatron" name="prenomPatron" value="${esc(f.prenomPatron)}" placeholder="ex. Marco"></label>
        <label class="row" style="gap:8px;margin-top:22px"><input type="checkbox" id="f-tutoiePatron" name="tutoiePatron" ${f.tutoiePatron ? 'checked' : ''} style="width:20px;height:20px"> Je le tutoie</label></div>
      <details ${f.contact || f.infos ? 'open' : ''}><summary>Options (recommandé)</summary>
        <div style="display:grid;gap:14px;margin-top:12px">
          <label class="field"><span>Contact pour les clients mécontents <em>(téléphone ou e-mail public)</em></span><input type="text" id="f-contact" name="contact" value="${esc(f.contact)}" placeholder="ex. 01 42 00 00 00"></label>
          <label class="field"><span>Ce que l'IA peut citer <em>(spécialités, terrasse, fait maison…)</em></span><textarea id="f-infos" name="infos" style="min-height:70px" placeholder="L'IA ne citera rien qui ne soit ici ou dans l'avis.">${esc(f.infos)}</textarea></label>
        </div></details>
      <div class="sheet-foot"><button class="btn primary block" type="submit">Enregistrer</button>
      ${s.isNew ? '' : '<button class="btn danger block" type="button" data-act="delete-restaurant">Supprimer ce restaurant</button>'}</div>
    </form>`;
}

function sheetEntry(s) {
  const e = store.get('history', s.id);
  if (!e) return '<p>Introuvable.</p>';
  const r = store.get('restaurants', e.restaurantId);
  const link = core.waLink(r && r.whatsapp, core.ownerMessage({ profile: r, review: e.review, reply: e.reply, alerts: e.alerts, me: settings.me }));
  const alerts = (e.alerts || []).filter((x) => x.level !== 'info');
  return `<div class="sheet-head"><h2>${esc((e.review && e.review.author) || 'Avis')} · ${esc(e.restaurantName || '')}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">✕</button></div>
    <div class="card"><div class="row" style="justify-content:space-between"><span class="mini-stars">${esc(starsText(e.review && e.review.stars))}</span><span class="hint">${esc(fmtDate(e.createdAt))}</span></div>
      <p style="margin:0;white-space:pre-wrap;overflow-wrap:anywhere">${esc((e.review && e.review.text) || '(note sans texte)')}</p></div>
    ${alerts.length ? `<ul class="alerts">${alerts.map((x) => `<li class="alert ${esc(x.level)}"><span>${esc(x.message)}</span></li>`).join('')}</ul>` : ''}
    <label class="field"><span>Réponse</span><textarea id="entry-reply" data-autosize data-id="${esc(e.id)}">${esc(e.reply)}</textarea></label>
    <div class="status-row">${['brouillon', 'envoye', 'publie'].map((st) => `<button data-act="entry-status" data-id="${esc(e.id)}" data-s="${st}" aria-pressed="${e.status === st}">${STATUS_LABEL[st]}</button>`).join('')}</div>
    <div class="btn-grid"><button class="btn" data-act="entry-copy" data-id="${esc(e.id)}">${ICONS.copy} Copier</button><button class="btn" data-act="entry-reuse" data-id="${esc(e.id)}">Retravailler</button></div>
    <a class="btn wa block" href="${esc(link)}" target="_blank" rel="noopener" data-act="entry-wa" data-id="${esc(e.id)}">${ICONS.wa} Envoyer au patron</a>
    <button class="btn danger block" data-act="entry-delete" data-id="${esc(e.id)}">Supprimer</button>`;
}

function sheetReport(s) {
  const r = store.get('restaurants', s.restaurantId);
  const rep = core.buildMonthlyReport(entriesFor(s.restaurantId), s.month);
  const max = Math.max(1, ...Object.values(rep.distribution));
  const bars = [5, 4, 3, 2, 1].map((k) => `<div class="bar ${k <= 2 ? 'low' : ''}"><span>${k}★</span><span class="bar-track"><span class="bar-fill" style="display:block;width:${(rep.distribution[k] / max) * 100}%"></span></span><span>${rep.distribution[k]}</span></div>`).join('');
  const trend = rep.prevAvg != null && rep.avg != null ? (rep.avg - rep.prevAvg >= 0.05 ? '▲' : rep.avg - rep.prevAvg <= -0.05 ? '▼' : '=') : '';
  const text = core.reportText(rep, r, settings.me);
  const link = core.waLink(r && r.whatsapp, text);
  return `<div class="sheet-head"><h2>Bilan · ${esc(r ? r.nom : '')}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Fermer">✕</button></div>
    <div class="row" style="justify-content:space-between"><button class="btn small" data-act="report-month" data-d="-1" aria-label="Mois précédent">‹</button><b style="text-transform:capitalize">${esc(rep.label)}</b><button class="btn small" data-act="report-month" data-d="1" aria-label="Mois suivant">›</button></div>
    <div class="kpis"><div class="kpi"><b>${rep.count}</b><span>avis traités</span></div><div class="kpi"><b>${rep.avg == null ? '–' : rep.avg.toFixed(1).replace('.', ',')} ${trend}</b><span>note moyenne</span></div><div class="kpi"><b>${rep.published}/${rep.count}</b><span>réponses publiées</span></div></div>
    <div class="card"><span class="label">Répartition des notes</span><div class="bars">${bars}</div></div>
    <div class="card"><span class="label">Ce qui revient dans les critiques</span>${rep.complaints.length ? `<ul style="margin:0;padding-left:18px">${rep.complaints.map((c) => `<li>${esc(c.label)} <b>(${c.count})</b></li>`).join('')}</ul>` : '<p class="hint">Rien de récurrent ce mois-ci.</p>'}
      <span class="label">Ce que les clients aiment</span>${rep.praise.length || rep.dishes.length ? `<ul style="margin:0;padding-left:18px">${rep.praise.map((c) => `<li>${esc(c.label)} <b>(${c.count})</b></li>`).join('')}${rep.dishes.map((d) => `<li>${esc(d.label)} <b>(${d.count})</b></li>`).join('')}</ul>` : '<p class="hint">—</p>'}</div>
    <p class="hint">Calculé sur les avis traités avec l'outil. L'agent automatique (Phase 3) le calculera sur tous les avis Google.</p>
    <div class="btn-grid"><button class="btn" data-act="report-copy">${ICONS.copy} Copier</button><a class="btn wa" href="${esc(link)}" target="_blank" rel="noopener">${ICONS.wa} Au patron</a></div>`;
}

// ------------------------------------------------------------------ actions
const actions = {
  tab: (el) => { ui.tab = el.dataset.tab; closeSheet(); render(); window.scrollTo(0, 0); },
  'pick-restaurant': (el) => { settings.lastRestaurantId = el.dataset.id; persistSettings(); ui.current = null; render(); },
  'new-restaurant': () => openRestaurantForm(),
  'edit-restaurant': (el) => openRestaurantForm(el.dataset.id),
  'example-restaurant': () => {
    const ex = { ...core.SAMPLE_PROFILES.marco, id: core.uid('r-'), nom: 'Chez Marco (exemple)', exemple: true };
    store.put('restaurants', ex);
    settings.lastRestaurantId = ex.id; persistSettings();
    toast('Restaurant d\'exemple ajouté');
    render();
  },
  star: (el) => {
    const n = Number(el.dataset.n);
    ui.draft.stars = n && ui.draft.stars !== n ? n : null;
    saveDraft();
    render();
  },
  'load-example': () => {
    const list = core.SAMPLE_REVIEWS.filter((x) => x.text && x.text !== ui.draft.text);
    const ex = list[Math.floor(Math.random() * list.length)];
    ui.draft = { text: ex.text, stars: ex.stars, author: ex.author };
    ui.current = null;
    saveDraft();
    render();
  },
  generate: () => generate('normal'),
  variant: (el) => generate(el.dataset.v),
  cancel: () => { if (ui.controller) ui.controller.abort(); },
  'copy-reply': () => ui.current && copyWithFallback(ui.current.text, 'Réponse copiée : colle-la sous l\'avis Google'),
  'wa-owner': () => { if (ui.current && ui.current.status !== 'publie') setStatus('envoye'); },
  'set-status': (el) => setStatus(el.dataset.s),
  filter: (el) => { ui.historyFilter = el.dataset.id; render(); },
  'open-entry': (el) => openSheet({ type: 'entry', id: el.dataset.id }),
  'entry-status': (el) => { const e = store.get('history', el.dataset.id); if (e) store.put('history', { ...e, status: el.dataset.s }); renderSheet(); },
  'entry-copy': (el) => { const e = store.get('history', el.dataset.id); if (e) copyWithFallback(e.reply, 'Réponse copiée'); },
  'entry-wa': (el) => { const e = store.get('history', el.dataset.id); if (e && e.status === 'brouillon') store.put('history', { ...e, status: 'envoye' }); },
  'entry-reuse': (el) => {
    const e = store.get('history', el.dataset.id);
    if (!e) return;
    settings.lastRestaurantId = e.restaurantId; persistSettings();
    ui.draft = { text: (e.review && e.review.text) || '', stars: (e.review && e.review.stars) || null, author: (e.review && e.review.author) || '' };
    saveDraft();
    const r = store.get('restaurants', e.restaurantId);
    ui.current = { entryId: e.id, text: e.reply, alerts: e.alerts || [], provider: e.provider, fallback: false, analysis: core.analyzeReview(e.review, r), templateIds: e.templateIds || [], attempt: 0, status: e.status };
    ui.tab = 'repondre';
    closeSheet();
    render();
  },
  'entry-delete': (el) => openSheet({ type: 'confirm', title: 'Supprimer cette réponse ?', message: 'Elle disparaîtra de l\'historique (pas de Google).', yes: 'Supprimer', danger: true, onYes: () => { store.remove('history', el.dataset.id); if (ui.current && ui.current.entryId === el.dataset.id) ui.current = null; } }),
  'open-report': (el) => openSheet({ type: 'report', restaurantId: el.dataset.id, month: core.monthKey(Date.now()) }),
  'report-month': (el) => {
    const s = ui.sheet;
    const [y, m] = s.month.split('-').map(Number);
    const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
    s.month = core.monthKey(d);
    renderSheet();
  },
  'report-copy': () => {
    const s = ui.sheet;
    const rep = core.buildMonthlyReport(entriesFor(s.restaurantId), s.month);
    copyWithFallback(core.reportText(rep, store.get('restaurants', s.restaurantId), settings.me), 'Bilan copié');
  },
  'form-tone': (el) => { ui.sheet.form.ton = el.dataset.v; syncForm(); renderSheet(); },
  'form-tu': (el) => { ui.sheet.form.tutoiement = el.dataset.v === '1'; syncForm(); renderSheet(); },
  'delete-restaurant': () => {
    const id = ui.sheet.form.id;
    openSheet({ type: 'confirm', title: 'Supprimer ce restaurant ?', message: 'Sa fiche sera supprimée. Son historique reste consultable dans l\'export.', yes: 'Supprimer', danger: true, onYes: () => { store.remove('restaurants', id); if (settings.lastRestaurantId === id) settings.lastRestaurantId = ''; persistSettings(); } });
  },
  'close-sheet': () => closeSheet(),
  'confirm-yes': () => { const s = ui.sheet; closeSheet(); if (s && s.onYes) s.onYes(); render(); },
  tier: (el) => { settings.modelTier = el.dataset.v; persistSettings(); render(); },
  'demo-tone': (el) => { settings.demo.ton = el.dataset.v; persistSettings(); render(); },
  'demo-tu': (el) => { settings.demo.tutoiement = el.dataset.v === '1'; persistSettings(); render(); },
  'test-ai': async (el) => {
    const out = $('#test-out');
    el.disabled = true;
    out.innerHTML = '<p class="hint">Test en cours…</p>';
    const t0 = performance.now();
    const res = await core.generateReply({ review: core.SAMPLE_REVIEWS[0], profile: core.SAMPLE_PROFILES.marco, settings: providerSettings(), env: { ...env }, firstTokenTimeoutMs: settings.safetyFallback ? 9000 : 90000 });
    if (res.provider === 'claude') env.sampleWarm = true;
    const secs = ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',');
    out.innerHTML = `<p class="hint">${res.fallback ? `⚠ IA indisponible (${esc(res.fallbackReason)}) : réponse du moteur hors-ligne.` : `✓ ${esc(PROVIDER_LABEL[res.provider])} a répondu en ${secs} s.`}</p><div class="bench-reply">${esc(res.text)}</div>`;
    el.disabled = false;
  },
  'bench-run': () => runBench(),
  'bench-stop': () => { ui.bench.stop = true; },
  'bench-copy': () => copyWithFallback(ui.bench.results.map((x) => `## ${x.kind} (${x.meta})\n> ${x.review}\n\n${x.reply}${x.alerts ? '\n⚠ ' + x.alerts : ''}`).join('\n\n'), 'Résultats copiés'),
  export: () => exportBackup(),
  'copy-backup': () => copyWithFallback(JSON.stringify(store.exportAll()), 'Sauvegarde copiée : colle-la dans une note ou un e-mail'),
  wipe: () => openSheet({ type: 'confirm', title: 'Tout effacer ?', message: 'Toutes les fiches et tout l\'historique seront supprimés (sur tous tes appareils synchronisés). Exporte une sauvegarde avant si besoin.', yes: 'Tout effacer', danger: true, onYes: () => { store.wipe(); ui.current = null; } }),
  'open-demo': () => demo.open(),
};

function syncForm() {
  const form = $('#restaurant-form');
  if (!form || !ui.sheet || ui.sheet.type !== 'restaurant') return;
  const f = ui.sheet.form;
  for (const el of form.elements) {
    if (!el.name) continue;
    f[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
}

async function runBench() {
  const b = ui.bench;
  b.running = true; b.stop = false; b.results = [];
  render();
  for (const r of core.SAMPLE_REVIEWS) {
    if (b.stop) break;
    const p = core.SAMPLE_PROFILES[r.profile];
    const t0 = performance.now();
    const out = await core.generateReply({ review: r, profile: p, settings: providerSettings(), env: { ...env }, firstTokenTimeoutMs: settings.safetyFallback ? 9000 : 90000 });
    if (out.provider === 'claude') env.sampleWarm = true;
    const secs = ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',');
    b.results.push({
      kind: r.kind, review: r.text, reply: out.text,
      meta: `${p.nom} · ${r.stars ? r.stars + '★' : 'auto'} · ${out.fallback ? 'démo (secours)' : PROVIDER_LABEL[out.provider]} · ${secs} s`,
      alerts: (out.alerts || []).filter((x) => x.level !== 'info').map((x) => x.message).join(' / '),
    });
    if (ui.tab === 'reglages' && !isTyping()) render();
  }
  b.running = false;
  if (ui.tab === 'reglages') render();
  toast('Banc d\'essai terminé');
}

async function exportBackup() {
  const json = JSON.stringify(store.exportAll(), null, 2);
  const filename = `avispro-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  if (env.downloads) {
    try { await env.downloads.save({ filename, data: json }); toast('Sauvegarde enregistrée'); return; } catch (e) { if (e && e.code === 'declined') return; }
  }
  if (!env.inClaude) {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      toast('Sauvegarde téléchargée');
      return;
    } catch (e) { /* on retombe sur la copie */ }
  }
  copyWithFallback(json, 'Sauvegarde copiée');
}

// ------------------------------------------------------------------ événements
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  // clic sur le fond sombre : on ferme ; un clic DANS la feuille garde son comportement normal
  if (el.dataset.act === 'backdrop') { if (ev.target === el) closeSheet(); return; }
  const fn = actions[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'BUTTON' && el.type !== 'submit') ev.preventDefault();
  fn(el, ev);
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'review-text') { ui.draft.text = t.value; ui.current = null; saveDraft(); autosize(); hideResult(); return; }
  if (t.id === 'review-author') { ui.draft.author = t.value; saveDraft(); return; }
  if (t.id === 'reply-edit') { onReplyEdited(t.value); autosize(); return; }
  if (t.id === 'entry-reply') {
    autosize();
    clearTimeout(editTimer);
    const id = t.dataset.id;
    editTimer = setTimeout(() => { const e = store.get('history', id); if (e) store.put('history', { ...e, reply: t.value, edited: true }); }, 600);
    return;
  }
  if (t.dataset.bind) bindSetting(t);
});
document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset.bind) { bindSetting(t); if (t.name === 'provider' || t.dataset.bind === 'provider') render(); }
  if (t.dataset.actChange === 'import' && t.files && t.files[0]) {
    const reader = new FileReader();
    reader.onload = () => {
      try { const n = store.importAll(String(reader.result)); toast(`${n} élément${n > 1 ? 's' : ''} importé${n > 1 ? 's' : ''}`); } catch (e) { toast('Fichier non reconnu : choisis un export AvisPro (.json)'); }
      render();
    };
    reader.readAsText(t.files[0]);
  }
});
document.addEventListener('submit', (ev) => {
  if (ev.target.id !== 'restaurant-form') return;
  ev.preventDefault();
  syncForm();
  const f = ui.sheet.form;
  f.nom = String(f.nom || '').trim();
  if (!f.nom) { toast('Le nom du restaurant est obligatoire'); return; }
  if (f.whatsapp && !core.normalizePhone(f.whatsapp)) { toast('Numéro WhatsApp à vérifier (ex. 06 12 34 56 78)'); return; }
  const saved = store.put('restaurants', { ...f, signature: String(f.signature || '').trim() });
  settings.lastRestaurantId = saved.id; persistSettings();
  closeSheet();
  toast('Fiche enregistrée');
  render();
});

function hideResult() {
  const t = $('.ticket');
  if (t && !ui.busy) t.remove();
}

function bindSetting(t) {
  const key = t.dataset.bind;
  const value = t.type === 'checkbox' ? t.checked : t.value;
  if (key.startsWith('me.')) settings.me[key.slice(3)] = value;
  else settings[key] = value;
  persistSettings();
  renderTop();
}

// ------------------------------------------------------------------ écran démo
const demo = createDemoScreen({ core, settings, env, persistSettings, copyText: copyWithFallback, toast, providerSettings });

// ------------------------------------------------------------------ démarrage
function boot() {
  document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => actions.tab(b)));
  $('#open-demo').addEventListener('click', () => demo.open());
  $('#ia-status').addEventListener('click', () => { ui.tab = 'reglages'; render(); });
  render();
  if (location.hash === '#demo') demo.open();
  if (env.inClaude) {
    window.claude.use('sample').then((s) => { if (s) { env.sample = s; env.sampleAvailable = true; renderTop(); if (ui.tab === 'reglages') scheduleRender(); } }).catch(() => {});
    window.claude.use('db').then((db) => { env.dbChecked = true; if (db) store.connect(db); }).catch(() => {});
    window.claude.use('downloads').then((d) => { env.downloads = d || null; }).catch(() => {});
  }
}
boot();
