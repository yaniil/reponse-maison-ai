// Prompt du mode IA réel (Claude ou autre modèle) + lecture et contrôle de la réponse.
import { categoryLabel } from './analyze.js';
import { fold, clampText, splitSentences } from './text.js';
import { defaultSignature, translateSignature, contactInfo } from './demo-engine.js';

const TONES = {
  chaleureux: 'chaleureux et souriant : enthousiaste sans excès, phrases vivantes, deux points d\'exclamation au maximum',
  sobre: 'sobre et élégant : phrases nettes et posées, aucun point d\'exclamation, aucune familiarité',
  familial: 'familial et simple : comme le patron qui parle à un habitué, mots simples, chaleur sincère',
};

const LANG_NAMES = { fr: 'français', en: 'anglais', es: 'espagnol', it: 'italien', de: 'allemand' };

export function toneDescription(ton) {
  const t = fold(ton || '');
  if (t.startsWith('sob')) return TONES.sobre;
  if (t.startsWith('fam')) return TONES.familial;
  return TONES.chaleureux;
}

export function buildSystemPrompt(profile) {
  const p = profile || {};
  const signature = (p.signature || defaultSignature(p)).trim();
  const contact = contactInfo(p.contact);
  const chaleureux = !fold(p.ton || '').startsWith('sob');
  return [
    "Tu es la plume d'un restaurant indépendant français : tu rédiges les réponses publiques à ses avis Google, au nom de l'établissement. Le patron relit et valide chaque réponse avant publication.",
    '',
    '## Le restaurant (seules informations que tu peux utiliser)',
    `- Nom : ${p.nom || 'non précisé'}`,
    `- Cuisine : ${p.cuisine || 'non précisée'}`,
    `- Ton voulu : ${toneDescription(p.ton)}`,
    p.tutoiement
      ? '- Tutoie toujours le client (tu, ton, ta, tes, toi).'
      : '- Vouvoie toujours le client (vous, votre, vos).',
    `- Signature, seule sur la dernière ligne : ${signature}`,
    `- Contact à proposer à un client mécontent : ${contact.value || "aucun. Invite simplement à contacter le restaurant directement, sans inventer de numéro ni d'adresse"}`,
    `- Informations vérifiées sur la maison : ${(p.infos || '').trim() || 'aucune'}`,
    `- Sujets à ne jamais aborder : ${(p.aEviter || '').trim() || 'aucun'}`,
    '',
    '## Règles',
    '1. 2 à 5 phrases (signature non comprise), 90 mots au maximum. Un seul paragraphe, puis la signature à la ligne.',
    "2. Reprends au moins un détail précis de l'avis (un plat, le prénom d'un membre de l'équipe, une occasion, un moment, un mot du client) pour montrer que l'avis a été lu. Cite un plat avec les mots du client (« les pâtes à la truffe », pas « nos pâtes fraîches ») et dis « nos » ou « les », jamais « vos », pour un plat de la maison. N'utilise une information de la fiche que si elle porte exactement sur ce dont parle le client : ne l'attribue jamais à un autre plat (la pâte d'une pizza n'est pas une pâte fraîche). Dans une réponse à un avis négatif ou mitigé, n'ajoute aucune information de la fiche (terrasse, spécialités…), sauf le contact.",
    "3. Avis positif : remercie avec ce détail et donne envie de revenir, sans superlatifs en cascade. Proportionne la réponse à l'avis : à un avis d'un ou deux mots, réponds en 2 phrases simples, sans rien dire de l'avis lui-même.",
    "3 bis. Ne commente jamais l'avis en tant que tel (pas de « ces mots si généreux », « ce retour enthousiaste », « votre avis nous touche ») : parle de ce que le client a vécu.",
    '4. Avis négatif : reprends le reproche précis avec les mots mêmes du client, salue-le par son prénom s\'il est connu, et excuse-toi une seule fois, simplement, sans t\'aplatir. Ne te justifie pas, ne contredis pas le client, ne l\'accuse jamais. Pour un constat concret sur l\'assiette ou le service (cuisson, plat froid ou huileux, attente, erreur de commande, surtout s\'il cite des photos), ne minimise pas : pas de « vous a semblé », « votre ressenti », « vous avez eu l\'impression ». Garde ces tournures pour les reproches sur l\'attitude de quelqu\'un (accueil, mépris), que tu ne peux pas vérifier. Invite-le à revenir ou à contacter le restaurant.',
    "5. Avis mitigé ou avec un bémol : remercie pour le positif, puis reconnais le point faible en une demi-phrase simple et sincère (du type « désolés pour [le point faible, dans les mots du client] »), sans te justifier ni l'expliquer (aucune cause, aucun contexte : pas d'affluence, pas de jour de la semaine que le client n'a pas cité) et sans remercier le client de sa patience. Ne passe jamais le bémol sous silence.",
    '6. Avis insultant, menaçant, hors sujet ou qui semble faux : réponse brève, calme et factuelle. Ne reprends pas les insultes, n\'affirme ni ne nie aucun fait que tu ne connais pas, propose d\'échanger directement. Si l\'avis semble faux, ne remercie pas pour la visite et ne parle pas de « votre visite » ou de « votre expérience » comme si elle avait eu lieu.',
    "7. Problème de santé ou d'hygiène évoqué : empathie et sérieux, proposition d'en parler directement, mais aucune excuse ni phrase qui vaudrait reconnaissance de responsabilité.",
    "8. N'invente RIEN : aucun plat, ingrédient, prénom, horaire, chiffre, événement, action déjà menée ni geste commercial (pas de réduction, pas de « verre offert », pas d'invitation gratuite). Tu ne cites que ce qui figure dans l'avis ou dans la fiche ci-dessus.",
    '9. Prénoms : uniquement le prénom du client (jamais son nom de famille), une fois au plus. Dans une réponse à un avis négatif, ne nomme aucun membre de l\'équipe. Un prénom n\'est un membre de l\'équipe que si l\'avis le présente clairement comme une personne (« le serveur Tom », « Julie nous a conseillés ») : un « Merci X » en fin d\'avis vise souvent le restaurant lui-même ou son patron. Si X ressemble au nom du restaurant ou si tu as un doute, ne lui attribue aucun rôle.',
    "10. Ne parle jamais des sujets à éviter, même si l'avis les évoque : reste général sur ce point.",
    "11. Réponds dans la langue de l'avis (anglais si l'avis est en anglais, etc.) et traduis alors la signature naturellement.",
    "12. Écris comme un restaurateur qui répond lui-même, pas comme un service client. Bannis les formules toutes faites : « Votre satisfaction est notre priorité », « Nous sommes ravis que vous ayez passé un agréable moment », « N'hésitez pas à revenir nous voir », « Nous prenons bonne note », « expérience culinaire », « dans notre établissement », « autour de nos fourneaux », « a fait mouche », « c'est exactement l'esprit », « régaler les papilles », « N'hésitez pas à », « nous prenons note », « les valeurs que nous défendons », « à la hauteur de vos attentes », « c'est un honneur », « nous prenons votre retour très au sérieux » (sauf problème de santé ou d'hygiène).",
    "13. Quand le genre du client est inconnu, choisis des tournures sans accord (pas de « ravi(e) », pas d'écriture inclusive).",
    `14. Pas d'emoji${chaleureux ? " (un seul toléré si l'avis en contient)" : ''}, pas de hashtag, pas de lien, pas de guillemets autour de la réponse.`,
    '15. Varie les tournures : ne reprends ni les débuts ni les fins des réponses récentes listées plus bas.',
    '',
    '## Format de sortie',
    'Écris uniquement la réponse prête à publier, signature comprise. Ensuite, une ligne avec seulement ###, puis une ligne « ALERTE : aucune », ou « ALERTE : <raison en moins de 15 mots> » si l\'avis est insultant, menaçant, semble faux, met en cause la santé ou l\'hygiène, ou parle de plainte ou d\'avocat.',
  ].join('\n');
}

const VARIANT_INSTRUCTIONS = {
  normal: () => 'Rédige la réponse.',
  regenerate: (prev) => `Rédige une nouvelle version, nettement différente de celle-ci (autre ouverture, autre conclusion, même fond) :\n«${prev}»`,
  shorter: (prev) => `Raccourcis cette réponse à 2 phrases au maximum (plus la signature), en gardant le détail repris de l'avis :\n«${prev}»`,
  warmer: (prev) => `Rends cette réponse plus chaleureuse et plus humaine, sans rien inventer et sans dépasser 5 phrases :\n«${prev}»`,
  edit: (prev, instruction) => `Le patron demande cette modification : «${instruction}».\nApplique-la à la réponse ci-dessous, sans rien changer d'autre et sans rien inventer :\n«${prev}»`,
};

export function buildUserPrompt({ review, analysis, recentReplies, variant, previous, instruction }) {
  const r = review || {};
  const a = analysis || {};
  const lines = [
    'Avis Google à traiter :',
    `- Note : ${r.stars ? r.stars + '/5' : 'non précisée'}`,
    `- Auteur : ${(r.author || '').trim() || 'non précisé'}`,
    `- Texte : «${(r.text || '').trim() || '(aucun texte, seulement une note)'}»`,
  ];
  const hints = [];
  if (a.lang && a.lang !== 'fr') hints.push(`langue de l'avis : ${LANG_NAMES[a.lang] || a.lang}`);
  if (a.dishes && a.dishes.length) hints.push('plats cités : ' + a.dishes.map((d) => d.text).join(', '));
  if (a.staff && a.staff.length) hints.push("prénoms de l'équipe cités : " + a.staff.map((s) => s.name).join(', '));
  if (a.occasion) hints.push('occasion : ' + a.occasion.label);
  if (a.durations && a.durations.length) hints.push("durée d'attente citée : " + a.durations[0]);
  if (a.author) hints.push('prénom du client : ' + a.author);
  if (a.avoidHits && a.avoidHits.length) hints.push("l'avis touche un sujet à éviter (" + a.avoidHits.join(', ') + ') : ne l\'aborde pas');
  if (a.category === 'abusif' || a.category === 'suspect') hints.push('avis classé ' + categoryLabel(a.category) + ' par le filtre automatique');
  if (hints.length) lines.push('', 'Repères (repérage automatique, à vérifier dans le texte) : ' + hints.join(' ; ') + '.');
  const recent = (recentReplies || []).filter(Boolean).slice(0, 5);
  if (recent.length) {
    lines.push('', 'Réponses récentes de ce restaurant (ne pas reprendre leurs tournures) :');
    recent.forEach((t, i) => lines.push(`${i + 1}. «${clampText(String(t).split('\n')[0], 140)}»`));
  }
  const v = VARIANT_INSTRUCTIONS[variant] && previous && (variant !== 'edit' || instruction) ? variant : 'normal';
  lines.push('', VARIANT_INSTRUCTIONS[v](previous || '', instruction || ''));
  lines.push('', "Rappel avant d'écrire : rien qui ne soit dans l'avis ou la fiche ; ne commente pas l'avis lui-même ; aucune des formules bannies (« N'hésitez pas », « nous prenons note », « à la hauteur », « valeurs », « prenons votre retour au sérieux »…) ; ne minimise pas un constat concret (« vous a semblé ») ; en anglais, pas de « don't hesitate » ni de « make things right ».");
  return lines.join('\n');
}

export function buildPrompt(opts) {
  const system = buildSystemPrompt(opts.profile);
  const user = buildUserPrompt(opts);
  return { system, user, combined: system + '\n\n---\n\n' + user };
}

/** Partie affichable pendant le streaming (on cache le bloc « ### ALERTE »). */
export function visiblePart(raw) {
  let t = String(raw || '');
  const i = t.indexOf('###');
  if (i !== -1) t = t.slice(0, i);
  t = t.replace(/\n?#{1,2}\s*$/, '');
  return cleanReply(t, true);
}

export function cleanReply(text, partial) {
  let t = String(text || '').replace(/\r/g, '');
  t = t.replace(/^\s*(réponse( proposée)?|response|reply)\s*:\s*/i, '');
  t = t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s.*$/gm, '');
  t = t.trim();
  if (!partial) {
    t = t.replace(/^[«"“]\s*/, '').replace(/\s*[»"”]\s*(\n|$)/, '$1');
  }
  return t.replace(/\n{3,}/g, '\n\n');
}

export function parseModelOutput(raw) {
  const text = String(raw || '');
  const parts = text.split(/\n\s*#{3,}\s*/);
  const reply = cleanReply(parts[0]);
  let alert = null;
  const meta = parts.slice(1).join('\n');
  const m = meta.match(/ALERTE\s*:\s*(.+)/i);
  if (m && !/^\s*(aucune|aucun|none|non|rien|ras)\b/i.test(m[1])) alert = m[1].trim().replace(/[.«»"]+$/g, '');
  return { reply, alert };
}

const HESITATE = [
  [/n'h[ée]sitez pas à nous (appeler|contacter|écrire|joindre)/gi, (m, v) => ({ appeler: 'appelez-nous', contacter: 'contactez-nous', 'écrire': 'écrivez-nous', joindre: 'joignez-nous' })[v.toLowerCase()]],
  [/n'h[ée]site pas à nous (appeler|contacter|écrire|joindre)/gi, (m, v) => ({ appeler: 'appelle-nous', contacter: 'contacte-nous', 'écrire': 'écris-nous', joindre: 'joins-nous' })[v.toLowerCase()]],
  [/n'h[ée]sitez pas à revenir/gi, () => 'revenez nous voir'],
  [/n'h[ée]site pas à revenir/gi, () => 'reviens nous voir'],
  [/please don't hesitate to (call|contact|reach out to|email) us/gi, (m, v) => ({ call: 'please call us', contact: 'please contact us', 'reach out to': 'please get in touch', email: 'please email us' })[v.toLowerCase()]],
  [/don't hesitate to (call|contact|reach out to|email) us/gi, (m, v) => ({ call: 'call us', contact: 'contact us', 'reach out to': 'get in touch', email: 'email us' })[v.toLowerCase()]],
];

/** Retouches sûres après l'IA : formules creuses remplacées, typographie française. */
export function polishReply(text, lang) {
  let t = String(text || '');
  for (const [re, fn] of HESITATE) {
    t = t.replace(re, (m, ...args) => {
      const out = fn(m, ...args);
      return /^[A-ZÉ]/.test(m) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
    });
  }
  // « Merci pour ces mots si généreux ! » : on ne commente pas l'avis
  t = t.replace(/ pour (ces|vos|tes) (si |très |bien )?([\p{L}-]+ )?(mots|paroles|compliments)( si [\p{L}-]+| très [\p{L}-]+| [\p{L}-]+(?<!s)s?)?(?=\s*[!.,])/giu, '')
    .replace(/ pour (ce|votre|ton) (si |très |bien )?([\p{L}-]+ )(retour|commentaire|avis|message)( si [\p{L}-]+| très [\p{L}-]+)?(?=\s*[!.,])/giu, '')
    .replace(/ pour (ce|votre|ton) (retour|commentaire|avis|message) (si |très )?[\p{L}-]+(?=\s*[!.,])/giu, '');
  t = t.replace(/(^|[.!?]\s+)([a-zé])/g, (m, a, b) => a + b.toUpperCase());
  if (lang === 'fr' || !lang) {
    t = t.replace(/[ \u00a0\u202f]*([!?;])/g, '\u202f$1')
      .replace(/([^\s\d\u00a0\u202f])[ \u00a0\u202f]*:(?=\s|$)/g, '$1\u00a0:')
      .replace(/«[ \u00a0\u202f]*/g, '«\u00a0').replace(/[ \u00a0\u202f]*»/g, '\u00a0»')
      .replace(/\u202f([!?])\u202f([!?])/g, '\u202f$1$2');
  }
  return t;
}

export function ensureSignature(reply, profile, lang) {
  const p = profile || {};
  const sig = (p.signature || defaultSignature(p)).trim();
  const text = String(reply || '').trim();
  if (!sig || !text) return text;
  const lines = text.split('\n');
  const last = fold(lines[lines.length - 1]);
  const nom = fold(p.nom || '');
  if (last.indexOf(fold(sig)) !== -1) return text;
  if (lang && lang !== 'fr' && ((nom && last.indexOf(nom) !== -1) || /team|equipo|staff|equipe/.test(last))) return text;
  if (lines.length > 1 && last.length < 60 && (last.indexOf(nom) !== -1 || /equipe|team/.test(last))) return text;
  return text + '\n' + (lang && lang !== 'fr' ? translateSignature(sig, lang, p.nom) : sig);
}

/** Contrôles de sécurité sur une réponse (IA ou modifiée à la main). */
export function checkReply(reply, profile, analysis) {
  const alerts = [];
  const f = fold(reply);
  const infos = fold((profile && profile.infos) || '');
  if (/(offert|offerte|offerts|gratuit|gratuite|remise|reduction|code promo|geste commercial|\d+ ?%|bon d'achat|avoir de|free of charge|discount|complimentary|on the house)/.test(f)
    && !/(offert|gratuit|remise|reduction)/.test(infos)) {
    alerts.push({ level: 'orange', code: 'geste_commercial', message: 'La réponse propose un geste commercial ou une remise : à valider avec le patron ou à retirer.' });
  }
  const avoid = String((profile && profile.aEviter) || '').split(/[,;\n]+/).map((x) => fold(x.trim())).filter((x) => x.length >= 3);
  const words = avoid.flatMap((x) => x.split(/\s+/).filter((w) => w.length >= 4));
  const hit = words.find((w) => f.indexOf(w) !== -1);
  if (hit) alerts.push({ level: 'orange', code: 'sujet_evite_reponse', message: `La réponse parle d'un sujet à éviter (« ${hit} ») : à reformuler.` });
  if (analysis && (analysis.stars || 3) <= 2) {
    const staff = (analysis.staff || []).find((s) => f.indexOf(fold(s.name)) !== -1);
    if (staff) alerts.push({ level: 'orange', code: 'personnel_cite', message: `La réponse nomme ${staff.name} dans un avis négatif : à retirer.` });
  }
  const n = splitSentences(String(reply).split('\n')[0]).length;
  if (n > 6) alerts.push({ level: 'info', code: 'longueur', message: 'Réponse un peu longue : utilise « Plus court ».' });
  return alerts;
}

export function mergeAlerts(...lists) {
  const out = [];
  for (const l of lists) for (const a of l || []) if (a && !out.some((x) => x.code === a.code && x.message === a.message)) out.push(a);
  const order = { rouge: 0, orange: 1, info: 2 };
  return out.sort((x, y) => (order[x.level] ?? 3) - (order[y.level] ?? 3));
}
