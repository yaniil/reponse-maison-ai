// Écran Démo (Phase 2) : on colle l'avis du restaurateur, la réponse s'écrit en direct.
// Aucun réglage visible, tout au pouce, et aucune erreur ne peut s'afficher : au pire, le moteur démo répond.
import { createTypewriter } from './typewriter.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createDemoScreen({ core, settings, env, persistSettings, copyText, toast, providerSettings }) {
  let root = null;
  let state = 'input'; // input | writing | done
  let stars = null;
  let reply = '';
  let last = null; // { templateIds, text }
  let attempt = 0;
  const history = [];
  let controller = null;
  let wakeLock = null;
  let t0 = 0;
  let exampleIndex = Math.floor(Math.random() * 6);

  function profile() {
    const nom = String(settings.demo.nom || '').trim();
    return {
      id: 'demo-' + (nom || 'x'), nom, cuisine: '', ton: settings.demo.ton || 'chaleureux', tutoiement: !!settings.demo.tutoiement,
      signature: nom ? core.defaultSignature({ nom }) : "L'équipe", aEviter: '', contact: '', infos: '',
    };
  }

  function build() {
    root = document.createElement('div');
    root.className = 'demo';
    root.id = 'demo';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Démo');
    root.innerHTML = `
      <div class="demo-top">
        <button class="demo-close" data-d="close" aria-label="Quitter la démo">✕</button>
        <label class="demo-for">pour <input id="demo-name" type="text" autocomplete="off" placeholder="votre restaurant" aria-label="Nom du restaurant"></label>
      </div>
      <div class="demo-stage" id="demo-stage"></div>
      <div class="demo-bar" id="demo-bar"></div>`;
    document.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('input', (e) => {
      if (e.target.id === 'demo-name') { settings.demo.nom = e.target.value; persistSettings(); }
      if (e.target.id === 'demo-text') { const go = root.querySelector('[data-d="go"]'); if (go) go.disabled = !e.target.value.trim() && !stars; }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root && !root.hidden) close(); });
  }

  function renderInput(prefill) {
    state = 'input';
    const stage = root.querySelector('#demo-stage');
    const canPaste = !env.inClaude && navigator.clipboard && typeof navigator.clipboard.readText === 'function';
    stage.innerHTML = `
      <h1 class="demo-title">Collez un avis <em>Google</em>.<br>La réponse s'écrit toute seule.</h1>
      <p class="demo-sub">Un vrai avis de votre fiche, positif ou négatif.</p>
      <textarea id="demo-text" placeholder="Appuyez longuement ici, puis « Coller »">${esc(prefill || '')}</textarea>
      <div class="demo-stars" role="group" aria-label="Note de l'avis">${[1, 2, 3, 4, 5].map((n) => `<button class="star ${stars && n <= stars ? 'on' : ''}" data-d="star" data-n="${n}" aria-label="${n} étoile${n > 1 ? 's' : ''}">★</button>`).join('')}<span>${stars ? stars + ' / 5' : 'note facultative'}</span></div>
      <div class="demo-secondary">${canPaste ? '<button data-d="paste">Coller</button>' : '<span></span>'}<button data-d="example">Prendre un avis d'exemple</button></div>`;
    root.querySelector('#demo-bar').innerHTML = `<button class="demo-go" data-d="go" ${prefill || stars ? '' : 'disabled'}>Répondre à cet avis</button>`;
  }

  function renderWriting(text) {
    state = 'writing';
    const p = profile();
    const initial = 'C';
    const stage = root.querySelector('#demo-stage');
    stage.innerHTML = `
      <article class="g-review fade-in"><div class="g-who"><span class="avatar">${initial}</span><div style="min-width:0"><div class="g-name">Avis client</div><div class="g-stars">${stars ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : ''}</div></div></div>
        <p class="g-text">${esc(text || '(note sans texte)')}</p></article>
      <article class="g-reply fade-in"><div class="g-reply-label"><span>Réponse du propriétaire</span><span>${esc(p.nom || '')}</span></div>
        <p id="demo-reply" class="caret" aria-live="polite"></p>
        <div class="demo-status" id="demo-status">Lecture de l'avis…</div></article>
      <div id="demo-wa"></div>`;
    root.querySelector('#demo-bar').innerHTML = `<button class="demo-go" disabled>Rédaction en cours…</button>`;
  }

  function renderDone(seconds) {
    state = 'done';
    const el = root.querySelector('#demo-reply');
    if (el) {
      el.classList.remove('caret');
      const lines = reply.split('\n');
      const sig = lines.length > 1 ? lines.pop() : '';
      el.innerHTML = esc(lines.join('\n')) + (sig ? `<span class="sig">${esc(sig)}</span>` : '');
    }
    const st = root.querySelector('#demo-status');
    if (st) { st.textContent = `Prête · ${seconds} s`; st.classList.add('done'); }
    const msg = core.prospectMessage({ review: { text: currentText() }, reply, me: settings.me });
    root.querySelector('#demo-bar').innerHTML = `
      <div class="demo-row">
        <button data-d="again">↻ Autre version</button>
        <button data-d="copy">Copier</button>
        <a class="wa" href="${esc(core.waLink('', msg))}" target="_blank" rel="noopener">Lui envoyer</a>
      </div>
      <div class="demo-secondary"><button data-d="new">Nouvel avis</button><button data-d="flow">Voir la validation patron →</button></div>`;
  }

  let lastText = '';
  function currentText() { return lastText; }

  async function go(again) {
    const ta = root.querySelector('#demo-text');
    const text = again ? lastText : ((ta && ta.value) || '').trim();
    if (!text && !stars) return;
    if (ta) ta.blur();
    lastText = text;
    renderWriting(text);
    if (controller) controller.abort();
    controller = new AbortController();
    const typer = createTypewriter((t) => { const el = root.querySelector('#demo-reply'); if (el) el.textContent = t; });
    t0 = performance.now();
    const p = profile();
    let out = null;
    try {
      out = await core.generateReply({
        review: { text, stars, author: '' }, profile: p, history: history.slice(0, 5),
        variant: 'normal', previous: again && last ? last : null, attempt: again ? ++attempt : (attempt = 0),
        settings: providerSettings(), env: { ...env }, signal: controller.signal, typingSpeed: 24,
        firstTokenTimeoutMs: env.sampleWarm || !env.sampleAvailable ? 7000 : 60000,
        onText: (t) => typer.set(t),
        onPhase: (ph) => { const st = root.querySelector('#demo-status'); if (st) st.textContent = ph === 'writing' ? 'Rédaction…' : "Lecture de l'avis…"; },
      });
    } catch (e) {
      if (e && e.name === 'AbortError') { typer.stop(); return; }
      // filet de sécurité absolu : jamais d'écran d'erreur devant un client
      const fallback = core.generateDemoReply({ review: { text, stars }, profile: p, attempt });
      out = { ...fallback, provider: 'demo', fallback: true };
      typer.set(out.text);
    }
    await typer.flush();
    typer.stop();
    if (out.provider === 'claude') env.sampleWarm = true;
    reply = out.text;
    last = { text: out.text, templateIds: out.templateIds || [] };
    history.unshift({ reply: out.text, templateIds: out.templateIds || [] });
    const secs = ((performance.now() - t0) / 1000).toFixed(1).replace('.', ',');
    renderDone(secs);
  }

  function showFlow() {
    const box = root.querySelector('#demo-wa');
    if (!box) return;
    const owner = core.ownerMessage({
      profile: { prenomPatron: '' }, review: { text: lastText, stars }, reply, alerts: [], me: settings.me,
    });
    box.innerHTML = `<div class="chat fade-in" aria-label="Aperçu du message de validation">
        <div class="chat-head">Ce que vous recevez sur WhatsApp</div>
        <div class="bubble in">${esc(owner)}</div>
      </div>`;
    const stage = root.querySelector('#demo-stage');
    const toEnd = () => { if (stage) stage.scrollTo({ top: stage.scrollHeight, behavior: 'smooth' }); };
    setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    setTimeout(() => { const c = box.querySelector('.chat'); if (c) { c.insertAdjacentHTML('beforeend', '<div class="bubble out fade-in">OK 👍</div>'); toEnd(); } }, 1400);
    setTimeout(() => { const c = box.querySelector('.chat'); if (c) { c.insertAdjacentHTML('beforeend', '<div class="chat-note fade-in">✓ Réponse publiée sous l\'avis Google</div>'); toEnd(); } }, 2300);
    const btn = root.querySelector('[data-d="flow"]');
    if (btn) btn.remove();
  }

  async function onClick(e) {
    const el = e.target.closest('[data-d]');
    if (!el) return;
    const d = el.dataset.d;
    if (d === 'close') close();
    else if (d === 'star') {
      const n = Number(el.dataset.n);
      stars = stars === n ? null : n;
      const ta = root.querySelector('#demo-text');
      renderInput(ta ? ta.value : '');
    } else if (d === 'example') {
      const list = core.SAMPLE_REVIEWS.filter((r) => r.text && r.text.length > 40 && !/abusif|espagnol|anglais/.test(r.kind));
      const ex = list[exampleIndex++ % list.length];
      stars = ex.stars || null;
      renderInput(ex.text);
    } else if (d === 'paste') {
      try { const t = await navigator.clipboard.readText(); if (t) { renderInput(t.trim()); } } catch (err) { const ta = root.querySelector('#demo-text'); if (ta) ta.focus(); }
    } else if (d === 'go') go(false);
    else if (d === 'again') go(true);
    else if (d === 'copy') copyText(reply, 'Réponse copiée');
    else if (d === 'new') { stars = null; reply = ''; last = null; renderInput(''); root.querySelector('#demo-stage').scrollTop = 0; }
    else if (d === 'flow') showFlow();
  }

  async function open() {
    if (!root) build();
    root.querySelector('#demo-name').value = settings.demo.nom || '';
    if (state !== 'done') renderInput('');
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { wakeLock = null; }
  }

  function close() {
    if (controller) controller.abort();
    root.hidden = true;
    document.body.style.overflow = '';
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* rien */ }
    wakeLock = null;
  }

  return { open, close };
}
