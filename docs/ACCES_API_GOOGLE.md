# Obtenir l'accès à l'API Google Business Profile — pas-à-pas

L'API qui permet de lire les avis et d'y répondre automatiquement n'est pas ouverte à tous : Google examine
chaque demande. Elle est **gratuite**, mais il faut remplir des conditions **avant** de la demander.
Pendant ce temps, tu travailles en semi-manuel avec l'appli (Phase 1) : rien ne bloque la vente.

## Ce que Google exige (conditions officielles)

- Gérer une **fiche d'établissement vérifiée et active depuis au moins 60 jours**.
- Avoir un **site web** qui représente l'entreprise, indiqué sur cette fiche.
- Une fiche complète et à jour.
- Faire la demande avec une **adresse e-mail propriétaire ou gestionnaire** de cette fiche.
- Il n'existe **pas d'environnement de test** : d'où le client Google simulé fourni avec l'agent.

Source : developers.google.com/my-business/content/prereqs

## Étape 0 — Cette semaine : lancer le compte à rebours des 60 jours

1. **Nom de domaine + site d'une page** au nom de ton offre (ex. `reponsemaison.fr`) : qui tu es, ce que tu fais,
   ton contact. Une page suffit.
2. **Une adresse e-mail pro** sur ce domaine (ex. `contact@reponsemaison.fr`) et un **compte Google créé avec
   cette adresse** (pas besoin de Gmail : « Créer un compte » → « Utiliser mon adresse e-mail actuelle »).
3. Avec ce compte, crée la **fiche Google de ton activité** (entreprise de services : tu peux masquer l'adresse et
   indiquer une zone desservie), mets le site, puis fais-la **vérifier**. Les 60 jours partent de la vérification.
4. Recommandé par Google pour les prestataires qui gèrent des fiches pour des clients : un **compte d'organisation**
   (business.google.com/agencysignup, avec le site et l'e-mail du domaine). Google précise qu'un compte ajouté à
   une organisation ne doit pas posséder ou gérer directement des fiches : crée-la avec une adresse dédiée
   (ex. `agence@…`) si tu le fais.
5. Pour la Phase 1, demande aux restaurateurs d'ajouter **ton adresse pro** comme « Administrateur »
   de leur fiche (pas ton Gmail perso) : tout sera déjà au bon endroit le jour où l'API arrive.

## Étape 1 — Créer le projet Google Cloud (10 min)

1. console.cloud.google.com → connecte-toi avec ton compte pro.
2. Sélecteur de projet → **Nouveau projet** → nom : `reponse-maison-avis` → Créer.
3. Sur le **Tableau de bord** du projet, note le **numéro du projet** (12 chiffres) : le formulaire le demande.

## Étape 2 — Faire la demande d'accès (15 min, à J+60)

1. Ouvre le formulaire : **support.google.com/business/contact/api_default**
2. Dans la liste, choisis **« Application for Basic API Access »**.
3. Renseigne : ton nom, l'e-mail propriétaire/gestionnaire de ta fiche, le **numéro du projet**, ton site web.
4. Description du cas d'usage : sois précis, honnête et modeste. Modèle (FR puis EN, le formulaire est souvent en anglais) :

> Je gère, à leur demande et sous mandat écrit, les réponses aux avis Google de restaurants indépendants qui m'ont
> ajouté comme administrateur de leur fiche. J'utilise l'API uniquement pour lister les nouveaux avis
> (accounts.locations.reviews.list) et publier une réponse (reviews.updateReply) après validation explicite du
> propriétaire du restaurant. Volume prévu : 10 à 50 établissements, quelques dizaines d'avis par jour. Aucune
> revente de données, aucune sollicitation ni modification d'avis.

> I manage, at their request and under a written mandate, the replies to Google reviews of independent restaurants
> that added me as a manager of their Business Profile. I use the API only to list new reviews
> (accounts.locations.reviews.list) and to post a reply (reviews.updateReply) after explicit approval by the
> restaurant owner. Expected volume: 10 to 50 locations, a few dozen reviews per day. No data resale, no review
> solicitation or modification.

5. Envoie. Tu reçois un e-mail avec un numéro de dossier. Délai : de quelques jours à plusieurs semaines.

## Étape 3 — Savoir si c'est accepté

Console Cloud → **API et services** → **Bibliothèque** → « Google My Business API » → onglet **Quotas** :
- **0 requête/minute** : pas encore accepté ;
- **300 requêtes/minute** : accepté.

## Étape 4 — Activer les API (5 min, après acceptation)

Dans **API et services → Bibliothèque**, active :
- **Google My Business API** (les avis et les réponses) ;
- **My Business Account Management API** (les comptes) ;
- **My Business Business Information API** (la liste des fiches) ;
- facultatif : **My Business Notifications API** (pour être prévenu en temps réel, plus tard).

## Étape 5 — Les identifiants OAuth (20 min)

1. **API et services → Écran de consentement OAuth** : type **Externe**, nom « Réponse Maison », ton e-mail.
   Ajoute le champ d'application `https://www.googleapis.com/auth/business.manage`.
2. Passe l'application **« En production »** : en mode « Test », Google fait expirer le jeton au bout de 7 jours
   et l'agent s'arrêterait chaque semaine. Comme tu es le seul utilisateur, l'avertissement « application non validée »
   peut être passé (« Paramètres avancés » → « Accéder à… »).
3. **Identifiants → Créer des identifiants → ID client OAuth** → type **Application Web** →
   URI de redirection autorisé : `https://developers.google.com/oauthplayground` → note l'ID client et le secret.
4. Ouvre **developers.google.com/oauthplayground** → roue dentée : coche « Use your own OAuth credentials »,
   colle l'ID et le secret → dans la case des scopes, colle `https://www.googleapis.com/auth/business.manage`
   → **Authorize APIs** → connecte-toi avec **le compte administrateur des fiches clients** →
   **Exchange authorization code for tokens** → copie le **refresh token**.
5. Test immédiat dans le Playground : requête GET sur
   `https://mybusinessaccountmanagement.googleapis.com/v1/accounts` → tu dois obtenir **200 OK**.

## Étape 6 — Brancher l'agent

1. Mets les 3 valeurs dans les variables d'environnement `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `GOOGLE_REFRESH_TOKEN` (jamais dans un fichier partagé).
2. `node agent/src/cli.js discover --config agent/config.json` : la liste des fiches accessibles s'affiche ;
   recopie chaque identifiant `accounts/…/locations/…` dans la configuration du restaurant correspondant.
3. Premier passage prudent : `backfillDays: 3` (seuls les avis des 3 derniers jours sont traités).
4. Ensuite seulement : WhatsApp Business (voir agent/README.md) et l'hébergement.

## Points de vigilance

- Une demande faite trop tôt (fiche de moins de 60 jours, pas de site) est refusée : mieux vaut attendre.
- L'accès est accordé **par projet** Google Cloud : garde le même projet.
- Les réponses publiées par l'API apparaissent comme « Réponse du propriétaire », exactement comme à la main.
- Si un restaurateur te retire l'accès Administrateur, l'agent ne voit plus sa fiche : c'est normal et voulu.
