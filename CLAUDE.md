# Mon patrimoine

App personnelle de finances (capital, budget, relevés bancaires, simulateur). Un seul code web, sans étape de build ni dépendance, publié en trois versions :
- **Web** : GitHub Pages, déployé depuis `main`.
- **Windows** : Electron, dans `desktop/`.
- **Android** : Capacitor, dans `mobile/`, APK debug signé avec `mobile/debug.keystore`.

Fichiers :
- `index.html`, `styles.css` ;
- `app.js` : une IIFE, avec l'état global `S`, un `render()` impératif et les aides `el()` / `sv()` ;
- `releve.js` : lecture des PDF du Crédit Mutuel, module pur ;
- `sw.js` ;
- `vendor/` : pdf.js 3.11.174 et la police Geist, figés.

L'utilisateur parle français et n'est pas développeur : réponds en français, simplement, le résultat d'abord.

## Commandes
- Tests : `node --test tests/*.test.js` (`node --test tests/` échoue sous Node 22).
- Essai local : `py -m http.server <port> --bind 127.0.0.1`, puis Chrome via le skill claude-in-chrome. `python` n'existe pas, `py` oui.
- GitHub : `gh` n'est pas installé. Lecture par l'API publique avec `curl` ; actions (PR, fusion, lancement de workflow) par l'interface web dans Chrome.

## Règles du code
- **Nouveau fichier JS :** le déclarer à 4 endroits : `index.html`, `SHELL` de `sw.js`, `desktop/copy-web.js`, `mobile/copy-web.js`.
- **Cache du service worker :** incrémenter `CACHE` dans `sw.js` à chaque modification d'un fichier servi, sinon le web garde l'ancienne version.
- **Logique testable :** la placer entre marqueurs (`/*PROJ-START*/…`, `FIN`, `STORE`, `IMPORT`). Les tests extraient ces blocs de `app.js` et les exécutent avec `new Function`.
- **Fins de ligne :** CRLF dans les fichiers de travail, comme le reste du dépôt.
- **Changements :** minimaux, dans le style existant. Pas de nouvelle dépendance ni de framework.

## Protection des données (non négociable)
- **Données de l'app :**
  - un document JSON dans `localStorage`, clé `patrimoine-app` ;
  - la copie d'annulation d'import sous `patrimoine-avant-import` ;
  - les PDF dans IndexedDB, base `patrimoine-docs`, magasin `pdf`.
- **Sans accord explicite :** ne jamais changer la clé, le format ni la base, ne faire aucune migration, ne supprimer aucun PDF.
- **Écritures :** un refus de l'appareil doit être signalé, jamais ignoré. Les données affichées restent exportables (« Sauvegarder mes données »).
- **Les anciens exports** doivent rester importables : `.json`, page `.html`, enveloppe `{data}`.
- **Données préservées par les mises à jour, à ne jamais modifier :**
  - Windows : `productName` « Mon patrimoine » et `appId` `fr.vtxnawo.monpatrimoine` ;
  - Android : la clé `mobile/debug.keystore` et `versionCode` 1.
- **Aucune donnée personnelle dans le dépôt :** respecter le `.gitignore`. Tests et essais avec des données fictives uniquement. Après un essai dans le navigateur, effacer `localStorage`, IndexedDB, le service worker et les caches de l'adresse de test.

## Publication et Git
- **Un push ou une fusion sur `main` publie tout :**
  - une Release `v1.0.<numéro d'exécution>`, avec le `.exe` et l'`.apk` ;
  - la version web.

  Jamais sans l'accord explicite de l'utilisateur, donné dans la conversation en cours.
- **Commit, push, PR, lancement de workflow :** seulement sur demande.
- **Une branche par amélioration :** `amelioration/<sujet>`, créée depuis `main` à jour.
- **Installateurs de test :** pousser la branche, puis lancer le workflow à la main sur cette branche. Le job Release ne tourne que sur `main`.
- **Fichiers jamais commités :** `AUDIT_MON_PATRIMOINE.md` (local) et les fichiers de revue (dans un dossier temporaire hors du projet).

## Façon de travailler
- **Choix ordinaires :** les faire sans demander, et les signaler dans le bilan.
- **Quand demander :** uniquement pour ce qui touche aux données (clé, format, nouvelle clé stockée, suppression), à la publication, ou si la demande est ambiguë avec des conséquences importantes.
- **Avant de modifier :** lire le code concerné et ses appels.
- **Comportement modifié :** ajouter ou adapter des tests, y compris les cas d'échec.
- **Rapport :** indiquer honnêtement ce qui n'a pas été vérifié, par exemple Windows ou Android sur appareil.
- **Amélioration complète :** `/ameliorer [demande]` (voir `.claude/skills/ameliorer/SKILL.md`).
