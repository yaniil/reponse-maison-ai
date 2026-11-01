// Moteur « démo » : rédige une réponse crédible SANS IA ni réseau, à partir de l'analyse de l'avis.
// Sert de filet de sécurité (l'outil ne plante jamais) et de mode démo hors-ligne.
// Règles : 2 à 5 phrases, un détail précis repris de l'avis, aucune invention, pas de répétition d'un avis à l'autre.
import { analyzeReview } from './analyze.js';
import { fold, hashString, seededRandom, capitalize, splitSentences } from './text.js';

// ---------------------------------------------------------------------------
// Banques de phrases. Syntaxe : {vous|tu} = alternative vouvoiement/tutoiement.
// tones : c = chaleureux, s = sobre, f = familial. Placeholders : %NAME% %DISH% %DISH_CAP% %A% %AIT% %STAFF%
// %OCC% %OCC_DE% %DUR% %DUR_CAP% %QUOTE% %STARS% %ASPECT% %CONTACT% %NOUN%
// ---------------------------------------------------------------------------
const FR = {
  thanks: [
    { id: 'th1', tones: 'cf', t: 'Un grand merci pour {votre|ton} message, il nous a fait très plaisir !' },
    { id: 'th2', tones: 'cf', t: "Merci beaucoup d'avoir pris le temps de nous écrire !", when: (a) => !a.isShort },
    { id: 'th3', tones: 'c', t: 'Quel plaisir de lire {votre|ton} avis !' },
    { id: 'th4', tones: 'cf', t: 'Merci mille fois pour ces mots !' },
    { id: 'th5', tones: 'cf', t: 'Merci pour ce retour qui fait chaud au cœur !' },
    { id: 'th7', tones: 'c', t: 'Merci pour ces %STARS% étoiles et pour ce joli message !', when: (a) => a.starsGiven >= 4 },
    { id: 'th8', tones: 'cf', t: 'Ça fait vraiment plaisir de lire un avis comme le {vôtre|tien}, merci !' },
    { id: 'th9', tones: 'f', t: 'Merci du fond du cœur pour {votre|ton} message !' },
    { id: 'th10', tones: 'f', t: "Toute l'équipe {vous|te} remercie pour ce joli message !" },
    { id: 'th11', tones: 'f', t: 'Quel bonheur de lire {votre|ton} message, merci !' },
    { id: 'ths1', tones: 's', t: 'Merci pour {votre|ton} avis.' },
    { id: 'ths2', tones: 's', t: 'Nous {vous|te} remercions pour ce retour.' },
    { id: 'ths3', tones: 's', t: "Merci d'avoir pris le temps de partager {votre|ton} expérience.", when: (a) => !a.isShort },
    { id: 'ths4', tones: 's', t: 'Nous {vous|te} remercions pour ces mots aimables.' },
    { id: 'ths5', tones: 's', t: "Merci pour ce message, très apprécié par toute l'équipe." },
  ],
  // courtes formules de remerciement, utilisées quand le détail ouvre la réponse
  thanksShort: [
    { id: 'tq1', tones: 'cf', t: 'Merci pour ce joli message !' },
    { id: 'tq2', tones: 'cf', t: "Merci d'avoir pris le temps de nous l'écrire !", when: (a) => !a.isShort },
    { id: 'tq3', tones: 'cf', t: 'Et merci pour ces mots, ils font plaisir à toute l\'équipe !' },
    { id: 'tqs1', tones: 's', t: 'Merci pour ce message.' },
    { id: 'tqs2', tones: 's', t: "Merci d'avoir pris le temps de nous l'écrire.", when: (a) => !a.isShort },
  ],
  dish: [
    { id: 'di1', tones: 'cf', t: 'Ravis que %DISH% {vous %AIT%|t\'%AIT%} plu !' },
    { id: 'di2', tones: 'cf', t: 'On transmet {votre|ton} compliment sur %DISH% à la cuisine, ça va faire des heureux !' },
    { id: 'di3', tones: 'c', t: 'Savoir que %DISH% {vous %A%|t\'%A%} autant plu, c\'est la plus belle récompense pour la cuisine.' },
    { id: 'di4', tones: 'f', t: '%DISH_CAP% : on est ravis d\'avoir visé juste !' },
    { id: 'di5', tones: 'cf', t: 'Mention spéciale pour %DISH%, alors : la cuisine va être contente de lire ça !' },
    { id: 'dis1', tones: 's', t: 'Nous sommes heureux que %DISH% {vous %AIT%|t\'%AIT%} plu.' },
    { id: 'dis2', tones: 's', t: '{Votre|Ton} compliment sur %DISH% sera transmis en cuisine.' },
  ],
  staff: [
    { id: 'st1', tones: 'cf', t: 'On transmet {vos|tes} compliments à %STAFF%, ça va lui faire très plaisir !' },
    { id: 'st2', tones: 'cf', t: 'Merci pour %STAFF% : on lui fait suivre {votre|ton} message !' },
    { id: 'st3', tones: 'cf', t: '{Vos|Tes} mots pour %STAFF% vont lui faire très plaisir !' },
    { id: 'sts1', tones: 's', t: 'Nous transmettrons {vos|tes} compliments à %STAFF%.' },
    { id: 'sts2', tones: 's', t: '{Vos|Tes} mots pour %STAFF% lui seront transmis.' },
  ],
  occasion: [
    { id: 'oc1', tones: 'cf', t: "Merci d'avoir choisi notre table pour %OCC% !", when: (a) => !a.delivery },
    { id: 'oc2', tones: 'c', t: "Quel plaisir d'avoir été de la partie pour %OCC% !" },
    { id: 'oc3', tones: 'cf', t: "On est heureux d'avoir fait partie %OCC_DE% !" },
    { id: 'ocs1', tones: 's', t: 'Merci de nous avoir choisis pour %OCC%.' },
    { id: 'ocs2', tones: 's', t: "Nous sommes heureux d'avoir fait partie %OCC_DE%." },
  ],
  regular: [
    { id: 're1', tones: 'cf', t: 'Merci pour {votre|ta} fidélité, ça compte énormément pour nous.' },
    { id: 're2', tones: 'cf', t: "Des clients fidèles comme {vous|toi}, c'est ce qui fait vivre la maison !" },
    { id: 'res1', tones: 's', t: '{Votre|Ta} fidélité nous touche beaucoup.' },
  ],
  quote: [
    { id: 'qu1', tones: 'cf', t: '« %QUOTE% » : court, mais ça nous fait très plaisir !' },
    { id: 'qu2', tones: 'f', t: '« %QUOTE% » : on prend !' },
    { id: 'qu3', tones: 'c', t: '« %QUOTE% » : on ne pouvait pas rêver mieux comme avis !' },
    { id: 'qus1', tones: 's', t: 'Un avis bref, mais qui nous fait grand plaisir.' },
  ],
  aspect: {
    accueil: [
      { id: 'aa1', tones: 'cf', t: "Ça fait plaisir de lire que l'accueil {vous a|t'a} plu, c'est ce qui nous tient le plus à cœur." },
      { id: 'aa2', tones: 'cf', t: "L'accueil compte énormément pour nous : merci de l'avoir remarqué !" },
      { id: 'aas1', tones: 's', t: "Nous sommes heureux que l'accueil {vous ait|t'ait} plu." },
      { id: 'aas2', tones: 's', t: "L'accueil compte beaucoup pour nous, et nous sommes heureux qu'il {vous ait|t'ait} plu." },
    ],
    service: [
      { id: 'as1', tones: 'cf', t: "Merci pour {votre|ton} mot sur le service, l'équipe en salle va être contente de lire ça !" },
      { id: 'ass1', tones: 's', t: "Merci pour {votre|ton} appréciation du service, que nous transmettons à l'équipe." },
      { id: 'ass2', tones: 's', t: "L'équipe en salle sera heureuse de lire {votre|ton} appréciation du service." },
      { id: 'as2', tones: 'cf', t: "L'équipe en salle va être ravie de lire ça !" },
    ],
    cuisine: [
      { id: 'ac1', tones: 'cf', t: 'Ravis que la cuisine {vous ait|t\'ait} plu !' },
      { id: 'ac2', tones: 'cf', t: 'On transmet {vos|tes} compliments à la cuisine, ça va faire des heureux !' },
      { id: 'acs1', tones: 's', t: "Nous sommes heureux que la cuisine {vous ait|t'ait} plu." },
      { id: 'acs2', tones: 's', t: 'La cuisine sera heureuse de lire {vos|tes} compliments.' },
      { id: 'ac3', tones: 'cf', t: 'La cuisine va être contente de lire ça !' },
    ],
    cadre: [
      { id: 'ad1', tones: 'cf', t: 'Ravis que %PLACE% {vous ait|t\'ait} plu !' },
      { id: 'ads1', tones: 's', t: 'Nous sommes heureux que %PLACE% {vous ait|t\'ait} plu.' },
    ],
    prix: [
      { id: 'ap1', tones: 'cf', t: 'Merci pour {votre|ton} mot sur le rapport qualité-prix, on y tient beaucoup !' },
      { id: 'aps1', tones: 's', t: 'Merci pour {votre|ton} appréciation du rapport qualité-prix.' },
    ],
    portions: [
      { id: 'ao1', tones: 'cf', t: "Merci d'avoir souligné la générosité des assiettes !" },
      { id: 'aos1', tones: 's', t: "Merci d'avoir souligné la générosité des assiettes." },
    ],
    rapidite: [
      { id: 'ar1', tones: 'cf', t: "Merci d'avoir souligné la rapidité du service !", when: (a) => !a.delivery },
      { id: 'ar2', tones: 'cf', t: "Ravis que la commande soit arrivée vite et en forme !", when: (a) => a.delivery },
      { id: 'ars1', tones: 's', t: "Merci d'avoir souligné la rapidité du service.", when: (a) => !a.delivery },
      { id: 'ars2', tones: 's', t: 'Nous sommes heureux que la livraison {vous ait|t\'ait} donné satisfaction.', when: (a) => a.delivery },
    ],
    enfants: [
      { id: 'ae1', tones: 'cf', t: 'Ravis que les enfants se soient régalés aussi !' },
      { id: 'aes1', tones: 's', t: 'Nous sommes heureux que les enfants aient passé un bon moment.' },
    ],
  },
  reserve: {
    attente: [
      { id: 'rv1', tones: 'cf', t: "Et merci pour {votre|ta} patience malgré l'attente, c'est noté !" },
      { id: 'rv2', tones: 'cf', t: "On note aussi {votre|ta} remarque sur l'attente, merci de l'avoir signalée." },
      { id: 'rv3', tones: 'cf', t: "Bien noté pour l'attente, on en tient compte !" },
      { id: 'rvs1', tones: 's', t: "Nous prenons note de {votre|ta} remarque sur l'attente." },
    ],
    bruit: [
      { id: 'rb1', tones: 'cf', t: 'Et merci pour la remarque sur le bruit, c\'est noté !' },
      { id: 'rb2', tones: 'cf', t: "On note pour le niveau sonore, merci de l'avoir signalé." },
      { id: 'rb3', tones: 'cf', t: 'Bien noté pour le niveau sonore, on en tient compte !' },
      { id: 'rbs1', tones: 's', t: 'Nous prenons note de {votre|ta} remarque sur le niveau sonore.' },
    ],
    generic: [
      { id: 'rg1', tones: 'cf', t: 'Et merci pour la petite remarque, elle est bien notée !' },
      { id: 'rg2', tones: 'cf', t: 'On note aussi {votre|ta} remarque sur %ASPECT%, merci.' },
      { id: 'rg3', tones: 'cf', t: 'Bien noté pour %ASPECT%, on en tient compte !' },
      { id: 'rgs1', tones: 's', t: 'Nous prenons note de {votre|ta} remarque sur %ASPECT%.' },
    ],
  },
  close: [
    { id: 'cl1', tones: 'c', t: 'Au plaisir de {vous|te} revoir très vite !', when: (a) => !a.delivery },
    { id: 'cl2', tones: 'cf', t: 'À très bientôt à notre table !', when: (a) => !a.delivery },
    { id: 'cl3', tones: 'cf', t: 'On {vous attend|t\'attend} pour la prochaine !', when: (a) => !a.delivery },
    { id: 'cl4', tones: 'cf', t: '{Revenez|Reviens} vite nous voir !', when: (a) => !a.delivery },
    { id: 'cl5', tones: 'cf', t: 'On compte sur {vous|toi} pour la prochaine fois !', when: (a) => a.willReturn },
    { id: 'cl6', tones: 'f', t: '{Vous êtes ici chez vous|Tu es ici chez toi}, à très vite !', when: (a) => !a.delivery },
    { id: 'cl7', tones: 'f', t: '{Revenez|Reviens} quand {vous voulez|tu veux}, la porte est grande ouverte !', when: (a) => !a.delivery },
    { id: 'cl8', tones: 'cf', t: 'Au plaisir de {vous|te} régaler à nouveau !' },
    { id: 'cl9', tones: 'cf', t: 'À très vite pour une prochaine commande !', when: (a) => a.delivery },
    { id: 'cl10', tones: 'cf', t: 'À très vite pour la suite !', when: (a) => a.regular },
    { id: 'cls1', tones: 's', t: 'Au plaisir de {vous accueillir|t\'accueillir} à nouveau.', when: (a) => !a.delivery },
    { id: 'cls2', tones: 's', t: 'Nous espérons {vous|te} revoir prochainement.', when: (a) => !a.delivery },
    { id: 'cls3', tones: 's', t: 'Au plaisir de {vous|te} retrouver très bientôt.', when: (a) => a.regular },
    { id: 'cls4', tones: 's', t: 'Au plaisir de {vous|te} servir à nouveau.' },
  ],
  warm: [
    { id: 'wa1', t: "C'est le genre de message qui donne le sourire à toute l'équipe !" },
    { id: 'wa2', t: 'Ça nous touche vraiment, merci du fond du cœur.' },
    { id: 'wa3', t: 'Des retours comme le {vôtre|tien} nous donnent envie de faire encore mieux !' },
  ],
  // ---- avis négatifs
  negOpen: [
    { id: 'nosa', t: 'Nous sommes désolés d\'apprendre que {vous avez|tu as} été malade.', sante: true },
    { id: 'nosb', t: 'Merci de nous avoir écrit, et nous sommes désolés d\'apprendre que {vous avez|tu as} été malade.', sante: true },
    { id: 'nohy', t: 'Merci de nous avoir signalé ce problème.', hygiene: true },
    { id: 'no1', t: "Merci d'avoir pris le temps de nous faire ce retour." },
    { id: 'no2', t: 'Merci pour {votre|ton} message, même s\'il nous attriste.' },
    { id: 'no3', t: 'Nous sommes désolés de lire que {votre|ta} visite ne s\'est pas passée comme prévu.', apology: true, when: (a) => !a.delivery },
    { id: 'no4', t: 'Nous sommes navrés que {votre|ton} repas n\'ait pas été à la hauteur.', apology: true, when: (a) => !a.delivery && a.timeOfDay !== 'soir' },
    { id: 'no5', t: 'Nous sommes navrés que {votre|ta} soirée n\'ait pas été à la hauteur.', apology: true, when: (a) => !a.delivery && a.timeOfDay === 'soir' },
    { id: 'no6', t: 'Nous sommes désolés que {votre|ta} commande n\'ait pas été à la hauteur.', apology: true, when: (a) => a.delivery },
    { id: 'no7', tones: 'cf', t: "Ce n'est pas le souvenir que nous voulions {vous|te} laisser, et nous en sommes désolés.", apology: true },
  ],
  issue: {
    attente: [
      { id: 'iw1', t: '%DUR_CAP% d\'attente, c\'est beaucoup trop, {vous avez|tu as} raison.', when: (a) => a.durations.length },
      { id: 'iw2', t: 'Attendre %DUR%, ce n\'est pas acceptable, et nous le savons.', when: (a) => a.durations.length },
      { id: 'iw3', t: "Une telle attente n'est pas ce que nous voulons pour nos clients.", when: (a) => !a.durations.length },
      { id: 'iw4', t: "L'attente que {vous décrivez|tu décris} n'est pas normale.", when: (a) => !a.durations.length },
    ],
    temperature: [
      { id: 'it1', t: '%TEMP_NOUN%, ce n\'est pas acceptable.' },
      { id: 'it2', t: '%TEMP_NOUN%, ce n\'est pas ainsi que nous voulons servir.' },
    ],
    accueil: [
      { id: 'ia1', prio: true, t: "Personne ne devrait avoir l'impression de déranger chez nous.", when: (a, r) => /derang/.test(fold(r.text)) },
      { id: 'ia2', t: 'Un accueil comme celui que {vous décrivez|tu décris} ne correspond pas à ce que nous voulons offrir.' },
      { id: 'ia3', t: 'Chacun doit se sentir bienvenu chez nous, et nous regrettons que ce ne soit pas ce que {vous avez|tu as} ressenti.' },
    ],
    prix: [
      { id: 'ip1', t: 'Nous entendons {votre|ta} remarque sur les prix et la prenons en compte.' },
    ],
    portions: [
      { id: 'io1', t: '{Votre|Ta} remarque sur les portions est notée, et nous allons en parler en cuisine.' },
    ],
    cuisson: [
      { id: 'ic1', t: 'Une cuisson ratée sur %DISH%, ça ne devrait pas arriver.', when: (a) => a._dish },
      { id: 'ic2', t: "Une cuisson qui n'est pas au rendez-vous, ça ne devrait pas arriver." },
    ],
    gout: [
      { id: 'ig1', t: 'Nous sommes désolés que %DISH% ne {vous %AIT%|t\'%AIT%} pas plu.', apology: true, when: (a) => a._dish },
      { id: 'ig2', t: 'Nous sommes désolés que les plats ne {vous aient|t\'aient} pas plu.', apology: true },
    ],
    bruit: [
      { id: 'ib1', t: '{Votre|Ta} remarque sur le bruit est juste, et nous la gardons en tête.' },
    ],
    proprete: [
      { id: 'ipr1', t: "La propreté n'est pas négociable, et nous allons vérifier ce point de près." },
    ],
    hygiene: [
      { id: 'ih1', t: 'Ce que {vous décrivez|tu décris} est sérieux, et nous voulons comprendre ce qui s\'est passé.' },
      { id: 'ih2', t: "C'est un point que nous prenons très au sérieux, et nous aimerions en savoir plus." },
    ],
    sante: [
      { id: 'is1', t: 'Nous prenons ce que {vous décrivez|tu décris} très au sérieux et voulons comprendre ce qui s\'est passé.' },
      { id: 'is2', t: "C'est un sujet que nous prenons très au sérieux, et nous aimerions en savoir plus." },
    ],
    erreur: [
      { id: 'ie1', t: "Une erreur dans la commande, ce n'est pas ce que nous voulons." },
    ],
    reservation: [
      { id: 'ir1', t: 'Nous sommes désolés pour ce souci de réservation.', apology: true },
    ],
    livraison: [
      { id: 'il1', t: "Une livraison qui n'arrive pas dans de bonnes conditions, ce n'est pas acceptable." },
    ],
    generic: [
      { id: 'ix1', t: "Ce n'est pas l'expérience que nous voulons offrir." },
      { id: 'ix2', t: 'Nous aurions aimé faire mieux.' },
    ],
  },
  apology: [
    { id: 'ap1', t: 'Toutes nos excuses.' },
    { id: 'ap2', t: 'Nous {vous|te} présentons nos excuses.' },
    { id: 'ap3', tones: 'f', t: 'On est vraiment désolés.' },
  ],
  action: [
    { id: 'aq1', t: 'Nous en parlons avec l\'équipe pour que cela ne se reproduise pas.' },
    { id: 'aq2', t: '{Votre|Ton} retour est partagé avec toute l\'équipe.' },
  ],
  invite: [
    { id: 'iv1', t: 'N\'{hésitez|hésite} pas à nous appeler au %CONTACT% pour en parler.', when: (a, r, ctx) => ctx.contactType === 'tel' },
    { id: 'iv2', t: 'N\'{hésitez|hésite} pas à nous écrire à %CONTACT% pour en parler.', when: (a, r, ctx) => ctx.contactType === 'mail' },
    { id: 'iv3', t: 'Si {vous le souhaitez|tu le souhaites}, {contactez-nous|contacte-nous} directement : nous aimerions {vous|te} donner l\'occasion de revenir dans de meilleures conditions.', when: (a, r, ctx) => !ctx.contactType && !a.wontReturn && !a.delivery },
    { id: 'iv4', t: 'Nous aimerions avoir l\'occasion de {vous|te} recevoir à nouveau, dans de meilleures conditions.', when: (a, r, ctx) => !ctx.contactType && !a.wontReturn && !a.delivery },
    { id: 'iv5', t: '{Contactez-nous|Contacte-nous} directement si {vous le souhaitez|tu le souhaites}, nous serions heureux d\'en parler.', when: (a, r, ctx) => !ctx.contactType },
    { id: 'iv6', t: 'Nous aimerions avoir l\'occasion de {vous|te} régaler à nouveau, dans de meilleures conditions.', when: (a, r, ctx) => !ctx.contactType && a.delivery },
  ],
  warmNeg: [
    { id: 'wn1', t: 'Nous comprenons vraiment {votre|ta} déception.' },
    { id: 'wn2', t: 'Nous sommes sincèrement désolés que cela se soit passé ainsi.', apology: true },
  ],
  // ---- avis mitigés
  mixOpen: [
    { id: 'mo1', t: 'Merci pour ce retour nuancé.' },
    { id: 'mo2', t: "Merci d'avoir pris le temps de nous écrire." },
    { id: 'mo3', tones: 'cf', t: 'Merci pour {votre|ton} message et pour {votre|ta} franchise !' },
  ],
  warmMix: [
    { id: 'wm1', t: 'Ce genre de retour nous aide vraiment à progresser.' },
    { id: 'wm2', t: "C'est grâce à des avis comme le {vôtre|tien} que nous avançons." },
  ],
  warmSerious: [
    { id: 'ws1', t: 'Nous espérons sincèrement que {vous allez|tu vas} mieux.', sante: true },
    { id: 'ws2', t: 'Nous tenons à ce que chacun se sente en confiance chez nous.' },
  ],
  mixIssue: [
    { id: 'mi1', t: '{Votre|Ta} remarque sur %ASPECT% est bien notée.' },
    { id: 'mi2', t: 'Pour %ASPECT%, nous entendons {votre|ta} remarque et allons en parler avec l\'équipe.' },
    { id: 'mi3', t: 'Nous prenons note de ce que {vous dites|tu dis} sur %ASPECT%.' },
  ],
  mixIssueAvoid: [
    { id: 'mx1', t: '{Votre|Ta} remarque est bien notée.' },
    { id: 'mx2', t: 'Nous avons bien noté {votre|ta} remarque.' },
  ],
  mixClose: [
    { id: 'mc1', tones: 'cf', t: 'Au plaisir de {vous|te} recevoir à nouveau, en espérant {vous|te} convaincre sur toute la ligne !', when: (a) => !a.delivery },
    { id: 'mc2', t: 'Nous espérons avoir l\'occasion de mieux faire lors de {votre|ta} prochaine visite.', when: (a) => !a.delivery },
    { id: 'mc3', t: 'Au plaisir de {vous|te} régaler à nouveau, en espérant faire un sans-faute la prochaine fois !' },
    { id: 'mc4', tones: 'cf', t: 'On espère {vous|te} revoir bientôt pour {vous|te} faire changer d\'avis !', when: (a) => !a.delivery },
  ],
  // ---- avis abusifs / suspects / sans texte
  abusive: [
    [{ id: 'ab1', t: 'Nous avons pris connaissance de {votre|ton} message.' },
      { id: 'ab2', t: 'Les termes employés ne permettent pas d\'échanger sereinement ici.', noThreat: true },
      { id: 'ab2t', t: 'Nous ne souhaitons pas répondre sur ce ton.', threat: true },
      { id: 'ab3', t: 'Si {votre|ta} visite s\'est mal passée, nous {vous|t\'}invitons à nous contacter directement pour en parler calmement.' }],
    [{ id: 'ab4', t: 'Nous regrettons le ton de ce message.' },
      { id: 'ab5', t: 'Si quelque chose s\'est mal passé lors d\'une visite, nous restons à {votre|ta} disposition pour en parler directement, dans le calme.' }],
  ],
  suspect: [
    [{ id: 'su1', t: 'Merci pour {votre|ton} message.' },
      { id: 'su2', t: 'Sans plus de détails, nous avons du mal à comprendre ce qui s\'est passé.' },
      { id: 'su3', t: 'Si {votre|ta} visite chez nous s\'est mal passée, {contactez-nous|contacte-nous} directement pour en parler.' }],
    [{ id: 'su4', t: 'Nous sommes désolés que l\'expérience n\'ait pas été à la hauteur.' },
      { id: 'su5', t: 'Sans plus de détails, difficile de savoir ce qui s\'est passé : {écrivez-nous|écris-nous} directement, nous voulons comprendre.' }],
  ],
  emptyNeg: [
    [{ id: 'en1', t: 'Nous sommes désolés que {votre|ta} visite n\'ait pas été à la hauteur.' },
      { id: 'en2', t: 'Sans commentaire, difficile de savoir ce qui n\'a pas plu : {écrivez-nous|écris-nous} pour nous en dire plus, nous voulons comprendre.' }],
    [{ id: 'en3', t: 'Nous regrettons que {votre|ta} visite n\'ait pas été à la hauteur de {vos|tes} attentes.' },
      { id: 'en4', t: 'Si {vous le souhaitez|tu le souhaites}, {dites-nous|dis-nous} ce qui s\'est passé, ici ou directement : nous voulons comprendre.' }],
  ],
};

const EN = {
  thanks: [
    { id: 'eth1', tones: 'cf', t: 'Thank you so much for your lovely review!' },
    { id: 'eth2', tones: 'cf', t: 'Thanks a lot for taking the time to write to us!' },
    { id: 'eth3', tones: 'cf', t: 'What a pleasure to read your message, thank you!' },
    { id: 'eths1', tones: 's', t: 'Thank you for your kind words.' },
    { id: 'eths2', tones: 's', t: 'Thank you for taking the time to share your experience.' },
  ],
  dish: [
    { id: 'edi1', tones: 'cf', t: "We're delighted you enjoyed the %DISH%!" },
    { id: 'edi2', tones: 'cf', t: "We'll pass your compliments on the %DISH% to the kitchen, they'll be thrilled!" },
    { id: 'edi3', tones: 'cf', t: 'So glad the %DISH% hit the spot!' },
    { id: 'edis1', tones: 's', t: "We're very pleased you enjoyed the %DISH%." },
  ],
  staff: [
    { id: 'est1', tones: 'cf', t: "We'll pass your kind words on to %STAFF%, it will make their day!" },
    { id: 'ests1', tones: 's', t: 'We will pass your compliments on to %STAFF%.' },
  ],
  occasion: [
    { id: 'eoc1', t: 'Thank you for choosing us for %OCC%!' },
  ],
  regular: [
    { id: 'ere1', t: 'Thank you for your loyalty, it means a lot to us.' },
  ],
  aspect: {
    accueil: [{ id: 'eaa1', t: "We're so glad you felt welcome." }],
    service: [{ id: 'eas1', t: 'Our team will be very happy to read this.' }],
    cuisine: [{ id: 'eac1', t: "We're delighted you enjoyed the food." }],
    cadre: [{ id: 'ead1', t: "We're glad you enjoyed the setting." }],
    prix: [{ id: 'eap1', t: 'Thank you for your kind words about the value.' }],
    portions: [{ id: 'eao1', t: "Glad you didn't leave hungry!" }],
    rapidite: [{ id: 'ear1', t: 'Thank you for mentioning how quick the service was.' }],
    enfants: [{ id: 'eae1', t: 'So glad the kids enjoyed it too!' }],
  },
  reserve: { generic: [{ id: 'erg1', t: 'Thanks also for the feedback on %ASPECT%, duly noted.' }] },
  close: [
    { id: 'ecl1', tones: 'cf', t: 'We hope to welcome you back on your next visit!', when: (a, r) => /trip|visit|holiday|vacation|stay/.test(fold(r.text)) },
    { id: 'ecl2', tones: 'cf', t: 'Hope to see you again soon!' },
    { id: 'ecl3', tones: 'cf', t: 'Looking forward to seeing you next time!' },
    { id: 'ecls1', tones: 's', t: 'We look forward to welcoming you again.' },
  ],
  negOpen: [
    { id: 'eno1', t: "Thank you for your feedback, and we're sorry your visit didn't live up to expectations.", apology: true },
    { id: 'eno2', t: 'Thank you for taking the time to share this, and please accept our apologies.', apology: true },
  ],
  issue: {
    attente: [{ id: 'eiw1', t: 'Waiting that long is not acceptable, and we know it.' }],
    temperature: [{ id: 'eit1', t: 'A dish should never reach the table cold.' }],
    accueil: [{ id: 'eia1', t: "Every guest should feel welcome here, and we're sorry that is not how you felt." }],
    prix: [{ id: 'eip1', t: 'We hear your comment on the prices and take it on board.' }],
    cuisson: [
      { id: 'eic1', t: 'An overcooked %DISH% is not what we want to serve.', when: (a) => a._dish },
      { id: 'eic2', t: 'The cooking clearly missed the mark, and that should not happen.' },
    ],
    gout: [{ id: 'eig1', t: "We're sorry the food didn't meet your expectations." }],
    bruit: [{ id: 'eib1', t: 'Your comment about the noise is fair, and we will keep it in mind.' }],
    proprete: [{ id: 'eipr1', t: 'Cleanliness is non-negotiable, and we will look into this closely.' }],
    hygiene: [{ id: 'eih1', t: 'What you describe is serious, and we want to understand what happened.' }],
    sante: [{ id: 'eis1', t: 'We take your message very seriously and want to understand what happened.' }],
    erreur: [{ id: 'eie1', t: 'A mistake with your order is not what we want.' }],
    reservation: [{ id: 'eir1', t: 'We are sorry about the problem with your booking.' }],
    livraison: [{ id: 'eil1', t: 'A delivery should arrive in good condition, and we are sorry it did not.' }],
    generic: [{ id: 'eix1', t: 'This is not the experience we want for our guests.' }],
  },
  invite: [
    { id: 'eiv1', t: 'Please feel free to call us on %CONTACT% so we can talk it through.', when: (a, r, ctx) => ctx.contactType === 'tel' },
    { id: 'eiv2', t: 'Please feel free to write to us at %CONTACT% so we can talk it through.', when: (a, r, ctx) => ctx.contactType === 'mail' },
    { id: 'eiv3', t: "If you're willing, please contact us directly: we would love the chance to welcome you back in better conditions.", when: (a, r, ctx) => !ctx.contactType },
  ],
  mixOpen: [{ id: 'emo1', t: 'Thank you for your honest feedback.' }],
  mixIssue: [{ id: 'emi1', t: 'Your comment on %ASPECT% is duly noted.' }],
  mixClose: [{ id: 'emc1', t: 'We hope to see you again and win you over completely next time!' }],
  abusive: [[
    { id: 'eab1', t: 'We have read your message.' },
    { id: 'eab2', t: "The language used doesn't allow for a constructive discussion here." },
    { id: 'eab3', t: 'If something went wrong during a visit, please contact us directly so we can talk about it calmly.' },
  ], [
    { id: 'eab4', t: 'We regret the tone of this message.' },
    { id: 'eab5', t: 'If something went wrong during a visit, we remain available to discuss it directly and calmly.' },
  ]],
  suspect: [[
    { id: 'esu1', t: 'Thank you for your message.' },
    { id: 'esu2', t: 'Without more details, it is hard for us to understand what happened.' },
    { id: 'esu3', t: 'If your visit did not go well, please contact us directly so we can talk about it.' },
  ]],
};

// Réponses courtes pour l'espagnol, l'italien et l'allemand (mode démo uniquement).
const OTHER = {
  es: {
    pos: { vous: '¡Muchas gracias por su reseña! Nos alegra mucho que haya disfrutado de su visita. ¡Esperamos recibirle de nuevo muy pronto!',
      tu: '¡Muchas gracias por tu reseña! Nos alegra mucho que hayas disfrutado de tu visita. ¡Esperamos verte de nuevo muy pronto!' },
    neg: { vous: 'Gracias por su mensaje, y sentimos mucho que su visita no haya estado a la altura. No dude en contactarnos directamente para hablarlo.',
      tu: 'Gracias por tu mensaje, y sentimos mucho que tu visita no haya estado a la altura. No dudes en contactarnos directamente para hablarlo.' },
    team: 'El equipo de %R%',
  },
  it: {
    pos: { vous: "Grazie mille per la sua recensione! Siamo felicissimi che l'esperienza le sia piaciuta. Speriamo di rivederla presto!",
      tu: "Grazie mille per la tua recensione! Siamo felicissimi che l'esperienza ti sia piaciuta. Speriamo di rivederti presto!" },
    neg: { vous: "Grazie per il suo messaggio, e ci dispiace molto che l'esperienza non sia stata all'altezza. Non esiti a contattarci direttamente per parlarne.",
      tu: "Grazie per il tuo messaggio, e ci dispiace molto che l'esperienza non sia stata all'altezza. Non esitare a contattarci direttamente per parlarne." },
    team: 'Lo staff di %R%',
  },
  de: {
    pos: { vous: 'Vielen Dank für Ihre Bewertung! Es freut uns sehr, dass es Ihnen bei uns gefallen hat. Wir hoffen, Sie bald wieder begrüßen zu dürfen!',
      tu: 'Vielen Dank für deine Bewertung! Es freut uns sehr, dass es dir bei uns gefallen hat. Wir hoffen, dich bald wieder bei uns zu sehen!' },
    neg: { vous: 'Vielen Dank für Ihr Feedback, und es tut uns sehr leid, dass Ihr Besuch nicht Ihren Erwartungen entsprochen hat. Kontaktieren Sie uns gerne direkt, damit wir darüber sprechen können.',
      tu: 'Vielen Dank für dein Feedback, und es tut uns sehr leid, dass dein Besuch nicht deinen Erwartungen entsprochen hat. Melde dich gerne direkt bei uns, damit wir darüber sprechen können.' },
    team: 'Das Team von %R%',
  },
};

const ASPECT_FR = {
  attente: "l'attente", temperature: 'la température des plats', accueil: "l'accueil", prix: 'les prix',
  portions: 'les portions', cuisson: 'la cuisson', gout: 'les plats', bruit: 'le bruit', proprete: 'la propreté',
  hygiene: "l'hygiène", sante: 'ce qui est arrivé', erreur: 'la commande', reservation: 'la réservation', livraison: 'la livraison',
};
const ASPECT_EN = {
  attente: 'the wait', temperature: 'the temperature of the food', accueil: 'the welcome', prix: 'the prices',
  portions: 'the portions', cuisson: 'the cooking', gout: 'the food', bruit: 'the noise level', proprete: 'cleanliness',
  erreur: 'your order', reservation: 'your booking', livraison: 'the delivery',
};

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
function toneKey(ton) {
  const t = fold(ton || '');
  if (t.startsWith('sob')) return 's';
  if (t.startsWith('fam')) return 'f';
  return 'c';
}

function render(template, ctx) {
  let out = template.replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_, a, b) => (ctx.tu ? b : a));
  const rep = {
    '%NAME%': ctx.name || '', '%DISH_CAP%': capitalize(ctx.dish || ''), '%DISH%': ctx.dish || '',
    '%AIT%': ctx.dishPlural ? 'aient' : 'ait', '%A%': ctx.dishPlural ? 'ont' : 'a', '%STAFF%': ctx.staff || '',
    '%OCC_DE%': ctx.occDe || '', '%OCC%': ctx.occ || '', '%DUR_CAP%': capitalize(ctx.dur || ''), '%DUR%': ctx.dur || '',
    '%QUOTE%': ctx.quote || '', '%STARS%': String(ctx.stars || ''), '%ASPECT%': ctx.aspect || '',
    '%CONTACT%': ctx.contact || '', '%PLACE%': ctx.place || 'le cadre', '%TEMP_NOUN%': ctx.tempNoun || '',
  };
  for (const [k, v] of Object.entries(rep)) out = out.split(k).join(v);
  return out.replace(/\s+/g, ' ').trim();
}

function frenchTypography(text) {
  // espace insécable avant ! ? : ; et à l'intérieur des guillemets français
  return text
    .replace(/\s+([!?;:])/g, ' $1')
    .replace(/«\s*/g, '« ')
    .replace(/\s*»/g, ' »');
}

function stripExclamations(text) {
  // ton sobre : pas de point d'exclamation (sauf dans une citation)
  return text.replace(/(«[^»]*»)|\s*!+/g, (m, quote) => (quote ? quote : '.')).replace(/\.\.+/g, '.');
}

export function contactInfo(raw) {
  const c = String(raw || '').trim();
  if (!c) return { type: null, value: '' };
  if (/@/.test(c)) return { type: 'mail', value: c };
  const digits = c.replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length >= 8) return { type: 'tel', value: c };
  return { type: null, value: '' };
}

/** Article + nom de restaurant : « Le Bistrot » → « du Bistrot » */
export function deRestaurant(nom) {
  const n = String(nom || '').trim();
  if (!n) return '';
  if (/^le\s/i.test(n)) return 'du ' + n.slice(3);
  if (/^les\s/i.test(n)) return 'des ' + n.slice(4);
  if (/^la\s/i.test(n)) return 'de la ' + n.slice(3);
  if (/^l['’]/i.test(n)) return "de l'" + n.slice(2);
  if (/^[aeiouyhéèêàâîôû]/i.test(n)) return "d'" + n;
  return 'de ' + n;
}

export function defaultSignature(profile) {
  const nom = (profile && profile.nom) || '';
  return nom ? "L'équipe " + deRestaurant(nom) : "L'équipe";
}

export function translateSignature(sig, lang, nom) {
  const s = String(sig || '').trim();
  if (lang === 'fr' || !s) return s;
  const f = fold(s);
  const looksTeam = /equipe|team|l'equipe/.test(f);
  if (!looksTeam) return s;
  const first = s.match(/^([A-ZÀ-Ý][\wÀ-ÿ-]+)\s+et\s+(toute\s+)?l['’]équipe/i);
  if (lang === 'en') {
    if (first) return `${first[1]} and the whole team`;
    return nom ? `The team at ${nom}` : 'The team';
  }
  const tpl = OTHER[lang] && OTHER[lang].team;
  return tpl ? tpl.replace('%R%', nom || '') : s;
}

function possessive(dish, lang) {
  if (!dish) return '';
  const head = dish.text.replace(/\s+/g, ' ').trim();
  if (lang === 'en') return head.toLowerCase().replace(/^(the|our|my|a|an)\s+/, '');
  let clean = head.replace(/^(le|la|les|l'|un|une|des|du|de la|mon|ma|mes|notre|nos|son|sa|ses|votre|vos|ce|cet|cette|ces)\s+/i, '');
  clean = clean.charAt(0).toLowerCase() + clean.slice(1);
  return (dish.plural ? 'nos ' : 'notre ') + clean;
}

function firstWord(t) {
  return fold(String(t || '').replace(/\{([^{}|]*)\|[^{}]*\}/g, '$1')).replace(/^[^a-z%]+/, '').split(/[\s',]/)[0];
}

// Évite les répétitions dans une même réponse : pas plus de 2 « merci », pas deux phrases qui commencent pareil.
const STEMS = ['acceptable', 'nous voulons', 'desole', 'navre', 'excuses', 'plaisir', 'transm', 'remarque', 'hesit',
  'contact', 'note', 'ravis', 'heureux', 'compliment', 'joli', 'sorry', 'glad', 'delighted', 'pass your'];

function isRepetitive(t, sentences) {
  const merci = sentences.reduce((n, s) => n + ((String(s).match(/merci/gi) || []).length), 0);
  if (/merci/i.test(t) && merci >= 2) return true;
  const ft = fold(t);
  const fs = sentences.map((x) => fold(x)).join(' ');
  if (STEMS.some((st) => ft.indexOf(st) !== -1 && fs.indexOf(st) !== -1)) return true;
  const fw = firstWord(t);
  if (!fw || fw.startsWith('%')) return false;
  const same = sentences.filter((s) => firstWord(s) === fw).length;
  const limit = fw === 'nous' ? 2 : 1;
  return same >= limit && ['merci', 'ravis', 'on', 'nous', 'et', 'au', 'a', 'thank', 'thanks', 'we'].includes(fw);
}

function makePicker(rng, avoid, getSentences) {
  return function pick(list, filter) {
    const usable = list.filter((x) => (!filter || filter(x)));
    if (!usable.length) return null;
    const current = getSentences ? getSentences() : [];
    const notRep = usable.filter((x) => !isRepetitive(x.t, current));
    const base = notRep.length ? notRep : usable;
    const fresh = base.filter((x) => !avoid.has(x.id));
    let pool = fresh.length ? fresh : base;
    const prio = pool.filter((x) => x.prio);
    if (prio.length) pool = prio;
    return pool[Math.floor(rng() * pool.length)];
  };
}

// Au plus 2 points d'exclamation par réponse (la première et la dernière phrase concernées).
function limitBangs(list, max) {
  const idx = list.map((s, i) => (/!\s*$/.test(s) ? i : -1)).filter((i) => i >= 0);
  if (idx.length <= max) return list;
  const keep = new Set([idx[0], idx[idx.length - 1]]);
  if (max >= 3) keep.add(idx[1]);
  return list.map((s, i) => (idx.includes(i) && !keep.has(i) ? s.replace(/\s*!+\s*$/, '.') : s));
}

const ISSUE_PRIORITY = ['sante', 'hygiene', 'attente', 'temperature', 'accueil', 'cuisson', 'gout', 'erreur', 'livraison',
  'proprete', 'portions', 'bruit', 'reservation', 'prix'];

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------
/**
 * @param {object} opts
 * @param {{text:string, stars?:number|null, author?:string}} opts.review
 * @param {object} opts.profile  fiche restaurant
 * @param {'normal'|'shorter'|'warmer'} [opts.variant]
 * @param {string[]} [opts.avoidIds]  identifiants de formules à ne pas réutiliser (historique récent, version précédente)
 * @param {number} [opts.attempt]  numéro de tentative (Régénérer)
 * @param {object} [opts.analysis]  analyse déjà calculée
 */
export function generateDemoReply(opts) {
  const review = opts.review || { text: '' };
  const profile = opts.profile || {};
  const variant = opts.variant || 'normal';
  const a = opts.analysis || analyzeReview(review, profile);
  const tu = !!profile.tutoiement;
  let tone = toneKey(profile.ton);
  if (variant === 'warmer') tone = 'c';
  const seed = hashString([review.text, review.stars, profile.id || profile.nom, opts.attempt || 0, variant].join('|'));
  const rng = seededRandom(seed);
  const avoid = new Set(opts.avoidIds || []);
  const sentences = [];
  const pick = makePicker(rng, avoid, () => sentences);
  const used = [];
  const contact = contactInfo(profile.contact);
  const ctxBase = { contactType: contact.type };
  const nom = profile.nom || '';
  const signature = translateSignature(profile.signature || defaultSignature(profile), a.lang, nom);

  // ---- autres langues (es, it, de) : réponse courte et sûre
  if (OTHER[a.lang]) {
    const o = OTHER[a.lang];
    const pos = (a.stars || 3) >= 4 && a.category !== 'abusif' && a.category !== 'suspect';
    const text = (pos ? o.pos : o.neg)[tu ? 'tu' : 'vous'];
    return finish({ text: text + '\n' + signature, ids: ['other-' + a.lang + (pos ? '-pos' : '-neg')], a, lang: a.lang });
  }

  const B = a.lang === 'en' ? EN : FR;
  const lang = a.lang === 'en' ? 'en' : 'fr';
  const toneOk = (x) => !x.tones || x.tones.indexOf(tone) !== -1;
  const whenOk = (x) => !x.when || x.when(a, review, ctxBase);
  const ok = (x) => toneOk(x) && whenOk(x);

  // contexte des placeholders
  const avoidedPos = new Set((a.avoidAspects || []).filter((x) => x.startsWith('pos:')).map((x) => x.slice(4)));
  const avoidedNeg = new Set((a.avoidAspects || []).filter((x) => !x.startsWith('pos:')));
  const avoidWords = String(profile.aEviter || '').split(/[,;\n]+/).map((x) => fold(x.trim())).filter((x) => x.length >= 3)
    .flatMap((x) => x.split(/\s+/).filter((w) => w.length >= 4));
  const mentionsAvoided = (s) => avoidWords.some((w) => fold(s).indexOf(w) !== -1);

  const posDish = a.dishes.find((d) => d.polarity !== 'neg' && !mentionsAvoided(d.text))
    || null;
  const negDish = a.dishes.find((d) => d.polarity === 'neg') || a.dishes.find((d) => d.polarity === 'neutre') || null;
  const staffPos = a.staff.find((s) => s.polarity !== 'neg');
  const ctx = {
    tu, name: a.author, stars: a.starsGiven || a.stars, contact: contact.value,
    occ: a.occasion && a.occasion.label, occDe: a.occasion && a.occasion.de,
    dur: a.durations[0] || '', quote: a.quote,
    place: a.terrace ? 'la terrasse' : 'le cadre',
  };
  const R = (tpl, extra) => {
    used.push(tpl.id);
    return render(tpl.t, { ...ctx, ...(extra || {}) });
  };
  const dishCtx = (d) => (d ? { dish: possessive(d, lang), dishPlural: d.plural } : {});

  let greeting = '';
  const cat = a.category;

  // ---------------------------------------------------------------- abusif / suspect / vide
  if (cat === 'abusif' || cat === 'suspect' || (a.isEmpty && (a.stars || 0) <= 3)) {
    let set;
    if (cat === 'abusif') {
      const sets = B.abusive;
      set = sets[Math.floor(rng() * sets.length)];
      if (set.some((x) => avoid.has(x.id)) && sets.length > 1) set = sets.find((s) => s !== set) || set;
      const threat = a.flags.threats > 0;
      for (const x of set) {
        if (x.threat && !threat) continue;
        if (x.noThreat && threat) continue;
        sentences.push(R(x));
      }
    } else if (a.isEmpty && (a.stars || 0) <= 1) {
      const sets = lang === 'en' ? EN.suspect : FR.emptyNeg;
      let es = sets[Math.floor(rng() * sets.length)];
      if (es.some((x) => avoid.has(x.id)) && sets.length > 1) es = sets.find((x) => x !== es) || es;
      for (const x of es) sentences.push(R(x));
    } else if (a.isEmpty) {
      // 2 ou 3 étoiles sans texte
      if (lang === 'en') sentences.push('Thank you for your rating.', 'If something fell short, we would be glad to hear more so we can improve.');
      else {
        sentences.push(render((a.stars === 3 ? 'Merci pour {votre|ta} note.' : 'Merci pour {votre|ta} note, même si elle nous montre que tout n\'a pas été parfait.'), ctx));
        sentences.push(render('Si quelque chose {vous a|t\'a} manqué, {dites-le-nous|dis-le-nous} : nous voulons comprendre pour faire mieux.', ctx));
        used.push('empty' + a.stars);
      }
    } else {
      const sets = B.suspect;
      set = sets[Math.floor(rng() * sets.length)];
      if (set.some((x) => avoid.has(x.id)) && sets.length > 1) set = sets.find((s) => s !== set) || set;
      for (const x of set) sentences.push(R(x));
    }
    if (variant === 'shorter' && sentences.length > 2) sentences.splice(1, sentences.length - 2);
    greeting = lang === 'en' ? 'Hello,' : 'Bonjour,';
    return finish({ text: assemble(greeting, sentences, signature, lang), ids: used, a, lang, tone });
  }

  // ---------------------------------------------------------------- 4-5 étoiles sans texte
  if (a.isEmpty) {
    if (lang === 'en') sentences.push(`Thank you so much for the ${a.stars} stars!`);
    else sentences.push(render(tone === 's' ? 'Merci beaucoup pour ces %STARS% étoiles.' : 'Merci beaucoup pour ces %STARS% étoiles !', ctx));
    const cl = pick(B.close, ok);
    if (cl) sentences.push(R(cl));
    return finish({ text: assemble('', sentences, signature, lang, tone), ids: used.concat('empty-pos'), a, lang, tone });
  }

  // ---------------------------------------------------------------- détails positifs disponibles
  const details = [];
  if (posDish && !(a.category === 'negatif')) details.push({ kind: 'dish', d: posDish });
  if (staffPos && (a.stars || 0) >= 4) details.push({ kind: 'staff' });
  if (a.occasion && (a.stars || 0) >= 4) details.push({ kind: 'occasion' });
  if (a.regular && (a.stars || 0) >= 4) details.push({ kind: 'regular' });
  if (a.isShort && a.quote && (a.stars || 0) >= 4 && a.quotePolarity !== 'neg' && lang === 'fr' && !mentionsAvoided(a.quote)) details.push({ kind: 'quote' });
  for (const asp of a.praise) {
    if (avoidedPos.has(asp)) continue;
    if (asp === 'prix' && avoidWords.some((w) => /prix|tarif/.test(w))) continue;
    if (asp === 'cuisine' && details.some((x) => x.kind === 'dish')) continue;
    if (asp === 'cadre' && a.terrace && avoidWords.some((w) => w.indexOf('terrasse') !== -1)) continue;
    if (B.aspect[asp]) details.push({ kind: 'aspect', asp });
  }
  // à défaut : le moment du repas (« ce déjeuner », « cette soirée »)
  if (!details.length && a.timeOfDay && (a.stars || 0) >= 4) details.push({ kind: 'moment' });

  const sayDetail = (det) => {
    if (!det) return null;
    if (det.kind === 'dish') { const t = pick(B.dish, ok); return t && R(t, dishCtx(det.d)); }
    if (det.kind === 'staff') { const t = pick(B.staff, ok); return t && R(t, { staff: staffPos.name }); }
    if (det.kind === 'occasion') { const t = pick(B.occasion, ok); return t && R(t); }
    if (det.kind === 'regular') { const t = pick(B.regular, ok); return t && R(t); }
    if (det.kind === 'quote') { const t = pick(FR.quote, ok); return t && R(t); }
    if (det.kind === 'aspect') { const t = pick(B.aspect[det.asp] || [], ok); return t && R(t); }
    if (det.kind === 'moment') {
      used.push('moment');
      if (lang === 'en') return a.timeOfDay === 'midi' ? "We're so glad you enjoyed your lunch!" : "We're so glad you enjoyed your evening!";
      const m = a.timeOfDay === 'midi' ? 'ce déjeuner' : 'cette soirée';
      return render(tone === 's' ? `Nous sommes heureux que ${m} {vous ait|t'ait} plu.` : `Ravis que ${m} {vous ait|t'ait} plu !`, ctx);
    }
    return null;
  };

  // ---------------------------------------------------------------- positif
  if (cat === 'positif' || cat === 'positif_reserve' || cat === 'neutre') {
    const nameGreeting = a.author && lang === 'fr';
    const skeletons = ['A', 'B', 'C'].filter((k) => !avoid.has('sk' + k));
    const sk = (skeletons.length ? skeletons : ['A', 'B', 'C'])[Math.floor(rng() * (skeletons.length || 3))];
    used.push('sk' + sk);
    const d1 = details[0];
    // un second détail d'un autre type, s'il apporte quelque chose
    const d2 = d1 ? (details.find((x, i) => i > 0 && x.kind !== d1.kind && x.kind !== 'aspect')
      || details.find((x, i) => i > 0 && x.kind !== d1.kind)) : null;

    if (sk === 'B' && nameGreeting) {
      sentences.push(tone === 's' ? render(`Merci ${a.author} pour {votre|ton} message.`, ctx) : `Merci ${a.author} !`);
    } else if (sk === 'C' && d1 && d1.kind !== 'quote') {
      if (a.author) greeting = lang === 'en' ? `Hi ${a.author},` : tu ? `Hello ${a.author},` : `Bonjour ${a.author},`;
    } else {
      if (a.author) greeting = lang === 'en' ? `Hi ${a.author},` : tu ? (tone === 'f' ? `Salut ${a.author},` : `Hello ${a.author},`) : `Bonjour ${a.author},`;
      const t = pick(B.thanks, ok);
      if (t) sentences.push(R(t, { stars: a.starsGiven }));
    }
    if (sk === 'C' && d1 && d1.kind !== 'quote') {
      sentences.push(sayDetail(d1));
      const tq = lang === 'fr' ? pick(FR.thanksShort, ok) : null;
      if (tq) sentences.push(R(tq));
    } else if (d1) {
      sentences.push(sayDetail(d1));
    }
    if (d2 && variant !== 'shorter' && sentences.length < 3) sentences.push(sayDetail(d2));
    if (cat === 'positif_reserve' && variant !== 'shorter') {
      const asp = a.complaints.find((c) => !avoidedNeg.has(c));
      if (asp) {
        const bank = (B.reserve[asp] || B.reserve.generic);
        const t = pick(bank, ok);
        if (t) sentences.push(R(t, { aspect: (lang === 'en' ? ASPECT_EN : ASPECT_FR)[asp] || '' }));
      }
    }
    if (variant === 'warmer' && lang === 'fr') {
      const w = pick(FR.warm);
      if (w) sentences.push(R(w));
    }
    if (variant !== 'shorter' || sentences.length < 2) {
      const cl = pick(B.close, ok);
      if (cl) sentences.push(R(cl));
    }
    let list = sentences.filter(Boolean);
    if (variant === 'shorter') list = shorten(list, 2);
    list = capSentences(list, 5);
    return finish({ text: assemble(greeting, list, signature, lang, tone), ids: used, a, lang, tone });
  }

  // ---------------------------------------------------------------- mitigé
  if (cat === 'mitige') {
    if (a.author) greeting = lang === 'en' ? `Hi ${a.author},` : tu ? `Hello ${a.author},` : `Bonjour ${a.author},`;
    const o = pick(B.mixOpen, ok);
    if (o) sentences.push(R(o));
    const posDet = details.find((x) => x.kind === 'dish' || x.kind === 'aspect');
    if (posDet && variant !== 'shorter') sentences.push(sayDetail(posDet));
    const asp = a.complaints.find((c) => !avoidedNeg.has(c));
    const hasAvoided = a.complaints.some((c) => avoidedNeg.has(c)) || a.avoidHits.length;
    if (asp && !(asp === 'prix' && avoidWords.some((w) => /prix|tarif/.test(w)))) {
      const t = pick(B.mixIssue, ok);
      if (t) sentences.push(R(t, { aspect: (lang === 'en' ? ASPECT_EN : ASPECT_FR)[asp] || '' }));
    } else if (hasAvoided || a.complaints.length) {
      const t = pick(lang === 'en' ? B.mixIssue : FR.mixIssueAvoid, ok);
      if (t) sentences.push(R(t, { aspect: 'this' }));
    }
    if (variant === 'warmer' && lang === 'fr') { const w = pick(FR.warmMix); if (w) sentences.push(R(w)); }
    const c = pick(B.mixClose, ok);
    if (c) sentences.push(R(c));
    let list = sentences.filter(Boolean);
    if (variant === 'shorter') list = shorten(list, 2);
    return finish({ text: assemble(greeting, capSentences(list, 5), signature, lang, tone), ids: used, a, lang, tone });
  }

  // ---------------------------------------------------------------- négatif
  if (a.author && !a.flags.aggressive) greeting = lang === 'en' ? `Hello ${a.author},` : tu ? `Hello ${a.author},` : `Bonjour ${a.author},`;
  else greeting = lang === 'en' ? 'Hello,' : 'Bonjour,';
  let apologized = false;
  const complaints = a.complaints.filter((c) => !avoidedNeg.has(c) && !(c === 'prix' && avoidWords.some((w) => /prix|tarif/.test(w))))
    .sort((x, y) => ISSUE_PRIORITY.indexOf(x) - ISSUE_PRIORITY.indexOf(y));
  const serious = complaints.includes('sante') || complaints.includes('hygiene');
  const openOk = (x) => ok(x) && (complaints.includes('sante') ? x.sante : complaints.includes('hygiene') ? x.hygiene : !x.sante && !x.hygiene);
  const main = complaints[0];
  const second = complaints.find((c, i) => i > 0 && !(main === 'attente' && c === 'reservation') && !(main === 'accueil' && c === 'reservation'));

  // quote pour un avis négatif très court (« Bof. »)
  if (a.isShort && a.quote && a.quotePolarity !== 'pos' && !main && lang === 'fr' && !mentionsAvoided(a.quote)) {
    const q = a.quote.replace(/[.!…\s]+$/, '');
    const alt = avoid.has('neg-quote-1') || (rng() < 0.5 && !avoid.has('neg-quote-2'));
    if (!alt) {
      sentences.push(render(tone === 's' ? '« %QUOTE% » : ce n\'est pas l\'effet que nous voulons produire.' : '« %QUOTE% » : ce n\'est pas l\'effet que nous voulons faire !', { ...ctx, quote: q }));
      sentences.push(render('{Dites-nous|Dis-nous} ce qui a manqué, nous voulons comprendre.', ctx));
      used.push('neg-quote-1');
    } else {
      sentences.push(render('« %QUOTE% »… ce n\'est pas ce que nous voulons entendre, mais merci de l\'avoir dit.', { ...ctx, quote: q }));
      sentences.push(render('Qu\'est-ce qui {vous a|t\'a} manqué ? Nous voulons comprendre pour faire mieux.', ctx));
      used.push('neg-quote-2');
    }
    if (variant !== 'shorter') {
      const iv = pick(B.invite, (x) => ok(x) && x.id !== 'iv5' && x.id !== 'iv3');
      if (iv) sentences.push(R(iv));
    }
    return finish({ text: assemble(greeting, capSentences(sentences, 4), signature, lang, tone), ids: used, a, lang, tone });
  }

  const issueSentence = (asp, withAnd) => {
    if (!asp) return null;
    const bank = (B.issue[asp] || B.issue.generic);
    const d = negDish;
    const aWithDish = { ...a, _dish: !!d };
    const t = pick(bank, (x) => toneOk(x) && (!x.when || x.when(aWithDish, review, ctxBase)));
    if (!t) return null;
    if (t.apology) apologized = true;
    const tiede = /tiede/.test(fold(review.text));
    const plural = d ? d.plural : /plats/.test(fold(review.text));
    const tempNoun = plural ? `Des plats servis ${tiede ? 'tièdes' : 'froids'}` : `Un plat servi ${tiede ? 'tiède' : 'froid'}`;
    let s = R(t, { ...dishCtx(d), tempNoun });
    if (withAnd && lang === 'fr') s = 'Et ' + s.charAt(0).toLowerCase() + s.slice(1);
    return s;
  };

  if (variant === 'shorter') {
    const o = pick(B.negOpen, (x) => openOk(x) && (x.apology || serious));
    if (o) { sentences.push(R(o)); apologized = true; }
    const iss = issueSentence(main || 'generic');
    if (iss) sentences.push(iss);
    const iv = pick(B.invite, ok);
    if (iv) sentences.push(R(iv));
    return finish({ text: assemble(greeting, shorten(sentences.filter(Boolean), 3), signature, lang, tone), ids: used, a, lang, tone });
  }

  const o = pick(B.negOpen, openOk) || pick(B.negOpen, ok);
  if (o) { sentences.push(R(o)); if (o.apology) apologized = true; }
  // santé / hygiène : de l'empathie, mais pas d'excuses qui vaudraient aveu
  if (serious) apologized = true;
  sentences.push(issueSentence(main || 'generic'));
  if (second && second !== main) sentences.push(issueSentence(second, true));
  if (variant === 'warmer' && lang === 'fr' && serious) {
    const w = pick(FR.warmSerious, (x) => (complaints.includes('sante') ? true : !x.sante));
    if (w) sentences.push(R(w));
  } else if (variant === 'warmer' && lang === 'fr') {
    const w = pick(FR.warmNeg, (x) => !(apologized && x.apology));
    if (w) { sentences.push(R(w)); if (w.apology) apologized = true; }
  }
  if (!apologized) {
    const ap = lang === 'en' ? null : pick(FR.apology, ok);
    if (ap) sentences.push(R(ap));
    else if (lang === 'en') sentences.push('Please accept our apologies.');
    apologized = true;
  }
  if (sentences.filter(Boolean).length <= 3 && lang === 'fr' && !a.flags.legal && !complaints.includes('sante') && !complaints.includes('hygiene')) {
    const act = pick(FR.action, ok);
    if (act) sentences.push(R(act));
  }
  const iv = pick(B.invite, ok);
  if (iv) sentences.push(R(iv));
  return finish({ text: assemble(greeting, capSentences(sentences.filter(Boolean), 5), signature, lang, tone), ids: used, a, lang, tone });
}

function shorten(list, n) {
  if (list.length <= n) return list;
  // garde la première phrase (remerciement ou excuse), le détail, et la conclusion si possible
  if (n === 2) return [list[0], list[1]];
  return [list[0], list[1], list[list.length - 1]];
}

function capSentences(list, max) {
  if (list.length <= max) return list;
  return list.slice(0, max - 1).concat(list[list.length - 1]);
}

function assemble(greeting, sentences, signature, lang, tone, maxBangs) {
  const body = limitBangs(sentences.filter(Boolean), maxBangs || 2);
  let first = body[0] || '';
  let text;
  if (greeting && first) {
    // « Bonjour Thomas, merci… » : on enchaîne en minuscule (sauf guillemet, sigle ou chiffre)
    const keepCap = /^(«|"|\d|[A-ZÀ-Ý]{2})/.test(first);
    if (!keepCap) first = first.charAt(0).toLowerCase() + first.slice(1);
    text = greeting + ' ' + first + (body.length > 1 ? ' ' + body.slice(1).join(' ') : '');
  } else {
    text = body.join(' ');
  }
  if (tone === 's') text = stripExclamations(text);
  if (lang === 'fr') text = frenchTypography(text);
  return text.trim() + (signature ? '\n' + signature : '');
}

function finish({ text, ids, a, lang, tone }) {
  return {
    text: text.replace(/[ \t]+\n/g, '\n').trim(),
    templateIds: ids.filter(Boolean),
    analysis: a,
    alerts: a.alerts,
    lang: lang || a.lang,
    category: a.category,
    tone,
  };
}

/** Nombre de phrases hors signature (pour les tests). */
export function bodySentenceCount(reply) {
  const body = String(reply || '').split('\n')[0];
  return splitSentences(body).length;
}
