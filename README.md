# Réponse Maison : agent IA de réponse aux avis Google

Rédige des réponses personnalisées aux avis Google des restaurants, avec **validation humaine par WhatsApp** avant publication.
Projet conçu et lancé en 2026, testé auprès de restaurants indépendants.

**[▶ Essayer la démo en ligne](https://yaniil.github.io/reponse-maison-ai/dist/avispro.html)**
Sans clé API, l'appli utilise son moteur hors-ligne. Avec une clé Anthropic (Réglages), elle rédige avec Claude.

## Ce que fait le projet

1. **Analyse l'avis** : langue, note, sentiment, plats et prénoms cités, insultes, faux avis probables, santé/hygiène.
2. **Rédige la réponse** avec un LLM (Claude), dans le ton du restaurant, sans rien inventer.
3. **Contrôle la réponse** : pas de geste commercial non validé, pas de sujet interdit, pas de prénom d'employé dans un avis négatif.
4. **Fait valider le patron** par WhatsApp, puis publie (agent connecté à l'API Google Business Profile).

## Points techniques

- **LLM & prompt engineering** : prompt système de 15 règles généré depuis la fiche du restaurant, enrichi de repères extraits de l'avis.
- **Sortie structurée** : réponse + ligne `ALERTE` lue par le code pour signaler les avis à risque.
- **Garde-fous** : contrôles par règles après génération et retouches automatiques des formules creuses.
- **Résilience** : streaming, délai de 9 s, bascule automatique vers un moteur sans IA (règles + gabarits, anti-répétition par similarité de trigrammes).
- **Human-in-the-loop** : rien n'est publié sans validation ; l'agent ne réécrit jamais une réponse déjà publiée par le patron.
- **Évaluation** : 34 tests automatisés, banc d'essai de 23 avis × 4 variantes, 400 avis aléatoires de robustesse.

## Architecture

```
src/core/   cœur partagé : analyse, prompt, fournisseurs LLM, moteur hors-ligne, WhatsApp, bilan mensuel
src/web/    appli mobile une page + écran de démo   → dist/avispro.html
agent/      agent d'automatisation (API Google Business Profile + WhatsApp Cloud, réels ou simulés)
tests/      tests automatisés
docs/       accès à l'API Google, résultats des tests
```

## Lancer en local

```bash
npm install
npm test           # tests
npm run build      # construit dist/avispro.html
npm run simulate   # boucle complète de l'agent sur un Google et un WhatsApp simulés
```

Node.js 18+. Le cœur et l'agent n'ont aucune dépendance.

## Stack

JavaScript (Node.js), API Claude (Anthropic), API Google Business Profile, WhatsApp Cloud API, esbuild, Playwright.

---
Projet réalisé par **Yani Zekhnine** avec l'assistance de Claude (Anthropic).
