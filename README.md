# AvisPro — réponses aux avis Google des restaurants

Outil semi-manuel (Phase 1), écran démo pour le porte-à-porte (Phase 2) et agent d'automatisation (Phase 3),
construits sur **un seul cœur** : l'appli et l'agent rédigent avec exactement les mêmes règles.

```
src/core/     le cœur : analyse de l'avis, moteur hors-ligne, prompt Claude, bascule automatique, WhatsApp, bilan
src/web/      l'appli mobile une page (+ écran démo)          → construite dans dist/avispro.html
agent/        l'agent Phase 3 (Google + WhatsApp, réels ou simulés)   → voir agent/README.md
tests/        33 tests automatiques
docs/         accès à l'API Google, résultats des tests, journal de simulation
```

## Utiliser l'appli

- **Dans claude.ai** (recommandé) : ouvre l'artefact « AvisPro ». Claude rédige via ton compte (aucune clé),
  fiches et historique sont synchronisés entre ton téléphone et ton ordinateur.
- **Hors claude.ai** (secours, ou pour un collègue) : `dist/avispro.html` est un fichier unique.
  1. Va sur app.netlify.com/drop et dépose le fichier → tu obtiens une adresse web.
  2. Ouvre-la sur ton téléphone → menu du navigateur → « Ajouter à l'écran d'accueil ».
  3. Réglages → « Claude, avec une clé API » → colle ta clé (console.anthropic.com). Sans clé, le moteur hors-ligne répond.
  Les données restent alors sur le téléphone : exporte une sauvegarde de temps en temps (Réglages → Données).

## Développer

```bash
npm install          # esbuild (construction de l'appli)
npm run build        # → dist/avispro.html et dist/avispro-artifact.html
npm test             # cœur IA, agent, robustesse (400 avis aléatoires)
npm run bench        # → docs/RESULTATS_TESTS_DEMO.md (23 avis × 4 variantes à relire)
npm run simulate     # la boucle de l'agent racontée pas à pas
```

Node 18 ou plus. Le cœur et l'agent n'ont aucune dépendance.

## Choix techniques

- **Un seul cœur** pour l'appli et l'agent : une règle corrigée une fois l'est partout.
- **Jamais de plantage** : si Claude ne répond pas (réseau, clé, délai de 9 s), le moteur hors-ligne prend le relais
  et l'interface le signale discrètement.
- **Moteur hors-ligne** : analyse l'avis (langue, note, sujets, plats, prénoms, durées, occasion, insultes, faux avis,
  santé/hygiène) puis assemble une réponse à partir de formules variées, sans répéter celles des réponses récentes.
- **Aucune invention** : seuls les éléments de l'avis et de la fiche peuvent être cités ; contrôle automatique
  des gestes commerciaux, des sujets à éviter et des prénoms d'employés dans les avis négatifs.
- **Santé / hygiène** : empathie, aucune excuse qui vaudrait aveu, alerte rouge pour le patron.
