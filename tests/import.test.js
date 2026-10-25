// Tests de l'import d'un fichier de données : vérification, copie de l'état précédent, annulation, refus de l'appareil.
// Lancer : node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Les blocs testés sont pris tels quels dans app.js, entre leurs marqueurs.
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
function cut(name) {
  const a = src.indexOf(`/*${name}-START*/`), b = src.indexOf(`/*${name}-END*/`);
  assert.ok(a >= 0 && b > a, `marqueurs ${name}-START / ${name}-END introuvables dans app.js`);
  return src.slice(a, b);
}
const MAIN = "patrimoine-app";
const UNDO = "patrimoine-avant-import";
const UNDO2 = "patrimoine-avant-import-2";
const isCopy = (k) => k === UNDO || k === UNDO2;
const MARK_OPEN = '<script type="application/json" id="donnees">';
const MARK_CLOSE = "<" + "/script>";
const quotaError = () => new DOMException("The quota has been exceeded.", "QuotaExceededError");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Charge les blocs avec un faux localStorage. storage.fail(clé, valeur) → true pour refuser une écriture,
 *  storage.failRemove(clé) → true pour refuser une suppression. t.draw remplace render() de l'app. */
function load(saved, undo, undoKey = UNDO) {
  const mem = new Map();
  if (saved !== undefined) mem.set(MAIN, JSON.stringify(saved));
  if (undo !== undefined) mem.set(undoKey, JSON.stringify(undo));
  const storage = {
    fail: null,
    failRemove: null,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { if (storage.fail && storage.fail(k, String(v))) throw quotaError(); mem.set(k, String(v)); },
    removeItem: (k) => { if (storage.failRemove && storage.failRemove(k)) throw new Error("refusé"); mem.delete(k); },
  };
  const reports = [];
  const S = { doc: null, saving: null, rate: null, saveTimer: 0, rateTimer: 0, undo: null, tab: "depenses", sim: { capital: 1 }, bk: { rel: "r-courant" } };
  const make = new Function("S", "localStorage", "reportWrite", "todayIso", "MARK_OPEN", "MARK_CLOSE", "render",
    `${cut("PROJ")}\n${cut("STORE")}\n${cut("IMPORT")}\n` +
    "return { localStore, persist, project, backupText, parseImport, checkImport, importSummary, readUndo, importDoc, undoImport, rendersWith };");
  const t = { draw: () => {} };
  const api = make(S, storage, (e) => reports.push(e), () => "2026-10-25", MARK_OPEN, MARK_CLOSE, () => t.draw());
  const store = api.localStore(MAIN, null);
  S.dbRef = store;
  S.doc = store.doc;
  return Object.assign(t, {
    ...api, S, store, storage, mem, reports,
    main: () => JSON.parse(mem.get(MAIN)),
    /** Les emplacements où se trouve une copie d'annulation. */
    copies: () => [...mem.keys()].filter(isCopy).sort(),
    /** La copie d'annulation, où qu'elle soit : il ne doit jamais en rester plus d'une. */
    undo: () => {
      const ks = [...mem.keys()].filter(isCopy);
      assert.ok(ks.length <= 1, `une seule copie d'annulation attendue, trouvé : ${ks.join(", ")}`);
      return ks.length ? JSON.parse(mem.get(ks[0])) : null;
    },
  });
}

/** Épargne et rendement changés à l'écran, leurs écritures encore en attente (comme setSaving / setRate). */
function pending(t) {
  const fired = [];
  t.S.saving = 250;
  t.S.saveTimer = setTimeout(() => { fired.push("epargne"); t.persist(t.store.update({ epargneMensuelle: 250 })); }, 30);
  t.S.rate = 0.05;
  t.S.rateTimer = setTimeout(() => { fired.push("rendement"); t.persist(t.store.update({ rendementCible: 0.05 })); }, 30);
  return fired;
}

/* --- données fictives --- */
const current = {
  comptes: [
    { id: "lj", nom: "Livret Jeune", type: "Livret", taux: 0.03, fermeture: "2027-12", transfertVers: "la" },
    { id: "la", nom: "Livret A", type: "Livret", taux: 0.024, recoitEpargne: 1 },
  ],
  releves: {
    "2026-08": { soldes: { lj: 1500, la: 3000 }, date: "2026-08-31" },
    "2026-09": { soldes: { lj: 1550, la: 3100 }, date: "2026-09-30", source: "releve" },
  },
  budget: { recettes: [{ id: "r1", nom: "Salaire", montant: 1400, note: "" }], depenses: [{ id: "d1", nom: "Loyer", montant: 500, note: "<charges comprises>" }] },
  banque: {
    releves: [{ id: "2026-09-30-1234", fichier: "releve.pdf", date: "2026-09-30", debut: "2026-09-01", fin: "2026-09-30", importe: "2026-10-01", titulaire: "M TEST",
      comptes: [{ nom: "C C EUROCOMPTE", cle: null, debut: "2026-09-01", fin: "2026-09-30", soldeDebut: 100, soldeFin: 40, verifie: true, n: 1 }],
      autres: [{ nom: "LIVRET A", solde: 3100 }], frais: 0, pdf: true }],
    ops: [{ id: "2026-09-30-1234:0:0", rel: "2026-09-30-1234", compte: "C C EUROCOMPTE", compteNom: "C C EUROCOMPTE", date: "2026-09-05", valeur: "2026-09-05", libelle: "PRLV SEPA ENGIE", montant: -60 }],
    regles: {},
  },
  epargneMensuelle: 100,
  rendementCible: 0.03,
  naissance: "2000-05",
};
const imported = {
  comptes: [{ id: "la", nom: "Livret A", taux: 0.024, recoitEpargne: 1 }],
  releves: { "2026-10": { soldes: { la: 9000 }, date: "2026-10-20" } },
  budget: { recettes: [], depenses: [{ id: "d9", nom: "Importé", montant: 42, note: "" }] },
  epargneMensuelle: 300,
};

/* --- anciens formats --- */
test("anciens formats d'export : acceptés quand ils sont valides", () => {
  const t = load(current);
  const cases = {
    "sauvegarde .json (avec _export)": JSON.stringify({ ...current, _export: "2026-10-24" }, null, 1),
    "page exportée .html": `<!doctype html><html><head><title>Mon patrimoine</title></head><body>\n${MARK_OPEN}${JSON.stringify({ ...current, _export: "2026-10-24" }).replace(/</g, "\\u003c")}${MARK_CLOSE}\n<script src="app.js"></script></body></html>`,
    "ancienne enveloppe { data }": JSON.stringify({ data: current }),
    "avant l'onglet Ma banque (marge, pas de budget)": JSON.stringify({ comptes: current.comptes, releves: current.releves, margeBudget: 650, epargneMensuelle: 120 }),
    "budget seul": JSON.stringify({ budget: current.budget }),
    "comptes sans soldes": JSON.stringify({ comptes: current.comptes }),
    "fichier avec BOM": "\uFEFF" + JSON.stringify(current),
  };
  for (const [name, text] of Object.entries(cases)) {
    const got = t.parseImport(text);
    assert.deepEqual(t.checkImport(got.doc), [], name);
    assert.equal(got.doc._export, undefined, `${name} : _export retiré`);
  }
  const html = t.parseImport(cases["page exportée .html"]);
  assert.deepEqual(html.doc, current, "la page .html rend exactement les données, y compris les « < »");
  assert.equal(html.exported, "2026-10-24");
  assert.deepEqual(t.parseImport(cases["ancienne enveloppe { data }"]).doc, current);
});

test("fichiers refusés : pas des données de l'app, ou données que l'app ne peut pas afficher", () => {
  const t = load(current);
  for (const text of ["pas du json", "[1,2,3]", '{"autre":"chose"}', "<html><body>rien</body></html>", '{"comptes":'])
    assert.throws(() => t.parseImport(text), undefined, text);

  const broken = {
    "compte vide": { comptes: [null], releves: { "2026-01": { soldes: {} } } },
    "mois de soldes vide": { comptes: [{ id: "a", nom: "A" }], releves: { "2026-01": null, "2026-02": { soldes: { a: 1 } } } },
    "budget illisible": { budget: 1 },
    "ligne de budget vide": { budget: { recettes: [null], depenses: [] } },
    "deux comptes même id": { comptes: [{ id: "a", nom: "A" }, { id: "a", nom: "B" }] },
    "compte sans id": { comptes: [{ nom: "A" }] },
    "compte sans nom": { comptes: [{ id: "a" }] },
    "fermeture illisible": { comptes: [{ id: "a", nom: "A", fermeture: 2027 }] },
    "mois mal daté": { comptes: [{ id: "a", nom: "A" }], releves: { "janvier": { soldes: {} } } },
    "soldes illisibles": { comptes: [{ id: "a", nom: "A" }], releves: { "2026-01": { soldes: "1200" } } },
    "relevé bancaire sans comptes": { comptes: [], banque: { releves: [{ id: "x" }], ops: [] } },
    "opération sans montant": { comptes: [], banque: { releves: [], ops: [{ id: "o", rel: "x", montant: "12,00" }] } },
    "banque illisible": { comptes: [], banque: [] },
    "épargne illisible": { comptes: [], epargneMensuelle: "beaucoup" },
  };
  for (const [name, doc] of Object.entries(broken)) {
    const bad = t.checkImport(doc);
    assert.ok(bad.length > 0, `${name} : doit être refusé`);
    assert.ok(bad.every((m) => typeof m === "string" && m.length > 5), `${name} : raison lisible`);
  }
  // ces deux fichiers étaient acceptés avant le correctif et faisaient planter chaque écran
  assert.throws(() => t.project(broken["compte vide"], 0, "2030-01"));
  assert.throws(() => t.project(broken["mois de soldes vide"], 0, "2030-01"));
});

test("le résumé montré avant de remplacer compte ce que contient le fichier", () => {
  const t = load();
  assert.deepEqual(t.importSummary(current), { comptes: 2, mois: 2, last: "2026-09", budget: true, releves: 1 });
  assert.deepEqual(t.importSummary(null), { comptes: 0, mois: 0, last: "", budget: false, releves: 0 });
});

/* --- import --- */
test("import réussi : le fichier est enregistré, l'état d'avant (valeurs en attente comprises) est gardé à part", async () => {
  const t = load(current);
  const fired = pending(t);
  const r = await t.importDoc(clone(imported));

  assert.deepEqual(r, { ok: true });
  assert.deepEqual(t.main(), imported, "même clé, même format que le fichier");
  assert.deepEqual(t.S.doc, imported);
  const u = t.undo();
  assert.equal(u.date, "2026-10-25");
  assert.deepEqual(u.doc, { ...current, epargneMensuelle: 250, rendementCible: 0.05 }, "copie = ce que l'écran montrait");
  assert.deepEqual(t.S.undo, { date: "2026-10-25" });
  assert.equal(t.S.saving, null);
  assert.equal(t.S.rate, null);
  assert.equal(t.reports[t.reports.length - 1], null, "enregistré : pas d'avertissement");
  await wait(60);
  assert.deepEqual(fired, [], "les écritures en attente de l'ancien état ne viennent pas modifier l'import");
  assert.deepEqual(t.main(), imported);
});

test("import refusé par l'appareil : données, valeurs en attente, avertissement et copie précédente intacts", async () => {
  const previous = { date: "2026-10-01", doc: { comptes: [], epargneMensuelle: 1 } };
  const t = load(current, previous);
  // un changement déjà refusé : l'avertissement est affiché, le budget modifié n'est qu'en mémoire
  t.storage.fail = (k) => k === MAIN;
  const edited = { ...t.S.doc, budget: { recettes: [{ id: "r1", nom: "Salaire", montant: 1500, note: "" }], depenses: [] } };
  await t.persist(t.store.set(edited));
  t.S.doc = edited;
  const docBefore = t.S.doc;
  const fired = pending(t);
  const n = t.reports.length;
  assert.equal(t.reports[n - 1].kept, true, "avertissement affiché avant l'import");

  // l'appareil refuse le fichier importé (il accepte le reste)
  t.storage.fail = (k, v) => k === MAIN && v.includes("Importé");
  const r = await t.importDoc(clone(imported));

  assert.equal(r.ok, false);
  assert.equal(r.step, "write");
  assert.equal(t.S.doc, docBefore, "données affichées inchangées");
  assert.deepEqual(t.main(), current, "appareil inchangé");
  assert.equal(t.S.saving, 250, "valeur en attente gardée");
  assert.equal(t.S.rate, 0.05, "valeur en attente gardée");
  assert.equal(t.reports.length, n, "l'avertissement n'est ni effacé ni remplacé");
  assert.deepEqual(t.undo(), previous, "la copie de l'import précédent n'est pas détruite");
  assert.equal(t.S.undo, null);
  const exp = JSON.parse(t.backupText().text);
  assert.equal(exp.budget.recettes[0].montant, 1500, "le changement non enregistré reste exportable");
  assert.equal(exp.epargneMensuelle, 250);

  // les écritures en attente restent fonctionnelles
  await wait(60);
  assert.deepEqual(fired.sort(), ["epargne", "rendement"]);
  assert.equal(t.main().epargneMensuelle, 250);
  assert.equal(t.main().rendementCible, 0.05);
  assert.equal(t.main().budget.recettes[0].montant, 1500);
  assert.equal(t.reports[t.reports.length - 1], null, "puis l'avertissement s'efface normalement");
});

test("copie impossible (stockage plein) : rien n'est importé, rien n'est perdu", async () => {
  const previous = { date: "2026-10-01", doc: { comptes: [], epargneMensuelle: 1 } };
  const t = load(current, previous);
  const docBefore = t.S.doc;
  const fired = pending(t);
  t.storage.fail = isCopy;
  const r = await t.importDoc(clone(imported));

  assert.deepEqual(r, { ok: false, step: "copy" });
  assert.equal(t.S.doc, docBefore);
  assert.deepEqual(t.main(), current);
  assert.deepEqual(t.undo(), previous, "copie précédente intacte");
  assert.equal(t.reports.length, 0, "pas d'avertissement « non enregistré » : rien n'a changé");
  await wait(60);
  assert.equal(fired.length, 2, "les écritures en attente ont lieu");
  assert.equal(t.main().epargneMensuelle, 250);
});

test("une tentative échouée après un import réussi garde de quoi annuler ce premier import", async () => {
  const t = load(current);
  assert.equal((await t.importDoc(clone(imported))).ok, true);
  const second = { ...clone(imported), comptes: [{ id: "x", nom: "Second" }] };
  t.storage.fail = (k, v) => k === MAIN && v.includes("Second");
  assert.equal((await t.importDoc(second)).ok, false);
  assert.deepEqual(t.undo().doc, current, "la copie d'avant le premier import est revenue");
  assert.deepEqual(t.S.undo, { date: "2026-10-25" });

  t.storage.fail = null;
  assert.equal((await t.undoImport()).ok, true);
  assert.deepEqual(t.main(), current, "l'annulation ramène bien les données d'origine");
});

test("double échec (appareil plein juste après la copie) : la copie de l'import précédent reste intacte", async () => {
  const previous = { date: "2026-10-01", doc: { comptes: [{ id: "p", nom: "Précédent" }], epargneMensuelle: 1 } };
  for (const key of [UNDO, UNDO2]) {
    const t = load(current, previous, key);
    const docBefore = t.S.doc;
    // la copie de cette tentative passe, puis l'appareil refuse tout : les données importées, et toute réécriture
    let n = 0, touched = false;
    t.storage.fail = (k) => { if (k === key) touched = true; return n++ > 0; };
    const r = await t.importDoc(clone(imported));

    assert.deepEqual(r, { ok: false, step: "write" }, key);
    assert.equal(t.S.doc, docBefore, key);
    assert.deepEqual(t.main(), current, `${key} : appareil inchangé`);
    assert.equal(touched, false, `${key} : la copie précédente n'est jamais réécrite`);
    assert.deepEqual(t.copies(), [key], `${key} : la copie de la tentative a disparu`);
    assert.deepEqual(t.undo(), previous, `${key} : la copie précédente est intacte`);
    assert.deepEqual(t.readUndo(), previous, `${key} : c'est elle qui sera proposée`);

    t.storage.fail = null;
    assert.equal((await t.undoImport()).ok, true, `${key} : annulation possible une fois de la place libérée`);
    assert.deepEqual(t.main(), previous.doc);
    assert.deepEqual(t.copies(), []);
  }
});

test("imports successifs : une seule copie, toujours celle d'avant le dernier import", async () => {
  const t = load(current);
  const a = { comptes: [{ id: "a", nom: "A" }] }, b = { comptes: [{ id: "b", nom: "B" }] }, c = { comptes: [{ id: "c", nom: "C" }] };
  await t.importDoc(clone(a));
  assert.deepEqual(t.copies(), [UNDO]);
  assert.deepEqual(t.undo().doc, current);
  await t.importDoc(clone(b));
  assert.deepEqual(t.copies(), [UNDO2], "la nouvelle copie va dans l'emplacement libre");
  assert.deepEqual(t.undo().doc, a);
  await t.importDoc(clone(c));
  assert.deepEqual(t.copies(), [UNDO]);
  assert.deepEqual(t.undo().doc, b);
  assert.equal((await t.undoImport()).ok, true);
  assert.deepEqual(t.main(), b);
  assert.deepEqual(t.copies(), []);
});

test("suppression refusée par l'appareil : la mauvaise copie n'est jamais proposée", async () => {
  const t = load(current);
  const a = { comptes: [{ id: "a", nom: "A" }] }, b = { comptes: [{ id: "b", nom: "B" }] }, c = { comptes: [{ id: "c", nom: "C" }] };
  await t.importDoc(clone(a));
  t.storage.failRemove = (k) => k === UNDO;
  assert.equal((await t.importDoc(clone(b))).ok, true, "l'import lui-même réussit");
  assert.equal(t.copies().length, 2, "l'ancienne copie n'a pas pu être retirée");
  assert.equal(t.readUndo(), null, "deux copies : aucune n'est proposée, plutôt que la mauvaise");
  assert.deepEqual(await t.undoImport(), { ok: false, step: "none" });
  assert.deepEqual(t.main(), b, "rien n'a changé");

  t.storage.failRemove = null;
  assert.equal((await t.importDoc(clone(c))).ok, true);
  assert.deepEqual(t.undo().doc, b, "l'import suivant remet tout en ordre : une copie, la bonne");
});

/* --- essai d'affichage avant l'import --- */
test("essai d'affichage : Patrimoine et Ma banque comme juste après l'import, puis retour à l'écran actuel", () => {
  const t = load(current);
  t.S.saving = 250; t.S.rate = 0.05;
  const keep = { doc: t.S.doc, sim: t.S.sim };
  const calls = [];
  t.draw = () => { calls.push({ doc: t.S.doc, tab: t.S.tab, saving: t.S.saving, rate: t.S.rate, sim: t.S.sim }); if (t.S.doc !== keep.doc) t.S.bk.rel = "choisi-par-render"; };
  const memBefore = new Map(t.mem);
  const doc = clone(imported);

  assert.equal(t.rendersWith(doc), true);
  assert.deepEqual(calls.slice(0, 2).map((c) => c.tab), ["patrimoine", "banque"]);
  for (const c of calls.slice(0, 2)) {
    assert.equal(c.doc, doc);
    assert.equal(c.saving, null, "sans les valeurs en attente, effacées par l'import");
    assert.equal(c.rate, null);
    assert.deepEqual(c.sim, {}, "simulateur remis à zéro, comme après l'import");
  }
  const last = calls[calls.length - 1];
  assert.equal(last.doc, keep.doc, "l'écran est redessiné avec les données actuelles");
  assert.equal(last.tab, "depenses");
  assert.equal(t.S.doc, keep.doc);
  assert.equal(t.S.tab, "depenses");
  assert.equal(t.S.sim, keep.sim);
  assert.equal(t.S.saving, 250);
  assert.equal(t.S.rate, 0.05);
  assert.equal(t.S.bk.rel, "r-courant", "le relevé choisi dans Ma banque est gardé");
  assert.deepEqual(t.mem, memBefore, "rien n'est écrit");
  assert.equal(t.reports.length, 0);
});

test("essai d'affichage qui échoue : fichier refusé, écran et données actuels intacts", () => {
  const t = load(current);
  t.S.saving = 250;
  const keep = t.S.doc;
  const bad = clone(imported);
  for (const where of ["patrimoine", "banque"]) {
    const seen = [];
    t.draw = () => { seen.push(t.S.doc); if (t.S.doc === bad && t.S.tab === where) throw new TypeError("plante"); };
    assert.equal(t.rendersWith(bad), false, where);
    assert.equal(seen[seen.length - 1], keep, `${where} : l'écran revient aux données actuelles`);
    assert.equal(t.S.doc, keep);
    assert.equal(t.S.tab, "depenses");
    assert.equal(t.S.saving, 250);
    assert.equal(t.S.bk.rel, "r-courant");
  }
  // même si l'écran actuel ne se redessine pas, l'essai ne lève pas d'erreur et remet l'état en place
  t.draw = () => { throw new TypeError("plante toujours"); };
  assert.equal(t.rendersWith(bad), false);
  assert.equal(t.S.doc, keep);
  assert.deepEqual(t.main(), current);
});

/* --- annulation --- */
test("annuler l'import : les données d'avant reviennent, la copie disparaît", async () => {
  const t = load(current);
  pending(t);
  await t.importDoc(clone(imported));
  const fired = pending(t); // changé après l'import, pas encore écrit
  const r = await t.undoImport();

  assert.deepEqual(r, { ok: true });
  const back = { ...current, epargneMensuelle: 250, rendementCible: 0.05 };
  assert.deepEqual(t.main(), back);
  assert.deepEqual(t.S.doc, back);
  assert.equal(t.undo(), null);
  assert.equal(t.S.undo, null);
  assert.equal(t.S.saving, null);
  assert.equal(t.reports[t.reports.length - 1], null);
  await wait(60);
  assert.deepEqual(fired, [], "rien ne vient réécrire par-dessus les données revenues");
  assert.deepEqual((await t.undoImport()).step, "none", "un seul niveau d'annulation");
});

test("annulation refusée par l'appareil : rien ne change et la copie reste", async () => {
  const t = load(current);
  await t.importDoc(clone(imported));
  const docBefore = t.S.doc;
  const n = t.reports.length;
  t.storage.fail = (k) => k === MAIN;
  const r = await t.undoImport();

  assert.deepEqual(r, { ok: false, step: "write" });
  assert.equal(t.S.doc, docBefore);
  assert.deepEqual(t.main(), imported);
  assert.deepEqual(t.undo().doc, current);
  assert.deepEqual(t.S.undo, { date: "2026-10-25" });
  assert.equal(t.reports.length, n, "pas d'avertissement trompeur");

  t.storage.fail = null;
  assert.equal((await t.undoImport()).ok, true, "on peut réessayer");
  assert.deepEqual(t.main(), current);
});

test("import sur un appareil vide : pas de copie, et une vieille copie ne peut plus être appliquée", async () => {
  const t = load(undefined, { date: "2025-01-01", doc: { comptes: [] } });
  t.S.doc = null;
  const r = await t.importDoc(clone(imported));
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(t.main(), imported);
  assert.equal(t.undo(), null);
  assert.equal(t.S.undo, null);
});

/* --- PDF --- */
test("l'import et son annulation ne touchent pas aux PDF", async () => {
  const code = cut("STORE") + cut("IMPORT");
  assert.ok(!/\bIDB\b|indexedDB/.test(code), "aucun accès au stockage des PDF dans l'import");
  const t = load(current);
  await t.importDoc(clone(imported));
  await t.undoImport();
  assert.deepEqual(t.main().banque, current.banque, "les relevés reviennent avec leur lien vers le PDF (pdf: true)");
});
