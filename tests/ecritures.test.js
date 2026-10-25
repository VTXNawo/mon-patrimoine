// Tests de l'enregistrement sur l'appareil (localStore) : écriture réussie, écriture refusée, sauvegarde.
// Lancer : node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Le bloc testé est pris tel quel dans app.js, entre les marqueurs STORE-START et STORE-END.
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = src.indexOf("/*STORE-START*/");
const end = src.indexOf("/*STORE-END*/");
assert.ok(start >= 0 && end > start, "marqueurs STORE-START / STORE-END introuvables dans app.js");
const block = src.slice(start, end);

const KEY = "patrimoine-app";

/** Charge le bloc avec un faux localStorage, qu'on peut faire refuser les écritures. */
function load(saved) {
  const mem = new Map();
  if (saved !== undefined) mem.set(KEY, JSON.stringify(saved));
  const storage = {
    fail: null,
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { if (storage.fail) throw storage.fail; mem.set(k, String(v)); },
  };
  const reports = [];
  const S = { doc: null, saving: null, rate: null, saveTimer: 0, rateTimer: 0 };
  const make = new Function("S", "localStorage", "reportWrite", "todayIso", `${block}\nreturn { localStore, persist, backupText, retrySave };`);
  const api = make(S, storage, (e) => reports.push(e), () => "2026-10-24");
  return { ...api, S, storage, mem, reports, saved: () => JSON.parse(mem.get(KEY)) };
}
const quotaError = () => new DOMException("The quota has been exceeded.", "QuotaExceededError");

test("écriture réussie : le document est enregistré sous la même clé et au même format", async () => {
  const t = load();
  const store = t.localStore(KEY, null);
  const doc = { comptes: [{ id: "lj", nom: "Livret Jeune", taux: 0.03 }], releves: { "2026-10": { soldes: { lj: 1200 }, date: "2026-10-24" } } };
  await store.set(doc);
  assert.equal(t.mem.get(KEY), JSON.stringify(doc), "même JSON, même clé");
  assert.deepEqual(t.reports, [null], "succès signalé (efface un éventuel avertissement)");

  await store.update({ epargneMensuelle: 150 });
  assert.equal(t.saved().epargneMensuelle, 150);
  assert.equal(t.S.doc.epargneMensuelle, 150, "update met aussi S.doc à jour");

  // l'app rouverte relit bien ce qui a été écrit
  const reopened = t.localStore(KEY, null);
  assert.deepEqual(reopened.doc, { ...doc, epargneMensuelle: 150 });
});

test("écriture refusée (stockage plein) : l'erreur remonte, les changements restent en mémoire", async () => {
  const before = { budget: { recettes: [], depenses: [{ id: "a", nom: "Engie", montant: 60 }] } };
  const t = load(before);
  const store = t.localStore(KEY, null);
  t.storage.fail = quotaError();
  const next = { budget: { recettes: [], depenses: [{ id: "a", nom: "Engie", montant: 75 }] } };

  await assert.rejects(store.set(next), (e) => e.kept === true && e.code === "quota_exceeded");
  assert.deepEqual(store.doc, next, "le nouveau document est gardé en mémoire");
  assert.deepEqual(t.saved(), before, "l'appareil garde l'ancienne version, intacte");
  assert.equal(t.reports.length, 1);
  assert.equal(t.reports[0].code, "quota_exceeded", "l'avertissement est déclenché avec la raison");
});

test("écriture refusée (stockage bloqué) : raison « storage_failed »", async () => {
  const t = load();
  const store = t.localStore(KEY, null);
  t.storage.fail = new DOMException("The operation is insecure.", "SecurityError");
  await assert.rejects(store.set({ comptes: [] }), (e) => e.kept === true && e.code === "storage_failed");
});

test("update refusé : S.doc contient quand même le changement", async () => {
  const t = load({ epargneMensuelle: 100 });
  const store = t.localStore(KEY, null);
  t.storage.fail = quotaError();
  await assert.rejects(store.update({ epargneMensuelle: 200 }), (e) => e.kept === true);
  assert.equal(t.S.doc.epargneMensuelle, 200);
  assert.equal(t.saved().epargneMensuelle, 100);
});

test("persist : laisse continuer après un refus de l'appareil, remonte les autres erreurs", async () => {
  const t = load();
  const kept = Object.assign(new Error("x"), { kept: true });
  const other = Object.assign(new Error("y"), { code: "invalid_argument" });
  await t.persist(Promise.reject(kept));
  await assert.rejects(t.persist(Promise.reject(other)), (e) => e === other);
  await t.persist(Promise.resolve());
});

test("la sauvegarde (export) contient les changements non enregistrés, puis l'enregistrement reprend", async () => {
  const t = load({ budget: { recettes: [], depenses: [] }, epargneMensuelle: 100 });
  const store = t.localStore(KEY, null);
  t.S.doc = store.doc;
  t.storage.fail = quotaError();

  // ce que font saveBudget / saveBank / saveEdit : persist(...) puis S.doc = next
  const next = { ...t.S.doc, budget: { recettes: [{ id: "r", nom: "Salaire", montant: 1400 }], depenses: [] } };
  await t.persist(store.set(next));
  t.S.doc = next;
  t.S.saving = 250; // curseur d'épargne pas encore enregistré

  const { name, text } = t.backupText();
  const data = JSON.parse(text);
  assert.equal(name, "patrimoine-donnees-2026-10-24.json");
  assert.equal(data.budget.recettes[0].nom, "Salaire", "le budget non enregistré est dans l'export");
  assert.equal(data.epargneMensuelle, 250, "l'épargne en cours est dans l'export");
  assert.equal(data._export, "2026-10-24");
  assert.equal(t.saved().budget.recettes.length, 0, "l'appareil n'a pas ces changements");

  // la place revient : la prochaine écriture enregistre tout, et l'avertissement s'efface
  t.storage.fail = null;
  await store.set(store.doc);
  assert.equal(t.saved().budget.recettes[0].nom, "Salaire");
  assert.equal(t.reports[t.reports.length - 1], null);
});

/* --- « Réessayer d'enregistrer » avec l'épargne et le rendement en attente (écrits 700 ms après le dernier changement) --- */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Prépare l'app après un refus de l'appareil : budget modifié, épargne déjà passée par un update refusé,
 *  puis épargne et rendement changés encore à l'écran, leurs écritures toujours en attente. */
async function afterRefusal() {
  const t = load({ budget: { recettes: [], depenses: [] }, epargneMensuelle: 100, rendementCible: 0.03 });
  const store = t.localStore(KEY, null);
  t.S.dbRef = store;
  t.S.doc = store.doc;
  t.storage.fail = quotaError();
  const next = { ...t.S.doc, budget: { recettes: [{ id: "r", nom: "Salaire", montant: 1400 }], depenses: [] } };
  await t.persist(store.set(next));
  t.S.doc = next;
  // le délai de 700 ms est écoulé une première fois : update refusé, gardé en mémoire
  t.S.saving = 200;
  await t.persist(store.update({ epargneMensuelle: 200 }));
  // nouveaux changements à l'écran, pas encore écrits (comme setSaving / setRate pendant leur délai)
  const fired = [];
  t.S.saving = 250;
  t.S.saveTimer = setTimeout(() => { fired.push("epargne"); t.persist(store.update({ epargneMensuelle: 250 })); }, 30);
  t.S.rate = 0.05;
  t.S.rateTimer = setTimeout(() => { fired.push("rendement"); t.persist(store.update({ rendementCible: 0.05 })); }, 30);
  return { t, store, fired };
}

test("réessai réussi pendant le délai : le stockage contient la dernière épargne et le dernier rendement affichés", async () => {
  const { t, fired } = await afterRefusal();
  assert.equal(t.saved().epargneMensuelle, 100, "rien n'est encore sur l'appareil");

  t.storage.fail = null; // la place revient
  await t.retrySave();

  const saved = t.saved();
  assert.equal(saved.epargneMensuelle, 250, "dernière épargne affichée");
  assert.equal(saved.rendementCible, 0.05, "dernier rendement affiché");
  assert.equal(saved.budget.recettes[0].nom, "Salaire", "le changement bloqué avant est aussi enregistré");
  assert.equal(t.reports[t.reports.length - 1], null, "le bandeau s'efface");
  assert.equal(t.S.doc.epargneMensuelle, 250, "S.doc suit ce qui est enregistré");
  // la sauvegarde et le stockage disent la même chose
  const exp = JSON.parse(t.backupText().text);
  delete exp._export;
  assert.deepEqual(exp, saved);
  // les écritures en attente sont annulées : rien ne vient réécrire après coup
  await wait(60);
  assert.deepEqual(fired, []);
});

test("réessai qui échoue encore : le bandeau reste et les valeurs affichées restent exportables", async () => {
  const { t, store } = await afterRefusal();
  const n = t.reports.length;

  await t.retrySave(); // l'appareil refuse toujours : pas d'exception pour l'appelant

  assert.equal(t.reports.length, n + 1);
  assert.equal(t.reports[n].kept, true, "le bandeau est de nouveau signalé (il reste visible)");
  assert.equal(t.saved().epargneMensuelle, 100, "l'appareil n'a toujours que l'ancienne version");
  assert.equal(store.doc.epargneMensuelle, 250, "gardé en mémoire");
  assert.equal(store.doc.rendementCible, 0.05);
  const exp = JSON.parse(t.backupText().text);
  assert.equal(exp.epargneMensuelle, 250, "exportable");
  assert.equal(exp.rendementCible, 0.05, "exportable");
  assert.equal(exp.budget.recettes[0].nom, "Salaire");

  // un second réessai, une fois la place revenue, enregistre tout
  t.storage.fail = null;
  await t.retrySave();
  assert.equal(t.saved().epargneMensuelle, 250);
  assert.equal(t.saved().rendementCible, 0.05);
  assert.equal(t.reports[t.reports.length - 1], null);
});
