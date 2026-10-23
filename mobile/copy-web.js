// Copie l'app web (dossier racine) dans mobile/www avant de fabriquer l'app Android.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const out = path.join(__dirname, "www");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ["index.html", "styles.css", "app.js", "releve.js"]) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of ["icons", "vendor"]) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });
console.log("App web copiée dans mobile/www");
