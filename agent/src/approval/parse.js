// Comprendre la réponse du patron sur WhatsApp.
//   « OK », « oui », « 👍 », « go », « parfait », « c'est bon »  → on publie
//   « non », « stop », « pas de réponse », « laisse tomber »    → on ne publie pas
//   un long texte qui ressemble à une réponse complète          → on publie SON texte
//   tout le reste (« enlève la dernière phrase »)               → consigne de modification

const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const APPROVE = /^(ok+|okay|oui|ouais|yes|go|vas[- ]?y|valide|validee|je valide|c'?est bon|parfait|top|nickel|super|d'?accord|dac|ca marche|publie|publiez|publier|envoie|envoyez|👍|✅|👌)\b[\s!.👍✅👌🙏]*$/u;
const APPROVE_EMOJI = /^[\s👍✅👌🙏💯]+$/u;
const REJECT = /^(non|no|nan|stop|annule|annuler|laisse tomber|pas de reponse|ne (pas )?repond|surtout pas|refuse|❌|👎)\b/u;

/**
 * @returns {{action:'approve'|'reject'|'replace'|'edit', text?:string, instruction?:string}}
 */
export function interpretOwnerReply(message, proposedReply) {
  const raw = String(message || '').trim();
  const f = fold(raw);
  if (!f) return { action: 'edit', instruction: '' };
  if (APPROVE.test(f) || APPROVE_EMOJI.test(raw)) return { action: 'approve' };
  // « OK merci », « oui c'est parfait », « ok vas-y » : court, commence par un accord, sans « mais / change… »
  const words = f.split(/\s+/);
  if (/^(ok+|okay|oui|ouais|yes|go|vas[- ]?y|valide\w*|je valide|c'?est bon|parfait|top|nickel|super|d'?accord|dac|ca marche|publie\w*|envoie\w*)\b/.test(f)
    && words.length <= 6 && !/\b(mais|sauf|change\w*|modifie\w*|enleve\w*|retire\w*|ajoute\w*|remplace\w*|corrige\w*|plutot|non)\b/.test(f)) {
    return { action: 'approve' };
  }
  if (REJECT.test(f)) return { action: 'reject' };
  // Le patron a recopié/réécrit la réponse entière : on publie son texte tel quel
  const sentences = raw.split(/[.!?]+\s/).filter((x) => x.trim().length > 3).length;
  const looksLikeReply = raw.length >= 90 && sentences >= 2
    && !/^(change|modifie|enleve|retire|ajoute|mets|remplace|precise|dis|ecris|corrige|il faut|faut|peux-tu|pouvez-vous)/.test(f)
    && /\b(merci|bonjour|nous|vous|bienvenue|a bientot|au plaisir|thank)\b/.test(f);
  if (looksLikeReply) return { action: 'replace', text: raw };
  if (proposedReply && fold(raw) === fold(proposedReply)) return { action: 'approve' };
  return { action: 'edit', instruction: raw };
}

/** Identifiant de bouton « OK:<clé> » / « EDIT:<clé> » / « NO:<clé> » */
export function parseButtonPayload(payload) {
  const m = String(payload || '').match(/^(OK|EDIT|NO):(.+)$/);
  if (!m) return null;
  return { action: m[1] === 'OK' ? 'approve' : m[1] === 'NO' ? 'reject' : 'edit-request', code: m[2] };
}
