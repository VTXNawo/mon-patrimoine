# Mon patrimoine

Une app pour suivre mon capital, mon budget du mois, comparer mes relevés de banque avec ce que j'avais prévu, et calculer combien il me faudrait placé pour que mes placements paient mes dépenses.

Elle existe en trois versions, fabriquées à partir du même code :

| Version | Où la trouver |
|---|---|
| **Windows** (programme à installer) | [Mon-patrimoine-installation.exe](https://github.com/VTXNawo/mon-patrimoine/releases/latest/download/Mon-patrimoine-installation.exe) |
| **Android** (app à installer) | [Mon-patrimoine.apk](https://github.com/VTXNawo/mon-patrimoine/releases/latest/download/Mon-patrimoine.apk) |
| **Navigateur** (téléphone ou ordinateur) | https://vtxnawo.github.io/mon-patrimoine/ |

**Les données restent sur l'appareil.** Ce dépôt ne contient aucun chiffre personnel, et aucun relevé de banque.
Pour mettre ses données sur un appareil : bouton « Importer », puis choisir son fichier de données (`.json`).
Pour les sauvegarder ou les passer sur un autre appareil : bouton « Sauvegarder mes données ».

## Comment le code est rangé

| Fichier ou dossier | Rôle |
|---|---|
| `index.html` | La structure des écrans : Patrimoine, Mes dépenses, Ma banque, Tester |
| `styles.css` | L'apparence : couleurs, polices, mise en page |
| `app.js` | Toute la logique : calculs, graphiques, enregistrement des données |
| `releve.js` | La lecture des relevés PDF du Crédit Mutuel et le classement automatique des opérations |
| `vendor/pdfjs/` | pdf.js (Mozilla), qui lit le texte des PDF sur l'appareil |
| `vendor/fonts/` | La police Geist (licence SIL OFL), incluse pour que l'app marche sans connexion |
| `icons/` | Les icônes de l'app |
| `manifest.webmanifest`, `sw.js` | Ce qui rend la version navigateur installable et utilisable hors connexion |
| `desktop/` | L'emballage Windows (Electron) |
| `mobile/` | L'emballage Android (Capacitor) |
| `.github/workflows/build.yml` | La fabrication automatique par GitHub |

## Comment les apps sont fabriquées

À chaque modification sur la branche `main`, GitHub fabrique le programme Windows et l'app Android (onglet **Actions**),
puis les publie comme nouvelle version dans **Releases**. Les liens de téléchargement ci-dessus donnent toujours la dernière version.

Pour mettre à jour une app déjà installée : télécharger la nouvelle version et l'installer par-dessus. Les données sont gardées.
