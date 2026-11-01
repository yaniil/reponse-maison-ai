# Agent AvisPro — automatisation (Phase 3)

L'agent fait seul ce que tu fais à la main en Phase 1 : il lit les nouveaux avis Google de chaque restaurant,
rédige la réponse, l'envoie au patron sur WhatsApp, et la publie **seulement après son accord**.

Tout est testé dès maintenant avec un **Google simulé** et un **WhatsApp simulé** : aucun compte n'est nécessaire
pour voir la boucle tourner.

```bash
node agent/src/cli.js simulate      # la boucle complète, racontée étape par étape
npm test                            # 33 tests (cœur IA + agent + robustesse)
```

## Architecture

```
   ┌────────────── toutes les 30 min (cron) ──────────────┐
   │                                                       ▼
   │   Google Business Profile ──► 1. nouveaux avis ? ──► 2. rédaction (même cœur que l'appli :
   │   (client réel ou simulé)                               Claude, sinon moteur hors-ligne)
   │            ▲                                            │
   │            │ 5. publication                             ▼
   │            │    (relit l'avis avant :            3. WhatsApp au patron : avis + réponse
   │            │     jamais d'écrasement)               + boutons « Publier » / « Modifier »
   │            │                                            │
   │    4. accord du patron ◄── webhook WhatsApp ◄───────────┘
   │       « OK » · texte modifié · consigne (« enlève la fin ») · « non »
   │
   └── relance à 24 h · validation tacite (option du contrat, avis 4-5★ sans alerte) · alertes à l'opérateur
```

| Fichier | Rôle |
|---|---|
| `src/agent.js` | La boucle : détection, rédaction, validation, publication, relances, alertes |
| `src/gbp/google.js` | Client **réel** de l'API Google (OAuth, fiches, avis, réponse) |
| `src/gbp/mock.js` | Client **simulé** (même interface ; sait simuler pannes 429/503 et réponses du patron sur Google) |
| `src/gbp/parse.js` | Lecture des avis (étoiles, avis traduits par Google → texte original) |
| `src/approval/whatsapp.js` | WhatsApp Cloud API (modèle hors fenêtre 24 h, boutons, webhook) + version simulée |
| `src/approval/parse.js` | Comprendre le patron : « OK », « non », son propre texte, ou une consigne |
| `src/store.js` | État de chaque avis dans un fichier JSON (écriture atomique) |
| `src/report.js` | Bilan mensuel sur **tous** les avis Google : volume, note, plaintes, délai de réponse, page HTML |
| `src/cli.js` | `simulate`, `discover`, `run`, `webhook`, `report` |

### Cycle de vie d'un avis

`en_validation` → (`OK`) → `approuve` → `publie`
- consigne du patron → nouvelle version → `en_validation` (sans IA : `a_modifier`, l'opérateur est prévenu)
- texte écrit par le patron → publié tel quel (signature ajoutée si absente)
- « non » → `rejete` (rien n'est publié)
- réponse déjà présente sur Google au moment de publier → `deja_repondu` (on n'écrase jamais)
- erreur Google temporaire → nouvel essai au cycle suivant (5 essais), puis `erreur` + alerte

### Garde-fous

1. Rien n'est publié sans accord, sauf si la **validation tacite** est activée pour ce restaurant
   (`autoApprovePositiveAfterHours`, option du contrat) et seulement pour un avis 4-5★ sans aucune alerte.
2. L'avis est relu juste avant publication : si le patron a déjà répondu lui-même, on ne touche à rien.
3. Avis sensibles (insultes, menaces, santé, hygiène) : alerte immédiate à l'opérateur.
4. Les avis traduits par Google sont lus dans leur langue d'origine, et on répond dans cette langue.
5. Au démarrage, seuls les avis récents sont traités (`backfillDays`) : pas de rafale sur 300 vieux avis.

## Passer en réel

1. **Accès API Google** : suivre `docs/ACCES_API_GOOGLE.md` (compter 60 jours de préparation pour la fiche
   de ton activité, puis quelques jours à quelques semaines d'examen par Google).
2. **WhatsApp Business** (Cloud API de Meta) : un numéro dédié, un modèle de message « validation_avis »
   (catégorie Utilité) avec 2 boutons de réponse rapide : « Publier ✅ » et « Modifier ✏️ ».
   Texte du modèle :
   ```
   Nouvel avis {{2}} sur {{1}} :
   « {{3}} »
   Réponse proposée :
   « {{4}} »
   Appuyez sur Publier pour la mettre en ligne, ou sur Modifier pour la changer.
   ```
3. Copier `config.example.json` en `config.json`, renseigner les variables d'environnement
   (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `ANTHROPIC_API_KEY`,
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN`).
4. `node agent/src/cli.js discover --config agent/config.json` liste les fiches auxquelles ton compte a accès :
   recopier chaque `accounts/…/locations/…` dans `restaurants[].location`.
5. Héberger sur un petit serveur (quelques euros par mois) :
   - `node agent/src/cli.js run --config agent/config.json` toutes les 30 minutes (cron) ;
   - `node agent/src/cli.js webhook --config agent/config.json --port 8080` derrière une adresse HTTPS,
     déclarée comme webhook dans l'application Meta.
6. Le 1er du mois : `node agent/src/cli.js report --config agent/config.json --month 2026-10`
   → une page HTML par restaurant + le texte prêt à envoyer sur WhatsApp.

Node 18 ou plus, aucune dépendance à installer pour l'agent.

## Coûts à prévoir (ordre de grandeur)

- API Google Business Profile : gratuite.
- Claude (rédaction) : environ 0,5 centime par réponse avec Claude Sonnet 5.5.
- WhatsApp Cloud API : facturation Meta à l'usage pour les modèles « Utilité » envoyés hors fenêtre de 24 h
  (quelques centimes par message : vérifier la grille en vigueur sur developers.facebook.com).
- Serveur : 4 à 6 € par mois.

## Limites connues

- Sans clé IA, l'agent ne peut pas appliquer une consigne libre du patron : il prévient l'opérateur.
- Les consignes ambiguës (« fais mieux ») sont envoyées telles quelles à Claude, puis revalidées par le patron.
- La détection temps réel par notifications Google (Pub/Sub) n'est pas branchée : le relevé toutes les 30 minutes suffit
  pour répondre en quelques heures.
