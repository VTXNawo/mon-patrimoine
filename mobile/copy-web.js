// Copie l'app web (dossier racine) dans mobile/www avant de fabriquer l'app Android.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const out = path.join(__dirname, "www");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of ["index.html", "styles.css", "app.js"]) fs.copyFileSync(path.join(root, f), path.join(out, f));
fs.cpSync(path.join(root, "icons"), path.join(out, "icons"), { recursive: true });
console.log("App web copiée dans mobile/www");
