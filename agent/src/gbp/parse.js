// Conversion des objets « Review » de l'API Google Business Profile (v4) vers notre format.

const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

export function starRatingToNumber(v) {
  if (typeof v === 'number') return v;
  return STARS[String(v || '').toUpperCase()] || null;
}

/**
 * Google ajoute sa traduction automatique dans le commentaire des avis étrangers :
 *   "(Translated by Google) Super !\n\n(Original)\nGreat!"   ou l'inverse selon la langue du compte.
 * On garde le texte ORIGINAL : c'est à lui que l'on répond, dans sa langue.
 */
export function originalComment(comment) {
  const c = String(comment || '').replace(/\r/g, '').trim();
  if (!c) return '';
  const ORIGINAL = /\(Original\)|\(Texte d'origine\)|\(Original text\)/i;
  const TRANSLATED = /\(Translated by Google\)|\(Traduit par Google\)/i;
  const m = c.match(ORIGINAL);
  if (m) return c.slice(m.index + m[0].length).trim();
  const t = c.match(TRANSLATED);
  if (t && t.index > 0) return c.slice(0, t.index).trim();
  if (t && t.index === 0) return c.replace(TRANSLATED, '').trim();
  return c;
}

/** Review v4 → { key, location, reviewId, author, stars, text, createTime, updateTime, reply } */
export function normalizeReview(r, locationName) {
  const name = r.name || `${locationName}/reviews/${r.reviewId}`;
  const reviewer = r.reviewer || {};
  return {
    key: name,
    location: name.split('/reviews/')[0],
    reviewId: r.reviewId || name.split('/').pop(),
    author: reviewer.isAnonymous ? '' : (reviewer.displayName || ''),
    stars: starRatingToNumber(r.starRating),
    text: originalComment(r.comment),
    createTime: r.createTime,
    updateTime: r.updateTime || r.createTime,
    reply: r.reviewReply ? { text: r.reviewReply.comment, updateTime: r.reviewReply.updateTime } : null,
  };
}
