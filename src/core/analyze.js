// Analyse d'un avis : langue, ton, sujets, détails réutilisables, alertes.
// Déterministe, hors-ligne, utilisé par le mode démo ET pour enrichir le mode IA réel.
import { fold, findTerm, hasTerm, hasAny, countAny, splitSentences, capitalize } from './text.js';
import * as L from './lexicon.js';

const CLAUSE_SPLIT_FR = [' mais ', ' par contre ', ' cependant ', ' en revanche ', ' seul bemol', ' seul petit bemol',
  ' petit bemol', ' toutefois ', ' neanmoins ', ' sauf ', ' dommage que ', ' malheureusement ', ' meme si '];
const CLAUSE_SPLIT_EN = [' but ', ' however ', ' although ', ' only downside', ' unfortunately ', ' except '];

// Aspects dont la simple mention n'est pas une plainte (il faut un contexte négatif)
const NEUTRAL_NEG = new Set(['attente', 'attendre', 'attendu', 'attendue', 'attendus', 'reservation', 'reserve', 'reservee',
  'livraison', 'livre', 'livree', 'livres', 'livreur', 'uber eats', 'ubereats', 'deliveroo', 'just eat', 'a emporter',
  'click and collect', "l'addition", 'proprete', 'bruit', 'faim', 'retard', 'en retard', 'erreur', 'erreurs', 'cher',
  'chere', 'chers', 'cheres', 'sec', 'seche', 'refuse', 'refuses', 'refusees', 'annule', 'annulee', 'oublie', 'oubliee',
  'wait', 'waited', 'waiting', 'reservation', 'booking', 'booked', 'delivery', 'delivered', 'late', 'cold', 'dry',
  'expensive', 'pricey', 'loud', 'sans reservation', 'pas reserve', 'tache', 'taches', 'odeur', 'lent', 'lente', 'long a']);
// Aspects positifs dont la mention seule n'est pas un compliment
const NEUTRAL_POS = new Set(['accueil', 'serveur', 'serveuse', 'serveurs', 'serveuses', 'equipe', 'personnel', 'cuisine',
  'cadre', 'deco', 'decoration', 'terrasse', 'vue', 'ambiance', 'atmosphere', 'endroit', 'lieu', 'musique', 'calme',
  'enfants', 'enfant', 'menu enfant', 'les petits', 'nos petits', 'bebe', 'poussette', 'chaise haute', 'vegetarien',
  'vegetarienne', 'vegetariens', 'vegan', 'vegane', 'sans gluten', 'allergie', 'allergies', 'intolerance', 'halal',
  'staff', 'waiter', 'waitress', 'server', 'terrace', 'view', 'kids', 'children', 'vegetarian', 'allergy', 'frais',
  'rapide', 'rapides', 'efficace', 'efficaces', 'service was', 'professionnel', 'professionnelle', 'professionnels', 'fresh']);

const ALERTS = {
  insultes: { level: 'rouge', message: "Avis insultant : la réponse reste calme. Prévenir le patron ; l'avis peut être signalé à Google (contenu injurieux)." },
  menace: { level: 'rouge', message: "Menaces : prévenir le patron tout de suite, garder une capture d'écran et signaler l'avis à Google." },
  discrimination: { level: 'rouge', message: 'Accusation de discrimination : sujet sensible, le patron doit valider chaque mot.' },
  sante: { level: 'rouge', message: 'Le client dit avoir été malade : appeler le patron avant toute publication.' },
  hygiene: { level: 'rouge', message: "Mise en cause de l'hygiène (insecte, cheveu…) : voir avec le patron avant publication." },
  juridique: { level: 'orange', message: 'Le client parle de plainte, d\'avocat ou de contrôle : réponse prudente, le patron doit valider.' },
  faux: { level: 'orange', message: "Peut-être un faux avis : demander au patron s'il reconnaît ce client. Si c'est faux, signaler l'avis à Google." },
  agressif: { level: 'orange', message: 'Client très remonté : à traiter vite, la réponse garde un ton calme.' },
  personnel: { level: 'orange', message: "Un membre de l'équipe est nommé dans un avis négatif : la réponse ne le cite pas." },
  incoherence: { level: 'orange', message: 'La note et le texte ne vont pas ensemble : vérifier avant de publier.' },
  sujet_evite: { level: 'orange', message: "L'avis touche un sujet à éviter pour ce restaurant : la réponse ne l'aborde pas." },
};

export function makeAlert(code, extra) {
  const a = ALERTS[code];
  if (!a) return { level: 'orange', code, message: extra || code };
  return { level: a.level, code, message: extra ? a.message.replace(/\.$/, '') + ' (' + extra + ').' : a.message };
}

export const ASPECT_LABELS = {
  neg: {
    attente: "l'attente", temperature: 'des plats froids ou tièdes', accueil: "l'accueil", prix: 'les prix',
    portions: 'les portions', cuisson: 'la cuisson', gout: 'le goût des plats', bruit: 'le bruit', proprete: 'la propreté',
    hygiene: "l'hygiène", sante: 'un problème de santé', erreur: 'des erreurs de commande', reservation: 'les réservations',
    livraison: 'la livraison',
  },
  pos: {
    accueil: "l'accueil", service: 'le service', cuisine: 'la cuisine', cadre: 'le cadre', prix: 'le rapport qualité-prix',
    portions: 'les portions généreuses', rapidite: 'la rapidité', enfants: "l'accueil des enfants",
    regime: 'les options végé / allergies',
  },
};

function detectLang(folded) {
  if (!folded.trim()) return 'fr';
  const scores = {
    fr: countAny(folded, L.STOP_FR) + (/[éèêàùç]/.test(folded) ? 0 : 0),
    en: countAny(folded, L.STOP_EN),
    es: countAny(folded, L.STOP_ES),
    it: countAny(folded, L.STOP_IT),
    de: countAny(folded, L.STOP_DE),
  };
  // Les mots très courts communs (« a », « e ») faussent IT/ES : on exige un écart net.
  let best = 'fr';
  let max = scores.fr;
  for (const k of ['en', 'es', 'it', 'de']) {
    if (scores[k] > max + (k === 'en' ? 0 : 1)) { best = k; max = scores[k]; }
  }
  if (best === 'fr' && scores.fr === 0 && scores.en > 0) best = 'en';
  return best;
}

function clauseSplit(sentence, lang) {
  const seps = lang === 'en' ? CLAUSE_SPLIT_EN : CLAUSE_SPLIT_FR;
  let parts = [sentence];
  for (const sep of seps) {
    const next = [];
    for (const p of parts) {
      const f = ' ' + fold(p) + ' ';
      const idx = f.indexOf(sep);
      if (idx > 1) {
        const cut = Math.max(0, idx - 1);
        next.push(p.slice(0, cut), p.slice(cut));
      } else next.push(p);
    }
    parts = next;
  }
  return parts.map((p) => p.trim()).filter(Boolean);
}

// « pas déçu » est compté en positif ET « déçu » en négatif : on retire le doublon.
const POS_NEGATED_FR = L.POS_WORDS_FR.filter((w) => w.startsWith('pas ') || w.startsWith('jamais '));
// « pas bon » est compté en négatif ET « bon » en positif : on retire le doublon.
const NEG_NEGATED_FR = L.NEG_WORDS_FR.filter((w) => L.POS_WORDS_FR.some((p) => p !== w && hasTerm(w, p)));
const RESERVE_FR = ['un peu', 'pas assez', 'seul bemol', 'petit bemol', 'bemol', 'dommage', 'par contre', 'a part',
  'manque', 'manquait', 'aurait pu', 'a revoir', 'a ameliorer', 'peut mieux faire', 'perfectible', 'legerement', 'un poil'];
const RESERVE_EN = ['a little', 'a bit', 'only downside', 'could be', 'shame', 'slightly', 'a tad'];

function polarityOf(folded, lang) {
  if (lang === 'en') {
    const pos = countAny(folded, L.POS_WORDS_EN);
    const neg = countAny(folded, L.NEG_WORDS_EN);
    return { pos, neg, score: pos - neg };
  }
  const posRaw = countAny(folded, L.POS_WORDS_FR);
  const negRaw = countAny(folded, L.NEG_WORDS_FR);
  const pos = Math.max(0, posRaw - countAny(folded, NEG_NEGATED_FR));
  const neg = Math.max(0, negRaw - countAny(folded, POS_NEGATED_FR));
  return { pos, neg, score: pos - neg };
}

function hasReserve(folded, lang) {
  if (countAny(folded, lang === 'en' ? RESERVE_EN : RESERVE_FR) > 0) return true;
  if (lang !== 'en') {
    for (const h of findTerm(folded, 'trop')) {
      const next = folded.slice(h + 5, h + 14);
      if (!/^(bon|bonne|bons|top|beau|belle|cool|sympa|mignon|gentil|chou|hate|content)/.test(next)) return true;
    }
  } else if (findTerm(folded, 'too').length) return true;
  return false;
}

function precededBy(folded, index, list) {
  const before = folded.slice(Math.max(0, index - 12), index);
  return list.some((w) => before.endsWith(w));
}

function extractDurations(text) {
  const out = [];
  const f = fold(text);
  const re = /(\d{1,3})\s?(h|heures?|hrs?)\s?(\d{1,2})?\b|(\d{1,3})\s?(minutes|minute|mins|min|mn)\b/g;
  let m;
  while ((m = re.exec(f))) {
    if (m[1]) {
      const h = Number(m[1]);
      if (h > 0 && h < 6) out.push(m[3] ? `${h}h${m[3].padStart(2, '0')}` : h === 1 ? 'une heure' : `${h} heures`);
    } else if (m[4]) {
      const n = Number(m[4]);
      if (n >= 10 && n < 300) out.push(`${n} minutes`);
    }
  }
  const words = [
    ['plus d\'une heure', "plus d'une heure"], ['une heure et demie', 'une heure et demie'], ['une demi-heure', 'une demi-heure'],
    ['trois quarts d\'heure', "trois quarts d'heure"], ['deux heures', 'deux heures'], ['une heure', 'une heure'],
  ];
  for (const [term, label] of words) if (hasTerm(f, fold(term)) && !out.includes(label)) { out.push(label); break; }
  return out;
}

function extractDishes(text, folded, lang) {
  const list = lang === 'en' ? L.FOOD_EN : L.FOOD_FR;
  const found = [];
  const taken = new Array(folded.length).fill(false);
  const sameLength = text.length === folded.length;
  for (const { term, weight } of list) {
    for (const i of findTerm(folded, term)) {
      if (taken[i]) continue;
      // cas piège : « souris d'agneau » n'est pas une souris
      let end = i + term.length;
      // qualificatifs : « maison », « à la truffe », « au chocolat », « 4 fromages »…
      const rest = folded.slice(end);
      let qual = '';
      const q1 = rest.match(/^\s+(maison|du jour|du (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)|fermiere?|basque|napolitaine|margherita|signature|truffee?|flambee?|tatin|bio|reine|regina|diavola|4 fromages|quatre fromages|vegetarienne?|vegan)\b/);
      const q2 = rest.match(/^\s+(a la|a l'|au|aux|de|d')\s?([a-zœæ'-]+(?:\s(?:beurre sale|rouges|de [a-z]+))?)/);
      if (q1) qual = q1[0];
      else if (q2 && L.INGREDIENTS.some((ing) => (q2[2] || '').startsWith(ing))) qual = q2[0];
      end += qual.length;
      for (let k = i; k < end; k++) taken[k] = true;
      const span = (sameLength ? text.slice(i, end) : folded.slice(i, end)).replace(/\s+/g, ' ').trim();
      const head = term;
      const plural = L.PLURAL_FORCED.has(head) || (!L.SINGULAR_S.has(head) && /[sx]$/.test(head.split(' ')[0]));
      found.push({ text: span.toLowerCase() === span ? span : span, head, weight, plural, index: i });
    }
  }
  found.sort((a, b) => a.index - b.index);
  return found.filter((d) => !found.some((e) => e !== d && e.index <= d.index
    && e.index + e.text.length >= d.index + d.text.length && e.text.length > d.text.length));
}

function extractStaff(text, lang) {
  const names = [];
  const add = (n, idx) => {
    if (!n) return;
    const clean = n.trim();
    const f = fold(clean);
    if (L.NOT_NAMES.has(f)) return;
    if (!names.some((x) => fold(x.name) === f)) names.push({ name: clean, index: idx });
  };
  const NAME = "([A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüçñ]+(?:-[A-ZÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ][a-zàâäéèêëîïôöùûüçñ]+)?)";
  const patterns = lang === 'en'
    ? [
      new RegExp('(?:thanks|thank you|shout ?out|kudos)\\s+(?:to\\s+)?(?:our\\s+(?:waiter|waitress|server|host|bartender)\\s+)?' + NAME, 'g'),
      new RegExp('(?:waiter|waitress|server|host|hostess|bartender|chef|manager|owner)\\s*,?\\s+' + NAME, 'g'),
      new RegExp(NAME + '\\s+(?:was|is)\\s+(?:so\\s+|very\\s+|super\\s+|really\\s+)?(?:friendly|lovely|amazing|great|fantastic|attentive|helpful|kind|wonderful|rude)', 'g'),
    ]
    : [
      new RegExp('(?:[Mm]erci|[Bb]ravo|[Mm]ention spéciale|[Mm]ention speciale|[Uu]n grand merci|[Ff]élicitations|[Bb]ig up)\\s+(?:à|a)\\s+(?:notre |la |le |nos |)(?:serveur |serveuse |chef |barman |barmaid |patron |patronne |hôtesse |sommelier |sommelière |)' + NAME, 'g'),
      new RegExp('(?:serveur|serveuse|chef|cheffe|patron|patronne|barman|barmaid|hôtesse|hôte|sommelier|sommelière|gérant|gérante|responsable|cuisinier|cuisinière)\\s*,?\\s+' + NAME, 'g'),
      new RegExp(NAME + '\\s+(?:nous a|nous avait|qui nous a|a été|était|est|s\'est|nous a très|nous a super)(?=[\\s,.!?;:]|$)', 'g'),
    ];
  patterns.forEach((re, pi) => {
    let m;
    while ((m = re.exec(text))) {
      const n = m[1];
      // le 3e motif (prénom + verbe) n'est fiable qu'avec un prénom connu
      if (pi === 2 && !L.FIRST_NAMES.has(fold(n))) continue;
      add(n, m.index);
    }
  });
  return names;
}

const PSEUDO_WORDS = new Set(['utilisateur', 'user', 'anonyme', 'anonymous', 'client', 'cliente', 'un', 'une', 'local',
  'guide', 'mr', 'mme', 'm', 'gros', 'grosse', 'petit', 'petite', 'grand', 'grande', 'mister', 'miss', 'chef', 'foodie',
  'gourmand', 'gourmande', 'gourmet', 'epicurien', 'voyageur', 'voyageuse', 'globe', 'papa', 'maman', 'tonton', 'tata',
  'bon', 'bonne', 'vieux', 'jeune', 'mega', 'roi', 'reine', 'prince', 'princesse', 'team', 'famille', 'fan', 'amateur',
  'amoureux', 'food', 'lover', 'travel', 'avis', 'critique', 'testeur', 'mangeur', 'resto', 'restaurant', 'the', 'a']);

export function authorFirstName(author) {
  const a = String(author || '').trim();
  if (!a) return '';
  const first = a.split(/[\s.]+/)[0] || '';
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'-]{2,20}$/.test(first)) return '';
  const f = fold(first);
  if (L.NOT_NAMES.has(f) || PSEUDO_WORDS.has(f)) return '';
  if (first.length <= 2 && !L.FIRST_NAMES.has(f)) return '';
  // un mot inconnu suivi d'un autre mot en minuscules ou d'un nom commun : probablement un pseudo
  const second = a.split(/\s+/)[1] || '';
  if (!L.FIRST_NAMES.has(f) && second && !/^[A-ZÀ-Ý]/.test(second)) return '';
  const norm = first.toLowerCase().split('-').map(capitalize).join('-');
  return norm;
}

function uppercaseRatio(text) {
  const letters = String(text || '').match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || [];
  if (letters.length < 15) return 0;
  const upper = letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  return upper / letters.length;
}

function parseAvoid(profile) {
  const raw = String((profile && profile.aEviter) || '');
  return raw.split(/[,;\n]+/).map((s) => s.trim()).filter((s) => s.length >= 3);
}

const AVOID_TO_ASPECT = [
  [/prix|tarif|cher|addition/, 'prix'], [/attente|lenteur|delai/, 'attente'], [/bruit|sonore|musique/, 'bruit'],
  [/portion|quantite/, 'portions'], [/reservation/, 'reservation'], [/livraison|uber|deliveroo/, 'livraison'],
  [/proprete|toilette/, 'proprete'], [/accueil|personnel|serveur/, 'accueil'],
];

/**
 * @param {{text?: string, stars?: number|null, author?: string}} review
 * @param {object} [profile]
 */
export function analyzeReview(review, profile) {
  const text = String((review && review.text) || '').trim();
  const folded = fold(text);
  const starsGiven = review && Number(review.stars) >= 1 && Number(review.stars) <= 5 ? Math.round(Number(review.stars)) : null;
  const lang = detectLang(folded);
  const isEmpty = text.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').length === 0;
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const isShort = !isEmpty && wordCount <= 4;

  // ----- sentiment par proposition
  const sentences = splitSentences(text);
  const clauses = [];
  sentences.forEach((s, si) => clauseSplit(s, lang).forEach((c) => clauses.push({ text: c, folded: fold(c), si })));
  const global = polarityOf(folded, lang);

  const negAspects = lang === 'en' ? L.NEG_ASPECTS_EN : L.NEG_ASPECTS_FR;
  const posAspects = lang === 'en' ? L.POS_ASPECTS_EN : L.POS_ASPECTS_FR;
  const complaints = {};
  const praise = {};
  const starsHint = starsGiven || (global.score > 0 ? 4 : global.score < 0 ? 2 : 3);

  for (const c of clauses) {
    const rawPol = polarityOf(c.folded, lang).score;
    // une proposition « avec réserve » (« un peu d'attente », « par contre… ») compte comme négative pour les mentions neutres
    const pol = hasReserve(c.folded, lang) && rawPol <= 0 ? -1 : rawPol;
    for (const [aspect, terms] of Object.entries(negAspects)) {
      for (const t of terms) {
        const hits = findTerm(c.folded, t);
        if (!hits.length) continue;
        // négations qui retournent le sens : « pas d'attente », « sans attente », « pas cher »
        const negatedHit = hits.some((h) => precededBy(c.folded, h, ['pas d\'', 'pas de ', 'sans ', 'aucune ', 'aucun ', 'peu d\'', 'pas ', 'jamais ', 'zero ', 'no ', 'not '])
          && !precededBy(c.folded, h, ['un peu d\'', 'un peu de ', 'un peu ']));
        if (negatedHit && (aspect === 'attente' || aspect === 'prix' || aspect === 'bruit')) {
          if (aspect === 'attente') praise.rapidite = (praise.rapidite || 0) + 1;
          if (aspect === 'prix') praise.prix = (praise.prix || 0) + 1;
          continue;
        }
        if (negatedHit && aspect !== 'gout' && aspect !== 'temperature') continue;
        const neutral = NEUTRAL_NEG.has(t);
        if (!neutral || pol < 0 || (pol === 0 && starsHint <= 3)) {
          complaints[aspect] = (complaints[aspect] || 0) + 1;
        }
      }
    }
    for (const [aspect, terms] of Object.entries(posAspects)) {
      for (const t of terms) {
        const hits = findTerm(c.folded, t);
        if (!hits.length) continue;
        if (hits.some((h) => precededBy(c.folded, h, ['pas ', 'peu ', 'pas tres ', 'pas assez ', 'not ', 'never ']))) continue;
        const neutral = NEUTRAL_POS.has(t);
        if (!neutral || pol > 0 || (pol === 0 && starsHint >= 4)) praise[aspect] = (praise[aspect] || 0) + 1;
      }
    }
    // règles de proximité dans la même proposition
    if (/portion|quantit|assiette/.test(c.folded) && /\b(petite?s?|ridicules?|chiches?|maigres?|minuscules?)\b/.test(c.folded)
      && !/(petit prix|petits prix)/.test(c.folded)) complaints.portions = (complaints.portions || 0) + 1;
    if (/(musique|son)\b/.test(c.folded) && /\b(forte?|trop fort)\b/.test(c.folded)) complaints.bruit = (complaints.bruit || 0) + 1;
    if (/\bprix\b|tarif|addition/.test(c.folded) && /(eleve|exagere|excessif|abuse|sale\b|salee|trop)/.test(c.folded)) complaints.prix = (complaints.prix || 0) + 1;
    // « froid » : plat froid ou accueil froid ?
    const froid = ['froid', 'froide', 'froids', 'froides'];
    for (const w of froid) {
      for (const h of findTerm(c.folded, w)) {
        const ctx = c.folded.slice(Math.max(0, h - 40), h + 20);
        if (/accueil|serveu|personnel|patron|equipe|ambiance|regard/.test(ctx)) complaints.accueil = (complaints.accueil || 0) + 1;
        else if (/plat|assiette|servi|arrive|pizza|frites|burger|soupe|pates|viande|poisson|cafe|nourriture|repas|food|dish|tout etait|livr/.test(ctx) || starsHint <= 2) {
          if (!/glace(s)? (a la|au|vanille|chocolat)|sorbet|dessert glac/.test(ctx)) complaints.temperature = (complaints.temperature || 0) + 1;
        }
      }
    }
  }
  // « 1h30 pour être servi » = plainte d'attente
  const durAll = extractDurations(text);
  if (durAll.length && (starsGiven || 3) <= 3 && /(servi|attente|attendu|attendre|pour avoir|pour etre|avant|arrive|commande)/.test(folded)
    && !complaints.livraison) complaints.attente = (complaints.attente || 0) + 1;
  // « souris d'agneau » n'est pas un problème d'hygiène
  if (complaints.hygiene && /souris d'?\s?agneau/.test(folded) && !/(cafard|blatte|rat |insecte|cheveu|mouche|ver )/.test(folded)) delete complaints.hygiene;
  // la livraison n'est une plainte que s'il y a un contexte de livraison ET un souci
  const delivery = !!hasAny(folded, lang === 'en' ? L.DELIVERY_EN : L.DELIVERY_FR);
  if (complaints.livraison && !(delivery && (global.neg > 0 || (starsGiven && starsGiven <= 2)))) delete complaints.livraison;
  if (delivery && complaints.livraison && complaints.attente) delete complaints.attente;
  // une plainte et un compliment sur le même aspect : on garde le plus fréquent
  for (const a of Object.keys(complaints)) {
    if (praise[a] && praise[a] >= complaints[a] && (starsGiven || 3) >= 4) delete complaints[a];
    else if (praise[a] && (starsGiven || 3) <= 2) delete praise[a];
  }
  // « Bon mais cher » : « bon » parle de la cuisine
  if (!praise.cuisine && (starsGiven || 3) >= 3 && /\b(bon|bonne|bons|bonnes|delicieux|delicieuse|excellent|excellente|succulent|un regal|tres bon|trop bon)\b/.test(folded)
    && !/(bon accueil|bonne ambiance|bon service|bon rapport|bonne adresse|bonne soiree|bon moment|bonne humeur|bonne journee)/.test(folded)) praise.cuisine = 1;
  // la « cuisine » générique n'est un compliment que pour un avis plutôt positif
  if (praise.cuisine && starsGiven && starsGiven <= 2 && global.score <= 0) delete praise.cuisine;

  // ----- détails
  const dishesAll = extractDishes(text, folded, lang).map((d) => {
    const clause = clauses.find((c) => c.folded.indexOf(d.head) !== -1 && fold(c.text).indexOf(fold(d.text)) !== -1) || null;
    const pol = clause ? polarityOf(clause.folded, lang).score : 0;
    return { ...d, polarity: pol > 0 ? 'pos' : pol < 0 ? 'neg' : 'neutre' };
  });
  const dishes = dishesAll.filter((d) => d.weight >= 2);
  const staffRaw = extractStaff(text, lang).map((s) => {
    const clause = clauses.find((c) => c.text.indexOf(s.name) !== -1);
    const pol = clause ? polarityOf(clause.folded, lang).score : 0;
    return { name: s.name, polarity: pol > 0 ? 'pos' : pol < 0 ? 'neg' : 'neutre' };
  });
  const author = authorFirstName(review && review.author);
  const staff = staffRaw.filter((s) => fold(s.name) !== fold(author));

  const occList = lang === 'en' ? L.OCCASIONS_EN : L.OCCASIONS_FR;
  const occasion = occList.find((o) => hasAny(folded, o.terms)) || null;
  const regular = !!hasAny(folded, lang === 'en' ? L.REGULAR_EN : L.REGULAR_FR);
  const firstVisit = !!hasAny(folded, lang === 'en' ? L.FIRST_VISIT_EN : L.FIRST_VISIT_FR);
  const wontReturn = /(ne (reviendrai|reviendrons|reviendra|retournerai|retournerons)|(reviendrai|reviendrons|reviendra) (pas|plus|jamais)|plus jamais|jamais plus|won't be back|will not be back|never again|not coming back|won't return)/.test(folded);
  const willReturn = !wontReturn && !!hasAny(folded, lang === 'en' ? L.WILL_RETURN_EN : L.WILL_RETURN_FR);
  const terrace = !!hasAny(folded, L.TERRACE);
  const timeOfDay = hasAny(folded, L.LUNCH) ? 'midi' : hasAny(folded, L.EVENING) ? 'soir' : null;
  const durations = complaints.attente || complaints.livraison ? durAll : [];

  // ----- abus, menaces, faux avis
  const insults = lang === 'en' ? countAny(folded, L.INSULTS_EN) : countAny(folded, L.INSULTS_FR);
  const slurs = countAny(folded, L.SLURS_FR);
  const threats = countAny(folded, lang === 'en' ? L.THREATS_EN : L.THREATS_FR);
  const legal = countAny(folded, lang === 'en' ? L.LEGAL_EN : L.LEGAL_FR);
  const fake = countAny(folded, lang === 'en' ? L.FAKE_EN : L.FAKE_FR) + (/(https?:\/\/|www\.|\.com\b|\.fr\b)/.test(folded) ? 1 : 0);
  const discrim = countAny(folded, lang === 'en' ? L.DISCRIM_EN : L.DISCRIM_FR);
  const upper = uppercaseRatio(text);
  const bangs = (text.match(/!{2,}/g) || []).length;
  const aggressive = upper >= 0.6 || bangs >= 2 || (bangs >= 1 && global.neg >= 3);
  const abusive = insults > 0 || slurs > 0 || threats > 0;

  // ----- note estimée si absente
  let stars = starsGiven;
  if (!stars) {
    if (abusive) stars = 1;
    else if (isEmpty) stars = null;
    else {
      const nC = Object.keys(complaints).length;
      const nP = Object.keys(praise).length + dishes.filter((d) => d.polarity === 'pos').length;
      const s = global.score + nP * 0.5 - nC * 0.8;
      stars = s >= 2 ? 5 : s >= 0.8 ? 4 : s > -0.8 ? 3 : s > -2 ? 2 : 1;
      if (nC && nP && stars >= 4) stars = 4;
      if (nC && nP && stars <= 2) stars = 3;
    }
  }

  // ----- catégorie
  let category;
  if (isEmpty && !starsGiven) category = 'neutre';
  else if (abusive) category = 'abusif';
  else if (fake > 0 && (stars || 1) <= 2) category = 'suspect';
  else if (isEmpty && (stars || 1) <= 1) category = 'suspect';
  else if (!stars) category = 'neutre';
  else if (stars >= 4) category = Object.keys(complaints).length ? 'positif_reserve' : 'positif';
  else if (stars === 3) category = 'mitige';
  else category = 'negatif';

  // ----- sujets à éviter
  const avoidTopics = parseAvoid(profile);
  const avoidHits = [];
  const avoidAspects = new Set();
  for (const topic of avoidTopics) {
    const ft = fold(topic);
    const key = ft.split(/\s+/).filter((w) => w.length >= 4);
    const hit = hasTerm(folded, ft) || key.some((w) => folded.indexOf(w) !== -1);
    for (const [re, asp] of AVOID_TO_ASPECT) if (re.test(ft)) avoidAspects.add(asp);
    if (hit) avoidHits.push(topic);
  }
  for (const a of avoidAspects) if (complaints[a] && !avoidHits.length) avoidHits.push(ASPECT_LABELS.neg[a] || a);
  // une plainte formulée dans la même phrase qu'un sujet à éviter devient elle aussi « à éviter »
  if (avoidHits.length) {
    const keys = avoidTopics.flatMap((t) => fold(t).split(/\s+/).filter((w) => w.length >= 4));
    for (const c of clauses) {
      if (!keys.some((k) => c.folded.indexOf(k) !== -1)) continue;
      for (const a of Object.keys(complaints)) {
        const terms = (negAspects[a] || []);
        if (terms.some((t) => hasTerm(c.folded, t)) || (a === 'bruit' && /bruit|sonore|musique/.test(c.folded))) avoidAspects.add(a);
      }
      for (const a of Object.keys(praise)) {
        const terms = (posAspects[a] || []);
        if (terms.some((t) => hasTerm(c.folded, t))) avoidAspects.add('pos:' + a);
      }
    }
  }

  // ----- alertes
  const alerts = [];
  if (insults > 0 || slurs > 0) alerts.push(makeAlert('insultes'));
  if (threats > 0) alerts.push(makeAlert('menace'));
  if (discrim > 0) alerts.push(makeAlert('discrimination'));
  if (complaints.sante) alerts.push(makeAlert('sante'));
  if (complaints.hygiene) alerts.push(makeAlert('hygiene'));
  if (legal > 0) alerts.push(makeAlert('juridique'));
  if (category === 'suspect') {
    const why = isEmpty ? '1★ sans texte' : fake ? 'renvoie vers un autre établissement ou dit ne pas être venu' : '';
    alerts.push(makeAlert('faux', why));
  }
  if (aggressive && !abusive && (stars || 3) <= 3) alerts.push(makeAlert('agressif'));
  if (staff.some((s) => s.polarity === 'neg') || (staff.length && (stars || 3) <= 2)) alerts.push(makeAlert('personnel', staff.map((s) => s.name).join(', ')));
  if (starsGiven && starsGiven >= 4 && global.neg >= 2 && global.pos === 0 && !isEmpty) alerts.push(makeAlert('incoherence', `${starsGiven}★ mais texte négatif`));
  if (starsGiven && starsGiven <= 2 && global.pos >= 3 && global.neg === 0 && !Object.keys(complaints).length) alerts.push(makeAlert('incoherence', `${starsGiven}★ mais texte positif`));
  if (avoidHits.length) alerts.push(makeAlert('sujet_evite', avoidHits.join(', ')));

  const complaintList = Object.entries(complaints).sort((a, b) => b[1] - a[1]).map(([a]) => a);
  const praiseList = Object.entries(praise).sort((a, b) => b[1] - a[1]).map(([a]) => a);

  return {
    lang, stars, starsGiven, starsEstimated: !starsGiven && !!stars,
    category, isEmpty, isShort, wordCount,
    quote: isShort && /^[A-Za-zÀ-ÖØ-öø-ÿ'’ !.…,-]{2,40}$/.test(text.trim().replace(/^[\s"«“]+|[\s"»”]+$/g, '')) ? text.trim().replace(/^[\s"«“]+|[\s"»”]+$/g, '') : '',
    quotePolarity: global.score > 0 ? 'pos' : global.score < 0 ? 'neg' : 'neutre',
    sentiment: global,
    complaints: complaintList, praise: praiseList,
    dishes, staff, author, occasion, regular, firstVisit, willReturn, wontReturn, delivery, terrace, timeOfDay, durations,
    intensity: aggressive ? 'fort' : 'normal',
    flags: { insults, slurs, threats, legal, fake, discrim, aggressive, abusive },
    avoidHits, avoidAspects: [...avoidAspects],
    alerts,
  };
}

export function categoryLabel(cat) {
  return {
    positif: 'positif', positif_reserve: 'positif avec un bémol', mitige: 'mitigé', negatif: 'négatif',
    abusif: 'abusif', suspect: 'suspect', neutre: 'sans note',
  }[cat] || cat;
}
