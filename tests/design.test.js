// Tests du nouveau design : chiffres affichés en plus (barre du mois, anneau des comptes) et cohérence de la page.
// Lancer : node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
function cut(name) {
  const a = src.indexOf(`/*${name}-START*/`), b = src.indexOf(`/*${name}-END*/`);
  assert.ok(a >= 0 && b > a, `marqueurs ${name}-START / ${name}-END introuvables dans app.js`);
  return src.slice(a, b);
}
// MONTHS est défini plus haut dans app.js : on reprend la même liste pour bilanTitle
const MONTHS = JSON.parse(src.match(/const MONTHS = (\[[^\]]*\]);/)[1]);
// EUR0 / EUR2 : mêmes formats que ceux définis en haut de app.js (vérifié par un test plus bas)
const EUR0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const EUR2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const { cashFlow, accountsSummary, accountKind, accountShare, recentDocs, bilanTitle, leftCard, hasBudget } = new Function("MONTHS", "EUR0", "EUR2", `${cut("ATELIER")}\nreturn { cashFlow, accountsSummary, accountKind, accountShare, recentDocs, bilanTitle, leftCard, hasBudget };`)(MONTHS, EUR0, EUR2);
const near = (a, b) => Math.abs(a - b) < 1e-9;

test("barre du mois : dépenses, épargne et disponible à partir du budget", () => {
  const f = cashFlow({ recettes: 2600, depenses: 1500, reste: 1100 }, 650);
  assert.equal(f.income, 2600);
  assert.equal(f.spending, 1500);
  assert.equal(f.saving, 650);
  assert.equal(f.left, 450, "comme « Il me reste pour vivre »");
  assert.ok(near(f.wSpending, 1500 / 2600 * 100));
  assert.ok(near(f.wSaving, 650 / 2600 * 100));
  assert.equal(f.ratio, 25, "25 % des revenus");
});

test("barre du mois : jamais plus large que 100 %, même quand on épargne plus qu'il ne reste", () => {
  const f = cashFlow({ recettes: 1000, depenses: 900, reste: 100 }, 400);
  assert.equal(f.left, -300, "le manque reste visible");
  assert.ok(f.wSpending + f.wSaving <= 100 + 1e-9);
  assert.ok(near(f.wSpending + f.wSaving, 100));
});

test("barre du mois : sans budget ou sans rentrées, rien d'inventé", () => {
  assert.equal(cashFlow(null, 200), null);
  const f = cashFlow({ recettes: 0, depenses: 0, reste: 0 }, 0);
  assert.equal(f.ratio, null, "pas de pourcentage sans rentrées");
  assert.equal(f.wSpending, 0);
  assert.equal(f.wSaving, 0);
});

test("carte Comptes : nombre de comptes suivis, accord au singulier, soldes négatifs signalés", () => {
  assert.deepEqual(accountsSummary([1550, 3100, 640]), { count: 3, label: "comptes suivis", negative: 0, negativeLabel: "" });
  assert.equal(accountsSummary([10]).label, "compte suivi", "« 1 compte suivi », pas « 1 comptes »");
  const neg = accountsSummary([1000, -120, 0]);
  assert.equal(neg.count, 3, "un compte vide ou négatif reste suivi");
  assert.equal(neg.negative, 1);
  assert.equal(neg.negativeLabel, "1 solde négatif");
  assert.equal(accountsSummary([-1, -2, 5]).negativeLabel, "2 soldes négatifs");
  assert.equal(accountsSummary([]).count, 0);
  assert.equal(accountsSummary(null).count, 0, "pas de données : zéro, sans erreur");
});

test("rangée de synthèse : 5 cartes, mêmes chiffres qu'avant, anneau retiré", () => {
  const start = html.indexOf('<section class="overview kpis"');
  assert.ok(start >= 0, "rangée de cartes présente");
  const row = html.slice(start, html.indexOf("</section>", start));
  assert.equal((row.match(/class="kpi[ "]/g) || []).length, 5);
  for (const id of ["k-total", "k-total-sub", "k-left", "k-left-sub", "k-passif", "k-passif-sub", "k-saving", "saving-ratio", "k-accounts", "k-accounts-sub"]) {
    assert.ok(row.includes(`id="${id}"`), `${id} dans la rangée`);
  }
  assert.ok(row.includes("comptes suivis"));
  for (const gone of ["allocation-ring", "allocation-count", "allocation-note"]) {
    assert.ok(!html.includes(gone) && !src.includes(`"${gone}"`), `${gone} retiré partout`);
  }
  // le nombre de comptes se met à jour avec les autres chiffres, y compris pendant l'édition
  const figures = src.slice(src.indexOf("function renderFigures"), src.indexOf("function", src.indexOf("function renderFigures") + 10));
  assert.ok(figures.includes('$("k-accounts")'), "calculé dans renderFigures");
  // les autres écrans gardent leur style de chiffres
  assert.ok(fs.readFileSync(path.join(root, "styles.css"), "utf8").includes(".figures:not(.overview)"));
});

test("la page contient chaque élément que l'app va chercher, une seule fois", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const set = new Set(ids);
  assert.equal(set.size, ids.length, "pas d'identifiant en double");
  const made = new Set(["bud-nom-recettes-0"]); // créé par l'app quand on ajoute une ligne de budget
  for (const m of src.matchAll(/\$\("([^"]+)"\)/g)) {
    if (!made.has(m[1])) assert.ok(set.has(m[1]), `élément manquant dans index.html : ${m[1]}`);
  }
});

test("sauvegarde, import et annulation restent dans la page, dans la fenêtre Réglages", () => {
  const dialog = html.slice(html.indexOf('<dialog class="settings-dialog"'), html.indexOf("</dialog>"));
  for (const id of ["btn-backup", "btn-import", "btn-undo-import", "file-import"]) assert.ok(dialog.includes(`id="${id}"`), id);
});

test("Réglages : dans le menu « MP » de l'en-tête, jamais dans le menu des rubriques", () => {
  assert.ok(!/<aside\b/.test(html), "plus de barre latérale");
  const nav = html.slice(html.indexOf('<nav class="tabs"'), html.indexOf("</nav>"));
  assert.ok(nav.length > 0 && !nav.includes('id="settings-open"') && !nav.includes("Réglages"), "Réglages n'est pas dans le menu des rubriques");
  assert.equal(html.split('id="settings-open"').length - 1, 1, "un seul bouton Réglages");
  const avatar = html.match(/<button[^>]*id="avatar-settings"[^>]*>([^<]*)<\/button>/);
  assert.ok(avatar, "bouton MP présent");
  assert.equal(avatar[1], "MP");
  assert.ok(avatar[0].includes('aria-expanded="false"'), "menu fermé au départ, annoncé comme tel");
  assert.ok(avatar[0].includes('aria-controls="profile-pop"'));
  const pop = html.match(/<div class="profile-pop" id="profile-pop" hidden>([\s\S]*?)<\/div>/);
  assert.ok(pop, "menu caché au départ");
  assert.ok(pop[1].includes('id="settings-open"') && pop[1].includes("Réglages"), "Réglages est dans le menu");
  // le bouton du menu ouvre bien la fenêtre des préférences existante
  assert.match(src, /\$\("settings-open"\)\.addEventListener\("click", \(\) => \{ setProfileMenu\(false\); openSettings\(\); \}\)/);
  assert.ok(!/\$\("avatar-settings"\)\.addEventListener\("click", openSettings\)/.test(src), "MP ouvre le menu, pas directement la fenêtre");
});

// Contraste WCAG entre deux couleurs « #rrggbb ».
function contrast(a, b) {
  const lum = (h) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// Dernière valeur d'une variable CSS déclarée pour ce sélecteur exact (la dernière règle l'emporte).
function lastVar(css, selector, name) {
  let value = null;
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1].trim() !== selector) continue;
    const v = m[2].match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
    if (v) value = v[1];
  }
  return value;
}

test("gris secondaires lisibles : au moins 4,5:1 sur le fond, en clair et en sombre", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [theme, sel] of [["clair", ':root, :root[data-theme="light"]'], ["sombre", ':root[data-theme="dark"]']]) {
    const bg = lastVar(css, sel, "bg"), muted = lastVar(css, sel, "muted"), ink2 = lastVar(css, sel, "ink-2");
    assert.ok(bg && muted && ink2, `couleurs du thème ${theme} trouvées`);
    assert.ok(contrast(muted, bg) >= 4.5, `--muted ${theme} : ${contrast(muted, bg).toFixed(2)}:1`);
    assert.ok(contrast(ink2, bg) >= 4.5, `--ink-2 ${theme} : ${contrast(ink2, bg).toFixed(2)}:1`);
  }
  // un gris trop clair (#8f948e) échoue : le test le détecte bien
  assert.ok(contrast("#8f948e", lastVar(css, ':root, :root[data-theme="light"]', "bg")) < 4.5);
  assert.ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 1e-9);
});

test("thème clair ivoire et sauge : textes, bouton principal, champs et courbe assez contrastés", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const v = (name) => lastVar(css, ':root, :root[data-theme="light"]', name);
  const bg = v("bg"), card = v("surface");
  assert.equal(card, "#ffffff", "cartes blanches");
  assert.ok(contrast(bg, card) > 1.05 && contrast(bg, card) < 1.25, "fond ivoire doux, proche du blanc des cartes");
  // textes : sur le fond et sur les cartes
  for (const name of ["ink", "ink-2", "muted", "good", "warn", "bad"]) {
    for (const [where, b] of [["fond", bg], ["carte", card]]) {
      assert.ok(contrast(v(name), b) >= 4.5, `--${name} sur ${where} : ${contrast(v(name), b).toFixed(2)}:1`);
    }
  }
  assert.ok(contrast(v("brand-ink"), v("brand")) >= 4.5, "texte du bouton principal sur le vert sauge");
  assert.ok(contrast(v("brand-ink"), v("brand-hover")) >= 4.5, "idem au survol");
  assert.ok(contrast(v("nav-on-ink"), v("nav-on")) >= 4.5, "choix actif sur fond sauge pâle");
  assert.ok(contrast(v("warn-ink"), v("warn-bg")) >= 4.5, "bandeau d'alerte");
  // éléments graphiques et contours de champ : 3:1 sur les cartes
  for (const name of ["avec", "sans", "dep", "field-line", "focus"]) {
    assert.ok(contrast(v(name), card) >= 3, `--${name} sur carte : ${contrast(v(name), card).toFixed(2)}:1`);
  }
  // le vert sauge est bien un vert discret, partagé par l'action, le menu actif et la courbe
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(v("brand").slice(i, i + 2), 16));
  assert.ok(g > r && g > b && g - Math.min(r, b) < 50, "vert sauge peu saturé");
  assert.equal(v("acc-0"), v("avec"), "la première couleur des barres suit la courbe");
});

test("thème clair : surfaces nettes, sans dégradé ni flou ; le thème sombre reste inchangé", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const start = css.indexOf(':root, :root[data-theme="light"] { --bg: #f4f2ec');
  assert.ok(start > 0, "bloc du thème ivoire présent");
  const block = css.slice(start);
  assert.ok(!/gradient\(/.test(block), "aucun dégradé dans le thème ivoire");
  assert.ok(!/backdrop-filter:\s*(?!none\b)[^\s;]/.test(block), "aucun flou dans le thème ivoire");
  // chaque règle ajoutée vise le thème clair seulement (ou déclare ses couleurs, que le sombre redéfinit)
  for (const m of block.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@media")) continue;
    assert.ok(sel.split(",").every((s) => s.trim().startsWith(':root[data-theme="light"]') || s.trim() === ":root"), `règle limitée au clair : ${sel}`);
  }
  // le sombre redéfinit chaque couleur du clair, il ne peut donc pas en hériter
  const lightVars = [...block.slice(0, block.indexOf("}")).matchAll(/--([\w-]+):/g)].map((x) => x[1]);
  const darkDecl = [...css.matchAll(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/g)].map((x) => x[1]).join(" ");
  for (const name of lightVars.filter((n) => n !== "field-line")) {
    assert.ok(new RegExp(`--${name}:`).test(darkDecl), `--${name} défini aussi en sombre`);
  }
  assert.ok(!/var\(--field-line\)/.test(css.slice(0, start)), "--field-line ne sert qu'au thème clair");
  // couleurs sombres de référence toujours là
  assert.equal(lastVar(css, ':root[data-theme="dark"]', "bg"), "#27212a");
  assert.equal(lastVar(css, ':root[data-theme="dark"]', "brand"), "#cbb5c7");
});

test("Mes comptes : part de chaque compte comme sur la barre (soldes positifs seulement)", () => {
  const bal = [1550, 3100, 640];
  const shares = bal.map((_, i) => accountShare(bal, i));
  assert.ok(near(shares[1], 3100 / 5290));
  assert.ok(near(shares.reduce((t, v) => t + v, 0), 1), "les parts font 100 %");
  // un solde négatif ou nul ne prend pas de place, et ne fausse pas les autres
  assert.equal(accountShare([1000, -200, 0], 1), null);
  assert.equal(accountShare([1000, -200, 0], 2), null);
  assert.equal(accountShare([1000, -200, 0], 0), 1);
  assert.equal(accountShare([0, 0], 0), null, "rien à répartir");
  assert.equal(accountShare([], 0), null);
});

test("Mes comptes : icône choisie d'après le type, sinon le nom", () => {
  assert.equal(accountKind({ nom: "Eurocompte", type: "Compte courant" }), "courant");
  assert.equal(accountKind({ nom: "Livret A" }), "livret");
  assert.equal(accountKind({ nom: "Livret fictif", type: "Compte courant" }), "courant", "le type passe avant le nom");
  assert.equal(accountKind({ nom: "Mon LDDS" }), "livret");
  assert.equal(accountKind({ nom: "X", type: "PEA" }), "bourse");
  assert.equal(accountKind({ nom: "X", type: "Assurance vie" }), "assurance");
  assert.equal(accountKind({ nom: "Coffre" }), "autre");
  assert.equal(accountKind(null), "autre");
});

test("panneaux comptes et budget : chaque lien mène à une action existante", () => {
  const panel = (cls) => html.slice(html.indexOf(`<section class="card ${cls}"`), html.indexOf("</section>", html.indexOf(`<section class="card ${cls}"`)));
  assert.ok(panel("accounts-panel").includes('id="manage-accounts"'), "« Gérer mes comptes » dans Mes comptes");
  assert.ok(panel("month-panel").includes('id="open-budget"'), "« Voir tout mon budget » dans Mon budget du mois");
  assert.match(src, /\$\("manage-accounts"\)\.addEventListener\("click", \(\) => \{ openEdit\(\);/);
  assert.match(src, /\$\("open-budget"\)\.addEventListener\("click", \(\) => \{ setTab\("depenses"\);/);
  // une ligne de compte n'est cliquable que si l'on peut modifier les comptes, et ouvre leur fenêtre d'édition
  assert.match(src, /el\(canEdit \? "button" : "div"/);
  assert.match(src, /openEdit\(\);\s*\$\("edit"\)\.scrollIntoView\(\{ block: "start" \}\);\s*const input = \$\(`ed-solde-\$\{i\}`\);/);
  for (const text of [html, src]) assert.ok(!/comptes? connectés?/i.test(text), "jamais « comptes connectés »");
});

test("Mes comptes : la répartition dit qu'elle exclut les soldes négatifs, sans changer le calcul", () => {
  const acc = src.slice(src.indexOf("function renderAccounts"), src.indexOf("function accountIcon"));
  assert.match(acc, /bal\.some\(\(v\) => v < 0\)\) box\.append\(el\("p", \{ class: "acc-note" \}, "Répartition hors soldes négatifs"\)\)/);
  // la part reste calculée sur les seuls soldes positifs
  assert.equal(accountShare([1000, -200], 0), 1);
});

test("mise en page : contenu centré sur ordinateur, marge de sécurité sur téléphone", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /@media \(min-width: 900px\) \{\s*\.app \{[^}]*display: grid;[^}]*justify-content: center;/);
  // la barre d'onglets et le bas de la page tiennent compte de la barre système du téléphone
  assert.match(css, /\.tabs-wrap \{ bottom: calc\(17px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
  assert.match(css, /\.main \{ padding-bottom: calc\(120px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
  assert.match(html, /viewport-fit=cover/, "sans cela, env(safe-area-inset-bottom) vaudrait toujours 0");
  // Réglages n'est que dans le menu MP
  assert.ok(!html.slice(html.indexOf('<nav class="tabs"'), html.indexOf("</nav>")).includes("Réglages"));
});

test("Vos derniers documents : PDF présents seulement, du plus récent au plus ancien, 3 au plus", () => {
  const rels = [
    { id: "a", fin: "2026-08-31", pdf: true, importe: "2026-09-02" },
    { id: "b", fin: "2026-10-31", pdf: true, importe: "2026-11-01" },
    { id: "c", fin: "2026-09-30", pdf: false, importe: "2026-10-01" },
    { id: "d", fin: "2026-09-30", pdf: true, importe: "2026-10-03" },
    { id: "e", fin: "2026-07-31", pdf: true },
    { id: "f", fin: "2026-09-30", pdf: true, importe: "2026-10-05" },
  ];
  const before = JSON.stringify(rels);
  assert.deepEqual(recentDocs(rels, 3).map((r) => r.id), ["b", "f", "d"], "même période : le dernier importé d'abord");
  assert.deepEqual(recentDocs(rels, 10).map((r) => r.id), ["b", "f", "d", "a", "e"], "sans PDF sur l'appareil : pas listé");
  assert.equal(JSON.stringify(rels), before, "la liste des relevés n'est pas modifiée");
  assert.deepEqual(recentDocs([], 3), [], "aucun document");
  assert.deepEqual(recentDocs(undefined, 3), [], "pas de banque : aucun document, sans erreur");
  assert.deepEqual(recentDocs([null, { id: "x", pdf: true }, { id: "y", fin: "", pdf: true }], 3), [], "relevés incomplets ignorés");
});

test("Vue globale : la carte Documents remplace le graphique et « Votre prochain pas »", () => {
  const pat = html.slice(html.indexOf('id="tab-patrimoine"'), html.indexOf('id="tab-depenses"'));
  assert.ok(pat.includes('class="card docs-panel"'), "carte Documents dans la Vue globale");
  for (const gone of ['id="chart"', "years-table", "k-horizon", "data-view", "data-age", "savings-glass", "Votre prochain pas", "trajectory-grid"]) {
    assert.ok(!html.includes(gone), `${gone} retiré de la page`);
  }
  assert.ok(!/renderChart|renderYears|S\.view\b/.test(src), "plus aucun appel au graphique dans app.js");
  // la carte Documents est seule sur sa ligne : elle prend toute la largeur libérée
  const docs = pat.indexOf('class="card docs-panel"');
  assert.ok(pat.lastIndexOf('<div class="pat-grid', docs) < pat.lastIndexOf("</section>", docs), "pas dans une grille à deux colonnes");
  // ordre conservé : cartes de synthèse, documents, comptes et budget
  assert.ok(pat.indexOf("overview kpis") < docs && docs < pat.indexOf("lower-grid"));
  // « Consulter » réutilise l'ouverture du PDF de Banque ; le lien mène à Banque
  const from = src.indexOf("function renderPatDocs");
  const fn = src.slice(from, from + src.slice(from).search(/\r?\n  \}\r?\n/));
  assert.ok(fn.length > 100 && fn.length < 3000, "fonction renderPatDocs trouvée");
  assert.match(fn, /openPdf\(r, /);
  assert.match(fn, /recentDocs\(bankOf\(S\.doc\)\.releves, 3\)/);
  assert.ok(!/IDB\.(put|del)|saveBank|removeReleve/.test(fn), "la carte ne modifie ni ne supprime aucun document");
  assert.match(src, /\$\("docs-open-bank"\)\.addEventListener\("click", \(\) => setTab\("banque"\)\)/);
});

test("Projets : le réglage d'épargne y est déplacé tel quel (mêmes éléments, même enregistrement)", () => {
  const proj = html.slice(html.indexOf('id="tab-simulateur"'), html.indexOf("<footer"));
  const pat = html.slice(html.indexOf('id="tab-patrimoine"'), html.indexOf('id="tab-depenses"'));
  for (const id of ["save-minus", "save-num", "save-plus", "save-range", "left", "saved-note"]) {
    assert.ok(proj.includes(`id="${id}"`), `${id} dans Projets`);
    assert.ok(!pat.includes(`id="${id}"`), `${id} plus dans la Vue globale`);
  }
  // logique et stockage inchangés : même champ enregistré, même délai, mêmes pas de 10 €
  assert.match(src, /await S\.dbRef\.update\(\{ epargneMensuelle: v \}\);/);
  assert.match(src, /\$\("save-minus"\)\.addEventListener\("click", \(\) => setSaving\(saving\(\) - 10, true\)\);/);
  assert.match(src, /\$\("save-plus"\)\.addEventListener\("click", \(\) => setSaving\(saving\(\) \+ 10, true\)\);/);
  assert.match(src, /const saving = \(\) => \(S\.saving != null \? S\.saving : Number\(S\.doc && S\.doc\.epargneMensuelle\) \|\| 0\);/);
});
// Grille du bas : deux colonnes indépendantes (.lower-col) dès 900 px, 24 px entre colonnes et entre cartes,
// aucune hauteur imposée ni carte étirée. Les fonctions reçoivent la feuille de styles sans commentaires.
function lowerGridBlock(css) {
  const at = css.indexOf("@media (min-width: 900px) {\r\n  .lower-grid {");
  return at > 0 ? css.slice(at, css.indexOf("\n}", at)) : "";
}
// règles (sélecteur, déclarations) de la feuille, les en-têtes @media retirés
function cssRules(css) {
  const out = [];
  const flat = css.replace(/@media[^{]*\{/g, "");
  for (const m of flat.matchAll(/([^{}]+)\{([^}]*)\}/g)) out.push({ sel: m[1].trim(), body: m[2] });
  return out;
}
const LOWER_CARDS = /(\.accounts-panel|\.month-panel|\.last-bank-panel|#hist-card)$/;
function lowerGridOk(css) {
  const block = lowerGridBlock(css);
  if (!/^@media \(min-width: 900px\) \{\s*\.lower-grid \{ grid-template-columns: 1\.15fr 1fr; align-items: start; \}\s*$/.test(block)) return false;
  if (!/(^|\n)\.lower-grid \{ gap: 24px; \}/.test(css)) return false;
  if (!/(^|\n)\.lower-col \{ display: flex; flex-direction: column; gap: 24px; min-width: 0; \}/.test(css)) return false;
  // sous 900 px : une seule colonne
  if (!/@media \(max-width:899px\) \{[^@]*\.lower-grid \{ grid-template-columns: 1fr; \}\s*\.accounts-panel \{ grid-row: auto; \}/.test(css)) return false;
  for (const { sel, body } of cssRules(css)) {
    const parts = sel.split(",").map((s) => s.trim());
    const lower = parts.some((s) => /lower-(col|grid)/.test(s));
    const card = parts.some((s) => LOWER_CARDS.test(s));
    if (!lower && !card) continue;
    // ni hauteur, ni étirement, ni réordonnancement, ni zones ou rangées de grille
    if (/(^|[;\s])(height|min-height|max-height|flex|flex-grow|flex-basis|align-self|order|grid-template-rows|grid-auto-rows|grid-template-areas|grid-area|grid-column)\s*:|stretch|:has\(/.test(body)) return false;
    if (lower && /(^|[;\s])grid-row\s*:/.test(body)) return false;
    // espacement régulier : tout gap de la grille du bas vaut 24 px
    if (lower && [...body.matchAll(/(^|[;\s])gap:\s*([^;]+);/g)].some((g) => g[2].trim() !== "24px")) return false;
  }
  return true;
}
// Partie « Vue globale » de la page : deux colonnes, comptes puis bilan à gauche, budget puis relevés de soldes à droite.
function lowerGridHtmlOk(page) {
  const pat = page.slice(page.indexOf('id="tab-patrimoine"'), page.indexOf('id="tab-depenses"'));
  const start = pat.indexOf('<div class="pat-grid lower-grid">');
  if (start < 0) return false;
  // fin de la grille : le </div> qui ferme le conteneur, à la même indentation que son ouverture
  const end = pat.indexOf("\r\n  </div>", start);
  if (end < 0) return false;
  const grid = pat.slice(start, end);
  const cols = grid.split('<div class="lower-col">');
  if (cols.length !== 3 || cols[0].includes("<section")) return false;
  const [left, right] = [cols[1], cols[2]];
  const inOrder = (s, a, b) => s.indexOf(a) > 0 && s.indexOf(b) > s.indexOf(a);
  const count = (s) => (s.match(/<section /g) || []).length;
  return inOrder(left, "accounts-panel", "last-bank-panel") && count(left) === 2
    && inOrder(right, "month-panel", 'id="hist-card"') && count(right) === 2
    && /<\/section>\r\n    <\/div>\r\n    $/.test(left) && /<\/section>\r\n    <\/div>$/.test(right)
    && !pat.slice(end).includes('id="hist-card"');
}

test("grille du bas : deux colonnes indépendantes, comptes puis bilan à gauche, budget puis relevés de soldes à droite", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(lowerGridBlock(css), "disposition déclarée à partir de 900 px");
  assert.ok(lowerGridOk(css), "deux colonnes alignées en haut, 24 px partout, hauteurs selon le contenu, aucune carte étirée");
  assert.ok(!/repeat\(2, minmax\(0, 1fr\)\)\); \}\s*\.lower-grid \.accounts-panel \{ grid-row: auto/.test(css), "plus de grille à 3 colonnes sur très grand écran");
  // ordre de la page (téléphone, clavier, lecteur d'écran) = ordre visuel : comptes, bilan, budget, relevés de soldes
  assert.ok(lowerGridHtmlOk(html), "comptes et bilan dans la 1re colonne, budget et relevés de soldes dans la 2e");
  // la carte reste cachée sans relevé de soldes : l'attribut est conservé et rien ne l'écrase en CSS
  assert.match(html, /<section class="card" aria-labelledby="hist-title" id="hist-card" hidden>/);
  assert.match(html, /\[hidden\]\{display:none!important\}/, "hidden l'emporte sur display: grid des cartes");
  assert.ok(!/#hist-card[^{]*\{[^}]*display/.test(css), "aucune règle n'affiche #hist-card de force");
  assert.match(src, /const card = \$\("hist-card"\), box = \$\("hist"\);[\s\S]{0,200}card\.hidden = !keys\.length;/, "app.js retrouve la carte par son id");
  // app.js ne dépend ni du parent ni des voisins des cartes
  assert.ok(!/lower-grid|lower-col|parentNode|parentElement|nextElementSibling|previousElementSibling/.test(src), "aucun accès au parent ou aux voisins");
});

test("grille du bas : les dispositions incorrectes sont refusées", () => {
  const good = fs.readFileSync(path.join(root, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(lowerGridOk(good));
  const block = lowerGridBlock(good);
  const rows = '@media (min-width: 900px) {\r\n  .lower-grid { grid-template-areas: "acc bud" "bank hist"; grid-template-rows: auto auto; align-items: start; }\r\n  .lower-grid .accounts-panel { grid-area: acc; }';
  assert.ok(!lowerGridOk(good.replace(block, rows)), "ancienne disposition en rangées refusée");
  assert.ok(!lowerGridOk(good.replace(block, "")), "bloc absent refusé");
  assert.ok(!lowerGridOk(good.replace(block, block.replace("align-items: start", "align-items: stretch"))), "colonnes étirées refusées");
  assert.ok(!lowerGridOk(good.replace(block, block.replace("1.15fr 1fr", "1fr"))), "une seule colonne dès 900 px refusée");
  assert.ok(!lowerGridOk(good.replace(".lower-grid { gap: 24px; }", ".lower-grid { gap: 28px; }")), "écart entre colonnes différent refusé");
  assert.ok(!lowerGridOk(good.replace("flex-direction: column; gap: 24px;", "flex-direction: column; gap: 32px;")), "écart entre cartes différent refusé");
  assert.ok(!lowerGridOk(good.replace(".lower-col { display: flex;", ".lower-col { display: block;")), "colonnes sans espacement refusées");
  assert.ok(!lowerGridOk(good + "\n.lower-col > .card { flex-grow: 1; }"), "carte étirée refusée");
  assert.ok(!lowerGridOk(good + "\n.lower-grid .last-bank-panel { flex: 1; }"), "bilan étiré refusé");
  assert.ok(!lowerGridOk(good + "\n#hist-card { min-height: 400px; }"), "hauteur imposée refusée");
  assert.ok(!lowerGridOk(good + "\n.lower-grid { grid-template-rows: auto 1fr; }"), "rangée étirée refusée");
  assert.ok(!lowerGridOk(good + "\n.lower-col .last-bank-panel { order: 3; }"), "réordonnancement visuel refusé");
  assert.ok(!lowerGridOk(good + "\n.lower-grid .month-panel { grid-column: 1 / -1; }"), "carte sur toute la rangée refusée");
  assert.ok(!lowerGridOk(good.replace(".lower-grid { grid-template-columns: 1fr; }", "")), "une colonne sous 900 px exigée");
  // page : ancienne disposition sans colonnes, bilan à droite, relevés de soldes hors de la grille
  const flat = html.replace(/\r\n    <\/div>(?=\r\n    <div class="lower-col">|\r\n  <\/div>)/g, "").replace(/\r\n    <div class="lower-col">/g, "");
  assert.notEqual(flat, html);
  assert.ok(!lowerGridHtmlOk(flat), "cartes sans colonnes refusées");
  const bank = html.match(/\r\n      <section class="card last-bank-panel"[\s\S]*?<\/section>/)[0];
  const hist = html.match(/\r\n      <section class="card" aria-labelledby="hist-title" id="hist-card" hidden>[\s\S]*?<\/section>/)[0];
  const swapped = html.replace(bank, "\u0000").replace(hist, bank).replace("\u0000", hist);
  assert.notEqual(swapped, html);
  assert.ok(!lowerGridHtmlOk(swapped), "bilan dans la colonne de droite refusé");
  const tabEnd = '\r\n  </div>\r\n\r\n  <div class="panel" id="tab-depenses"';
  const outside = html.replace(hist, "").replace(tabEnd, `${hist}${tabEnd}`);
  assert.notEqual(outside, html);
  assert.ok(!lowerGridHtmlOk(outside), "relevés de soldes hors de la grille refusés");
  const budLeft = html.replace('<div class="lower-col">', '<div class="lower-col"><section class="card month-panel"></section>');
  assert.ok(!lowerGridHtmlOk(budLeft), "budget dans la colonne de gauche refusé");
});

test("ordinateur et ultrawide : marges latérales réduites, le contenu seul dans la colonne centrée", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const app = css.match(/@media \(min-width: 900px\) \{\s*\.app \{([^}]*--content-max[^}]*)\}/);
  assert.ok(app, "mise en page ordinateur trouvée");
  assert.match(app[1], /--content-max: 2400px/);
  assert.match(app[1], /grid-template-columns: minmax\(0, var\(--content-max\)\);/, "une seule colonne : la place du menu est rendue au contenu");
  assert.ok(!/column-gap/.test(app[1]), "plus d'espace menu-contenu");
  assert.match(app[1], /padding: 0 clamp\(16px, 1\.4vw, 32px\)/, "marges latérales de 16 à 32 px");
  assert.match(css, /@media \(min-width: 3000px\) \{\s*\.app \{ --content-max: 2800px; \}/);
  assert.ok(!/--content-max: 1(536|680|800)px/.test(css), "anciennes largeurs maximales retirées");
});

// ---- Menu des rubriques dans l'en-tête (proposition n° 10) ----
// Règles de styles.css, sans commentaires, avec la liste des @media qui les entourent.
function cssRulesMedia(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  let i = 0;
  (function block(media) {
    while (i < css.length) {
      const open = css.indexOf("{", i), close = css.indexOf("}", i);
      if (close >= 0 && (open < 0 || close < open)) { i = close + 1; return; }
      if (open < 0) { i = css.length; return; }
      const head = css.slice(i, open).trim();
      i = open + 1;
      if (head.startsWith("@media")) { block(media.concat(head.slice(6).trim())); continue; }
      const end = css.indexOf("}", i);
      if (!head.startsWith("@")) rules.push({ media, sel: head, body: css.slice(i, end).trim() });
      i = end + 1;
    }
  })([]);
  return rules;
}
const isPhone = (r) => r.media.some((m) => /\(max-width: ?899px\)/.test(m));
const isDesktop = (r) => r.media.some((m) => /\(min-width: ?900px\)/.test(m)) && !isPhone(r);
const TAB_LIST = [["patrimoine", "Vue globale"], ["depenses", "Budget"], ["banque", "Banque"], ["simulateur", "Projets"]];

// Problèmes de structure du menu dans index.html (liste vide = tout va bien).
function navHtmlProblems(h) {
  const p = [];
  if (/<aside\b/.test(h) || /class="side"/.test(h)) p.push("barre latérale encore présente");
  if (/class="brand"/.test(h)) p.push("pictogramme de marque encore présent");
  const a = h.indexOf('<div class="masthead">'), z = h.indexOf('<header class="head">', a);
  if (a < 0 || z < 0) return p.concat("en-tête introuvable");
  const mast = h.slice(a, z);
  const iw = mast.indexOf('class="wordmark"'), iwrap = mast.indexOf('<div class="tabs-wrap">');
  const inav = mast.indexOf('<nav class="tabs" role="tablist" aria-label="Rubriques">'), iend = mast.indexOf("</nav>"), ir = mast.indexOf('<div class="mast-right">');
  if (!(iw >= 0 && iw < iwrap && iwrap < inav && inav < iend && iend < ir)) p.push("ordre logo, menu, MP non respecté dans l'en-tête");
  if ((h.match(/role="tablist"/g) || []).length !== 1) p.push("un seul menu des rubriques attendu");
  const nav = inav >= 0 && iend > inav ? mast.slice(inav, iend) : "";
  if (/settings-open|Réglages/.test(nav)) p.push("Réglages dans le menu des rubriques");
  const all = [...h.matchAll(/<button[^>]*role="tab"[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
  const inNav = [...nav.matchAll(/<button[^>]*role="tab"[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
  if (all.length !== 4 || inNav.length !== 4) p.push("4 onglets attendus, tous dans le menu de l'en-tête");
  TAB_LIST.forEach(([t, label], k) => {
    const b = inNav[k] || "";
    const open = b.slice(0, b.indexOf(">") + 1);
    const want = [`type="button"`, `role="tab"`, `id="t-${t}"`, `data-tab="${t}"`, `aria-controls="tab-${t}"`, `aria-selected="${k === 0}"`];
    for (const w of want) if (!open.includes(w)) p.push(`onglet ${k + 1} : ${w} manquant`);
    if ((k === 0) === open.includes('tabindex="-1"')) p.push(`onglet ${k + 1} : tabindex incorrect`);
    if (!b.includes(`<span>${label}</span>`) || !b.includes('<svg class="ic"')) p.push(`onglet ${k + 1} : libellé ou icône`);
    if (!new RegExp(`id="tab-${t}" role="tabpanel" aria-labelledby="t-${t}"`).test(h)) p.push(`panneau tab-${t} manquant`);
  });
  if (/tabindex="[1-9]/.test(mast)) p.push("tabindex positif dans l'en-tête");
  return p;
}

test("en-tête : les 4 rubriques entre le logo et « MP », dans l'ordre, avec leurs attributs", () => {
  assert.deepEqual(navHtmlProblems(html), []);
  // Réglages reste seulement dans le menu MP, dans l'en-tête, après le menu des rubriques
  const pop = html.indexOf('<div class="profile-pop" id="profile-pop" hidden>');
  assert.ok(pop > html.indexOf("</nav>") && html.indexOf('id="settings-open"') > pop, "Réglages dans le menu MP");
});

test("en-tête : une structure de menu incorrecte est refusée", () => {
  const navStart = html.indexOf('    <div class="tabs-wrap">'), navEnd = html.indexOf('    <div class="mast-right">');
  const navBlock = html.slice(navStart, navEnd), without = html.slice(0, navStart) + html.slice(navEnd);
  const bad = {
    "menu avant le logo": without.replace('    <a class="wordmark"', navBlock + '    <a class="wordmark"'),
    "menu après MP": without.replace('  </div>\r\n  <header class="head">', navBlock + '  </div>\r\n  <header class="head">').replace('  </div>\n  <header class="head">', navBlock + '  </div>\n  <header class="head">'),
    "menu hors de l'en-tête": without.replace('<div class="app" id="app">', '<div class="app" id="app">\n' + navBlock),
    "barre latérale réintroduite": html.replace('<div class="app" id="app">', '<div class="app" id="app">\n  <aside class="side"></aside>'),
    "pictogramme de marque": html.replace('<a class="wordmark"', '<div class="brand"></div><a class="wordmark"'),
    "Budget et Banque inversés": html.replace('id="t-depenses" data-tab="depenses" aria-controls="tab-depenses"', 'id="t-banque" data-tab="banque" aria-controls="tab-banque"'),
    "aria-controls manquant": html.replace(' aria-controls="tab-simulateur"', ""),
    "onglet actif hors tabulation": html.replace('aria-selected="true">', 'aria-selected="true" tabindex="-1">'),
    "Réglages dans le menu": html.replace("</nav>", '<button type="button" id="settings-open">Réglages</button></nav>'),
    "tabindex positif": html.replace('<a class="wordmark"', '<a tabindex="1" class="wordmark"'),
    "second menu": html.replace("</nav>", '</nav><div role="tablist"></div>'),
    "libellé changé": html.replace("<span>Projets</span>", "<span>Simulateur</span>"),
  };
  for (const [name, h] of Object.entries(bad)) {
    assert.notEqual(h, html, `mutation appliquée : ${name}`);
    assert.ok(navHtmlProblems(h).length > 0, `refusé : ${name}`);
  }
});

// Règles attendues pour la barre du bas (sous 900 px) : celles d'avant, la barre s'appelant .side au lieu de .tabs-wrap.
const PHONE_BAR = [
  [".tabs-wrap", "position: fixed; inset: 150px auto auto 24px; width: 82px; height: auto; min-height: 440px; padding: 14px 8px; border: 1px solid #fff8; border-radius: 44px; background: linear-gradient(140deg,#f8f4f075,#e9e3e14a); box-shadow: inset 0 1px 1px #fff8,0 16px 40px #4c314c0c; backdrop-filter: blur(22px); display: flex; flex-direction: column; align-items: center; gap: 30px; z-index: 30; overflow: visible;"],
  [':root[data-theme="dark"] .tabs-wrap', "background: #49384455; border-color: #e9d6e533;"],
  [".tabs-wrap", "inset: auto 50% 17px auto; transform: translateX(50%); height: 66px; min-height: 0; width: 360px; max-width: calc(100% - 24px); padding: 6px 12px; flex-direction: row; gap: 8px; border-radius: 35px; justify-content: space-between; background: #e8e0d9d9; box-shadow: 0 8px 30px #3a0f3425; backdrop-filter: blur(24px);"],
  [".tabs", "flex-direction: row; gap: 2px; flex: 1; justify-content: space-around;"],
  [".tabs button", "width: 58px; height: 52px; min-height: 52px; border-radius: 24px; font-size: 8px; gap: 4px;"],
  [".tabs .ic", "width: 20px; height: 20px;"],
  [".tabs button", "padding: 3px; gap: 3px;"],
  [".tabs-wrap", "bottom: calc(17px + env(safe-area-inset-bottom, 0px));"],
  [".main", "padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px));"],
  [':root[data-theme="light"] .tabs-wrap', "background: var(--surface); border: 1px solid var(--line); box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none;"],
  [':root[data-theme="light"] .tabs-wrap', "background: var(--surface); border-color: var(--line-strong); box-shadow: 0 6px 20px #1f26201a;"],
];
const BAR_LOOK = /(^|;)\s*(position|inset|top|bottom|left|right|transform|width|height|min-height|background|border|border-radius|box-shadow|backdrop-filter|z-index)\s*:/;

// Problèmes du menu dans styles.css (liste vide = tout va bien).
function navCssProblems(cssText) {
  const p = [], rules = cssRulesMedia(cssText);
  for (const r of rules) {
    if (/\.side(?![\w-])/.test(r.sel)) p.push(`règle de l'ancienne barre latérale : ${r.sel}`);
    if (/\.brand\b/.test(r.sel)) p.push(`règle du pictogramme de marque : ${r.sel}`);
    if (/--rail-top/.test(r.body)) p.push("variable du rail encore utilisée");
    if (/^\.app$/.test(r.sel) && /grid-template-columns:[^;]*\b82px/.test(r.body)) p.push("colonne de rail de 82 px");
    const nav = /\.tabs-wrap|\.tabs\b/.test(r.sel);
    if (nav && !isPhone(r) && /\.tabs-wrap/.test(r.sel) && !/\.tabs-wrap \.tabs button/.test(r.sel) && BAR_LOOK.test(r.body)) p.push(`style de barre hors du téléphone : ${r.sel} { ${r.body} }`);
    if (nav && isDesktop(r) && /(\.tabs-wrap|\.tabs|\.tabs button)$/.test(r.sel) && /(^|;)\s*(height|max-height)\s*:\s*\d/.test(r.body)) p.push(`hauteur figée sur ordinateur : ${r.sel}`);
    if (nav && isDesktop(r) && /(^|;)\s*(order|grid-area|grid-row|grid-column|margin-top)\s*:/.test(r.body)) p.push(`placement forcé sur ordinateur : ${r.sel}`);
    if (nav && isDesktop(r) && /\.tabs-wrap$|\.tabs$/.test(r.sel) && /position\s*:\s*(fixed|absolute|sticky)/.test(r.body)) p.push(`menu sorti du flux sur ordinateur : ${r.sel}`);
  }
  const desk = rules.filter(isDesktop);
  const has = (list, sel, re) => list.some((r) => r.sel === sel && re.test(r.body));
  if (!has(desk, ".app", /grid-template-columns: minmax\(0, var\(--content-max\)\);/)) p.push("une seule colonne de contenu attendue");
  if (!has(desk, ".masthead", /display: grid; grid-template-columns: 1fr auto 1fr;/)) p.push("en-tête en trois colonnes attendu");
  if (!has(desk, ".wordmark", /justify-self: start/) || !has(desk, ".tabs-wrap", /justify-self: center/) || !has(desk, ".mast-right", /justify-self: end/)) p.push("logo à gauche, menu au centre, MP à droite");
  if (!has(desk, ".tabs", /flex-direction: row; gap: 4px;/)) p.push("menu horizontal attendu");
  if (!has(desk, ".tabs button", /min-height: 44px;.*padding: 0 14px;.*font-size: 14px;.*white-space: nowrap;/)) p.push("boutons du prototype attendus");
  if (!has(desk, ".tabs button::after", /bottom: 4px; height: 2px;/) || !has(desk, '.tabs button[aria-selected="true"]::after', /background: var\(--brand\)/)) p.push("soulignement sauge de la rubrique active");
  if (!has(desk, ':root[data-theme] .tabs-wrap .tabs button[aria-selected="true"]', /background: transparent; color: var\(--nav-on-ink\); font-weight: 600;/)) p.push("rubrique active sans fond plein");
  if (!has(desk, ".tabs button:focus-visible", /outline: 2px solid var\(--focus\); outline-offset: 2px;/)) p.push("contour de focus visible");
  const mid = rules.filter((r) => r.media.some((m) => /\(min-width: 900px\) and \(max-width: 1099px\)/.test(m)));
  if (!has(mid, ".tabs .ic", /display: none/)) p.push("icônes masquées de 900 à 1099 px");
  // barre du bas : mêmes règles qu'avant, dans le même ordre, sous 900 px seulement
  const phone = rules.filter(isPhone);
  let k = -1;
  for (const [sel, body] of PHONE_BAR) {
    const at = phone.findIndex((r, j) => j > k && r.sel === sel && r.body === body);
    if (at < 0) { p.push(`règle de la barre du bas absente ou déplacée : ${sel} { ${body} }`); continue; }
    k = at;
  }
  return p;
}

test("menu dans l'en-tête sur ordinateur, barre du bas inchangée sur téléphone et tablette", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.deepEqual(navCssProblems(css), []);
  // le thème ivoire et sauge reste le dernier bloc
  assert.ok(css.lastIndexOf("@media (min-width: 900px)") < css.indexOf("/* thème clair « ivoire"));
});

test("menu dans l'en-tête : les styles incorrects sont refusés", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const ivoire = css.indexOf("/* thème clair « ivoire");
  const add = (txt) => css.slice(0, ivoire) + txt + "\n" + css.slice(ivoire);
  const bad = {
    "ancienne barre latérale": add(".side { position: fixed; }"),
    "colonne de rail": css.replace("grid-template-columns: minmax(0, var(--content-max));", "grid-template-columns: 82px minmax(0, var(--content-max));"),
    "pictogramme": add(".brand { display: none; }"),
    "hauteur d'en-tête figée": add("@media (min-width: 900px) { .tabs-wrap { height: 106px; } }"),
    "menu superposé": add("@media (min-width: 900px) { .tabs-wrap { position: absolute; } }"),
    "barre visible sur ordinateur": add(".tabs-wrap { background: var(--surface); }"),
    "menu déplacé par grid-area": add("@media (min-width: 900px) { .tabs-wrap { grid-area: 1 / 1; } }"),
    "icônes toujours visibles": css.replace(/(@media \(min-width: 900px\) and \(max-width: 1099px\) \{\s*)\.tabs \.ic \{ display: none; \}/, "$1"),
    "barre du bas modifiée": css.replace("width: 58px; height: 52px;", "width: 60px; height: 52px;"),
    "marge de sécurité retirée": css.replace(".tabs-wrap { bottom: calc(17px + env(safe-area-inset-bottom, 0px)); }", ""),
    "barre du bas sortie du téléphone": css.replace("@media (max-width: 899px) {\n  .tabs-wrap { position: fixed;", "@media (min-width: 0px) {\n  .tabs-wrap { position: fixed;").replace("@media (max-width: 899px) {\r\n  .tabs-wrap { position: fixed;", "@media (min-width: 0px) {\r\n  .tabs-wrap { position: fixed;"),
    "sans focus visible": css.replace("  .tabs button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }", ""),
    "sans soulignement": css.replace('.tabs button[aria-selected="true"]::after { background: var(--brand); }', ""),
    "menu vertical": css.replace("  .tabs { flex-direction: row; gap: 4px; }", "  .tabs { flex-direction: column; gap: 4px; }"),
  };
  for (const [name, c] of Object.entries(bad)) {
    assert.notEqual(c, css, `mutation appliquée : ${name}`);
    assert.ok(navCssProblems(c).length > 0, `refusé : ${name}`);
  }
});

// Gestionnaire des flèches de la barre d'onglets, extrait de app.js et exécuté avec un setTab factice.
function navKeys(handlerBody) {
  const run = new Function("ev", "S", "TABS", "setTab", handlerBody);
  return (from, key) => {
    const calls = [];
    let prevented = false;
    run({ key, preventDefault: () => { prevented = true; } }, { tab: from }, ["patrimoine", "depenses", "banque", "simulateur"], (t, focus) => calls.push([t, focus]));
    return { calls, prevented };
  };
}
const keyHandler = (s) => (s.match(/b\.addEventListener\("keydown", \(ev\) => \{([\s\S]*?)\n {4}\}\);/) || [])[1];

test("clavier : ←/→ et ↑/↓ changent de rubrique en boucle, Tab n'est pas bloqué", () => {
  const body = keyHandler(src);
  assert.ok(body, "gestionnaire des flèches trouvé");
  assert.match(src, /const TABS = \["patrimoine", "depenses", "banque", "simulateur"\];/, "même ordre que le menu");
  const press = navKeys(body);
  const T = ["patrimoine", "depenses", "banque", "simulateur"];
  T.forEach((t, k) => {
    for (const key of ["ArrowRight", "ArrowDown"]) assert.deepEqual(press(t, key), { calls: [[T[(k + 1) % 4], true]], prevented: true }, `${key} depuis ${t}`);
    for (const key of ["ArrowLeft", "ArrowUp"]) assert.deepEqual(press(t, key), { calls: [[T[(k + 3) % 4], true]], prevented: true }, `${key} depuis ${t}`);
  });
  for (const key of ["Tab", "Enter", " ", "Escape", "a"]) assert.deepEqual(press("banque", key), { calls: [], prevented: false }, `${key} laissé au navigateur`);
  // un seul onglet dans l'ordre de tabulation (l'onglet actif), les autres par les flèches ; focus déplacé par setTab
  assert.match(src, /b\.setAttribute\("aria-selected", String\(on\)\);\s*b\.tabIndex = on \? 0 : -1;/);
  assert.match(src, /if \(focus\) \$\("t-" \+ t\)\.focus\(\);/);
  assert.match(src, /document\.querySelectorAll\("\[data-tab\]"\)\.forEach\(\(b\) => \{\s*b\.addEventListener\("click", \(\) => setTab\(b\.dataset\.tab\)\);/);
});

test("clavier : un gestionnaire sans ← / → ou sans ↑ / ↓ est refusé", () => {
  const body = keyHandler(src);
  const ok = (b) => {
    const press = navKeys(b);
    return ["ArrowRight", "ArrowDown"].every((k) => press("patrimoine", k).calls[0]?.[0] === "depenses")
      && ["ArrowLeft", "ArrowUp"].every((k) => press("patrimoine", k).calls[0]?.[0] === "simulateur")
      && !press("patrimoine", "Tab").prevented;
  };
  assert.ok(ok(body));
  assert.ok(!ok(body.replace('ev.key === "ArrowLeft" || ', "")), "sans ←");
  assert.ok(!ok(body.replace(' || ev.key === "ArrowDown"', "")), "sans ↓");
  assert.ok(!ok(body.replace("const k = TABS.indexOf(S.tab);", "const k = TABS.indexOf(S.tab); if (ev.key === \"Tab\") ev.preventDefault();")), "Tab bloqué");
});
test("Bilan du dernier relevé : titre « Bilan de [mois] » d'après la fin du relevé, avec élision", () => {
  assert.equal(bilanTitle("2026-09-10"), "Bilan de septembre");
  assert.equal(bilanTitle("2026-04-30"), "Bilan d'avril");
  assert.equal(bilanTitle("2026-08-31"), "Bilan d'août");
  assert.equal(bilanTitle("2026-10-31"), "Bilan d'octobre");
  assert.equal(bilanTitle("2027-01-05"), "Bilan de janvier");
  for (const bad of ["", null, undefined, "2026-13-01", "10/09/2026"]) assert.equal(bilanTitle(bad), "Dernier relevé", `date illisible : ${bad}`);
});

test("Bilan du dernier relevé : Entrées et Dépenses en premier, budget prévu sous Dépenses seulement, mêmes calculs", () => {
  const from = src.indexOf("function renderPatBank");
  const fn = src.slice(from, from + src.slice(from).search(/\r?\n  \}\r?\n/));
  assert.ok(fn.length > 500 && fn.length < 5000, "fonction renderPatBank trouvée");
  // mêmes calculs qu'avant : rien de recalculé ni d'enregistré dans les données
  assert.match(fn, /const st = periodStats\(m, last\.id\);/);
  assert.match(fn, /const plan = planTotals\(\);/);
  assert.match(fn, /bilanTitle\(last\.fin\)/);
  assert.match(fn, /when\.textContent = periodLabel\(last\);/, "période exacte sous le titre");
  assert.ok(!/S\.dbRef|saveBank|IDB\.|patrimoine-app/.test(fn), "aucune écriture dans les données");
  // premier niveau : Entrées puis Dépenses ; « Budget prévu » une seule fois, sur la ligne Dépenses, seulement si un budget existe
  const inn = fn.indexOf('fig("Entrées"'), out = fn.indexOf('fig("Dépenses"');
  assert.ok(inn > 0 && out > inn, "Entrées puis Dépenses");
  assert.equal(fn.split("Budget prévu").length, 2, "un seul montant prévu");
  const outLine = fn.slice(out, fn.indexOf("\n", out));
  assert.match(outLine, /plan\.has && plan\.out > 0\.004 \? `Budget prévu : \$\{EUR2\.format\(plan\.out\)\}` : ""/);
  assert.ok(!/plan\./.test(fn.slice(inn, out)), "aucun montant prévu sous Entrées");
  // second niveau, après le séparateur : Mis de côté et Reste, signes conservés, négatifs signalés
  assert.match(fn, /fig\("Mis de côté", signed\(st\.epargne\), tone\(st\.epargne\)\)/);
  assert.match(fn, /fig\("Reste", signed\(st\.reste\), st\.reste < -0\.004 \? "v-bad" : ""\)/);
  assert.ok(fn.indexOf("bilan-main") < fn.indexOf("bilan-sub"));
  // frais d'incident toujours signalés ; état vide et lien vers Banque conservés
  assert.match(fn, /de frais d'incident sur \$\{n > 1 \? `vos \$\{n\} relevés` : "ce relevé"\}/);
  assert.match(fn, /Ajoutez vos relevés PDF dans « Banque »/);
  assert.equal(fn.split('"Ouvrir Banque →"').length, 2);
  assert.match(fn, /setTab\("banque"\)/);
});

test("Bilan du dernier relevé : montants lisibles sans être géants, bloc arrondi en clair, toute la largeur du bloc", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const at = css.indexOf("/* Vue globale : « Bilan de [mois] »");
  assert.ok(at > 0, "styles du bilan trouvés");
  const block = css.slice(at, css.indexOf("/* thème clair « ivoire", at));
  assert.match(block, /\.bilan-v \{[^}]*font-size: clamp\(21px, 6cqi, 28px\)/, "Entrées et Dépenses : 28 px au plus, comme les cartes de synthèse");
  assert.match(block, /\.bilan-sub \.bilan-v \{ font-size: 17px;/, "second niveau plus petit");
  assert.match(block, /\.bilan-sub \{ padding-top: 14px; border-top: 1px solid var\(--line-soft\); \}/, "séparateur léger");
  assert.ok(bilanFullWidth(block), "contenu sur toute la largeur, ni place ni largeur extérieure modifiées");
  assert.match(css, /:root\[data-theme="light"\] \.last-bank-panel \{ padding: 18px 23px; border-radius: 26px; \}/, "coins arrondis comme les autres cartes");
  const head = html.slice(html.indexOf('class="card last-bank-panel"'), html.indexOf('id="pat-bank"'));
  assert.match(head, /<h2 id="pk-title">Dernier relevé<\/h2><span class="bilan-period" id="pat-bank-when"><\/span>/);
  assert.match(head, /<svg class="ic bilan-ico"[^>]*aria-hidden="true"/, "icône décorative, ignorée par les lecteurs d'écran");
});

// Bloc du bilan : aucune largeur (hors icône) ni placement dans la grille ; les deux lignes partagent le même partage
// en deux moitiés (.bilan-row, .bilan-fig en flex: 1 1 0) pour que Dépenses commence au milieu et Reste soit dessous.
function bilanFullWidth(block) {
  const rest = block.replace(/svg\.bilan-ico \{[^}]*\}/, "");
  return !/last-bank-panel \{|grid-area|width:/.test(rest)
    && /\.bilan-row \{ display: flex; flex-wrap: wrap; gap: 14px 24px; \}/.test(rest)
    && /\.bilan-fig \{ flex: 1 1 0;/.test(rest)
    && !/\.bilan-(main|sub)[^{]*\{[^}]*(gap|flex|justify)/.test(rest);
}

test("Bilan du dernier relevé : le contenu occupe toute la largeur du bloc, Entrées / Dépenses et Mis de côté / Reste alignés", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const at = css.indexOf("/* Vue globale : « Bilan de [mois] »");
  const block = css.slice(at, css.indexOf("/* thème clair « ivoire", at));
  assert.ok(!css.includes("#pat-bank > * { max-width"), "plus de largeur de lecture de 760 px");
  assert.ok(!/#pat-bank[^{]*\{[^}]*width/.test(css), "aucune largeur pour #pat-bank, dans aucun thème");
  const noIcon = block.replace(/svg\.bilan-ico \{[^}]*\}/, "");
  assert.equal((noIcon.match(/width:/g) || []).length, 0, "aucune autre largeur que celle de l'icône");
  assert.ok(html.indexOf('id="pat-bank"') > html.indexOf('class="card last-bank-panel"'), "#pat-bank est bien dans le bloc du bilan");
  // deux chiffres par ligne : Entrées et Dépenses, puis Mis de côté et Reste
  const from = src.indexOf("function renderPatBank");
  const fn = src.slice(from, from + src.slice(from).search(/\r?\n  \}\r?\n/));
  const mainAppend = fn.slice(fn.indexOf("main.append("), fn.indexOf("const sub ="));
  const subAppend = fn.slice(fn.indexOf("sub.append("), fn.indexOf("box.append(main, sub)"));
  assert.equal((mainAppend.match(/fig\(/g) || []).length, 2, "deux chiffres au 1er niveau");
  assert.equal((subAppend.match(/fig\(/g) || []).length, 2, "deux chiffres au 2e niveau");
});

test("Bilan du dernier relevé : toute largeur réintroduite ou tout placement du bloc est refusé", () => {
  const base = ".bilan-row { display: flex; flex-wrap: wrap; gap: 14px 24px; }\n.bilan-fig { flex: 1 1 0; display: grid; }\nsvg.bilan-ico { width: 22px; height: 22px; }\n";
  assert.ok(bilanFullWidth(base), "contenu sur toute la largeur accepté");
  assert.ok(!bilanFullWidth(base + ".last-bank-panel #pat-bank > * { max-width: 760px; }"), "largeur de lecture de 760 px refusée");
  assert.ok(!bilanFullWidth(base + ".last-bank-panel { max-width: 900px; }"), "largeur du bloc refusée");
  assert.ok(!bilanFullWidth(base + ".lower-grid .last-bank-panel { grid-area: acc; }"), "déplacement du bloc refusé");
  assert.ok(!bilanFullWidth(base + ".bilan-row { max-width: 600px; }"), "autre largeur refusée");
  assert.ok(!bilanFullWidth(base + ".bilan-sub { gap: 8px; }"), "Reste décalé par rapport à Dépenses refusé");
  assert.ok(!bilanFullWidth(base.replace("flex: 1 1 0;", "flex: 0 0 auto;")), "chiffres serrés à gauche refusés");
});

// Règle du « Disponible après épargne » telle qu'elle était écrite avant (étape 11) : « — » dès que la marge est ≤ 0.
// Elle sert à vérifier que rien ne change au-delà du cas demandé (marge ≤ 0 avec un budget, et la couleur d'un négatif).
function oldLeftRule(marge, sav) {
  if (marge > 0) {
    const rest = marge - sav;
    return { text: EUR2.format(rest), low: rest < 50, sub: `par mois, après ${EUR0.format(sav)} d'épargne` };
  }
  return { text: "—", low: false, sub: "remplissez « Budget »" };
}
const ABSENT = { text: "—", low: false, neg: false, sub: "remplissez « Budget »" };
const subOf = (s) => `par mois, après ${EUR0.format(s)} d'épargne`;
// une règle est juste si : « — » sans budget ; avec budget, marge − épargne même à 0 ou en dessous,
// rouge (neg) en dessous de 0, orange (low) de 0 à moins de 50 €, jamais les deux
function leftRuleOk(rule) {
  for (const m of [-500, -0.01, 0, 0.01, 49.99, 50, 50.01, 120, 449.99, 450, 1100.5, 3000])
    for (const s of [0, 0.5, 49, 50, 400, 1100.5, 5000]) {
      const a = rule(m, s, false), b = rule(m, s, true), rest = m - s;
      if (JSON.stringify(a) !== JSON.stringify(ABSENT)) return false;
      if (b.text !== EUR2.format(rest) || b.sub !== subOf(s)) return false;
      if (b.neg !== rest < 0 || b.low !== (rest >= 0 && rest < 50)) return false;
    }
  return true;
}
const fnSrc = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf("\n  function ", src.indexOf(`function ${name}(`) + 10));
function fakeEl() {
  const cls = new Set();
  return {
    value: "", max: "", parts: [],
    set textContent(v) { this.parts = v === "" ? [] : [String(v)]; },
    get textContent() { return this.parts.map((p) => (typeof p === "string" ? p : p.text)).join(""); },
    append(...a) { this.parts.push(...a); },
    classList: {
      toggle(c, on) { if (on === undefined) on = !cls.has(c); if (on) cls.add(c); else cls.delete(c); return on; },
      add(c) { cls.add(c); }, remove(c) { cls.delete(c); }, contains: (c) => cls.has(c),
    },
  };
}
const fakeDom = (els = {}) => (id) => els[id] || (els[id] = fakeEl());

test("Disponible après épargne : budget absent, total nul, positif, sous 50 €, négatif", () => {
  // budget absent : comportement d'avant conservé, quel que soit le chiffre
  assert.deepEqual(leftCard(0, 0, false), ABSENT);
  assert.deepEqual(leftCard(970, 400, false), ABSENT);
  assert.deepEqual(leftCard(-120, 0), ABSENT, "sans indication de budget : tiret, sans erreur");
  // total nul : 0,00 € en avertissement ; avec de l'épargne : négatif en rouge
  assert.deepEqual(leftCard(0, 0, true), { text: EUR2.format(0), low: true, neg: false, sub: subOf(0) });
  assert.deepEqual(leftCard(0, 400, true), { text: EUR2.format(-400), low: false, neg: true, sub: subOf(400) });
  // positif ≥ 50 € : normal, textes d'avant
  assert.deepEqual(leftCard(970, 400, true), { text: EUR2.format(570), low: false, neg: false, sub: subOf(400) });
  assert.deepEqual(leftCard(450, 400, true), { text: EUR2.format(50), low: false, neg: false, sub: subOf(400) }, "50 € tout juste : pas d'alerte");
  // de 0 à moins de 50 € : avertissement
  assert.deepEqual(leftCard(449.99, 400, true), { text: EUR2.format(49.99), low: true, neg: false, sub: subOf(400) });
  assert.equal(leftCard(400, 400, true).low, true, "0 € tout juste : avertissement, pas rouge");
  assert.equal(leftCard(400, 400, true).neg, false);
  // négatif : rouge, et le rouge l'emporte sur l'orange
  assert.deepEqual(leftCard(300, 400, true), { text: EUR2.format(-100), low: false, neg: true, sub: subOf(400) }, "épargne plus forte que la marge");
  assert.deepEqual(leftCard(-700, 0, true), { text: EUR2.format(-700), low: false, neg: true, sub: subOf(0) }, "dépenses plus fortes que les rentrées : le manque s'affiche");
  assert.deepEqual(leftCard(-120, 50, true), { text: EUR2.format(-170), low: false, neg: true, sub: subOf(50) });
  assert.ok(leftRuleOk(leftCard), "règle complète sur 84 combinaisons");
  // les formats du test sont bien ceux de l'app
  assert.match(src, /const EUR0 = new Intl\.NumberFormat\("fr-FR", \{ style: "currency", currency: "EUR", maximumFractionDigits: 0 \}\);/);
  assert.match(src, /const EUR2 = new Intl\.NumberFormat\("fr-FR", \{ style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 \}\);/);
});

test("Disponible après épargne : rien ne change au-delà de la marge ≤ 0 et de la couleur d'un négatif ; mauvaises règles refusées", () => {
  for (const m of [-500, -0.01, 0, 0.01, 49.99, 50, 50.01, 120, 449.99, 450, 1100.5, 3000])
    for (const s of [0, 0.5, 49, 50, 400, 1100.5, 5000]) {
      const old = oldLeftRule(m, s), now = leftCard(m, s, true), rest = m - s;
      if (m > 0) {
        assert.equal(now.text, old.text, `marge ${m}, épargne ${s} : même montant`);
        assert.equal(now.sub, old.sub);
        // l'alerte d'avant couvre maintenant soit l'orange (0 à < 50 €), soit le rouge (négatif)
        assert.equal(now.low || now.neg, old.low, `marge ${m}, épargne ${s} : même alerte`);
      }
      if (m <= 0) {
        assert.deepEqual(leftCard(m, s, false), { ...old, neg: false }, `marge ${m} sans budget : comme avant`);
        assert.equal(now.text, EUR2.format(rest), `marge ${m} avec budget : montant affiché, plus de tiret`);
      }
    }
  // cas d'échec : l'ancienne règle, un négatif en orange, un mauvais seuil, un zéro en rouge, un tiret malgré le budget
  const oldWithFlag = (m, s, has) => (has ? { ...oldLeftRule(m, s), neg: false } : ABSENT);
  assert.ok(!leftRuleOk(oldWithFlag), "ancienne règle (tiret dès que la marge est ≤ 0) refusée");
  assert.ok(!leftRuleOk((m, s, has) => { const c = leftCard(m, s, has); return has ? { ...c, low: m - s < 50 } : c; }), "négatif aussi en orange refusé");
  assert.ok(!leftRuleOk((m, s, has) => { const c = leftCard(m, s, has); return has ? { ...c, low: m - s >= 0 && m - s < 49 } : c; }), "seuil de 49 € refusé");
  assert.ok(!leftRuleOk((m, s, has) => { const c = leftCard(m, s, has); return has ? { ...c, neg: m - s <= 0, low: m - s > 0 && m - s < 50 } : c; }), "zéro en rouge refusé");
  assert.ok(!leftRuleOk((m, s, has) => (m - s < 0 ? ABSENT : leftCard(m, s, has))), "tiret pour un négatif refusé");
  assert.ok(!leftRuleOk((m, s, has) => leftCard(m, s, true)), "montant affiché sans budget refusé");
});

test("budget renseigné : au moins une ligne (même à 0 €), ou l'ancien champ margeBudget ; sinon absent", () => {
  for (const d of [null, undefined, 0, "x", {}, { budget: {} }, { budget: { recettes: [], depenses: [] } }, { budget: { recettes: "abc", depenses: {} } },
    { margeBudget: null }, { margeBudget: "" }, { margeBudget: "  " }, { margeBudget: "abc" }, { margeBudget: NaN }, { margeBudget: Infinity }, { margeBudget: true },
    { budget: {}, margeBudget: 300 }, { budget: { recettes: [] }, margeBudget: 300 }])
    assert.equal(hasBudget(d), false, JSON.stringify(d));
  for (const d of [{ budget: { recettes: [{ libelle: "Salaire", montant: 0 }], depenses: [] } }, { budget: { depenses: [{ libelle: "Loyer", montant: 0 }] } },
    { budget: { recettes: [{ montant: 2000 }], depenses: [{ montant: 2700 }] } }, { margeBudget: 300 }, { margeBudget: 0 }, { margeBudget: -50 }, { margeBudget: "300" },
    { budget: null, margeBudget: 300 }])
    assert.equal(hasBudget(d), true, JSON.stringify(d));
  // lecture seule
  const doc = { budget: { recettes: [{ libelle: "Salaire", montant: 2000 }], depenses: [] }, margeBudget: 10 };
  const before = JSON.stringify(doc);
  hasBudget(doc);
  assert.equal(JSON.stringify(doc), before);
  // toute marge positive vient d'un budget renseigné : l'affichage d'une marge positive ne peut pas devenir « — »
  const code = src.slice(src.indexOf("  const budgetOf ="), src.indexOf("  const targetRate ="));
  const margeOf = (doc) => new Function("S", `${code}\nreturn margeMois();`)({ doc });
  const docs = [null, {}, { margeBudget: 300 }, { margeBudget: "300" }, { margeBudget: 0 }, { margeBudget: -10 }, { margeBudget: "" },
    { budget: {} }, { budget: {}, margeBudget: 300 }, { budget: { recettes: [{ montant: 100 }] } }, { budget: { recettes: [{ montant: 0 }], depenses: [{ montant: 0 }] } },
    { budget: { recettes: [{ montant: 100 }], depenses: [{ montant: 900 }] } }, { budget: { recettes: [{ montant: "50" }] } }];
  for (const d of docs) if (margeOf(d) > 0) assert.equal(hasBudget(d), true, JSON.stringify(d));
  assert.equal(margeOf({ budget: {}, margeBudget: 300 }), 0, "un objet budget l'emporte sur l'ancien champ, comme margeMois");
});

test("Disponible après épargne : la même règle sur la Vue globale, le Budget et Projets", () => {
  assert.ok(fnSrc("renderFigures").includes('paintLeft("k-left", leftCard(margeMois(), saving(), hasBudget(S.doc)));'), "Vue globale");
  assert.ok(fnSrc("renderBudget").includes('paintLeft("b-left", leftCard(margeMois(), saving(), hasBudget(S.doc)));'), "Budget");
  const lever = fnSrc("renderLever");
  assert.ok(lever.includes("const marge = margeMois();") && lever.includes("const filled = hasBudget(S.doc);") && lever.includes("const c = leftCard(marge, v, filled);"), "Projets");
  assert.equal((src.match(/leftCard\(/g) || []).length, 4, "une définition et trois appels, pas d'autre règle");
  for (const id of ["k-left", "k-left-sub", "b-left", "b-left-sub", "left"]) assert.ok(html.includes(`id="${id}"`), id);
  // paintLeft exécuté : texte, ligne du dessous, orange et rouge ajoutés puis retirés
  const els = {}, $ = fakeDom(els);
  const paint = new Function("$", `${fnSrc("paintLeft")}\nreturn paintLeft;`)($);
  paint("k-left", leftCard(300, 400, true));
  assert.equal(els["k-left"].textContent, EUR2.format(-100));
  assert.equal(els["k-left-sub"].textContent, subOf(400));
  assert.ok(els["k-left"].classList.contains("v-bad") && !els["k-left"].classList.contains("low"), "négatif : rouge seulement");
  paint("k-left", leftCard(430, 400, true));
  assert.ok(els["k-left"].classList.contains("low") && !els["k-left"].classList.contains("v-bad"), "sous 50 € : orange seulement");
  paint("k-left", leftCard(0, 0, false));
  assert.equal(els["k-left"].textContent, "—");
  assert.equal(els["k-left-sub"].textContent, "remplissez « Budget »");
  assert.ok(!els["k-left"].classList.contains("low") && !els["k-left"].classList.contains("v-bad"), "budget absent : aucune couleur");
  // couleurs : rouge existant (--bad) ; .low est !important donc un négatif ne doit pas l'avoir (vérifié plus haut)
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.match(css, /\n\.v-bad \{ color: var\(--bad\); \}/);
  assert.ok(css.indexOf("\n.v-bad {") > css.indexOf("\n.key-avec {"), "le rouge passe devant la couleur sauge du Disponible du Budget");
  assert.match(css, /\n\.left\.v-bad, \.left\.v-bad b \{ color: var\(--bad\); \}/, "Projets : phrase et montant en rouge");
  assert.match(css, /\n\.low \{ color: var\(--warn\)!important; \}/);
});

function runLever(doc, marge, sav, els = {}) {
  const $ = fakeDom(els);
  new Function("$", "el", "document", "S", "saving", "margeMois", "hasBudget", "leftCard", "EUR2", `${fnSrc("renderLever")}\nrenderLever();`)(
    $, (tag, attrs, text) => ({ tag, text }), { activeElement: null }, { doc, canWrite: true }, () => sav, () => marge, hasBudget, leftCard, EUR2);
  return els;
}

test("Projets : phrase du disponible selon le budget, la marge et l'épargne ; curseur inchangé", () => {
  const filled = { budget: { recettes: [{ montant: 2000 }], depenses: [{ montant: 1000 }] } };
  const has = (e, c) => e.left.classList.contains(c);
  // budget absent
  let e = runLever({}, 0, 300);
  assert.equal(e.left.textContent, "Remplissez l'onglet « Budget » pour voir ce qu'il vous reste pour vivre.");
  assert.ok(!has(e, "low") && !has(e, "v-bad"));
  assert.equal(e["save-range"].max, "400", "curseur : même maximum qu'avant");
  // marge positive, disponible ≥ 50 € : phrase d'avant
  e = runLever(filled, 1000, 300);
  assert.equal(e.left.textContent, `Il me reste pour vivre ${EUR2.format(700)} par mois, sur les ${EUR2.format(1000)} qui restent après mes dépenses`);
  assert.equal(e.left.parts[1].tag, "b", "montant en gras");
  assert.ok(!has(e, "low") && !has(e, "v-bad"));
  assert.equal(e["save-range"].max, "1000");
  // marge positive, sous 50 € : orange ; négatif : rouge
  e = runLever(filled, 1000, 980);
  assert.ok(has(e, "low") && !has(e, "v-bad"));
  e = runLever(filled, 1000, 1200);
  assert.equal(e.left.textContent, `Il me reste pour vivre ${EUR2.format(-200)} par mois, sur les ${EUR2.format(1000)} qui restent après mes dépenses`);
  assert.ok(has(e, "v-bad") && !has(e, "low"));
  assert.equal(e["save-range"].max, "1200");
  // marge ≤ 0 avec budget : montant et nouvelle phrase
  const over = { budget: { recettes: [{ montant: 2000 }], depenses: [{ montant: 2700 }] } };
  e = runLever(over, -700, 0);
  assert.equal(e.left.textContent, `Il me reste pour vivre ${EUR2.format(-700)} par mois : mes dépenses prévues atteignent ou dépassent déjà mes rentrées.`);
  assert.ok(has(e, "v-bad") && !has(e, "low"));
  assert.equal(e["save-range"].max, "400");
  e = runLever({ budget: { recettes: [{ montant: 0 }], depenses: [] } }, 0, 0);
  assert.equal(e.left.textContent, `Il me reste pour vivre ${EUR2.format(0)} par mois : mes dépenses prévues atteignent ou dépassent déjà mes rentrées.`);
  assert.ok(has(e, "low") && !has(e, "v-bad"), "0,00 € : avertissement");
  // ancien champ margeBudget
  e = runLever({ margeBudget: -50 }, -50, 0);
  assert.ok(e.left.textContent.startsWith(`Il me reste pour vivre ${EUR2.format(-50)} par mois :`));
  // les couleurs se retirent quand la situation change (même élément)
  const els = runLever(over, -700, 0);
  runLever({}, 0, 0, els);
  assert.ok(!els.left.classList.contains("v-bad") && !els.left.classList.contains("low"), "plus de rouge une fois le budget absent");
  assert.equal(els.left.textContent, "Remplissez l'onglet « Budget » pour voir ce qu'il vous reste pour vivre.");
});

test("Vue globale : « Comprendre les projections » supprimé, le reste de la page en place", () => {
  const removed = (page, js) => !/calculation-notes|Comprendre les projections|Trait plein|Pointillés/.test(page) && !/calculation-notes/.test(js);
  assert.ok(removed(html, src));
  const pat = html.slice(html.indexOf('id="tab-patrimoine"'), html.indexOf('id="tab-depenses"'));
  assert.match(pat, /<\/section>\r\n    <\/div>\r\n  <\/div>\r\n  <\/div>\r\n\r\n  <div class="panel" $/, "l'onglet se termine juste après la grille du bas");
  // cas d'échec : le bloc remis, ou un appel depuis le code
  assert.ok(!removed(html.replace("\r\n  </div>\r\n\r\n  <div class=\"panel\" id=\"tab-depenses\"", "\r\n  <details class=\"calculation-notes\"><summary>Comprendre les projections</summary></details>\r\n  </div>\r\n\r\n  <div class=\"panel\" id=\"tab-depenses\""), src));
  assert.ok(!removed(html, src + '\ndocument.querySelector(".calculation-notes");'));
});

test("en-tête : nombre de comptes accordé, message sans soldes", () => {
  const head = fnSrc("renderHeader");
  const line = head.slice(head.indexOf("    const d = dateLong("), head.indexOf("\n", head.indexOf('$("asof").textContent = `')) );
  const asof = (n) => {
    const els = {};
    new Function("$", "dateLong", "monthLong", "L", "S", line)(fakeDom(els), () => "3 octobre 2026", () => "octobre 2026", { rel: { date: "2026-10-03" }, ym: "2026-10" }, { proj: { comptes: Array(n).fill({}) } });
    return els.asof.textContent;
  };
  assert.equal(asof(1), "Soldes au 3 octobre 2026 · 1 compte");
  assert.equal(asof(2), "Soldes au 3 octobre 2026 · 2 comptes");
  assert.equal(asof(5), "Soldes au 3 octobre 2026 · 5 comptes");
  assert.equal(asof(0), "Soldes au 3 octobre 2026 · 0 comptes");
  assert.notEqual(asof(1), "Soldes au 3 octobre 2026 · 1 comptes", "« 1 comptes » refusé");
  assert.ok(head.includes('"Aucun solde pour l\'instant. Ajoutez vos soldes du mois pour voir vos comptes."'));
  assert.ok(!src.includes("pour voir vos courbes") && !html.includes("pour voir vos courbes"), "ancien message retiré");
});

test("Budget : 4 cartes de synthèse, puis le détail du budget, puis les placements", () => {
  const tab = html.slice(html.indexOf('id="tab-depenses"'), html.indexOf('id="tab-banque"'));
  const kpis = tab.indexOf('<section class="overview kpis budget-kpis"');
  const bud = tab.indexOf('<section class="card month-panel budget-panel"');
  const free = tab.indexOf('aria-labelledby="free-title"');
  assert.ok(kpis >= 0 && kpis < bud && bud < free, "ordre : cartes, Mon budget du mois, Quand mes placements paient mes dépenses");
  const row = tab.slice(kpis, tab.indexOf("</section>", kpis));
  assert.equal((row.match(/class="kpi[ "]/g) || []).length, 4);
  const order = ["b-in", "b-out", "b-saving", "b-left"].map((id) => row.indexOf(`id="${id}"`));
  assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), "Ce qui rentre, Ce que je dépense, Mis de côté, Disponible");
  assert.match(row, /class="kpi kpi-total kpi-left">\s*<span class="kpi-label">DISPONIBLE APRÈS ÉPARGNE<\/span>/, "Disponible mis en avant");
  // la barre est en tête de la carte du budget, avant les tableaux et le formulaire
  const card = tab.slice(bud, free);
  assert.ok(card.indexOf('class="flow-bar"') < card.indexOf('id="bud-view"') && card.indexOf('id="bud-view"') < card.indexOf('id="bud-edit"'));
  for (const id of ["bud-edit-btn", "b-flow-spending", "b-flow-saving", "b-cash-spending", "b-cash-saving", "b-cash-left"]) assert.ok(card.includes(`id="${id}"`), id);
  // l'ancien « Ce qu'il me reste » (avant épargne) a disparu
  for (const gone of ["b-rest", "b-rest-sub"]) assert.ok(!html.includes(`"${gone}"`) && !src.includes(`"${gone}"`), `${gone} retiré`);
  assert.ok(!tab.includes("Ce qu'il me reste"));
});

test("Budget : barre et Mis de côté calculés comme sur la Vue globale", () => {
  const fn = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf("\n  function ", src.indexOf(`function ${name}(`) + 10));
  const bud = fn("renderBudget"), at = fn("renderAtelier");
  assert.ok(bud.includes("const f = cashFlow(t, saving());") && bud.includes("const t = budgetTotals(S.doc);"));
  assert.ok(at.includes("const f = cashFlow(budgetTotals(doc), saving());"));
  for (const [b, a] of [
    ['$("b-saving").textContent = S.doc ? EUR0.format(saving()) : "—";', '$("k-saving").textContent = doc ? EUR0.format(saving()) : "—";'],
    ['$("b-saving-sub").textContent = f && f.ratio != null ? `${f.ratio} % de vos revenus` : "par mois";', '$("saving-ratio").textContent = f && f.ratio != null ? `${f.ratio} % de vos revenus` : "par mois";'],
    ['$("b-cash-left-item").classList.toggle("v-bad", !!f && f.left < 0);', '$("cash-left-item").classList.toggle("v-bad", !!f && f.left < 0);'],
    ['$("b-flow-spending").style.width = `${f ? f.wSpending : 0}%`;', '$("flow-spending").style.width = `${f ? f.wSpending : 0}%`;'],
    ['$("b-flow-saving").style.width = `${f ? f.wSaving : 0}%`;', '$("flow-saving").style.width = `${f ? f.wSaving : 0}%`;'],
  ]) { assert.ok(bud.includes(b), b); assert.ok(at.includes(a), a); }
  // « Disponible » négatif : rouge sur tout le libellé, plus l'ancien orange (« low ») sur le seul montant
  assert.ok(!/\$\("(b-)?cash-left"\)\.classList\.toggle\("low"/.test(src), "plus d'orange sur le montant Disponible des barres");
  // les chiffres du haut sont mis à jour avant le retour anticipé du mode modification
  assert.ok(bud.indexOf('paintLeft("b-left"') < bud.indexOf("if (S.budEditing) return;"));
});

test("Budget : styles placés avant le bloc du bilan, sans règle propre au thème sombre", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const a = css.indexOf("/* Budget : 4 cartes de synthèse");
  const b = css.indexOf("/* Vue globale : « Bilan de [mois] »");
  assert.ok(a > 0 && a < b && b < css.indexOf("/* thème clair « ivoire"), "avant le bilan, le thème ivoire reste le dernier bloc");
  const block = css.slice(a, b);
  assert.ok(!/data-theme/.test(block), "aucune règle de thème");
  assert.ok(!/gradient\(|backdrop-filter/.test(block));
});
