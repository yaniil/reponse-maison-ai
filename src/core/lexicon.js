// Lexiques pour l'analyse des avis (FR + EN). Les termes sont « pliés » (minuscules, sans accents) au chargement.
import { fold } from './text.js';

const F = (arr) => arr.map((t) => fold(t));

// ---------------------------------------------------------------------------
// Plats, produits, boissons (pour reprendre un détail précis de l'avis)
// weight : 3 = très spécifique (tiramisu), 2 = spécifique (burger), 1 = générique (plat, menu)
// ---------------------------------------------------------------------------
const FOOD_FR_RAW = {
  3: [
    'tiramisu', 'tiramisù', 'panna cotta', 'pannacotta', 'carbonara', 'bolognaise', 'risotto', 'lasagnes', 'lasagne',
    'gnocchis', 'gnocchi', 'raviolis', 'ravioli', 'tagliatelles', 'spaghettis', 'spaghetti', 'linguine', 'penne',
    'burrata', 'carpaccio', 'antipasti', 'focaccia', 'calzone', 'arancini', 'vitello tonnato', 'osso buco',
    'cheeseburger', 'onion rings', 'smash burger', 'smash burgers', 'nuggets', 'hot dog', 'bagel',
    'entrecôte', 'entrecote', 'bavette', 'onglet', 'faux-filet', 'côte de bœuf', 'côte de boeuf', 'tartare',
    'magret', 'magret de canard', 'confit de canard', 'souris d\'agneau', 'blanquette', 'blanquette de veau',
    'bœuf bourguignon', 'boeuf bourguignon', 'bourguignon', 'pot-au-feu', 'cassoulet', 'choucroute', 'tête de veau',
    'andouillette', 'escargots', 'foie gras', 'terrine', 'rillettes', 'œuf mayo', 'oeuf mayo', 'œufs mayo', 'oeufs mayo',
    'raclette', 'fondue', 'tartiflette', 'quiche', 'croque-monsieur', 'croque madame', 'croque-madame',
    'saumon', 'cabillaud', 'dorade', 'daurade', 'thon', 'sole', 'truite', 'merlu', 'turbot', 'loup',
    'moules', 'moules-frites', 'moules frites', 'huîtres', 'huitres', 'fruits de mer', 'crevettes', 'gambas', 'calamars',
    'poulpe', 'saint-jacques', 'noix de saint-jacques', 'langoustines', 'homard', 'bouillabaisse', 'paella', 'aïoli',
    'gaspacho', 'velouté', 'veloute', 'gratin dauphinois', 'purée', 'puree', 'aligot', 'ratatouille',
    'couscous', 'tajine', 'tagine', 'pastilla', 'kebab', 'falafel', 'falafels', 'houmous', 'mezze', 'shawarma', 'chawarma',
    'sushi', 'sushis', 'maki', 'makis', 'sashimi', 'sashimis', 'ramen', 'ramens', 'gyoza', 'gyozas', 'bo bun', 'bobun',
    'pho', 'nems', 'pad thaï', 'pad thai', 'curry', 'naan', 'cheese naan', 'butter chicken', 'tikka', 'biryani',
    'dim sum', 'dumplings', 'bibimbap', 'poke', 'poké', 'poke bowl', 'tacos', 'burrito', 'nachos', 'fajitas', 'ceviche',
    'crêpe', 'crêpes', 'crepe', 'crepes', 'galette', 'galettes', 'gaufre', 'gaufres',
    'tarte tatin', 'tarte au citron', 'fondant au chocolat', 'mousse au chocolat', 'crème brûlée', 'creme brulee',
    'île flottante', 'ile flottante', 'profiteroles', 'café gourmand', 'cheesecake', 'brownie', 'brownies', 'cookie',
    'cookies', 'baba au rhum', 'paris-brest', 'éclair', 'millefeuille', 'mille-feuille', 'riz au lait', 'clafoutis',
    'pain perdu', 'churros', 'macarons', 'cannelés', 'fondant', 'moelleux au chocolat', 'tarte',
    'croissant', 'croissants', 'pain au chocolat', 'pains au chocolat', 'brunch',
    'spritz', 'mojito', 'mojitos', 'negroni', 'champagne', 'limoncello', 'cappuccino', 'chocolat chaud', 'citronnade',
    'limonade maison', 'plateau de fromages', 'planche de charcuterie', 'planche mixte', 'charcuterie', 'fromages',
  ],
  2: [
    'pizza', 'pizzas', 'pâtes', 'pates', 'burger', 'burgers', 'frites', 'steak', 'pavé', 'filet', 'canard', 'poulet',
    'volaille', 'agneau', 'veau', 'porc', 'cochon', 'bœuf', 'boeuf', 'poisson', 'fromage', 'salade', 'salades', 'soupe',
    'légumes', 'legumes', 'gratin', 'wrap', 'planche', 'dessert', 'desserts', 'glace', 'glaces', 'sorbet', 'sorbets',
    'cocktail', 'cocktails', 'vin', 'vins', 'bière', 'bières', 'biere', 'bieres', 'café', 'expresso', 'thé',
    'pain', 'viennoiseries', 'petit-déjeuner', 'petit déjeuner', 'apéritif', 'apéro', 'digestif',
    'plat du jour', 'plats du jour', 'menu du jour', 'menu enfant', 'menu enfants', 'formule', 'formule midi', 'entrée', 'entrées',
  ],
  1: ['plat', 'plats', 'menu', 'assiette', 'assiettes', 'repas', 'cuisine', 'boissons', 'boisson', 'carte'],
};

const FOOD_EN_RAW = {
  3: [
    'tiramisu', 'duck confit', 'confit', 'foie gras', 'escargots', 'snails', 'onion soup', 'french onion soup',
    'ratatouille', 'crème brûlée', 'creme brulee', 'crepes', 'crêpes', 'galette', 'croissant', 'croissants',
    'beef bourguignon', 'boeuf bourguignon', 'steak frites', 'steak tartare', 'tartare', 'oysters', 'mussels',
    'seafood platter', 'cheese platter', 'charcuterie', 'risotto', 'carbonara', 'lasagna', 'burrata', 'gnocchi',
    'ramen', 'sushi', 'curry', 'tacos', 'macarons', 'cheesecake', 'brownie', 'espresso martini', 'negroni',
    'mojito', 'spritz', 'champagne', 'cappuccino', 'brunch',
  ],
  2: [
    'pizza', 'pasta', 'burger', 'burgers', 'fries', 'steak', 'duck', 'chicken', 'lamb', 'beef', 'fish', 'salmon',
    'cheese', 'salad', 'soup', 'dessert', 'desserts', 'wine', 'wines', 'cocktail', 'cocktails', 'beer', 'coffee',
    'bread', 'breakfast', 'ice cream',
  ],
  1: ['food', 'meal', 'dish', 'dishes', 'menu'],
};

function buildFood(raw) {
  const out = [];
  for (const w of [3, 2, 1]) for (const t of raw[w]) out.push({ term: fold(t), weight: w });
  // les termes les plus longs d'abord (pour « tarte tatin » avant « tarte »)
  out.sort((a, b) => b.term.length - a.term.length);
  return out;
}

export const FOOD_FR = buildFood(FOOD_FR_RAW);
export const FOOD_EN = buildFood(FOOD_EN_RAW);

// Mots qui prolongent un plat : « pâtes À LA TRUFFE », « tiramisu MAISON », « pizza 4 FROMAGES »
export const QUALIFIER_WORDS = F([
  'maison', 'du jour', 'fermier', 'fermière', 'basque', 'napolitaine', 'margherita', 'végétarien', 'végétarienne',
  'vegan', 'végan', 'signature', 'truffé', 'truffée', 'truffes', 'flambé', 'flambée', 'tatin', 'brûlée', 'bio',
  'italienne', 'italien', 'quatre fromages', '4 fromages', 'reine', 'regina', 'calzone', 'diavola', 'marinara',
]);
export const INGREDIENTS = F([
  'truffe', 'chocolat', 'citron', 'caramel', 'caramel beurre salé', 'fruits rouges', 'framboise', 'framboises', 'fraise',
  'fraises', 'pistache', 'noisette', 'vanille', 'cèpes', 'champignons', 'morilles', 'chèvre', 'roquefort', 'bleu',
  'poivre', 'moutarde', 'crème', 'beurre', 'ail', 'basilic', 'pesto', 'tomate', 'tomates', 'parmesan', 'saumon',
  'canard', 'poulet', 'bœuf', 'boeuf', 'veau', 'porc', 'agneau', 'crevettes', 'légumes', 'épinards', 'ricotta',
  'gorgonzola', 'nduja', 'lardons', 'oignons', 'frites', 'fromage', 'fromages', 'jambon', 'chorizo', 'mozzarella',
  'burrata', 'thon', 'olives', 'aubergines', 'courgettes', 'poireaux', 'pommes', 'poires', 'mangue', 'coco',
  'speculoos', 'nutella', 'miel', 'gingembre', 'curry', 'sauce', 'sauce au poivre', 'béarnaise', 'bearnaise',
]);

// Pluriels trompeurs (singuliers terminés par s/x)
export const SINGULAR_S = new Set(F(['jus', 'couscous', 'riz', 'foie gras', 'ananas', 'bo bun', 'bobun', 'menu enfants', 'paris-brest']));
export const PLURAL_FORCED = new Set(F(['fruits de mer', 'moules-frites', 'moules frites', 'nems', 'tacos', 'mezze', 'antipasti', 'dim sum', 'nachos', 'fajitas', 'churros', 'gnocchi', 'spaghetti', 'raviolis']));

// ---------------------------------------------------------------------------
// Aspects positifs / négatifs (FR)
// ---------------------------------------------------------------------------
export const POS_ASPECTS_FR = {
  accueil: F(['accueil', 'accueillant', 'accueillante', 'accueillants', 'accueillantes', 'souriant', 'souriante', 'souriants',
    'souriantes', 'sourire', 'aimable', 'aimables', 'adorable', 'adorables', 'gentil', 'gentille', 'gentils', 'gentilles',
    'aux petits soins', 'attentionné', 'attentionnée', 'attentionnés', 'attentionnées', 'bienveillant', 'bienveillante',
    'chaleureux', 'chaleureuse', 'chaleureuses', 'convivial', 'conviviale', 'patron sympa', 'équipe sympa', 'personnel sympa',
    'bien accueilli', 'bien accueillis', 'bien accueillie', 'bien accueillies', 'bien reçu', 'bien reçus', 'bien reçue',
    'accueil chaleureux', 'accueil adorable', 'accueil au top', 'super accueil', 'excellent accueil', 'très bon accueil',
    'bon accueil', 'accueil parfait', 'accueil impeccable']),
  service: F(['service impeccable', 'service rapide', 'service efficace', 'service parfait', 'service au top', 'service top',
    'bon service', 'super service', 'excellent service', 'service irréprochable', 'service attentif', 'professionnel',
    'professionnelle', 'professionnels', 'serveur', 'serveuse', 'serveurs', 'serveuses', 'équipe', 'personnel']),
  cuisine: F(['délicieux', 'délicieuse', 'délicieuses', 'excellent', 'excellente', 'excellents', 'excellentes', 'succulent',
    'succulente', 'succulents', 'savoureux', 'savoureuse', 'savoureuses', 'un régal', 'régalé', 'régalés', 'régalée',
    'régalées', 'divin', 'divine', 'divins', 'divines', 'bien cuisiné', 'fait maison', 'faits maison', 'produits frais',
    'frais', 'fraîche', 'fraîcheur', 'goûteux', 'parfaitement assaisonné', 'cuisine', 'raffiné', 'raffinée']),
  cadre: F(['cadre', 'déco', 'décoration', 'terrasse', 'vue', 'ambiance', 'atmosphère', 'cosy', 'calme', 'lumineux',
    'joli', 'jolie', 'charmant', 'charmante', 'cadre agréable', 'endroit', 'lieu', 'musique', 'bien décoré']),
  prix: F(['rapport qualité-prix', 'rapport qualité prix', 'qualité-prix', 'qualité prix', 'prix raisonnable',
    'prix raisonnables', 'prix abordable', 'prix abordables', 'pas cher', 'prix doux', 'prix corrects', 'prix correct',
    'tarifs raisonnables', 'bon rapport']),
  portions: F(['copieux', 'copieuse', 'copieuses', 'généreux', 'généreuse', 'généreuses', 'bien servi', 'bien servis',
    'énorme', 'énormes', 'gargantuesque',
    'bien servie', 'portions généreuses', 'assiettes généreuses', 'assiette généreuse']),
  rapidite: F(['rapide', 'rapides', 'rapidement', 'sans attente', 'pas d\'attente', 'efficace', 'efficaces', 'vite servis',
    'servis rapidement']),
  enfants: F(['enfants', 'enfant', 'menu enfant', 'chaise haute', 'bébé', 'poussette', 'les petits', 'nos petits']),
  regime: F(['végétarien', 'végétarienne', 'végétariens', 'vegan', 'végan', 'vegane', 'sans gluten', 'allergie', 'allergies',
    'intolérance', 'halal']),
};

export const NEG_ASPECTS_FR = {
  attente: F(['attente', 'attendu', 'attendre', 'attendue', 'attendus', 'lent', 'lente', 'lents', 'lentes', 'lenteur',
    'interminable', 'interminables', 'trop long', 'très long', 'super long', 'long à', 'longue attente', 'pas servis',
    'jamais servis', 'oubliés', 'débordé', 'débordée', 'débordés', 'pas assez de personnel', 'manque de personnel']),
  temperature: F(['tiède', 'tièdes', 'réchauffé', 'réchauffée', 'réchauffés', 'pas chaud', 'pas chaude', 'pas chauds',
    'servi froid', 'servie froide', 'servis froids', 'arrivé froid', 'arrivée froide', 'plat froid', 'plats froids',
    'complètement froid', 'complètement froide']),
  accueil: F(['désagréable', 'désagréables', 'impoli', 'impolie', 'impolis', 'malpoli', 'malpolie', 'malpolis',
    'irrespectueux', 'irrespectueuse', 'méprisant', 'méprisante', 'hautain', 'hautaine', 'arrogant', 'arrogante',
    'agressif', 'agressive', 'accueil froid', 'accueil glacial', 'glacial', 'mal accueilli', 'mal accueillis',
    'mal accueillie', 'mal reçu', 'mal reçus', 'pas un bonjour', 'pas de bonjour', 'sans un bonjour', 'ignoré', 'ignorés',
    'dérangeait', 'dérangions', 'déranger', 'pas aimable', 'peu aimable', 'désobligeant', 'insolent', 'insolente',
    'condescendant', 'condescendante', 'rit au nez', 'ri au nez', 'pas souriant', 'aucun sourire',
    'mauvais accueil', 'accueil déplorable', 'accueil désastreux', 'aimable comme une porte de prison']),
  prix: F(['cher', 'chère', 'chers', 'chères', 'trop cher', 'hors de prix', 'exorbitant', 'exorbitants', 'prohibitif',
    'pour le prix', 'prix élevé', 'prix élevés', 'prix exagéré', 'prix exagérés', 'tarifs élevés',
    'addition salée', 'l\'addition', 'prix excessif', 'prix excessifs', 'abusé', 'abusif', 'cher payé', 'du vol',
    'mauvais rapport qualité', 'rapport qualité-prix décevant', 'pas donné']),
  portions: F(['petite portion', 'petites portions', 'portions ridicules', 'portion ridicule', 'pas copieux', 'faim',
    'sur notre faim', 'sur ma faim', 'chiche', 'maigre', 'minuscule', 'minuscules', 'portions minuscules', 'peu copieux']),
  cuisson: F(['trop cuit', 'trop cuite', 'trop cuits', 'trop cuites', 'pas assez cuit', 'pas assez cuite', 'pas cuit',
    'pas cuite', 'brûlé', 'brûlée', 'brûlés', 'caoutchouteux', 'caoutchouteuse', 'cuisson ratée',
    'mal cuit', 'mal cuite', 'sèche', 'sec comme', 'trop saignant', 'pas à la cuisson demandée']),
  gout: F(['fade', 'fades', 'sans goût', 'insipide', 'insipides', 'trop salé', 'trop salée', 'trop salés', 'trop gras',
    'trop grasse', 'immangeable', 'immangeables', 'pas bon', 'pas bonne', 'pas bons', 'industriel',
    'industrielle', 'surgelé', 'surgelés', 'surgelée', 'aucun goût', 'quelconque', 'sans saveur']),
  bruit: F(['bruyant', 'bruyante', 'bruyants', 'bruit', 'musique trop forte', 'musique forte', 'musique un peu forte',
    'musique très forte', 'son trop fort', 'on ne s\'entend pas',
    'assourdissant', 'brouhaha', 'trop fort', 'vacarme']),
  proprete: F(['sale', 'sales', 'saleté', 'propreté', 'crasseux', 'crasseuse', 'pas propre', 'pas propres', 'collant',
    'collante', 'collantes', 'tache', 'taches', 'taché', 'tachée', 'toilettes sales', 'wc sales', 'mauvaise odeur', 'odeur désagréable']),
  hygiene: F(['cheveu', 'cheveux dans', 'un cheveu', 'insecte', 'insectes', 'cafard', 'cafards', 'blatte', 'blattes',
    'rat', 'rats', 'souris', 'mouche dans', 'ver dans', 'moisi', 'moisie', 'périmé', 'périmée', 'avarié']),
  sante: F(['malade', 'malades', 'intoxication', 'intoxiqué', 'intoxiquée', 'intoxiqués', 'gastro', 'vomi', 'vomir',
    'vomissements', 'diarrhée', 'mal au ventre', 'aux urgences', 'urgences', 'réaction allergique', 'empoisonné',
    'empoisonnement']),
  erreur: F(['erreur', 'erreurs', 'oublié', 'oubliée', 'oubliés', 'oubliées', 'oubli', 'pas ce que j\'avais commandé',
    'mauvaise commande', 'il manquait', 'manquait', 'manquant', 'jamais arrivé', 'jamais arrivée', 'pas reçu']),
  reservation: F(['réservation', 'réservé', 'réservée', 'pas de table', 'table pas prête', 'annulé', 'annulée',
    'pas noté', 'pas notée', 'refusé', 'refusés', 'refusées', 'sans réservation', 'pas réservé']),
  livraison: F(['livraison', 'livré', 'livrée', 'livrés', 'livreur', 'uber eats', 'ubereats', 'deliveroo', 'just eat',
    'en retard', 'retard', 'renversé', 'renversée', 'à emporter', 'click and collect']),
};

// Aspects négatifs (EN)
export const NEG_ASPECTS_EN = {
  attente: F(['wait', 'waited', 'waiting', 'slow', 'took forever', 'forever', 'long wait', 'took ages']),
  temperature: F(['cold', 'lukewarm', 'not hot', 'reheated']),
  accueil: F(['rude', 'unfriendly', 'arrogant', 'ignored', 'barely spoke', 'condescending', 'impolite', 'unwelcoming', 'dismissive']),
  prix: F(['overpriced', 'expensive', 'pricey', 'rip off', 'rip-off', 'not worth']),
  portions: F(['small portions', 'tiny portions', 'portion was small', 'still hungry']),
  cuisson: F(['overcooked', 'undercooked', 'burnt', 'raw', 'dry', 'chewy']),
  gout: F(['bland', 'tasteless', 'too salty', 'greasy', 'inedible', 'disgusting', 'bad food', 'frozen']),
  bruit: F(['noisy', 'loud', 'too loud']),
  proprete: F(['dirty', 'filthy', 'sticky', 'unclean']),
  hygiene: F(['hair in', 'a hair', 'cockroach', 'cockroaches', 'rat', 'mouse', 'insect', 'bug in', 'fly in', 'mold', 'mouldy', 'moldy']),
  sante: F(['food poisoning', 'sick', 'vomit', 'vomiting', 'ill after', 'hospital', 'allergic reaction']),
  erreur: F(['wrong order', 'forgot', 'forgotten', 'mistake', 'missing']),
  reservation: F(['reservation', 'booking', 'booked']),
  livraison: F(['delivery', 'delivered', 'uber eats', 'deliveroo', 'takeaway', 'take away', 'late']),
};

export const POS_ASPECTS_EN = {
  accueil: F(['friendly', 'welcoming', 'warm welcome', 'kind', 'lovely staff', 'smiling', 'attentive', 'hospitality']),
  service: F(['great service', 'excellent service', 'service was', 'staff', 'waiter', 'waitress', 'server', 'professional']),
  cuisine: F(['delicious', 'amazing', 'excellent', 'fantastic', 'perfectly cooked', 'tasty', 'incredible', 'superb', 'best meal', 'fresh']),
  cadre: F(['atmosphere', 'ambiance', 'ambience', 'terrace', 'view', 'cozy', 'cosy', 'charming', 'decor', 'lovely place']),
  prix: F(['good value', 'great value', 'reasonable prices', 'reasonably priced', 'affordable']),
  portions: F(['generous', 'huge portions', 'big portions', 'generous portions']),
  rapidite: F(['quick', 'fast service', 'quickly', 'no wait']),
  enfants: F(['kids', 'children', 'family friendly', 'family-friendly']),
  regime: F(['vegetarian', 'vegan', 'gluten free', 'gluten-free', 'allergy']),
};

// ---------------------------------------------------------------------------
// Sentiment général
// ---------------------------------------------------------------------------
export const POS_WORDS_FR = F(['top', 'parfait', 'parfaite', 'parfaits', 'parfaites', 'super', 'génial', 'géniale', 'géniaux',
  'excellent', 'excellente', 'incroyable', 'incroyables', 'merveilleux', 'merveilleuse', 'magnifique', 'magnifiques',
  'un régal', 'je recommande', 'nous recommandons', 'à recommander', 'recommande vivement', 'on reviendra',
  'nous reviendrons', 'je reviendrai', 'reviendrons', 'reviendrai', 'coup de cœur', 'coup de coeur', 'pépite', 'bonne adresse',
  'adresse à retenir', 'bijou', 'délicieux', 'délicieuse', 'délicieuses', 'succulent', 'au top', 'rien à redire',
  'impeccable', 'impeccables', 'bravo', 'merci', 'génialissime', 'formidable', 'sublime', 'sublimes', 'exceptionnel',
  'exceptionnelle', 'très bon', 'très bonne', 'très bons', 'très bonnes', 'bon', 'bonne', 'bons', 'agréable', 'agréables',
  'sympa', 'sympathique', 'ravi', 'ravie', 'ravis', 'ravies', 'conquis', 'conquise', 'satisfait', 'satisfaite', 'satisfaits',
  'adore', 'adoré', 'adorée', 'aimé', 'apprécié', 'appréciée', 'chaleureux', 'chaleureuse', 'top du top', 'trop bon',
  'trop bonne', 'excellentissime', 'pas déçu', 'pas déçus', 'pas déçue', 'jamais déçu', 'jamais déçus', 'pas mal',
  'divin', 'divine', 'divins', 'divines', 'succulente', 'succulents', 'savoureux', 'savoureuse', 'excellents',
  'excellentes', 'valait le coup', 'vaut le coup', 'vaut le détour', 'au rendez-vous', 'de qualité', 'copieux',
  'généreux', 'généreuse', 'fondant', 'gourmand', 'réussi', 'réussie', 'chaleureuse', 'aux petits soins', 'plaisir',
  'une institution', 'délice', 'un délice', 'énorme', 'énormes', 'incontournable', '🔥', '😍', '😋', '🤩', '👍', '👌',
  '💯', '❤️', '❤', '🥰', '⭐']);

export const NEG_WORDS_FR = F(['déçu', 'déçue', 'déçus', 'déçues', 'décevant', 'décevante', 'décevants', 'déception',
  'dommage', 'bof', 'moyen', 'moyenne', 'pas terrible', 'nul', 'nulle', 'nuls', 'horrible', 'horribles', 'catastrophique',
  'catastrophe', 'à fuir', 'fuyez', 'à éviter', 'plus jamais', 'jamais plus', 'honteux', 'honteuse', 'honte', 'scandaleux',
  'scandaleuse', 'scandale', 'inadmissible', 'inacceptable', 'lamentable', 'médiocre', 'médiocres', 'mauvais', 'mauvaise',
  'pas bon', 'pas bonne', 'pas top', 'désagréable', 'pire', 'déplorable', 'navrant', 'navrante', 'regrette', 'regretté',
  'je ne reviendrai pas', 'nous ne reviendrons pas', 'on ne reviendra pas', 'ne reviendrai plus', 'ne reviendrons plus',
  'arnaque', 'immangeable', 'tiède', 'tièdes', 'trop cher', 'impoli', 'impolie', 'pourri', 'pourrie', 'pourris',
  'dégueulasse', 'dégueulasses', 'dégueu', 'minable', 'minables', 'gerbant', 'incompétent', 'incompétents', 'incapables',
  'n\'importe quoi', 'interminable', 'désastre', 'désastreux', 'raté', 'ratée', 'ratés', 'sans plus',
  '😡', '🤮', '👎', '😤', '💩', '😠', '🤢',
  'correct sans plus', 'juste correct', 'pas à la hauteur', 'ne vaut pas', 'aucun intérêt']);

export const POS_WORDS_EN = F(['great', 'amazing', 'excellent', 'delicious', 'fantastic', 'wonderful', 'perfect', 'lovely',
  'best', 'love', 'loved', 'recommend', 'highly recommend', 'superb', 'awesome', 'friendly', 'incredible', 'outstanding',
  'gem', 'will be back', 'will come back', 'good', 'nice', 'tasty', 'enjoyed']);
export const NEG_WORDS_EN = F(['bad', 'terrible', 'awful', 'horrible', 'worst', 'disappointing', 'disappointed', 'rude',
  'overpriced', 'cold', 'slow', 'dirty', 'never again', 'avoid', 'mediocre', 'poor', 'not worth', 'waste', 'disgusting',
  'scam', 'bland']);

// ---------------------------------------------------------------------------
// Avis abusifs, menaces, faux avis
// ---------------------------------------------------------------------------
export const INSULTS_FR = F(['connard', 'connards', 'connasse', 'connasses', 'conne', 'connes', 'enculé', 'enculés',
  'enculer', 'salaud', 'salauds', 'salope', 'salopes', 'pute', 'putes', 'ordure', 'ordures', 'raclure', 'raclures',
  'crétin', 'crétins', 'débile', 'débiles', 'abruti', 'abrutis', 'imbécile', 'imbéciles', 'escroc', 'escrocs', 'voleur',
  'voleurs', 'voleuse', 'voleuses', 'arnaqueur', 'arnaqueurs', 'arnaqueuse', 'de la merde', 'bouffe de merde',
  'merdique', 'merde', 'nique', 'ntm', 'fdp', 'fils de pute', 'bâtard', 'bâtards', 'batard', 'batards', 'clochards',
  'porcs', 'guignols', 'tocards', 'branleurs', 'charlots', 'bande d\'escrocs', 'bande de voleurs', 'bande de nuls']);

export const SLURS_FR = F(['sale race', 'bougnoule', 'bougnoules', 'nègre', 'negre', 'bamboula', 'youpin', 'niakoué',
  'chinetoque', 'bicot', 'raton', 'pd', 'pédé', 'pédés', 'tarlouze', 'gouine']);

export const THREATS_FR = F(['je vais revenir avec', 'vous allez le payer', 'vous allez payer', 'vous allez voir',
  'je vais vous faire fermer', 'vous faire fermer', 'faire fermer', 'je connais du monde', 'tout casser', 'je vais casser',
  'brûler', 'cramer', 'casser la gueule', 'péter la gueule', 'on se reverra', 'vous allez regretter', 'attendez-vous à',
  'je vais vous détruire', 'je vais vous pourrir', 'pourrir votre', 'couler votre', 'faire couler']);

export const LEGAL_FR = F(['avocat', 'plainte', 'porter plainte', 'porté plainte', 'tribunal', 'procès', 'dgccrf',
  'répression des fraudes', 'services d\'hygiène', 'service d\'hygiène', 'services sanitaires', 'inspection',
  'police', 'gendarmerie', 'huissier', 'justice', 'signalement', 'je vais signaler', 'vais signaler', 'dénoncer',
  'ars', 'préfecture']);

export const FAKE_FR = F(['jamais mis les pieds', 'jamais venu', 'jamais venue', 'jamais venus', 'pas encore venu',
  'pas encore testé', 'même pas entré', 'même pas rentré', 'allez plutôt', 'allez chez',
  'à côté c\'est mieux', 'le concurrent', 'meilleur ailleurs',
  'bien meilleur', 'bien mieux chez']);

export const DISCRIM_FR = F(['raciste', 'racistes', 'racisme', 'discrimination', 'discriminé', 'discriminée',
  'homophobe', 'homophobie', 'sexiste', 'à cause de ma couleur', 'parce que je suis', 'délit de faciès']);

export const INSULTS_EN = F(['idiot', 'idiots', 'stupid', 'fuck', 'fucking', 'f*cking', 'shit', 'shitty', 'crap', 'bitch',
  'asshole', 'assholes', 'scammers', 'thieves', 'liars', 'morons', 'moron', 'bastards']);
export const THREATS_EN = F(['you will pay', 'you will regret', 'shut you down', 'i know people', 'burn']);
export const LEGAL_EN = F(['lawyer', 'sue', 'lawsuit', 'police', 'health department', 'health inspector', 'report you', 'trading standards']);
export const FAKE_EN = F(['never been', 'never went', 'go to the place next door', 'go elsewhere instead', 'competitor']);
export const DISCRIM_EN = F(['racist', 'racism', 'discrimination', 'discriminated', 'homophobic', 'sexist']);

// ---------------------------------------------------------------------------
// Occasions, contexte, fidélité
// ---------------------------------------------------------------------------
export const OCCASIONS_FR = [
  { terms: F(['anniversaire de mariage']), label: 'cet anniversaire de mariage', de: 'de cet anniversaire de mariage' },
  { terms: F(['anniversaire', 'anniv']), label: 'cet anniversaire', de: 'de cet anniversaire' },
  { terms: F(['fête des mères', 'fete des meres']), label: 'cette fête des Mères', de: 'de cette fête des Mères' },
  { terms: F(['fête des pères', 'fete des peres']), label: 'cette fête des Pères', de: 'de cette fête des Pères' },
  { terms: F(['mariage']), label: 'ce mariage', de: 'de ce mariage' },
  { terms: F(['baptême', 'communion']), label: 'cette fête de famille', de: 'de cette fête de famille' },
  { terms: F(['evjf', 'evg', 'enterrement de vie']), label: 'cette soirée de fête', de: 'de cette soirée de fête' },
  { terms: F(['saint-valentin', 'saint valentin']), label: 'cette Saint-Valentin', de: 'de cette Saint-Valentin' },
  { terms: F(['repas d\'affaires', 'déjeuner d\'affaires', 'déjeuner pro', 'repas pro', 'repas d\'équipe', 'séminaire',
    'afterwork', 'pot de départ', 'repas de service']), label: 'ce repas entre collègues', de: 'de ce repas entre collègues' },
  { terms: F(['en famille', 'repas de famille', 'avec les enfants', 'avec nos enfants', 'avec mes enfants', 'en famille avec']),
    label: 'ce repas en famille', de: 'de ce repas en famille' },
  { terms: F(['entre amis', 'entre copines', 'entre potes', 'avec des amis', 'avec mes amis', 'avec des copains', 'entre copains']),
    label: 'ce moment entre amis', de: 'de ce moment entre amis' },
  { terms: F(['en amoureux', 'en couple', 'avec ma femme', 'avec mon mari', 'avec ma compagne', 'avec mon compagnon',
    'avec ma copine', 'avec mon copain', 'dîner romantique']), label: 'ce moment à deux', de: 'de ce moment à deux' },
];
export const OCCASIONS_EN = [
  { terms: F(['birthday']), label: 'your birthday celebration' },
  { terms: F(['anniversary']), label: 'your anniversary' },
  { terms: F(['date night', 'romantic dinner', 'with my wife', 'with my husband', 'with my partner']), label: 'your evening for two' },
  { terms: F(['with the kids', 'with our kids', 'family dinner', 'with family', 'with the family']), label: 'your family meal' },
  { terms: F(['with friends', 'group of friends']), label: 'your evening with friends' },
  { terms: F(['business lunch', 'work lunch', 'team dinner']), label: 'your team meal' },
];

export const REGULAR_FR = F(['habitué', 'habituée', 'habitués', 'depuis des années', 'depuis plusieurs années', 'ans que je viens',
  'ans que nous venons', 'ans qu\'on vient', 'toujours un plaisir', 'comme toujours', 'fidèle', 'fidèles', 'à chaque fois',
  'chaque fois', 'on revient', 'nous revenons', 'je reviens', 'notre cantine', 'ma cantine', 'toujours aussi', 'jamais déçu',
  'jamais déçus', 'jamais déçue']);
export const REGULAR_EN = F(['regular', 'regulars', 'every time', 'always come back', 'for years', 'as always', 'never disappoints']);

export const FIRST_VISIT_FR = F(['première fois', 'premiere fois', 'première visite', 'découvert', 'découverte',
  'par hasard', 'de passage', 'pour la première']);
export const FIRST_VISIT_EN = F(['first time', 'first visit', 'stumbled upon', 'by chance', 'passing through']);

export const WILL_RETURN_FR = F(['on reviendra', 'nous reviendrons', 'je reviendrai', 'reviendrons', 'reviendrai', 'à refaire',
  'on y retournera', 'nous y retournerons', 'on revient', 'à bientôt']);
export const WILL_RETURN_EN = F(['will be back', 'will come back', 'coming back', 'will return', 'cant wait to come back', 'can\'t wait to come back']);

export const DELIVERY_FR = F(['livraison', 'livré', 'livrée', 'livrés', 'livreur', 'uber eats', 'ubereats', 'deliveroo',
  'just eat', 'à emporter', 'a emporter', 'click and collect', 'commandé en ligne', 'commande en ligne']);
export const DELIVERY_EN = F(['delivery', 'delivered', 'uber eats', 'deliveroo', 'takeaway', 'take away', 'take-out', 'takeout']);

export const TERRACE = F(['terrasse', 'terrace', 'en extérieur']);
export const EVENING = F(['soir', 'soirée', 'dîner', 'diner', 'dinner', 'evening', 'night']);
export const LUNCH = F(['midi', 'déjeuner', 'dejeuner', 'lunch', 'pause déj', 'pause dej']);

// ---------------------------------------------------------------------------
// Langue
// ---------------------------------------------------------------------------
export const STOP_FR = F(['le', 'la', 'les', 'et', 'est', 'était', 'très', 'nous', 'avons', 'un', 'une', 'des', 'du', 'de',
  'pour', 'avec', 'mais', 'pas', 'c\'est', 'j\'ai', 'on', 'au', 'aux', 'ce', 'cette', 'sont', 'été', 'tout', 'trop',
  'bien', 'plat', 'service', 'accueil', 'personnel', 'merci', 'à', 'en', 'qui', 'que', 'il', 'elle']);
export const STOP_EN = F(['the', 'and', 'was', 'were', 'very', 'we', 'our', 'with', 'but', 'not', 'it', 'is', 'this',
  'that', 'for', 'had', 'have', 'they', 'staff', 'food', 'great', 'good', 'place', 'of', 'to', 'in', 'my', 'so', 'really',
  'amazing', 'delicious', 'nice', 'restaurant', 'service', 'friendly', 'would', 'will', 'definitely']);
export const STOP_ES = F(['el', 'los', 'muy', 'comida', 'servicio', 'fue', 'pero', 'con', 'una', 'para', 'volveremos', 'gracias', 'y', 'es', 'del']);
export const STOP_IT = F(['il', 'molto', 'cibo', 'servizio', 'era', 'ma', 'con', 'una', 'per', 'torneremo', 'grazie', 'e', 'è', 'della', 'buono', 'ottimo']);
export const STOP_DE = F(['der', 'die', 'das', 'und', 'sehr', 'essen', 'war', 'aber', 'mit', 'ein', 'eine', 'für', 'nicht', 'ist', 'gut', 'lecker', 'wir']);

// ---------------------------------------------------------------------------
// Prénoms fréquents (pour repérer un membre de l'équipe cité dans l'avis)
// ---------------------------------------------------------------------------
export const FIRST_NAMES = new Set(F([
  'julie', 'thomas', 'marie', 'sophie', 'nicolas', 'camille', 'léa', 'lucas', 'hugo', 'emma', 'chloé', 'manon', 'sarah',
  'laura', 'pauline', 'mathilde', 'clara', 'inès', 'yasmine', 'yasmina', 'mehdi', 'karim', 'sofiane', 'nassim', 'rayan',
  'amine', 'youssef', 'mohamed', 'mohammed', 'ali', 'fatima', 'leïla', 'leila', 'nadia', 'samir', 'kevin', 'jordan',
  'dylan', 'anthony', 'alexandre', 'antoine', 'pierre', 'paul', 'jean', 'louis', 'arthur', 'jules', 'léo', 'leo',
  'gabriel', 'raphaël', 'raphael', 'adam', 'nathan', 'théo', 'theo', 'maxime', 'romain', 'julien', 'guillaume',
  'sébastien', 'sebastien', 'vincent', 'david', 'olivier', 'christophe', 'stéphane', 'laurent', 'frédéric', 'eric',
  'éric', 'patrick', 'philippe', 'michel', 'alain', 'bernard', 'marc', 'luc', 'franck', 'fabien', 'cédric', 'jérôme',
  'mathieu', 'matthieu', 'benjamin', 'florian', 'quentin', 'baptiste', 'clément', 'valentin', 'victor', 'simon', 'martin',
  'tom', 'enzo', 'marco', 'luigi', 'giulia', 'francesca', 'paolo', 'giovanni', 'matteo', 'lorenzo', 'chiara', 'sara',
  'elena', 'anna', 'lisa', 'eva', 'alice', 'zoé', 'zoe', 'lola', 'jade', 'louise', 'rose', 'anaïs', 'anais', 'margaux',
  'océane', 'elodie', 'élodie', 'aurélie', 'céline', 'sandrine', 'nathalie', 'isabelle', 'valérie', 'sylvie',
  'christine', 'catherine', 'martine', 'brigitte', 'hélène', 'claire', 'charlotte', 'juliette', 'lucie', 'marine',
  'mélanie', 'émilie', 'emilie', 'audrey', 'caroline', 'virginie', 'stéphanie', 'sabrina', 'jessica', 'amandine',
  'morgane', 'justine', 'amélie', 'coralie', 'estelle', 'agathe', 'victoria', 'diane', 'romane', 'maëlle', 'lina',
  'mia', 'nina', 'léna', 'sofia', 'ambre', 'jeanne', 'agnès', 'monique', 'danielle', 'mireille', 'kader', 'rachid',
  'farid', 'hakim', 'bilal', 'ilyes', 'ilyès', 'walid', 'nabil', 'malik', 'samy', 'sami', 'sam', 'max', 'alex',
  'mickael', 'mickaël', 'michael', 'jonathan', 'jérémy', 'jeremy', 'loïc', 'loic', 'yann', 'yannick', 'gaël', 'gael',
  'erwan', 'ronan', 'mael', 'maël', 'noé', 'noah', 'ethan', 'timothée', 'axel', 'bastien', 'damien', 'adrien', 'xavier',
  'thierry', 'didier', 'pascal', 'serge', 'gérard', 'jacques', 'daniel', 'denis', 'bruno', 'hervé', 'joël', 'dominique',
  'françois', 'francois', 'arnaud', 'cyril', 'benoît', 'benoit', 'grégory', 'gregory', 'tony', 'kenzo', 'ayoub', 'idriss',
  'moussa', 'mamadou', 'aminata', 'awa', 'fatou', 'aïcha', 'aicha', 'salma', 'imane', 'meriem', 'sonia', 'linda', 'nora',
  'jack', 'james', 'john', 'mike', 'emily', 'kate', 'jessica', 'ben', 'sophia', 'oliver', 'harry', 'charlie', 'george',
  'lucy', 'amy', 'sean', 'ryan', 'chris', 'steve', 'mark', 'peter', 'andrew', 'luca', 'giorgio', 'alessandro', 'pablo',
  'diego', 'carlos', 'maria', 'lucia', 'hans', 'klaus', 'yuki', 'kenji', 'mei', 'lin', 'wei', 'ana', 'ines', 'inés',
]));

// Mots capitalisés qui ne sont PAS des prénoms (débuts de phrase fréquents, lieux…)
export const NOT_NAMES = new Set(F([
  'le', 'la', 'les', 'un', 'une', 'des', 'nous', 'on', 'je', 'il', 'elle', 'ils', 'elles', 'tout', 'tous', 'très', 'trop',
  'service', 'restaurant', 'accueil', 'cuisine', 'plat', 'plats', 'repas', 'cadre', 'rapport', 'personnel', 'équipe',
  'serveur', 'serveuse', 'patron', 'patronne', 'endroit', 'lieu', 'ambiance', 'déco', 'prix', 'top', 'super', 'excellent',
  'bon', 'bonne', 'belle', 'beau', 'parfait', 'merci', 'bravo', 'google', 'paris', 'lyon', 'marseille', 'france',
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'janvier', 'février', 'mars', 'avril', 'mai',
  'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre', 'chef', 'cheffe', 'madame', 'monsieur',
  'the', 'and', 'our', 'we', 'great', 'food', 'staff', 'it', 'this', 'very', 'thank', 'thanks', 'uber', 'deliveroo',
  'tripadvisor', 'instagram', 'facebook', 'noël', 'pâques', 'italien', 'italienne', 'français', 'française',
]));
