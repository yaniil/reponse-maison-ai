// Outils texte partagés (navigateur + Node). Aucune dépendance.
// Volontairement sans lookbehind ni groupes nommés : compatible vieux Safari iOS.

const FOLD_MAP = {
  à: 'a', â: 'a', ä: 'a', á: 'a', ã: 'a', å: 'a',
  ç: 'c',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  î: 'i', ï: 'i', í: 'i', ì: 'i',
  ô: 'o', ö: 'o', ó: 'o', ò: 'o', õ: 'o',
  ù: 'u', û: 'u', ü: 'u', ú: 'u',
  ÿ: 'y', ñ: 'n',
  '’': "'", '‘': "'", 'ʼ': "'", '`': "'",
  ' ': ' ', ' ': ' ',
};

/** Minuscules + accents retirés, en gardant EXACTEMENT la même longueur (index alignés avec l'original). */
export function fold(s) {
  const lower = String(s || '').toLowerCase();
  let out = '';
  for (const ch of lower) {
    const m = FOLD_MAP[ch];
    out += m !== undefined && m.length === ch.length ? m : (m !== undefined ? m : ch);
  }
  // Sécurité : si la longueur a bougé (caractère exotique), on retombe sur un repli simple.
  if (out.length !== lower.length) {
    out = '';
    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i];
      const m = FOLD_MAP[ch];
      out += m && m.length === 1 ? m : ch;
    }
  }
  return out;
}

const WORD_CHAR = /[a-z0-9œæ]/;
export function isWordChar(ch) {
  return !!ch && WORD_CHAR.test(ch);
}

/**
 * Trouve toutes les occurrences d'un terme (déjà « plié ») dans un texte plié, en respectant les frontières de mots.
 * Renvoie un tableau d'index de début.
 */
export function findTerm(folded, term) {
  const hits = [];
  if (!term) return hits;
  let from = 0;
  for (;;) {
    const i = folded.indexOf(term, from);
    if (i === -1) break;
    const before = folded[i - 1];
    const after = folded[i + term.length];
    if (!isWordChar(before) && !isWordChar(after)) hits.push(i);
    from = i + 1;
  }
  return hits;
}

export function hasTerm(folded, term) {
  return findTerm(folded, term).length > 0;
}

export function hasAny(folded, terms) {
  for (const t of terms) if (hasTerm(folded, t)) return t;
  return null;
}

export function countAny(folded, terms) {
  let n = 0;
  for (const t of terms) n += findTerm(folded, t).length;
  return n;
}

/** Découpe en phrases (approximatif mais robuste). */
export function splitSentences(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const parts = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    cur += ch;
    if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
      // avale la ponctuation multiple et guillemets fermants
      while (i + 1 < t.length && /[.!?…»"')\]]/.test(t[i + 1])) { cur += t[i + 1]; i++; }
      const next = t[i + 1];
      // évite de couper "M. Dupont" ou "4.5"
      const prevWord = cur.trim().split(' ').pop() || '';
      const isAbbrev = /^(m|mme|mr|dr|st|ste|etc|ex|cf|vs|env|min|n°)\.$/i.test(prevWord);
      const isNumber = /\d\.$/.test(cur) && /\d/.test(next || '');
      if (!isAbbrev && !isNumber && (next === undefined || next === ' ')) {
        parts.push(cur.trim());
        cur = '';
      }
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts.filter((p) => /[a-zA-Z0-9À-ÿ]/.test(p));
}

export function countSentences(text) {
  return splitSentences(text).length;
}

/** Hash FNV-1a 32 bits. */
export function hashString(s) {
  let h = 0x811c9dc5;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function seededRandom(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function capitalize(s) {
  const str = String(s || '');
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}

export function words(s) {
  return fold(s).split(/[^a-z0-9œæ']+/).filter(Boolean);
}

/** Similarité de Jaccard sur trigrammes de mots (0..1). */
export function similarity(a, b) {
  const grams = (s) => {
    const w = words(s);
    const set = new Set();
    for (let i = 0; i + 2 < w.length; i++) set.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
    return set;
  };
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

export function clampText(s, max) {
  const str = String(s || '').trim();
  if (str.length <= max) return str;
  const cut = str.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '') + '…';
}

export function uid(prefix = '') {
  const r = Math.random().toString(36).slice(2, 8);
  return prefix + Date.now().toString(36) + r;
}

export function starsLabel(n) {
  const k = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  if (!k) return 'note non précisée';
  return '★'.repeat(k) + '☆'.repeat(5 - k);
}
