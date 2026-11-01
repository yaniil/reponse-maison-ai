// Couche IA abstraite : un seul point d'entrée, plusieurs moteurs, et une bascule automatique
// vers le moteur démo si l'IA ne répond pas (réseau, clé invalide, délai dépassé…).
import { analyzeReview } from './analyze.js';
import { generateDemoReply } from './demo-engine.js';
import { buildPrompt, parseModelOutput, visiblePart, ensureSignature, checkReply, mergeAlerts, polishReply } from './prompt.js';

export const PROVIDERS = {
  auto: { id: 'auto', label: 'Automatique (recommandé)' },
  claude: { id: 'claude', label: 'Claude, avec ton compte claude.ai' },
  anthropic: { id: 'anthropic', label: 'Claude, avec une clé API' },
  openai: { id: 'openai', label: 'Compatible OpenAI (OpenAI, Mistral…)' },
  demo: { id: 'demo', label: 'Moteur hors-ligne (sans IA)' },
};

export const ANTHROPIC_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (recommandé)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (le plus rapide)' },
];

export class ProviderError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/** Quel moteur utiliser, compte tenu des réglages et de ce qui est disponible ici. */
export function resolveProvider(settings, env) {
  const s = settings || {};
  const e = env || {};
  const want = s.provider || 'auto';
  const hasKey = !!(s.apiKey && String(s.apiKey).trim().length > 10);
  const hasOpenai = !!(s.openaiKey && s.openaiBaseUrl && s.openaiModel);
  if (want === 'demo') return 'demo';
  if (want === 'claude') return e.sampleAvailable ? 'claude' : hasKey ? 'anthropic' : 'demo';
  if (want === 'anthropic') return hasKey ? 'anthropic' : e.sampleAvailable ? 'claude' : 'demo';
  if (want === 'openai') return hasOpenai ? 'openai' : 'demo';
  // auto
  if (e.sampleAvailable) return 'claude';
  if (hasKey) return 'anthropic';
  if (hasOpenai) return 'openai';
  return 'demo';
}

// ---------------------------------------------------------------------------
// Lecture d'un flux SSE (Anthropic et compatibles OpenAI)
// ---------------------------------------------------------------------------
async function readSSE(res, onEvent) {
  if (!res.body || !res.body.getReader) {
    // navigateur sans streaming : on lit tout d'un coup
    const all = await res.text();
    for (const block of all.replace(/\r/g, '').split('\n\n')) handleBlock(block, onEvent);
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r/g, '');
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      handleBlock(block, onEvent);
    }
  }
  if (buf.trim()) handleBlock(buf, onEvent);
}

function handleBlock(block, onEvent) {
  const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
  if (!data || data === '[DONE]') return;
  let json;
  try { json = JSON.parse(data); } catch (e) { return; }
  onEvent(json);
}

export async function callAnthropic({ apiKey, model, system, user, onText, signal, fetchImpl }) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) throw new ProviderError('no_fetch', 'fetch indisponible');
  const res = await f('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-5-5',
      max_tokens: 700,
      system,
      messages: [{ role: 'user', content: user }],
      stream: true,
    }),
    signal,
  });
  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = (j && j.error && j.error.message) || ''; } catch (e) { /* ignore */ }
    throw new ProviderError('http_' + res.status, detail || 'Erreur ' + res.status);
  }
  let text = '';
  await readSSE(res, (j) => {
    if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') {
      text += j.delta.text;
      if (onText) onText(text);
    } else if (j.type === 'error') {
      throw new ProviderError('stream_error', (j.error && j.error.message) || 'erreur de flux');
    }
  });
  return text;
}

export async function callOpenAICompatible({ apiKey, baseUrl, model, system, user, onText, signal, fetchImpl }) {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  const url = String(baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
  const res = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal,
  });
  if (!res.ok) throw new ProviderError('http_' + res.status, 'Erreur ' + res.status);
  let text = '';
  await readSSE(res, (j) => {
    const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
    if (d) { text += d; if (onText) onText(text); }
  });
  return text;
}

export async function callClaudeSample({ sample, prompt, onText, signal, modelTier }) {
  const res = await sample(prompt, {
    onText: ({ text }) => { if (onText) onText(text); },
    signal,
    modelTier: modelTier || 'quick',
    cache: false,
  });
  return res.text;
}

// ---------------------------------------------------------------------------
// Effet « machine à écrire » pour le moteur démo (et pour lisser les flux trop rapides)
// ---------------------------------------------------------------------------
export function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortError()); return; }
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

function abortError() {
  const e = new Error('annulé');
  e.name = 'AbortError';
  return e;
}

export async function typeOut(text, onText, signal, speed) {
  if (!onText) return;
  if (!speed) { onText(text); return; }
  const tokens = String(text).match(/\S+\s*/g) || [];
  let out = '';
  for (const tok of tokens) {
    out += tok;
    onText(out);
    const pause = /[.!?…]\s*$/.test(tok) ? 140 : /[,;:]\s*$/.test(tok) ? 70 : 0;
    await wait(speed * (0.6 + Math.random() * 0.8) + pause, signal);
  }
}

// ---------------------------------------------------------------------------
// Point d'entrée unique
// ---------------------------------------------------------------------------
/**
 * Génère une réponse à un avis. Ne lève JAMAIS d'erreur, sauf annulation volontaire (signal) :
 * en cas de souci réseau / clé / délai, on bascule sur le moteur démo et on le signale (fallback: true).
 *
 * @returns {Promise<{text, alerts, analysis, provider, fallback, fallbackReason?, templateIds, category, lang}>}
 */
export async function generateReply(opts) {
  const {
    review, profile, history = [], variant = 'normal', previous = null, attempt = 0, instruction = '',
    settings = {}, env = {}, onText, onPhase, signal, typingSpeed = 0, firstTokenTimeoutMs = 9000,
    totalTimeoutMs = 30000, fetchImpl,
  } = opts;
  const analysis = analyzeReview(review, profile);
  const recent = (history || []).slice(0, 6);
  const avoidIds = recent.flatMap((h) => h.templateIds || []).concat((previous && previous.templateIds) || []);
  const provider = resolveProvider(settings, env);

  const runDemo = async (reasonForFallback) => {
    const out = generateDemoReply({ review, profile, variant, avoidIds, attempt, analysis });
    if (onPhase) onPhase('writing');
    await typeOut(out.text, onText, signal, typingSpeed);
    return {
      ...out,
      alerts: mergeAlerts(out.alerts, checkReply(out.text, profile, analysis)),
      provider: 'demo',
      fallback: !!reasonForFallback,
      fallbackReason: reasonForFallback || undefined,
    };
  };

  if (provider === 'demo' && variant === 'edit') {
    const err = new ProviderError('edit_needs_ai', 'Modifier une réponse sur consigne demande une IA (clé API).');
    throw err;
  }
  if (provider === 'demo') {
    if (onPhase) onPhase('reading');
    if (typingSpeed) await wait(500 + Math.random() * 400, signal);
    return runDemo(null);
  }

  const hasPrev = !!(previous && previous.text);
  const v = (variant === 'shorter' || variant === 'warmer' || (variant === 'edit' && instruction)) && hasPrev ? variant : (attempt > 0 && hasPrev ? 'regenerate' : 'normal');
  const prompt = buildPrompt({
    review, profile, analysis,
    recentReplies: recent.map((h) => h.reply).filter(Boolean),
    variant: v,
    previous: previous && previous.text,
    instruction,
  });

  // Contrôleur interne : annulation par l'utilisateur OU délai dépassé
  const inner = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timedOut = false;
  let gotFirst = false;
  const onOuterAbort = () => inner && inner.abort();
  if (signal) signal.addEventListener('abort', onOuterAbort, { once: true });
  const applyFirstTimeout = provider !== 'claude' || env.sampleWarm;
  const t1 = applyFirstTimeout ? setTimeout(() => { if (!gotFirst) { timedOut = true; if (inner) inner.abort(); } }, firstTokenTimeoutMs) : null;
  const t2 = setTimeout(() => { timedOut = true; if (inner) inner.abort(); }, applyFirstTimeout ? totalTimeoutMs : totalTimeoutMs * 4);
  const onPartial = (raw) => {
    if (!gotFirst) { gotFirst = true; if (onPhase) onPhase('writing'); }
    const vis = visiblePart(raw);
    if (onText && vis) onText(vis);
  };
  if (onPhase) onPhase('reading');

  try {
    let raw;
    if (provider === 'claude') {
      raw = await callClaudeSample({ sample: env.sample, prompt: prompt.combined, onText: onPartial, signal: inner && inner.signal, modelTier: settings.modelTier });
    } else if (provider === 'anthropic') {
      raw = await callAnthropic({ apiKey: settings.apiKey, model: settings.model, system: prompt.system, user: prompt.user, onText: onPartial, signal: inner && inner.signal, fetchImpl });
    } else {
      raw = await callOpenAICompatible({ apiKey: settings.openaiKey, baseUrl: settings.openaiBaseUrl, model: settings.openaiModel, system: prompt.system, user: prompt.user, onText: onPartial, signal: inner && inner.signal, fetchImpl });
    }
    const parsed = parseModelOutput(raw);
    if (!parsed.reply || parsed.reply.replace(/\s/g, '').length < 15) throw new ProviderError('empty', 'réponse vide');
    const text = ensureSignature(polishReply(parsed.reply, analysis.lang), profile, analysis.lang);
    if (onText) onText(text);
    const aiAlert = parsed.alert ? [{ level: 'orange', code: 'ia', message: "Signalé par l'IA : " + parsed.alert + '.' }] : [];
    return {
      text,
      alerts: mergeAlerts(analysis.alerts, aiAlert, checkReply(text, profile, analysis)),
      analysis,
      provider,
      fallback: false,
      templateIds: [],
      category: analysis.category,
      lang: analysis.lang,
    };
  } catch (err) {
    if (signal && signal.aborted) throw abortError();
    // une consigne du patron ne peut pas être appliquée par le moteur démo : on le dit au lieu de l'ignorer
    if (variant === 'edit') throw err;
    if (onText) onText('');
    const reason = timedOut ? 'délai dépassé' : describeError(err);
    return runDemo(reason);
  } finally {
    if (t1) clearTimeout(t1);
    clearTimeout(t2);
    if (signal) signal.removeEventListener('abort', onOuterAbort);
  }
}

export function describeError(err) {
  const code = (err && (err.code || err.name)) || '';
  if (code === 'http_401' || code === 'http_403') return 'clé API refusée';
  if (code === 'http_429') return 'trop de demandes (quota)';
  if (code === 'http_529' || code === 'http_503' || code === 'http_500') return 'service IA surchargé';
  if (code === 'http_400') return 'requête refusée';
  if (code === 'not_granted' || code === 'sampling_disabled') return 'IA non autorisée ici';
  if (code === 'rate_limited') return 'limite d\'usage atteinte';
  if (code === 'AbortError') return 'délai dépassé';
  if (code === 'empty') return 'réponse vide';
  if (/fetch|network|Failed/i.test(String(err && err.message))) return 'pas de réseau';
  return 'IA indisponible';
}
