# Mon patrimoine

Une app pour suivre mon capital, mon budget du mois, et calculer combien il me faudrait placé pour que mes placements paient mes dépenses.

Elle existe en trois versions, fabriquées à partir du même code :

| Version | Où la trouver |
|---|---|
| **Windows** (programme à installer) | [Mon-patrimoine-installation.exe](https://github.com/VTXNawo/mon-patrimoine/releases/latest/download/Mon-patrimoine-installation.exe) |
| **Android** (app à installer) | [Mon-patrimoine.apk](https://github.com/VTXNawo/mon-patrimoine/releases/latest/download/Mon-patrimoine.apk) |
| **Navigateur** (téléphone ou ordinateur) | https://vtxnawo.github.io/mon-patrimoine/ |

**Les données restent sur l'appareil.** Ce dépôt ne contient aucun chiffre personnel.
Pour mettre ses données sur un appareil : bouton « Importer », puis choisir son fichier de données (`.json`).
Pour les sauvegarder ou les passer sur un autre appareil : bouton « Sauvegarder mes données ».

## Comment le code est rangé

| Fichier ou dossier | Rôle |
|---|---|
| `index.html` | La structure des écrans : Patrimoine, Mes dépenses, Tester |
| `styles.css` | L'apparence : couleurs, polices, mise en page |
| `app.js` | Toute la logique : calculs, graphique, enregistrement des données |
| `icons/` | Les icônes de l'app |
| `manifest.webmanifest`, `sw.js` | Ce qui rend la version navigateur installable et utilisable hors connexion |
| `desktop/` | L'emballage Windows (Electron) |
| `mobile/` | L'emballage Android (Capacitor) |
| `.github/workflows/build.yml` | La fabrication automatique par GitHub |

## Comment les apps sont fabriquées

À chaque modification sur la branche `main`, GitHub fabrique le programme Windows et l'app Android (onglet **Actions**),
puis les publie comme nouvelle version dans **Releases**. Les liens de téléchargement ci-dessus donnent toujours la dernière version.

Pour mettre à jour une app déjà installée : télécharger la nouvelle version et l'installer par-dessus. Les données sont gardées.
