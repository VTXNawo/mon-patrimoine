// Mon patrimoine : toute la logique de l'app.
(() => {
  "use strict";
  /* ---------------- formatting ---------------- */
  const EUR0 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const EUR2 = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PCT = new Intl.NumberFormat("fr-FR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const PCT0 = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
  const eur = (v) => (Math.abs(v) >= 1000 ? EUR0 : EUR2).format(v);
  const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  /*PROJ-START*/
  const toIdx = (ym) => { const [y, m] = String(ym).split("-").map(Number); return y * 12 + (m - 1); };
  const toYm = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;

  /** Month-by-month projection. Before the latest statement both lines follow the statements;
   *  after it, "sans" only earns interest and "avec" also receives `saving` each month. */
  function project(doc, saving, endYm) {
    const comptes = Array.isArray(doc.comptes) ? doc.comptes : [];
    const rel = doc.releves || {};
    const keys = Object.keys(rel).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
    if (!comptes.length || !keys.length) return null;
    const first = toIdx(keys[0]);
    const last = toIdx(keys[keys.length - 1]);
    const end = Math.max(toIdx(endYm), last);
    const rates = comptes.map((c) => Math.pow(1 + (Number(c.taux) || 0), 1 / 12) - 1);
    const closeIdx = comptes.map((c) => (c.fermeture ? toIdx(c.fermeture) : Infinity));
    const passive = (b) => b.reduce((s, v, i) => s + v * (Number(comptes[i].taux) || 0), 0) / 12;
    const sum = (b) => b.reduce((s, v) => s + v, 0);

    function step(prev, t, amount, verse) {
      const b = prev.map((v, i) => v * (1 + rates[i]));
      comptes.forEach((c, i) => {
        if (t > closeIdx[i] && b[i] > 0) {
          const j = comptes.findIndex((x) => x.id === c.transfertVers);
          if (j >= 0) b[j] += b[i];
          b[i] = 0;
        }
      });
      if (amount > 0) {
        const order = comptes
          .map((c, i) => [c, i])
          .filter(([c, i]) => c.recoitEpargne != null && !(t > closeIdx[i]))
          .sort((a, b2) => a[0].recoitEpargne - b2[0].recoitEpargne);
        let rest = amount;
        order.forEach(([c, i], k) => {
          if (rest <= 0) return;
          let d = rest;
          if (c.plafondVersements && k < order.length - 1) {
            d = Math.min(rest, Math.max(0, c.plafondVersements - (verse[c.id] || 0)));
          }
          b[i] += d;
          verse[c.id] = (verse[c.id] || 0) + d;
          rest -= d;
        });
      }
      return b;
    }

    const rows = [];
    let sans = null, avec = null;
    const verse = {};
    for (let t = first; t <= end; t++) {
      const r = rel[toYm(t)];
      if (t <= last) {
        sans = r ? comptes.map((c) => Number(r.soldes && r.soldes[c.id]) || 0) : step(sans, t, 0, {});
        avec = sans.slice();
        comptes.forEach((c, i) => { verse[c.id] = sans[i]; });
      } else {
        sans = step(sans, t, 0, {});
        avec = step(avec, t, saving, verse);
      }
      rows.push({
        t, ym: toYm(t), real: !!r,
        sans: sum(sans), avec: sum(avec),
        sansPassif: passive(sans), avecPassif: passive(avec),
        avecParts: avec.slice(), sansParts: sans.slice(),
      });
    }
    return { rows, comptes, lastIdx: last };
  }
  /*PROJ-END*/

  /*FIN-START*/
  const monthlyRate = (r) => Math.pow(1 + r, 1 / 12) - 1;
  /** Capital whose yearly return `r` pays `dep` every month. */
  const needFor = (dep, r) => (r > 0 ? (dep * 12) / r : Infinity);
  /** Months to grow P into T, adding S at the end of each month at monthly rate i. */
  function monthsTo(P, S, i, T) {
    if (!isFinite(T)) return Infinity;
    if (P >= T) return 0;
    if (i <= 0) return S > 0 ? Math.ceil((T - P) / S) : Infinity;
    const b = P * i + S;
    if (b <= 0) return Infinity;
    return Math.ceil(Math.log((T * i + S) / b) / Math.log(1 + i));
  }
  /** Monthly saving needed to grow P into T in n months at monthly rate i. */
  function savingFor(P, i, T, n) {
    if (!isFinite(T) || n <= 0) return Infinity;
    if (i <= 0) return Math.max(0, (T - P) / n);
    const g = Math.pow(1 + i, n);
    return Math.max(0, ((T - P * g) * i) / (g - 1));
  }
  /*FIN-END*/
  const PCTR = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 2 });
  function dur(n) {
    if (!isFinite(n) || n > 1200) return null;
    const y = Math.floor(n / 12), mo = n % 12;
    const ys = y ? `${y} an${y > 1 ? "s" : ""}` : "", ms = mo ? `${mo} mois` : "";
    return ys && ms ? `${ys} et ${ms}` : (ys || ms || "0 mois");
  }

  const monthLong = (ym) => { const i = toIdx(ym); return `${MONTHS[i % 12]} ${Math.floor(i / 12)}`; };
  const dateLong = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
  };
  const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const todayIso = () => { const d = new Date(); return `${thisMonth()}-${String(d.getDate()).padStart(2, "0")}`; };
  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, text) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };
  const SVGNS = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs = {}, text) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  };

  /* ---------------- state ---------------- */
  const S = {
    doc: null,          // data from the store
    loaded: false,      // the store answered
    dbRef: null,
    canWrite: null,     // null = unknown, keep controls
    noDb: false,
    view: "capital",
    age: 27,
    saving: null,       // local value while editing the lever
    saveTimer: 0,
    proj: null,
    hover: -1,
    editing: false,
    draft: null,
    confirmDel: null,
    tab: "patrimoine",
    budEditing: false,
    budDraft: null,
    rate: null,         // local value while editing the target return
    rateTimer: 0,
    sim: {},            // simulator values the viewer changed
  };
  const TABS = ["patrimoine", "depenses", "banque", "simulateur"];
  const TAB_TITLE = { patrimoine: "Patrimoine", depenses: "Mes dépenses", banque: "Ma banque", simulateur: "Tester" };
  const TAB_SUB = {
    depenses: "Ce qui rentre et ce qui sort chaque mois, d'après votre budget",
    banque: "Vos relevés du Crédit Mutuel comparés à votre budget",
    simulateur: "Combien il vous faudrait placé pour que vos placements paient vos dépenses",
  };
  {
    const h = (location.hash || "").slice(1);
    let t = TABS.includes(h) ? h : null;
    if (!t) { try { const v = localStorage.getItem("patrimoine-tab"); if (TABS.includes(v)) t = v; } catch (e) {} }
    if (t) S.tab = t;
    try { const v = JSON.parse(localStorage.getItem("patrimoine-sim") || "{}"); if (v && typeof v === "object") S.sim = v; } catch (e) {}
  }

  const budgetOf = (doc) => (doc && doc.budget && typeof doc.budget === "object" ? doc.budget : null);
  function budgetTotals(doc) {
    const b = budgetOf(doc);
    if (!b) return null;
    const s = (a) => (Array.isArray(a) ? a : []).reduce((t, x) => t + (Number(x.montant) || 0), 0);
    const r = s(b.recettes), d = s(b.depenses);
    return { recettes: r, depenses: d, reste: r - d };
  }
  const margeMois = () => { const t = budgetTotals(S.doc); return t ? t.reste : (Number(S.doc && S.doc.margeBudget) || 0); };
  const targetRate = () => {
    if (S.rate != null) return S.rate;
    const v = Number(S.doc && S.doc.rendementCible);
    return v > 0 ? v : 0.03;
  };
  const nowIdx = () => toIdx(thisMonth());
  const birthYm = () => (S.doc && /^\d{4}-\d{2}$/.test(S.doc.naissance || "") ? S.doc.naissance : toYm(nowIdx() - 25 * 12));
  const birthIdx = () => toIdx(birthYm());
  const ageNow = () => Math.floor((nowIdx() - birthIdx()) / 12);
  const reach = (n) => { const t = nowIdx() + n; return { ym: toYm(t), age: Math.floor((t - birthIdx()) / 12) }; };
  try { const a = Number(localStorage.getItem("patrimoine-age")); if ([27, 30, 35].includes(a)) S.age = a; } catch (e) {}
  try { const v = localStorage.getItem("patrimoine-view"); if (v === "capital" || v === "passif") S.view = v; } catch (e) {}

  const saving = () => (S.saving != null ? S.saving : Number(S.doc && S.doc.epargneMensuelle) || 0);
  const endYm = () => {
    const [y, m] = birthYm().split("-").map(Number);
    return `${y + S.age}-${String(m).padStart(2, "0")}`;
  };

  /* ---------------- render ---------------- */
  function render() {
    const doc = S.doc;
    const has = doc && Array.isArray(doc.comptes) && doc.releves && Object.keys(doc.releves).length;
    S.proj = has ? project(doc, saving(), endYm()) : null;
    renderHeader();
    renderFigures();
    renderLever();
    renderChart();
    renderYears();
    renderAccounts();
    renderPatBudget();
    renderPatBank();
    renderHistory();
    renderTabs();
    renderBudget();
    renderFreedom();
    renderSim();
    renderBank();
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === S.view)));
    document.querySelectorAll("[data-age]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.age) === S.age)));
    $("chart-title").textContent = S.view === "capital" ? "Mon capital mois par mois" : "Ce que mon argent rapporte tout seul, par mois";
    $("lg-avec").textContent = `Avec ${EUR0.format(saving())} par mois`;
  }

  function latest() {
    if (!S.proj) return null;
    const r = S.proj.rows.find((x) => x.t === S.proj.lastIdx);
    const ym = toYm(S.proj.lastIdx);
    return { row: r, ym, rel: S.doc.releves[ym] };
  }

  function renderHeader() {
    const L = latest();
    const btn = $("btn-edit");
    btn.hidden = !(S.loaded && S.canWrite !== false && S.tab === "patrimoine");
    $("btn-export").hidden = !(S.downloads && S.doc && !S.offline);
    $("btn-import").hidden = !S.app;
    $("btn-backup").hidden = !(S.app && S.doc);
    btn.textContent = S.doc ? "Mettre à jour mes soldes" : "Ajouter mes soldes";
    if (S.tab !== "patrimoine") { $("asof").textContent = TAB_SUB[S.tab] || ""; return; }
    if (!S.loaded) { $("asof").textContent = "Vos comptes s'affichent ici dès qu'ils sont chargés."; return; }
    if (!L) {
      $("asof").textContent = S.app
        ? "Aucune donnée sur cet appareil. Importez votre fichier de données, ou ajoutez vos soldes."
        : S.noDb
        ? "Vos comptes n'ont pas pu être chargés sur cet affichage."
        : "Aucun solde pour l'instant. Ajoutez vos soldes du mois pour voir vos courbes.";
      return;
    }
    const d = dateLong(L.rel && L.rel.date);
    $("asof").textContent = `${d ? "Soldes au " + d : "Soldes de " + monthLong(L.ym)} · ${S.proj.comptes.length} comptes`;
  }

  function renderFigures() {
    const L = latest();
    const marge = margeMois(), kl = $("k-left");
    if (marge > 0) {
      const rest = marge - saving();
      kl.textContent = EUR2.format(rest);
      kl.classList.toggle("low", rest < 50);
      $("k-left-sub").textContent = `par mois, après ${EUR0.format(saving())} d'épargne`;
    } else {
      kl.textContent = "—";
      kl.classList.remove("low");
      $("k-left-sub").textContent = "remplissez « Mes dépenses »";
    }
    if (!L) {
      ["k-total", "k-passif", "k-horizon"].forEach((id) => { $(id).textContent = "—"; });
      return;
    }
    $("k-total").textContent = EUR2.format(L.row.sans);
    $("k-total-sub").textContent = `sur ${S.proj.comptes.length} comptes`;
    const p = $("k-passif");
    p.textContent = "";
    p.append(EUR2.format(L.row.sansPassif), el("small", {}, " /mois"));
    $("k-passif-sub").textContent = `soit ${EUR2.format(L.row.sansPassif * 12)} par an`;
    const end = S.proj.rows[S.proj.rows.length - 1];
    $("k-horizon-label").textContent = `À ${S.age} ans (${monthLong(end.ym)})`;
    $("k-horizon").textContent = eur(end.avec);
    const sub = $("k-horizon-sub");
    sub.textContent = "";
    sub.append(`avec ${EUR0.format(saving())} par mois · `, el("b", {}, eur(end.sans)), " sans rien ajouter");
  }

  function renderLever() {
    const v = saving();
    const num = $("save-num"), rng = $("save-range");
    if (document.activeElement !== num) num.value = String(v);
    const marge = margeMois();
    rng.max = String(marge > 0 ? Math.max(Math.ceil(marge / 10) * 10, v) : Math.max(400, v));
    rng.value = String(v);
    const left = $("left");
    left.textContent = "";
    if (marge > 0) {
      const rest = marge - v;
      left.append("Il me reste pour vivre ", el("b", {}, EUR2.format(rest)), ` par mois, sur les ${EUR2.format(marge)} qui restent après mes dépenses`);
      left.classList.toggle("low", rest < 50);
    } else {
      left.append("Remplissez l'onglet « Mes dépenses » pour voir ce qu'il vous reste pour vivre.");
      left.classList.remove("low");
    }
    const note = $("saved-note");
    if (S.canWrite === false || S.noDb) note.textContent = "Simulation : ce montant n'est pas enregistré.";
  }

  /* ---------------- chart ---------------- */
  let chartW = 0;
  function niceStep(max, count) {
    const raw = max / count;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  function renderChart() {
    const box = $("chart");
    const empty = $("chart-empty");
    box.querySelectorAll("svg, .tip").forEach((n) => n.remove());
    if (!S.proj) {
      empty.hidden = false;
      empty.textContent = "";
      empty.append(el("span", {}, S.loaded
        ? (S.noDb ? "Vos comptes n'ont pas pu être chargés ici." : "Ajoutez vos soldes du mois pour voir la courbe de votre capital.")
        : "La courbe de votre capital apparaît ici dès que vos soldes sont chargés."));
      return;
    }
    empty.hidden = true;
    const rows = S.proj.rows;
    const isCap = S.view === "capital";
    const kS = isCap ? "sans" : "sansPassif";
    const kA = isCap ? "avec" : "avecPassif";
    const W = Math.max(280, box.clientWidth || 600);
    chartW = W;
    const narrow = W < 560;
    const H = narrow ? 250 : 330;
    const m = { t: 18, r: narrow ? 12 : 20, b: 28, l: narrow ? 58 : 70 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const maxV = Math.max(1e-9, ...rows.map((r) => Math.max(r[kS], r[kA])));
    const stepV = niceStep(maxV, narrow ? 4 : 5);
    const top = Math.ceil(maxV / stepV) * stepV;
    const n = rows.length;
    const x = (i) => m.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => m.t + ih - (v / top) * ih;
    const fmtTick = (v) => (top >= 100 ? EUR0.format(v) : (top >= 10 ? EUR0.format(v) : EUR2.format(v)));

    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", tabindex: "0", role: "img",
      "aria-label": `${isCap ? "Capital" : "Revenus passifs par mois"} de ${monthLong(rows[0].ym)} à ${monthLong(rows[n - 1].ym)} : ${eur(rows[n - 1][kA])} avec épargne, ${eur(rows[n - 1][kS])} sans rien ajouter.` });
    const g = sv("g", { class: "grid" });
    const ax = sv("g", { class: "axis" });
    for (let v = 0; v <= top + 1e-9; v += stepV) {
      g.append(sv("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
      ax.append(sv("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, fmtTick(v)));
    }
    svg.append(g);
    svg.append(sv("line", { class: "baseline", x1: m.l, x2: W - m.r, y1: y(0), y2: y(0) }));
    // year ticks on each January
    const janIdx = rows.map((r, i) => (r.t % 12 === 0 ? i : -1)).filter((i) => i >= 0);
    const every = Math.max(1, Math.ceil(janIdx.length / Math.max(2, Math.floor(iw / 64))));
    janIdx.forEach((i, k) => {
      if (k % every) return;
      ax.append(sv("text", { x: x(i), y: H - 8, "text-anchor": "middle" }, String(Math.floor(rows[i].t / 12))));
    });
    svg.append(ax);

    // Livret Jeune closing marker (and any other closing account)
    S.proj.comptes.forEach((c) => {
      if (!c.fermeture) return;
      const i = rows.findIndex((r) => r.t === toIdx(c.fermeture) + 1);
      if (i <= 0) return;
      const mk = sv("g", { class: "marker" });
      mk.append(sv("line", { x1: x(i), x2: x(i), y1: m.t, y2: m.t + ih }));
      const leftSide = x(i) - 126 > m.l;
      mk.append(sv("text", { x: x(i) + (leftSide ? -6 : 6), y: m.t + 10, "text-anchor": leftSide ? "end" : "start" }, `${c.nom} fermé`));
      svg.append(mk);
    });

    const path = (k) => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join("");
    svg.append(sv("path", { class: "line sans", d: path(kS) }));
    svg.append(sv("path", { class: "line avec", d: path(kA) }));
    rows.forEach((r, i) => { if (r.real) svg.append(sv("circle", { class: "dot-real", cx: x(i), cy: y(r[kS]), r: 4.5 })); });

    // end labels, kept apart
    const last = rows[n - 1];
    let ya = y(last[kA]) - 10, ys = y(last[kS]) - 10;
    if (Math.abs(ya - ys) < 16) { if (last[kA] >= last[kS]) ya = ys - 16; else ys = ya - 16; }
    const lab = (yy, name, v) => {
      const t = sv("text", { class: "end-label", x: W - m.r, y: Math.max(m.t + 12, Math.min(m.t + ih - 4, yy)), "text-anchor": "end" });
      t.append(sv("tspan", {}, name + " "), sv("tspan", { class: "v" }, eur(v)));
      return t;
    };
    const endLabels = [lab(ya, `Avec ${EUR0.format(saving())}/mois :`, last[kA]), lab(ys, "Sans rien ajouter :", last[kS])];
    svg.append(...endLabels);

    // hover layer
    const cross = sv("line", { class: "cross", y1: m.t, y2: m.t + ih, visibility: "hidden" });
    const hdS = sv("circle", { class: "hover-dot sans", r: 5, visibility: "hidden" });
    const hdA = sv("circle", { class: "hover-dot avec", r: 5, visibility: "hidden" });
    svg.append(cross, hdS, hdA);
    const hit = sv("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" });
    svg.append(hit);
    box.append(svg);
    // keep the closing-marker label clear of the end labels
    const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    svg.querySelectorAll(".marker text").forEach((t) => {
      try {
        for (let k = 0; k < 12 && endLabels.some((e) => overlap(t.getBBox(), e.getBBox())); k++) {
          t.setAttribute("y", String(Number(t.getAttribute("y")) + 16));
        }
      } catch (e) { /* getBBox unavailable: leave as is */ }
    });
    const tip = el("div", { class: "tip", hidden: "" });
    box.append(tip);

    const show = (i) => {
      if (i < 0 || i >= n) { hide(); return; }
      S.hover = i;
      const r = rows[i];
      [cross].forEach((c) => { c.setAttribute("x1", x(i)); c.setAttribute("x2", x(i)); c.setAttribute("visibility", "visible"); });
      hdS.setAttribute("cx", x(i)); hdS.setAttribute("cy", y(r[kS])); hdS.setAttribute("visibility", "visible");
      hdA.setAttribute("cx", x(i)); hdA.setAttribute("cy", y(r[kA])); hdA.setAttribute("visibility", "visible");
      tip.textContent = "";
      tip.append(el("h3", {}, monthLong(r.ym)));
      if (r.real) tip.append(el("div", { class: "tag" }, "Votre relevé"));
      const unit = isCap ? "" : " /mois";
      const row = (cls, label, v) => {
        const d = el("div", { class: "row" });
        const k = el("span", { class: "k" });
        k.append(el("i", cls === "avec" ? { class: "avec" } : {}), label);
        d.append(k, el("span", { class: "num" }, eur(v) + unit));
        return d;
      };
      tip.append(row("avec", `Avec ${EUR0.format(saving())}/mois`, r[kA]));
      tip.append(row("sans", "Sans rien ajouter", r[kS]));
      const parts = el("div", { class: "parts" });
      parts.append(el("div", { class: "tag" }, isCap ? "Détail avec épargne" : "Capital avec épargne"));
      if (isCap) {
        S.proj.comptes.forEach((c, j) => {
          const d = el("div", { class: "row" });
          d.append(el("span", {}, c.nom), el("span", { class: "num" }, eur(r.avecParts[j])));
          parts.append(d);
        });
      } else {
        const d = el("div", { class: "row" });
        d.append(el("span", {}, "Total"), el("span", { class: "num" }, eur(r.avec)));
        parts.append(d);
      }
      tip.append(parts);
      tip.hidden = false;
      const bw = box.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
      const scale = bw / W;
      let left = x(i) * scale + 14;
      if (left + tw > bw) left = x(i) * scale - tw - 14;
      left = Math.max(0, left);
      let topPx = Math.min(y(Math.max(r[kA], r[kS])) * scale, box.clientHeight - th);
      topPx = Math.max(0, topPx - th / 2);
      tip.style.transform = `translate(${left}px, ${topPx}px)`;
    };
    const hide = () => {
      S.hover = -1;
      tip.hidden = true;
      [cross, hdS, hdA].forEach((c) => c.setAttribute("visibility", "hidden"));
    };
    const fromEvent = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * W;
      return Math.round(((px - m.l) / iw) * (n - 1));
    };
    svg.addEventListener("pointermove", (ev) => show(Math.max(0, Math.min(n - 1, fromEvent(ev)))));
    svg.addEventListener("pointerdown", (ev) => show(Math.max(0, Math.min(n - 1, fromEvent(ev)))));
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") {
        ev.preventDefault();
        const cur = S.hover < 0 ? 0 : S.hover;
        show(Math.max(0, Math.min(n - 1, cur + (ev.key === "ArrowRight" ? 1 : -1))));
      } else if (ev.key === "Home") { ev.preventDefault(); show(0); }
      else if (ev.key === "End") { ev.preventDefault(); show(n - 1); }
      else if (ev.key === "Escape") hide();
    });
  }

  function renderYears() {
    const t = $("years-table");
    t.textContent = "";
    if (!S.proj) return;
    const rows = S.proj.rows;
    const pick = rows.filter((r, i) => i === 0 || r.t % 12 === 0 || i === rows.length - 1);
    const head = el("tr");
    ["Mois", "Sans rien ajouter", `Avec ${EUR0.format(saving())} par mois`, "Rapporte par mois (avec épargne)"].forEach((h, i) => head.append(el("th", i ? { class: "r" } : {}, h)));
    const thead = el("thead"); thead.append(head);
    const tb = el("tbody");
    pick.forEach((r) => {
      const tr = el("tr");
      tr.append(el("td", {}, monthLong(r.ym)));
      tr.append(el("td", { class: "r num" }, eur(r.sans)));
      tr.append(el("td", { class: "r num" }, eur(r.avec)));
      tr.append(el("td", { class: "r num" }, EUR2.format(r.avecPassif)));
      tb.append(tr);
    });
    t.append(thead, tb);
  }

  function renderAccounts() {
    const box = $("acc-list");
    box.textContent = "";
    const L = latest();
    if (!L) {
      box.append(el("p", { class: "muted small" }, S.loaded ? "Aucun compte pour l'instant." : "Chargement de vos comptes…"));
      return;
    }
    const comptes = S.proj.comptes;
    const bal = L.row.sansParts;
    const total = bal.reduce((s, v) => s + Math.max(0, v), 0);
    const bar = el("div", { class: "acc-bar", role: "img", "aria-label": "Répartition entre vos comptes" });
    comptes.forEach((c, i) => {
      if (!(bal[i] > 0) || !(total > 0)) return;
      const seg = el("i", { class: "c" + (i % 5), title: `${c.nom} : ${PCT0.format(bal[i] / total)}` });
      seg.style.flex = `${bal[i] / total} 1 0`;
      bar.append(seg);
    });
    if (total > 0) box.append(bar);
    comptes.forEach((c, i) => {
      const rate = Number(c.taux) || 0;
      const row = el("div", { class: "acc-row" });
      if (c.description) row.title = c.description;
      const info = el("div");
      info.append(el("div", { class: "acc-name" }, c.nom));
      info.append(el("div", { class: "acc-type" }, [c.type || "Compte", PCT.format(rate)].join(" · ")));
      const chips = el("div", { class: "chips" });
      if (c.plafondVersements) {
        const room = Math.max(0, c.plafondVersements - bal[i]);
        chips.append(el("span", { class: "chip" }, `Place avant le plafond : ${EUR2.format(room)}`));
      }
      if (c.fermeture) chips.append(el("span", { class: "chip" }, `À fermer fin ${c.fermeture.slice(0, 4)}`));
      if (chips.childNodes.length) info.append(chips);
      const amt = el("div", { class: "acc-amt" }, EUR2.format(bal[i]));
      if (rate > 0) amt.append(el("span", { class: "acc-gain" }, `+${EUR2.format(bal[i] * rate / 12)} /mois`));
      row.append(el("span", { class: "acc-dot c" + (i % 5), "aria-hidden": "true" }), info, amt);
      box.append(row);
    });
  }

  /* --- résumés sur l'écran Patrimoine : budget et dernier relevé --- */
  function renderPatBudget() {
    const box = $("pat-bud"), sum = $("pat-bud-sum");
    box.textContent = ""; sum.textContent = "";
    const b = budgetOf(S.doc);
    const deps = (b && Array.isArray(b.depenses) ? b.depenses : []).filter((l) => Number(l.montant) > 0)
      .slice().sort((x, y) => Number(y.montant) - Number(x.montant));
    const t = budgetTotals(S.doc);
    if (!deps.length) {
      box.append(el("p", { class: "pk-empty" }, "Ajoutez vos dépenses du mois dans « Mes dépenses » pour les voir ici."));
      const go = el("button", { class: "go", type: "button" }, "Ouvrir Mes dépenses →");
      go.addEventListener("click", () => setTab("depenses"));
      box.append(go);
      return;
    }
    sum.append(`Rentrées ${EUR2.format(t.recettes)} · Dépenses `, el("b", {}, EUR2.format(t.depenses)));
    const max = Number(deps[0].montant) || 1;
    const grid = el("div", { class: "pb-grid" });
    const top = deps.slice(0, 6);
    top.forEach((l) => {
      const v = Number(l.montant) || 0;
      const bar = el("div", { class: "pb-bar", "aria-hidden": "true" });
      const fill = el("i"); fill.style.width = `${Math.max(2, v / max * 100).toFixed(1)}%`;
      bar.append(fill);
      grid.append(el("span", { class: "pb-name", title: l.nom }, l.nom), bar, el("span", { class: "pb-amt" }, EUR2.format(v)));
    });
    const rest = deps.slice(6);
    if (rest.length) {
      const v = rest.reduce((s, l) => s + (Number(l.montant) || 0), 0);
      grid.append(el("span", { class: "pb-more" }, `${rest.length} autre${rest.length > 1 ? "s lignes" : " ligne"}`), el("span"), el("span", { class: "pb-amt pb-more" }, EUR2.format(v)));
    }
    box.append(grid);
  }

  function renderPatBank() {
    const box = $("pat-bank"), when = $("pat-bank-when");
    box.textContent = ""; when.textContent = "";
    const go = el("button", { class: "go", type: "button" }, "Ouvrir Ma banque →");
    const m = RL ? bankModel() : null;
    const last = m && m.releves.length ? m.releves[m.releves.length - 1] : null;
    if (!last) {
      box.append(el("p", { class: "pk-empty" }, "Ajoutez vos relevés PDF dans « Ma banque » pour comparer ce qui s'est passé avec votre budget."));
      go.addEventListener("click", () => setTab("banque"));
      box.append(go);
      return;
    }
    when.textContent = periodChip(last);
    const st = periodStats(m, last.id);
    const plan = planTotals();
    const dl = el("dl", { class: "pk" });
    const row = (k, v, cls, prevu, tot) => {
      const dd = el("dd", { class: [cls, tot ? "tot" : ""].filter(Boolean).join(" ") });
      if (prevu != null && plan.has) dd.append(el("span", { class: "plan" }, `prévu ${EUR0.format(prevu)}`));
      dd.append(v);
      dl.append(el("dt", tot ? { class: "tot" } : {}, k), dd);
    };
    row("Entrées", EUR2.format(st.inn), "", plan.inn);
    row("Dépenses", EUR2.format(st.out), "v-dep", plan.out);
    if (Math.abs(st.epargne) > 0.004) row("Mis de côté", signed(st.epargne), st.epargne > 0 ? "v-good" : "v-bad", plan.epargne);
    row("Reste", signed(st.reste), st.reste < 0 ? "v-bad" : "v-good", null, true);
    box.append(dl);
    let incV = 0;
    m.releves.forEach((r) => { m.b.ops.forEach((o) => { if (o.rel === r.id && m.cat.get(o.id) === "c:incidents") incV -= o.montant; }); });
    if (incV > 0.004) {
      const n = m.releves.length;
      box.append(el("p", { class: "pk-alert" }, `${EUR0.format(incV)} de frais d'incident sur ${n > 1 ? `vos ${n} relevés` : "ce relevé"}.`));
    }
    go.addEventListener("click", () => { S.bk.rel = last.id; S.bk.ask = null; try { localStorage.setItem("patrimoine-bk-rel", last.id); } catch (e) {} setTab("banque"); });
    box.append(go);
  }

  function renderHistory() {
    const card = $("hist-card"), box = $("hist");
    box.textContent = "";
    const rel = (S.doc && S.doc.releves) || {};
    const keys = Object.keys(rel).sort().reverse();
    card.hidden = !keys.length;
    const comptes = (S.doc && S.doc.comptes) || [];
    keys.forEach((k) => {
      const r = rel[k];
      const tot = comptes.reduce((s, c) => s + (Number(r.soldes && r.soldes[c.id]) || 0), 0);
      const row = el("div", { class: "hist-row" });
      const label = el("span");
      label.append(el("b", {}, monthLong(k)), "  ", el("span", { class: "num" }, EUR2.format(tot)));
      row.append(label);
      if (S.canWrite !== false && !S.noDb) {
        const act = el("span", { class: "actions" });
        if (S.confirmDel === k) {
          act.append(el("span", { class: "muted" }, "Supprimer ce relevé ?"));
          const yes = el("button", { class: "btn", type: "button" }, "Oui, supprimer");
          yes.addEventListener("click", () => deleteReleve(k));
          const no = el("button", { class: "btn btn-quiet", type: "button" }, "Non");
          no.addEventListener("click", () => { S.confirmDel = null; renderHistory(); });
          act.append(yes, no);
        } else {
          const del = el("button", { class: "btn btn-quiet", type: "button", "aria-label": `Supprimer le relevé de ${monthLong(k)}` }, "Supprimer");
          del.addEventListener("click", () => { S.confirmDel = k; renderHistory(); });
          act.append(del);
        }
        row.append(act);
      }
      box.append(row);
    });
  }

  /* ---------------- edit panel ---------------- */
  function openEdit() {
    const doc = S.doc || {};
    const comptes = Array.isArray(doc.comptes) ? doc.comptes : [];
    const L = latest();
    S.draft = {
      month: thisMonth(),
      rows: comptes.map((c, i) => ({ ...c, solde: L ? Math.round(L.row.sansParts[i] * 100) / 100 : "", tauxPct: Math.round((Number(c.taux) || 0) * 10000) / 100 })),
    };
    if (!S.draft.rows.length) S.draft.rows.push({ id: "", nom: "", solde: "", tauxPct: 0, isNew: true });
    S.editing = true;
    $("edit").hidden = false;
    $("ed-err").textContent = "";
    $("ed-month").value = S.draft.month;
    $("ed-birth").value = (S.doc && S.doc.naissance) || "";
    renderEditGrid();
    $("ed-month").focus();
  }
  function renderEditGrid() {
    const g = $("ed-grid");
    g.textContent = "";
    g.append(el("span", { class: "h hn" }, "Compte"), el("span", { class: "h" }, "Solde (€)"), el("span", { class: "h" }, "Taux par an (%)"));
    S.draft.rows.forEach((r, i) => {
      const nameCell = el("div", { class: "name-cell" });
      const name = el("input", { type: "text", id: `ed-name-${i}`, "aria-label": "Nom du compte", placeholder: "Nom du compte" });
      name.value = r.nom || "";
      name.addEventListener("input", () => { r.nom = name.value; });
      nameCell.append(name);
      const solde = el("input", { type: "number", id: `ed-solde-${i}`, step: "0.01", min: "0", inputmode: "decimal", "aria-label": `Solde de ${r.nom || "ce compte"}` });
      solde.value = r.solde === "" ? "" : String(r.solde);
      solde.addEventListener("input", () => { r.solde = solde.value; });
      const taux = el("input", { type: "number", id: `ed-taux-${i}`, step: "0.05", min: "0", inputmode: "decimal", "aria-label": `Taux par an de ${r.nom || "ce compte"}, en pourcentage` });
      taux.value = String(r.tauxPct);
      taux.addEventListener("input", () => { r.tauxPct = taux.value; });
      g.append(nameCell, solde, taux);
    });
  }
  function closeEdit() { S.editing = false; S.draft = null; $("edit").hidden = true; }

  async function saveEdit() {
    const err = $("ed-err");
    err.textContent = "";
    const d = S.draft;
    const month = $("ed-month").value;
    if (!/^\d{4}-\d{2}$/.test(month)) { err.textContent = "Choisissez le mois du relevé."; return; }
    const rows = d.rows.filter((r) => (r.nom || "").trim() || String(r.solde).trim());
    if (!rows.length) { err.textContent = "Ajoutez au moins un compte."; return; }
    for (const r of rows) {
      if (!(r.nom || "").trim()) { err.textContent = "Donnez un nom à chaque compte."; return; }
      if (String(r.solde).trim() === "" || !(Number(r.solde) >= 0)) { err.textContent = `Indiquez le solde de « ${r.nom} » (0 si le compte est vide).`; return; }
      if (!(Number(r.tauxPct) >= 0)) { err.textContent = `Le taux de « ${r.nom} » doit être un nombre positif.`; return; }
    }
    const used = new Set();
    const comptes = rows.map((r) => {
      let id = r.id;
      if (!id) {
        id = (r.nom.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "compte").slice(0, 24);
        while (used.has(id) || (S.doc && (S.doc.comptes || []).some((c) => c.id === id))) id += "-2";
      }
      used.add(id);
      const { solde, tauxPct, isNew, ...keep } = r;
      return { ...keep, id, nom: r.nom.trim(), taux: Math.round(Number(r.tauxPct) * 100) / 10000 };
    });
    const soldes = {};
    rows.forEach((r, i) => { soldes[comptes[i].id] = Math.round(Number(r.solde) * 100) / 100; });
    const releve = { soldes, date: month === thisMonth() ? todayIso() : `${month}-01` };
    const next = { ...(S.doc || {}), comptes, releves: { ...((S.doc && S.doc.releves) || {}), [month]: releve } };
    if (next.epargneMensuelle == null) next.epargneMensuelle = saving();
    const birth = $("ed-birth").value;
    if (/^\d{4}-\d{2}$/.test(birth)) next.naissance = birth;
    if (!S.dbRef) {
      S.doc = next; S.loaded = true; closeEdit(); render();
      $("saved-note").textContent = "Affiché ici seulement : vos comptes n'ont pas pu être enregistrés sur cet affichage.";
      return;
    }
    const btn = $("ed-save");
    btn.disabled = true;
    try {
      await S.dbRef.set(next);
      S.doc = next;
      closeEdit();
      render();
    } catch (e) {
      if (e && e.code === "invalid_argument") { S.canWrite = false; err.textContent = "Vous ne pouvez pas modifier ces comptes depuis cet affichage."; }
      else if (e && e.code === "quota_exceeded") err.textContent = "L'espace de stockage est plein : supprimez d'anciens relevés puis réessayez.";
      else err.textContent = "L'enregistrement n'a pas abouti. Vérifiez votre connexion puis réessayez.";
    } finally { btn.disabled = false; }
  }

  async function deleteReleve(k) {
    if (!S.doc || !S.dbRef) return;
    const releves = { ...S.doc.releves };
    delete releves[k];
    const next = { ...S.doc, releves };
    try { await S.dbRef.set(next); S.doc = next; S.confirmDel = null; render(); }
    catch (e) { S.confirmDel = null; renderHistory(); }
  }

  /* ---------------- tabs ---------------- */
  function renderTabs() {
    $("page-title").textContent = TAB_TITLE[S.tab] || "Mon patrimoine";
    TABS.forEach((t) => {
      const on = t === S.tab;
      const b = $("t-" + t);
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      $("tab-" + t).hidden = !on;
    });
  }
  function setTab(t, focus) {
    S.tab = t;
    try { localStorage.setItem("patrimoine-tab", t); } catch (e) {}
    try { history.replaceState(null, "", "#" + t); } catch (e) {}
    renderTabs();
    renderHeader();
    if (t === "patrimoine") renderChart();
    if (t === "banque") renderBank();
    if (focus) $("t-" + t).focus();
  }
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
    b.addEventListener("keydown", (ev) => {
      const k = TABS.indexOf(S.tab);
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") { ev.preventDefault(); setTab(TABS[(k + 1) % TABS.length], true); }
      if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") { ev.preventDefault(); setTab(TABS[(k + TABS.length - 1) % TABS.length], true); }
    });
  });

  /* ---------------- apparence : clair ou sombre ---------------- */
  const darkMq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const themeNow = () => {
    const t = document.documentElement.dataset.theme;
    return t === "dark" || t === "light" ? t : darkMq && darkMq.matches ? "dark" : "light";
  };
  function renderTheme() {
    const t = themeNow();
    document.querySelectorAll("[data-theme-set]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === t)));
  }
  document.querySelectorAll("[data-theme-set]").forEach((b) => b.addEventListener("click", () => {
    document.documentElement.dataset.theme = b.dataset.themeSet;
    try { localStorage.setItem("patrimoine-theme", b.dataset.themeSet); } catch (e) {}
    renderTheme();
  }));
  if (darkMq && darkMq.addEventListener) darkMq.addEventListener("change", renderTheme);
  renderTheme();

  /* ---------------- budget ---------------- */
  const GROUPS = [["recettes", "Ce qui rentre"], ["depenses", "Ce que je dépense"]];
  function renderBudget() {
    const t = budgetTotals(S.doc);
    const b = budgetOf(S.doc);
    $("b-in").textContent = t ? EUR2.format(t.recettes) : "—";
    $("b-out").textContent = t ? EUR2.format(t.depenses) : "—";
    $("b-rest").textContent = t ? EUR2.format(t.reste) : "—";
    $("b-in-sub").textContent = b ? `par mois · ${(b.recettes || []).length} ligne${(b.recettes || []).length > 1 ? "s" : ""}` : "par mois";
    $("b-out-sub").textContent = b ? `par mois · ${(b.depenses || []).length} ligne${(b.depenses || []).length > 1 ? "s" : ""}` : "par mois";
    const rs = $("b-rest-sub");
    rs.textContent = t ? `dont ${EUR0.format(saving())} mis de côté · ${EUR2.format(t.reste - saving())} pour vivre` : "par mois";
    $("bud-edit-btn").hidden = !(S.loaded && S.canWrite !== false) || S.budEditing;
    $("bud-view").hidden = S.budEditing;
    $("bud-edit").hidden = !S.budEditing;
    if (S.budEditing) return;
    const view = $("bud-view");
    view.textContent = "";
    if (!b) {
      view.append(el("p", { class: "muted" }, S.loaded
        ? "Aucune ligne pour l'instant. Cliquez sur « Modifier mes lignes » pour ajouter ce qui rentre et ce que vous dépensez chaque mois."
        : "Chargement de votre budget…"));
      return;
    }
    GROUPS.forEach(([key, title]) => {
      const box = el("div", { class: "bud" });
      box.append(el("h3", {}, title));
      const wrap = el("div", { class: "tscroll" });
      const table = el("table");
      const head = el("tr");
      head.append(el("th", {}, "Ligne"), el("th", { class: "r" }, "Par mois"), el("th", {}, "Remarque"));
      const thead = el("thead"); thead.append(head);
      const tb = el("tbody");
      const lines = Array.isArray(b[key]) ? b[key] : [];
      lines.forEach((l) => {
        const tr = el("tr");
        tr.append(el("td", {}, l.nom || ""), el("td", { class: "r num" }, EUR2.format(Number(l.montant) || 0)), el("td", { class: "note" }, l.note || ""));
        tb.append(tr);
      });
      if (!lines.length) {
        const tr = el("tr"); tr.append(el("td", { class: "muted", colspan: "3" }, "Aucune ligne")); tb.append(tr);
      }
      const tot = lines.reduce((s, l) => s + (Number(l.montant) || 0), 0);
      const tr = el("tr", { class: "total" });
      tr.append(el("td", {}, "Total"), el("td", { class: "r num" }, EUR2.format(tot)), el("td"));
      tb.append(tr);
      table.append(thead, tb);
      wrap.append(table);
      box.append(wrap);
      view.append(box);
    });
  }

  function openBudget() {
    const b = budgetOf(S.doc) || {};
    S.budDraft = {};
    GROUPS.forEach(([key]) => {
      S.budDraft[key] = (Array.isArray(b[key]) ? b[key] : []).map((l) => ({ ...l, montant: String(l.montant ?? "") }));
      if (!S.budDraft[key].length) S.budDraft[key].push({ id: "", nom: "", montant: "", note: "" });
    });
    S.budEditing = true;
    $("bud-err").textContent = "";
    renderBudget();
    renderBudgetEdit();
    const f = $("bud-nom-recettes-0"); if (f) f.focus();
  }
  function renderBudgetEdit() {
    const g = $("bud-edit-grid");
    g.textContent = "";
    GROUPS.forEach(([key, title]) => {
      const box = el("div", { class: "bud" });
      box.append(el("h3", {}, title));
      const totalEl = el("span", { class: "num" });
      const updTotal = () => { totalEl.textContent = EUR2.format(S.budDraft[key].reduce((s, l) => s + (Number(l.montant) || 0), 0)); };
      S.budDraft[key].forEach((l, i) => {
        const row = el("div", { class: "bud-edit-row" });
        const nom = el("input", { type: "text", id: `bud-nom-${key}-${i}`, placeholder: "Ex. : Engie", "aria-label": "Nom de la ligne" });
        nom.value = l.nom || "";
        nom.addEventListener("input", () => { l.nom = nom.value; });
        const mt = el("input", { type: "number", id: `bud-mt-${key}-${i}`, step: "0.01", min: "0", inputmode: "decimal", placeholder: "0,00", "aria-label": `Montant par mois de ${l.nom || "cette ligne"}` });
        mt.value = l.montant;
        mt.addEventListener("input", () => { l.montant = mt.value; updTotal(); });
        const note = el("input", { type: "text", class: "note-in", id: `bud-note-${key}-${i}`, placeholder: "Remarque (facultatif)", "aria-label": "Remarque" });
        note.value = l.note || "";
        note.addEventListener("input", () => { l.note = note.value; });
        const del = el("button", { class: "btn btn-quiet", type: "button", "aria-label": `Retirer ${l.nom || "cette ligne"}` }, "Retirer");
        del.addEventListener("click", () => { S.budDraft[key].splice(i, 1); renderBudgetEdit(); });
        row.append(nom, mt, note, del);
        box.append(row);
      });
      const add = el("button", { class: "btn btn-quiet", type: "button" }, "+ Ajouter une ligne");
      add.addEventListener("click", () => {
        S.budDraft[key].push({ id: "", nom: "", montant: "", note: "" });
        renderBudgetEdit();
        const f = $(`bud-nom-${key}-${S.budDraft[key].length - 1}`); if (f) f.focus();
      });
      const foot = el("div", { class: "actions" });
      foot.append(add, el("span", { class: "muted" }, "Total :"), totalEl);
      updTotal();
      box.append(foot);
      g.append(box);
    });
  }
  function closeBudget() { S.budEditing = false; S.budDraft = null; renderBudget(); }

  async function saveBudget() {
    const err = $("bud-err");
    err.textContent = "";
    const next = {};
    let n = 0;
    for (const [key] of GROUPS) {
      next[key] = [];
      for (const l of S.budDraft[key]) {
        const nom = (l.nom || "").trim();
        const mt = String(l.montant).trim();
        if (!nom && !mt) continue;
        if (!nom) { err.textContent = "Donnez un nom à chaque ligne."; return; }
        if (mt === "" || !(Number(mt) >= 0)) { err.textContent = `Indiquez le montant par mois de « ${nom} ».`; return; }
        next[key].push({ id: l.id || `l${Date.now().toString(36)}${(n++).toString(36)}`, nom, montant: Math.round(Number(mt) * 100) / 100, note: (l.note || "").trim() });
      }
    }
    const btn = $("bud-save");
    btn.disabled = true;
    try {
      if (S.dbRef && S.doc) await S.dbRef.update({ budget: next });
      else if (S.dbRef) await S.dbRef.set({ ...(S.doc || {}), budget: next });
      S.doc = { ...(S.doc || {}), budget: next };
      S.budEditing = false; S.budDraft = null;
      render();
    } catch (e) {
      if (e && e.code === "invalid_argument") { S.canWrite = false; err.textContent = "Vous ne pouvez pas modifier ce budget depuis cet affichage."; }
      else err.textContent = "L'enregistrement n'a pas abouti. Vérifiez votre connexion puis réessayez.";
    } finally { btn.disabled = false; }
  }
  $("bud-edit-btn").addEventListener("click", openBudget);
  $("bud-cancel").addEventListener("click", closeBudget);
  $("bud-save").addEventListener("click", saveBudget);

  /* ---------------- freedom ---------------- */
  function renderFreedom() {
    const t = budgetTotals(S.doc);
    const facts = $("free-facts");
    const bar = $("free-bar").firstElementChild;
    facts.textContent = "";
    const ok = !!(t && t.depenses > 0);
    $("fs-empty").hidden = ok;
    $("fs-full").hidden = !ok;
    if (!ok) { bar.style.width = "0%"; return; }
    const r = targetRate();
    const rateIn = $("free-rate");
    if (document.activeElement !== rateIn) rateIn.value = String(Math.round(r * 10000) / 100);
    const T = needFor(t.depenses, r);
    $("fs-dep").textContent = EUR2.format(t.depenses);
    $("fs-need").textContent = isFinite(T) ? EUR0.format(T) : "—";
    if (!isFinite(T)) { bar.style.width = "0%"; facts.append(el("p", {}, "Avec un rendement de 0 %, vos placements ne rapportent rien : indiquez un rendement.")); return; }
    const P = latest() ? latest().row.sans : 0;
    const share = Math.min(1, P / T);
    bar.style.width = `${(share * 100).toFixed(2)}%`;
    const p1 = el("p");
    p1.append("Tu as ", el("b", {}, EUR2.format(P)), " aujourd'hui : ", el("b", {}, PCTR.format(share)), " du chemin.");
    facts.append(p1);
    const sv_ = saving();
    const n = monthsTo(P, sv_, monthlyRate(r), T);
    const p2 = el("p");
    if (n === 0) p2.append("C'est déjà atteint : tes placements peuvent payer tes dépenses.");
    else if (dur(n)) {
      const at = reach(n);
      p2.append(`En mettant ${EUR0.format(sv_)} de côté chaque mois à ${PCTR.format(r)}, tu y arriverais en `, el("b", {}, dur(n)), ` (en ${monthLong(at.ym)}, à ${at.age} ans).`);
    } else p2.append(`En mettant ${EUR0.format(sv_)} de côté chaque mois, il faudrait plus de 100 ans : il faut mettre plus de côté ou viser un meilleur rendement.`);
    facts.append(p2);
    const L = latest();
    if (L) {
      const yearly = L.row.sansParts.reduce((s, v, i) => s + v * (Number(S.proj.comptes[i].taux) || 0), 0);
      const avg = L.row.sans > 0 ? yearly / L.row.sans : 0;
      const rates = S.proj.comptes.filter((c) => Number(c.taux) > 0).map((c) => `${c.nom} ${PCTR.format(Number(c.taux))}`).join(", ");
      const p3 = el("p", { class: "muted" });
      p3.append(`Aujourd'hui, ton argent rapporte en moyenne ${PCTR.format(avg)} par an${rates ? ` (${rates})` : ""}. Tu peux tester d'autres chiffres dans l'onglet « Tester ».`);
      facts.append(p3);
    }
  }
  function setRate(v) {
    if (v === "" || !(Number(v) >= 0)) return;
    S.rate = Number(v) / 100;
    renderFreedom();
    if (!S.dbRef || S.canWrite === false || !S.doc) return;
    clearTimeout(S.rateTimer);
    const r = S.rate;
    S.rateTimer = setTimeout(async () => { try { await S.dbRef.update({ rendementCible: r }); } catch (e) {} }, 700);
  }
  $("free-rate").addEventListener("input", (e) => setRate(e.target.value));

  /* ---------------- simulator ---------------- */
  const SIM_RATES = [0.02, 0.03, 0.04, 0.05, 0.07];
  function simReal() {
    const t = budgetTotals(S.doc);
    return {
      dep: t && t.depenses > 0 ? Math.round(t.depenses * 100) / 100 : 1000,
      rate: Math.round(targetRate() * 10000) / 100,
      have: latest() ? Math.round(latest().row.sans * 100) / 100 : 0,
      save: saving(),
      age: Math.max(ageNow() + 1, 40),
    };
  }
  const simVal = (k) => (S.sim[k] != null && S.sim[k] !== "" ? Number(S.sim[k]) : simReal()[k]);
  const SIM_IDS = { dep: "sim-dep", rate: "sim-rate", have: "sim-have", save: "sim-save", age: "sim-age" };
  function renderSim() {
    Object.entries(SIM_IDS).forEach(([k, id]) => {
      const inp = $(id);
      if (document.activeElement !== inp) inp.value = String(simVal(k));
    });
    $("sim-age").min = String(ageNow() + 1);
    const chips = $("sim-rate-chips");
    chips.textContent = "";
    SIM_RATES.forEach((r) => {
      const pct = Math.round(r * 100);
      const b = el("button", { type: "button", class: "chip-btn", "aria-pressed": String(Math.abs(simVal("rate") - pct) < 1e-9) }, `${pct} %`);
      b.addEventListener("click", () => simSet("rate", pct, true));
      chips.append(b);
    });
    renderSimResults();
  }
  function renderSimResults() {
    const dep = simVal("dep"), rate = simVal("rate") / 100, have = simVal("have"), save = simVal("save"), age = simVal("age");
    const T = needFor(dep, rate);
    const i = monthlyRate(rate);
    const need = $("r-need"), needSub = $("r-need-sub");
    need.textContent = isFinite(T) ? EUR0.format(T) : "—";
    needSub.textContent = isFinite(T) ? `placés à ${PCTR.format(rate)} par an pour toucher ${EUR2.format(dep)} par mois` : "Indiquez un rendement au-dessus de 0 %.";
    const n = monthsTo(have, save, i, T);
    $("r-time-label").textContent = `Avec ${EUR0.format(save)} par mois`;
    const time = $("r-time"), timeSub = $("r-time-sub");
    if (!isFinite(T)) { time.textContent = "—"; timeSub.textContent = ""; }
    else if (n === 0) { time.textContent = "Déjà atteint"; timeSub.textContent = "ce que tu as suffit déjà"; }
    else if (dur(n)) { const at = reach(n); time.textContent = dur(n); timeSub.textContent = `en ${monthLong(at.ym)}, à ${at.age} ans`; }
    else { time.textContent = "Plus de 100 ans"; timeSub.textContent = "mets plus de côté ou vise un meilleur rendement"; }
    const months = birthIdx() + age * 12 - nowIdx();
    $("r-effort-label").textContent = `Pour y arriver à ${age} ans`;
    const eff = $("r-effort"), effSub = $("r-effort-sub");
    eff.textContent = "";
    if (!isFinite(T)) { eff.textContent = "—"; effSub.textContent = ""; }
    else if (months <= 0) { eff.textContent = "—"; effSub.textContent = `choisis un âge au-dessus de ${ageNow()} ans`; }
    else {
      const sf = savingFor(have, i, T, months);
      eff.append(EUR0.format(sf), el("small", {}, " /mois"));
      effSub.textContent = sf === 0 ? "rien à ajouter : c'est déjà atteint" : `à mettre de côté chaque mois pendant ${dur(months) || months + " mois"}`;
    }
    // table by return
    const table = $("sim-table");
    table.textContent = "";
    const rates = SIM_RATES.slice();
    if (rate > 0 && !rates.some((r) => Math.abs(r - rate) < 1e-9)) { rates.push(rate); rates.sort((a, b) => a - b); }
    const head = el("tr");
    [["Rendement", ""], ["Il me faut placé", "r"], [`Avec ${EUR0.format(save)} par mois`, "r"], [`Pour y arriver à ${age} ans`, "r"]]
      .forEach(([h, c]) => head.append(el("th", c ? { class: c } : {}, h)));
    const thead = el("thead"); thead.append(head);
    const tb = el("tbody");
    rates.forEach((r) => {
      const Tr = needFor(dep, r), ir = monthlyRate(r);
      const nr = monthsTo(have, save, ir, Tr);
      const tr = el("tr", Math.abs(r - rate) < 1e-9 ? { class: "hl" } : {});
      tr.append(el("td", { class: "num" }, PCTR.format(r)));
      tr.append(el("td", { class: "r num" }, EUR0.format(Tr)));
      tr.append(el("td", { class: "r" }, nr === 0 ? "déjà atteint" : (dur(nr) ? `${dur(nr)} (à ${reach(nr).age} ans)` : "plus de 100 ans")));
      tr.append(el("td", { class: "r num" }, months > 0 ? `${EUR0.format(savingFor(have, ir, Tr, months))} /mois` : "—"));
      tb.append(tr);
    });
    table.append(thead, tb);
  }
  function simSet(k, v, full) {
    if (v === "" || !(Number(v) >= 0)) return;
    S.sim[k] = Number(v);
    try { localStorage.setItem("patrimoine-sim", JSON.stringify(S.sim)); } catch (e) {}
    if (full) renderSim(); else { renderSimResults(); renderSimChips(); }
  }
  function renderSimChips() {
    $("sim-rate-chips").querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-pressed", String(Math.abs(simVal("rate") - Math.round(SIM_RATES[k] * 100)) < 1e-9)));
  }
  Object.entries(SIM_IDS).forEach(([k, id]) => $(id).addEventListener("input", (e) => simSet(k, e.target.value, false)));
  $("sim-reset").addEventListener("click", () => {
    S.sim = {};
    try { localStorage.removeItem("patrimoine-sim"); } catch (e) {}
    renderSim();
  });

  /* ---------------- ma banque : relevés PDF, classement, prévu et réel ---------------- */
  const RL = window.PatrimoineReleve || null;
  const MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const dParts = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
  const dShort = (iso) => { const p = dParts(iso); return p ? `${p.d} ${MOIS_COURT[p.m - 1]}` : ""; };
  const dNum = (iso) => { const p = dParts(iso); return p ? `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}` : ""; };
  const dayIdx = (iso) => { const p = dParts(iso); return p ? Math.round(Date.UTC(p.y, p.m - 1, p.d) / 864e5) : 0; };
  const isoOfDay = (t) => new Date(t * 864e5).toISOString().slice(0, 10);
  const periodLabel = (r) => {
    const a = dParts(r.debut), b = dParts(r.fin);
    if (!a || !b) return r.id;
    return `Du ${a.d} ${MONTHS[a.m - 1]}${a.y !== b.y ? " " + a.y : ""} au ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  };
  const periodChip = (r) => `${dShort(r.debut)} → ${dShort(r.fin)}`;
  const money = (v) => EUR2.format(Math.abs(v) < 0.005 ? 0 : v).replace("-", "−");
  const signed = (v) => (v > 0.004 ? "+" : v < -0.004 ? "−" : "") + EUR2.format(Math.abs(v));

  S.bk = { rel: null, curve: "dep", q: "", fcat: "", facc: "", scope: "", ask: null, confirmDel: null, busy: false, msg: null };
  try { const v = localStorage.getItem("patrimoine-bk-curve"); if (v === "dep" || v === "solde") S.bk.curve = v; } catch (e) {}
  try { const v = localStorage.getItem("patrimoine-bk-rel"); if (v) S.bk.rel = v; } catch (e) {}

  const bankOf = (doc) => {
    const b = doc && doc.banque && typeof doc.banque === "object" ? doc.banque : {};
    return {
      releves: Array.isArray(b.releves) ? b.releves : [],
      ops: Array.isArray(b.ops) ? b.ops : [],
      regles: b.regles && typeof b.regles === "object" && !Array.isArray(b.regles) ? b.regles : {},
    };
  };
  let bkCache = { doc: undefined, m: null };
  function bankModel() {
    if (bkCache.m && bkCache.doc === S.doc) return bkCache.m;
    const b = bankOf(S.doc);
    const budget = budgetOf(S.doc) || {};
    const info = RL ? RL.enrich(b.releves, b.ops) : new Map();
    const { cat, how } = RL ? RL.classifyAll(b.ops, info, budget, b.regles) : { cat: new Map(), how: new Map() };
    const lines = new Map();
    (Array.isArray(budget.depenses) ? budget.depenses : []).forEach((l) => lines.set(l.id, { l, sens: "out" }));
    (Array.isArray(budget.recettes) ? budget.recettes : []).forEach((l) => lines.set(l.id, { l, sens: "in" }));
    const releves = b.releves.slice().sort((x, y) => (x.fin < y.fin ? -1 : x.fin > y.fin ? 1 : 0));
    const m = { b, budget, info, cat, how, lines, releves };
    bkCache = { doc: S.doc, m };
    return m;
  }
  const catName = (m, c) => {
    if (!c) return "—";
    if (c.startsWith("b:")) { const x = m.lines.get(c.slice(2)); return x ? x.l.nom : "Ligne retirée"; }
    const k = RL && RL.CAT[c.slice(2)];
    return k ? k.nom : "—";
  };
  const catSide = (m, c) => {
    if (!c) return "out";
    if (c.startsWith("b:")) { const x = m.lines.get(c.slice(2)); return x ? x.sens : "out"; }
    const k = RL && RL.CAT[c.slice(2)];
    return k ? k.sens : "out";
  };

  /** Totaux d'un relevé : par classement, entrées, dépenses, mis de côté. */
  function periodStats(m, relId) {
    const ops = m.b.ops.filter((o) => o.rel === relId);
    const per = new Map();
    let inn = 0, out = 0, interneCourant = 0, hasCourant = false;
    ops.forEach((o) => {
      const c = m.cat.get(o.id);
      const side = catSide(m, c);
      if (side === "neutre") {
        if (RL.isCourant(o.compteNom || "")) { interneCourant += o.montant; hasCourant = true; }
        return;
      }
      const v = side === "out" ? -o.montant : o.montant;
      if (side === "out") out += v; else inn += v;
      const e = per.get(c) || { v: 0, n: 0 };
      e.v += v; e.n += 1;
      per.set(c, e);
    });
    let epargne = -interneCourant;
    if (!hasCourant) epargne = ops.filter((o) => m.cat.get(o.id) === "c:interne").reduce((s, o) => s + o.montant, 0);
    return { ops, per, inn, out, reste: inn - out, epargne };
  }
  function planTotals() {
    const t = budgetTotals(S.doc);
    return { has: !!t, inn: t ? t.recettes : 0, out: t ? t.depenses : 0, reste: t ? t.reste : 0, epargne: saving() };
  }

  /* --- PDF : lecture avec pdf.js, chargé seulement quand on ajoute un relevé --- */
  let pdfLib = null;
  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error(src));
    document.head.append(s);
  });
  async function loadPdfJs() {
    if (pdfLib) return pdfLib;
    // le moteur est chargé dans la page : la lecture marche aussi dans le programme Windows et l'app Android
    if (!window.pdfjsWorker) await loadScript("vendor/pdfjs/pdf.worker.min.js");
    if (!window.pdfjsLib) await loadScript("vendor/pdfjs/pdf.min.js");
    pdfLib = window.pdfjsLib;
    try { pdfLib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.js"; } catch (e) {}
    return pdfLib;
  }
  async function pdfPages(lib, bytes) {
    const doc = await lib.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
    try {
      const pages = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const tc = await (await doc.getPage(p)).getTextContent();
        pages.push(tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
      }
      return pages;
    } finally { try { doc.destroy(); } catch (e) {} }
  }

  /* --- les fichiers PDF restent sur l'appareil (IndexedDB) --- */
  const IDB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        let r;
        try { r = indexedDB.open("patrimoine-docs", 1); } catch (e) { rej(e); return; }
        r.onupgradeneeded = () => { r.result.createObjectStore("pdf"); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async run(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction("pdf", mode);
        const req = fn(t.objectStore("pdf"));
        t.oncomplete = () => res(req ? req.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    },
    put(id, v) { return this.run("readwrite", (s) => s.put(v, id)); },
    get(id) { return this.run("readonly", (s) => s.get(id)); },
    del(id) { return this.run("readwrite", (s) => s.delete(id)); },
  };

  const sameAcct = (a, b) => {
    const x = RL.flat(a).replace(/^C C /, ""), y = RL.flat(b).replace(/^C C /, "");
    return !!x && !!y && (x === y || (x.length > 6 && y.length > 6 && (x.endsWith(" " + y) || y.endsWith(" " + x))));
  };
  const compteFor = (nom) => {
    const c = ((S.doc && S.doc.comptes) || []).find((k) => sameAcct(nom, k.nom));
    return c ? c.id : null;
  };
  /** Soldes de fin de relevé pour l'onglet Patrimoine (tous les comptes, sinon rien). */
  function soldesFrom(r) {
    const comptes = (S.doc && S.doc.comptes) || [];
    if (!comptes.length) return null;
    const out = {};
    for (const c of comptes) {
      const sec = r.comptes.find((x) => sameAcct(x.nom, c.nom) && x.soldeFin != null);
      if (sec) { out[c.id] = sec.soldeFin; continue; }
      const a = (r.autres || []).find((x) => sameAcct(x.nom, c.nom));
      if (a) { out[c.id] = a.solde; continue; }
      return null;
    }
    return out;
  }

  function setBkMsg(text, warn, actions) { S.bk.msg = text ? { text, warn: !!warn, actions: actions || null } : null; renderBkMsg(); }
  function renderBkMsg() {
    const box = $("bk-msg");
    const msg = S.bk.msg;
    box.hidden = !msg;
    box.textContent = "";
    if (!msg) return;
    box.classList.toggle("warn", msg.warn);
    box.append(el("span", {}, msg.text));
    if (!S.bk.busy) {
      const ok = el("button", { class: "btn btn-quiet", type: "button" }, "OK");
      ok.addEventListener("click", () => setBkMsg(null));
      box.append(ok);
    }
  }

  async function importFiles(files) {
    files = Array.from(files || []).filter((f) => f && /\.pdf$/i.test(f.name || "") || (f && f.type === "application/pdf"));
    if (!files.length || S.bk.busy) return;
    if (!RL) { setBkMsg("La lecture des relevés n'est pas disponible dans cette version de l'app.", true); return; }
    S.bk.busy = true;
    setBkMsg(files.length > 1 ? `Lecture de ${files.length} relevés…` : "Lecture du relevé…");
    let lib;
    try { lib = await loadPdfJs(); }
    catch (e) { S.bk.busy = false; setBkMsg("Le lecteur de PDF n'a pas pu se charger. Fermez puis rouvrez l'app, et réessayez.", true); return; }
    const b = bankOf(S.doc);
    const releves = b.releves.slice(), ops = b.ops.slice();
    const soldes = { ...((S.doc && S.doc.releves) || {}) };
    const added = [], dup = [], bad = [], months = [];
    for (const f of files) {
      let buf, r;
      try {
        buf = await f.arrayBuffer();
        r = RL.parseReleve(await pdfPages(lib, new Uint8Array(buf.slice(0))));
      } catch (e) { bad.push(f.name); continue; }
      const id = `${r.fin}-${String(r.principal || "").slice(-4)}`;
      if (releves.some((x) => x.id === id)) { dup.push(periodChip(r)); continue; }
      const rec = {
        id, fichier: f.name, date: r.date, debut: r.debut, fin: r.fin, importe: todayIso(), titulaire: r.titulaire,
        comptes: r.comptes.map((c) => ({ nom: c.nom, cle: compteFor(c.nom), debut: c.debut, fin: c.fin, soldeDebut: c.soldeDebut, soldeFin: c.soldeFin, verifie: c.verifie, n: c.ops.length })),
        autres: r.autres, frais: r.frais, pdf: false,
      };
      r.comptes.forEach((c, ci) => c.ops.forEach((o, i) => {
        const op = { id: `${id}:${ci}:${i}`, rel: id, compte: compteFor(c.nom) || c.nom, compteNom: c.nom, date: o.date, valeur: o.valeur, libelle: o.libelle, montant: o.montant };
        if (o.detail) op.detail = o.detail;
        ops.push(op);
      }));
      try { await IDB.put(id, { name: f.name, data: buf }); rec.pdf = true; } catch (e) { rec.pdf = false; }
      releves.push(rec);
      added.push(rec);
      const so = soldesFrom(r);
      const ym = r.fin.slice(0, 7);
      if (so && (!soldes[ym] || soldes[ym].source === "releve")) { soldes[ym] = { soldes: so, date: r.fin, source: "releve" }; months.push(ym); }
    }
    S.bk.busy = false;
    if (added.length) {
      added.sort((x, y) => (x.fin < y.fin ? -1 : 1));
      S.bk.rel = added[added.length - 1].id;
      try { localStorage.setItem("patrimoine-bk-rel", S.bk.rel); } catch (e) {}
      const ok = await saveBank({ ...b, releves, ops }, months.length ? { releves: soldes } : null);
      if (!ok) return;
    }
    const parts = [];
    if (added.length) parts.push(added.length > 1 ? `${added.length} relevés ajoutés.` : `Relevé ajouté (${periodChip(added[0])}).`);
    if (added.some((r) => r.comptes.some((c) => !c.verifie))) parts.push("Attention : sur un relevé, les totaux ne tombent pas juste, certaines lignes ont pu être mal lues.");
    if (months.length) parts.push(`Soldes repris dans Patrimoine : ${months.sort().map(monthLong).join(", ")}.`);
    if (dup.length) parts.push(`${dup.length > 1 ? "Déjà présents" : "Déjà présent"} : ${dup.join(", ")}.`);
    if (bad.length) parts.push(`Pas lu : ${bad.join(", ")}. Ce n'est pas un relevé de compte du Crédit Mutuel, ou le fichier est abîmé.`);
    setBkMsg(parts.join(" "), !added.length || bad.length > 0);
  }

  async function saveBank(nextBank, extra) {
    const next = { ...(S.doc || {}), ...(extra || {}), banque: nextBank };
    try {
      if (S.dbRef) await S.dbRef.set(next);
      S.doc = next;
      S.loaded = true;
    } catch (e) {
      setBkMsg(e && e.code === "invalid_argument" ? "Vous ne pouvez pas modifier ces données depuis cet affichage." : "L'enregistrement n'a pas abouti. Réessayez.", true);
      return false;
    }
    render();
    return true;
  }

  async function setOpCat(id, value) {
    const m = bankModel(), b = m.b;
    if (!b.ops.some((o) => o.id === id)) return;
    const key = m.info.get(id).d.key;
    const regles = { ...b.regles };
    const ops = b.ops.map((o) => (o.id === id ? { ...o } : o));
    const me = ops.find((o) => o.id === id);
    S.bk.ask = null;
    if (value === "auto") {
      delete me.cat;
      delete regles[key];
    } else {
      const others = b.ops.filter((o) => o.id !== id && m.info.get(o.id).d.key === key);
      const toChange = others.filter((o) => m.how.get(o.id) !== "manuel" && m.cat.get(o.id) !== value);
      if (toChange.length) {
        me.cat = value;
        S.bk.ask = { key, value, n: toChange.length, nom: RL.joli(m.info.get(id).d.tiers) };
      } else {
        // retenu pour ce commerçant : les prochains relevés seront classés pareil
        regles[key] = value;
        delete me.cat;
      }
    }
    await saveBank({ ...b, ops, regles });
  }
  async function answerAsk(all) {
    const a = S.bk.ask;
    S.bk.ask = null;
    if (!a || !all) { renderBkOps(bankModel()); return; }
    const m = bankModel(), b = m.b;
    const ops = b.ops.map((o) => {
      if (o.cat === a.value && m.info.get(o.id).d.key === a.key) { const c = { ...o }; delete c.cat; return c; }
      return o;
    });
    await saveBank({ ...b, ops, regles: { ...b.regles, [a.key]: a.value } });
  }

  async function removeReleve(id) {
    const b = bankOf(S.doc);
    S.bk.confirmDel = null;
    if (S.bk.rel === id) S.bk.rel = null;
    try { await IDB.del(id); } catch (e) {}
    await saveBank({ ...b, releves: b.releves.filter((r) => r.id !== id), ops: b.ops.filter((o) => o.rel !== id) });
  }

  async function openPdf(rel) {
    let rec = null;
    try { rec = await IDB.get(rel.id); } catch (e) {}
    if (!rec || !rec.data) { setBkMsg("Le fichier PDF de ce relevé n'est pas sur cet appareil.", true); return; }
    const name = rec.name || `releve-${rel.fin}.pdf`;
    const Cap = window.Capacitor;
    try {
      if (window.patrimoineDesktop && window.patrimoineDesktop.openPdf) {
        const err = await window.patrimoineDesktop.openPdf(name, new Uint8Array(rec.data));
        if (err) setBkMsg("Windows n'a pas trouvé de programme pour ouvrir les PDF.", true);
        return;
      }
      if (Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform()) {
        const plug = (n) => (typeof Cap.registerPlugin === "function" ? Cap.registerPlugin(n) : Cap.Plugins[n]);
        const bytes = new Uint8Array(rec.data);
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        const w = await plug("Filesystem").writeFile({ path: name.replace(/[^\w.\- ]+/g, "_"), data: btoa(bin), directory: "CACHE" });
        await plug("Share").share({ title: name, files: [w.uri], dialogTitle: "Ouvrir le relevé" });
        return;
      }
    } catch (e) {
      if (!/cancel/i.test(String(e && e.message))) setBkMsg("Le relevé n'a pas pu s'ouvrir.", true);
      return;
    }
    const url = URL.createObjectURL(new Blob([rec.data], { type: "application/pdf" }));
    const w = window.open(url, "_blank");
    if (!w) {
      const a = el("a", { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  /* --- affichage --- */
  function renderBank() {
    const m = bankModel();
    const rels = m.releves;
    $("bk-empty").hidden = rels.length > 0;
    $("bk-top").hidden = rels.length === 0;
    $("bk-main").hidden = rels.length === 0;
    renderBkMsg();
    if (!rels.length) return;
    let rel = rels.find((r) => r.id === S.bk.rel);
    if (!rel) rel = rels[rels.length - 1];
    S.bk.rel = rel.id;
    renderBkPeriods(m, rel);
    if ($("tab-banque").hidden) { renderBkOps(m); renderBkDocs(m); return; }
    const st = periodStats(m, rel.id);
    const plan = planTotals();
    renderBkFigures(st, plan);
    renderBkSummary(m, st, plan, rel);
    renderBkLines(m, st);
    renderBkCurve(m, st, plan, rel);
    renderBkEvo(m, plan, rel);
    renderBkOps(m);
    renderBkDocs(m);
  }
  function selectPeriod(id) {
    S.bk.rel = id;
    S.bk.ask = null;
    try { localStorage.setItem("patrimoine-bk-rel", id); } catch (e) {}
    renderBank();
  }
  function renderBkPeriods(m, rel) {
    const box = $("bk-periods");
    box.textContent = "";
    m.releves.slice().reverse().forEach((r) => {
      const b = el("button", { type: "button", class: "chip-btn", "aria-pressed": String(r.id === rel.id) }, periodChip(r));
      b.addEventListener("click", () => selectPeriod(r.id));
      box.append(b);
    });
    $("bk-title").textContent = periodLabel(rel);
  }

  /** ▲ / ▼ avec des mots : jamais la couleur seule. */
  function deltaEl(real, plan, higherIsGood) {
    const d = real - plan;
    if (Math.abs(d) < 0.5) return el("span", { class: "delta" }, "comme prévu");
    const good = higherIsGood ? d > 0 : d < 0;
    return el("span", { class: `delta ${good ? "good" : "bad"}` }, `${d > 0 ? "▲" : "▼"} ${EUR2.format(Math.abs(d))} de ${d > 0 ? "plus" : "moins"}`);
  }
  function renderBkFigures(st, plan) {
    const fill = (id, value, planV, higherIsGood, fmt) => {
      $(id).textContent = fmt(value);
      const sub = $(id + "-sub");
      sub.textContent = "";
      if (!plan.has) { sub.append("Remplissez « Mes dépenses » pour comparer"); return; }
      sub.append(`prévu ${fmt(planV)} · `, deltaEl(value, planV, higherIsGood));
    };
    fill("bk-in", st.inn, plan.inn, true, money);
    fill("bk-out", st.out, plan.out, false, money);
    fill("bk-rest", st.reste, plan.reste, true, signed);
    $("bk-rest").classList.toggle("neg", st.reste < -0.004);
    $("bk-save").textContent = signed(st.epargne);
    const ss = $("bk-save-sub");
    ss.textContent = "";
    ss.append(st.epargne < -0.004 ? "repris sur mes livrets · " : "vers mes livrets · ", `prévu ${EUR0.format(plan.epargne)}`);
  }

  function renderBkSummary(m, st, plan, rel) {
    const p = $("bk-sentence");
    p.textContent = "";
    const B = (t) => el("b", {}, t);
    p.append(`${periodLabel(rel)}, il est rentré `, B(money(st.inn)));
    if (plan.has) p.append(` (${money(plan.inn)} prévus)`);
    p.append(" et tu as dépensé ", B(money(st.out)));
    if (plan.has) p.append(` pour ${money(plan.out)} prévus`);
    p.append(". ");
    if (plan.has) {
      p.append("Au final : ", B(signed(st.reste)), `, alors que le plan prévoyait ${signed(plan.reste)}. `);
    } else p.append("Au final : ", B(signed(st.reste)), ". ");
    if (st.epargne < -0.004) p.append("Tu as repris ", B(money(-st.epargne)), ` sur tes livrets au lieu d'y mettre ${EUR0.format(plan.epargne)}.`);
    else if (st.epargne > 0.004) p.append("Tu as mis ", B(money(st.epargne)), ` de côté sur tes livrets, pour ${EUR0.format(plan.epargne)} prévus.`);
    else p.append(`Rien n'est allé sur tes livrets, pour ${EUR0.format(plan.epargne)} prévus.`);

    const box = $("bk-alerts");
    box.textContent = "";
    const alert = (kind, icon, nodes, action) => {
      const d = el("div", { class: `alert ${kind}` });
      d.append(el("span", { class: "ic", "aria-hidden": "true" }, icon));
      const t = el("div");
      t.append(...nodes);
      if (action) { const b = el("button", { class: "btn btn-quiet", type: "button" }, action[0]); b.addEventListener("click", action[1]); t.append(" ", b); }
      d.append(t);
      box.append(d);
    };
    // plus gros écarts
    const over = [];
    m.lines.forEach(({ l, sens }) => {
      if (sens !== "out") return;
      const e = st.per.get("b:" + l.id);
      const d = (e ? e.v : 0) - (Number(l.montant) || 0);
      if (d > 0.5) over.push({ c: "b:" + l.id, nom: l.nom, d, txt: `+${EUR0.format(d)}` });
    });
    st.per.forEach((e, c) => { if (c.startsWith("c:") && catSide(m, c) === "out" && e.v > 0.5 && c !== "c:incidents") over.push({ c, nom: catName(m, c), d: e.v, txt: `${EUR0.format(e.v)} hors budget` }); });
    over.sort((a, b) => b.d - a.d);
    if (over.length) {
      const nodes = ["Ce qui a le plus dépassé : "];
      over.slice(0, 4).forEach((o, i) => {
        if (i) nodes.push(i === Math.min(4, over.length) - 1 ? " et " : ", ");
        const b = el("button", { class: "link", type: "button" }, o.nom);
        b.addEventListener("click", () => showCat(o.c));
        nodes.push(b, ` (${o.txt})`);
      });
      nodes.push(".");
      alert("info", "↗", nodes);
    }
    const inc = st.ops.filter((o) => m.cat.get(o.id) === "c:incidents");
    const incV = inc.reduce((s, o) => s - o.montant, 0);
    const rej = st.ops.filter((o) => m.info.get(o.id).d.type === "impaye");
    if (incV > 0.004 || rej.length) {
      const nodes = [];
      if (incV > 0.004) nodes.push(el("b", {}, `${EUR2.format(incV)} de frais d'incident`), ` (${inc.length} frais). `);
      if (rej.length) nodes.push(`${rej.length} prélèvement${rej.length > 1 ? "s rejetés" : " rejeté"} faute d'argent sur le compte. `);
      nodes.push("La banque facture ces frais quand le compte courant est trop juste au moment d'un paiement : garder une petite marge les évite.");
      alert("warn", "⚠", nodes, incV > 0.004 ? ["Voir ces frais", () => showCat("c:incidents")] : null);
    }
    const autres = st.ops.filter((o) => m.cat.get(o.id) === "c:autres-dep" || m.cat.get(o.id) === "c:autres-ent");
    if (autres.length) {
      alert("info", "?", [`${autres.length} opération${autres.length > 1 ? "s" : ""} pas reconnue${autres.length > 1 ? "s" : ""} (« Autres »). Classez-les une fois : l'app s'en souviendra pour les prochains relevés.`],
        ["Les voir", () => showCat(autres.every((o) => m.cat.get(o.id) === "c:autres-ent") ? "c:autres-ent" : "c:autres-dep")]);
    }
    if (rel.comptes.some((c) => !c.verifie)) alert("warn", "⚠", ["Sur ce relevé, solde de départ + opérations ne donnent pas le solde de fin : une ligne a pu être mal lue. Comparez avec le PDF."]);
  }
  function showCat(c) {
    S.bk.fcat = c;
    S.bk.scope = "";
    S.bk.q = "";
    $("bk-q").value = "";
    renderBkOps(bankModel());
    const card = $("bk-ops-card");
    try { card.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { card.scrollIntoView(); }
  }

  function renderBkLines(m, st) {
    const box = $("bk-lines");
    box.textContent = "";
    const get = (c) => st.per.get(c) || { v: 0, n: 0 };
    const hors = (side) => [...st.per].filter(([c, e]) => c.startsWith("c:") && catSide(m, c) === side && Math.abs(e.v) > 0.004)
      .sort((a, b) => b[1].v - a[1].v).map(([c]) => ({ c, nom: catName(m, c), plan: null }));
    const lineItems = (arr) => (Array.isArray(arr) ? arr : []).map((l) => ({ c: "b:" + l.id, nom: l.nom, plan: Number(l.montant) || 0 }));
    const groups = [
      { title: "Ce qui rentre", sens: "in", items: [...lineItems(m.budget.recettes), ...hors("in")] },
      { title: "Mes dépenses prévues", sens: "out", items: lineItems(m.budget.depenses) },
      { title: "Hors budget", sens: "out", items: hors("out"), hors: true },
    ].filter((g) => g.items.length);
    let scale = 1;
    groups.forEach((g) => g.items.forEach((it) => { scale = Math.max(scale, it.plan || 0, get(it.c).v); }));
    if (!groups.length) { box.append(el("p", { class: "muted" }, "Aucune opération sur ce relevé.")); return; }
    groups.forEach((g) => {
      const grp = el("div", { class: "pr-group" });
      const head = el("div", { class: "pr-head" });
      const real = g.items.reduce((s, it) => s + get(it.c).v, 0);
      const planT = g.items.reduce((s, it) => s + (it.plan || 0), 0);
      head.append(el("h3", {}, g.title));
      const tot = el("span", { class: "pr-tot" });
      tot.append(el("b", { class: "num" }, money(real)));
      if (!g.hors) tot.append(el("span", { class: "muted num" }, ` / ${money(planT)} prévus`));
      head.append(tot);
      grp.append(head);
      g.items.forEach((it) => {
        const e = get(it.c);
        const row = el("button", { type: "button", class: "pr-row", "aria-label": `${it.nom} : ${money(e.v)}${it.plan != null ? ` pour ${money(it.plan)} prévus` : " hors budget"}. Voir les opérations.` });
        row.append(el("span", { class: "pr-name" }, it.nom));
        const vals = el("span", { class: "pr-vals" });
        vals.append(el("b", { class: "num" }, money(e.v)));
        if (it.plan != null) vals.append(el("span", { class: "muted num" }, ` / ${money(it.plan)}`));
        row.append(vals);
        row.append(el("span", { class: "pr-sub" }, e.n ? `${e.n} opération${e.n > 1 ? "s" : ""}${it.plan == null ? " · pas prévu" : ""}` : "aucune opération"));
        const dl = el("span", { class: "pr-delta" });
        if (it.plan != null) dl.append(deltaEl(e.v, it.plan, g.sens === "in"));
        row.append(dl);
        const bar = el("span", { class: `pr-bar ${g.sens}`, "aria-hidden": "true" });
        const fillI = el("i");
        fillI.style.width = `${Math.max(0, Math.min(100, (e.v / scale) * 100)).toFixed(2)}%`;
        bar.append(fillI);
        if (it.plan != null) { const t = el("s"); t.style.left = `${Math.min(100, (it.plan / scale) * 100).toFixed(2)}%`; bar.append(t); }
        row.append(bar);
        row.addEventListener("click", () => showCat(it.c));
        grp.append(row);
      });
      box.append(grp);
    });
  }

  /* --- graphiques --- */
  function chartBox(box) {
    box.querySelectorAll("svg, .tip, .empty").forEach((n) => n.remove());
    const W = Math.max(280, box.clientWidth || 600);
    return { W, narrow: W < 560 };
  }
  function placeTip(box, tip, W, px, py) {
    tip.hidden = false;
    const bw = box.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    const scale = bw / W;
    let left = px * scale + 14;
    if (left + tw > bw) left = px * scale - tw - 14;
    left = Math.max(0, left);
    const top = Math.max(0, Math.min(py * scale - th / 2, box.clientHeight - th));
    tip.style.transform = `translate(${left}px, ${top}px)`;
  }
  const tipRow = (label, value, cls) => {
    const d = el("div", { class: "row" });
    const k = el("span", { class: "k" });
    k.append(el("i", { class: cls || "" }), label);
    d.append(k, el("span", { class: "num" }, value));
    return d;
  };

  /** Courbes sur les jours d'un relevé, avec repère au survol. */
  function bkLineChart(box, o) {
    const { W, narrow } = chartBox(box);
    const H = narrow ? 230 : 290;
    const mg = { t: 16, r: narrow ? 12 : 18, b: 28, l: narrow ? 62 : 72 };
    const iw = W - mg.l - mg.r, ih = H - mg.t - mg.b;
    const all = o.series.flatMap((s) => s.vals);
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    if (hi - lo < 1) hi = lo + 1;
    const step = niceStep(hi - lo, narrow ? 4 : 5);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const n = o.n;
    const x = (i) => mg.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => mg.t + ih - ((v - lo) / (hi - lo)) * ih;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", tabindex: "0", role: "img", "aria-label": o.aria });
    if (o.negBand && lo < 0) {
      svg.append(sv("rect", { class: "neg-band", x: mg.l, y: y(0), width: iw, height: y(lo) - y(0) }));
      svg.append(sv("text", { class: "neg-label", x: mg.l + 6, y: y(lo) - 6 }, "À découvert"));
    }
    const g = sv("g", { class: "grid" }), ax = sv("g", { class: "axis" });
    for (let v = lo; v <= hi + 1e-9; v += step) {
      g.append(sv("line", { x1: mg.l, x2: W - mg.r, y1: y(v), y2: y(v) }));
      ax.append(sv("text", { x: mg.l - 8, y: y(v) + 4, "text-anchor": "end" }, EUR0.format(v).replace("-", "−")));
    }
    svg.append(g);
    svg.append(sv("line", { class: lo < 0 ? "zero" : "baseline", x1: mg.l, x2: W - mg.r, y1: y(0), y2: y(0) }));
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
    for (let i = 0; i < n; i += every) ax.append(sv("text", { x: x(i), y: H - 8, "text-anchor": i === 0 ? "start" : "middle" }, o.tick(i)));
    svg.append(ax);
    o.series.forEach((s) => {
      svg.append(sv("path", { class: `line ${s.cls}`, d: s.vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("") }));
    });
    const main = o.series[0];
    const lv = main.vals[n - 1];
    svg.append(sv("circle", { class: `end-dot ${main.cls}`, cx: x(n - 1), cy: y(lv), r: 4.5 }));
    const lab = sv("text", { class: "end-label", x: x(n - 1) - 8, y: Math.max(mg.t + 12, y(lv) - 10), "text-anchor": "end" });
    lab.append(sv("tspan", { class: "v" }, money(lv)));
    svg.append(lab);
    const cross = sv("line", { class: "cross", y1: mg.t, y2: mg.t + ih, visibility: "hidden" });
    const dots = o.series.map((s) => sv("circle", { class: `hover-dot ${s.cls}`, r: 5, visibility: "hidden" }));
    svg.append(cross, ...dots);
    box.append(svg);
    const tip = el("div", { class: "tip", hidden: "" });
    box.append(tip);
    let cur = -1;
    const show = (i) => {
      cur = i;
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      o.series.forEach((s, k) => { dots[k].setAttribute("cx", x(i)); dots[k].setAttribute("cy", y(s.vals[i])); dots[k].setAttribute("visibility", "visible"); });
      tip.textContent = "";
      tip.append(el("h3", {}, o.title(i)));
      o.series.forEach((s) => tip.append(tipRow(s.name, money(s.vals[i]), s.cls)));
      if (o.extra) { const ex = o.extra(i); if (ex) tip.append(ex); }
      placeTip(box, tip, W, x(i), y(Math.max(...o.series.map((s) => s.vals[i]))));
    };
    const hide = () => { cur = -1; tip.hidden = true; cross.setAttribute("visibility", "hidden"); dots.forEach((d) => d.setAttribute("visibility", "hidden")); };
    const at = (ev) => { const r = svg.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W; return Math.max(0, Math.min(n - 1, Math.round(((px - mg.l) / iw) * (n - 1)))); };
    svg.addEventListener("pointermove", (ev) => show(at(ev)));
    svg.addEventListener("pointerdown", (ev) => show(at(ev)));
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowRight" || ev.key === "ArrowLeft") { ev.preventDefault(); show(Math.max(0, Math.min(n - 1, (cur < 0 ? 0 : cur) + (ev.key === "ArrowRight" ? 1 : -1)))); }
      else if (ev.key === "Escape") hide();
    });
  }

  function renderBkCurve(m, st, plan, rel) {
    document.querySelectorAll("[data-bkcurve]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.bkcurve === S.bk.curve)));
    const box = $("bk-curve"), legend = $("bk-curve-legend");
    const d0 = dayIdx(rel.debut), d1 = Math.max(dayIdx(rel.fin), d0 + 1);
    const n = d1 - d0 + 1;
    const when = (o) => {
      let t = dayIdx(o.date);
      if (t < d0 || t > d1) { const v = dayIdx(o.valeur); t = v >= d0 && v <= d1 ? v : Math.min(d1, Math.max(d0, t)); }
      return t - d0;
    };
    const day = (i) => isoOfDay(d0 + i);
    const opsOn = (pred) => { const a = Array.from({ length: n }, () => []); st.ops.forEach((o) => { if (pred(o)) a[when(o)].push(o); }); return a; };
    const dayList = (list, sign) => {
      if (!list.length) return null;
      const box2 = el("div", { class: "parts" });
      list.slice().sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant)).slice(0, 4).forEach((o) => {
        const d = el("div", { class: "row" });
        d.append(el("span", {}, RL.joli(m.info.get(o.id).d.tiers)), el("span", { class: "num" }, sign ? signed(o.montant) : money(-o.montant)));
        box2.append(d);
      });
      if (list.length > 4) box2.append(el("div", { class: "tag" }, `et ${list.length - 4} autre${list.length - 4 > 1 ? "s" : ""}`));
      return box2;
    };
    legend.textContent = "";
    if (S.bk.curve === "dep") {
      $("bk-curve-title").textContent = "Mes dépenses jour après jour";
      const per = opsOn((o) => catSide(m, m.cat.get(o.id)) === "out");
      const cum = [];
      per.forEach((list, i) => { cum.push((i ? cum[i - 1] : 0) + list.reduce((s, o) => s - o.montant, 0)); });
      const series = [{ name: "Dépensé", cls: "dep", vals: cum }];
      if (plan.has) series.push({ name: "Rythme prévu", cls: "plan", vals: cum.map((v, i) => (plan.out * i) / (n - 1)) });
      const l1 = el("span"); l1.append(el("i", { class: "sw dep" }), "Dépensé depuis le début du relevé");
      legend.append(l1);
      if (plan.has) { const l2 = el("span"); l2.append(el("i", { class: "sw plan" }), `Rythme prévu (${EUR0.format(plan.out)} sur le relevé)`); legend.append(l2); }
      bkLineChart(box, {
        n, series, tick: (i) => dShort(day(i)),
        title: (i) => dateLong(day(i)),
        extra: (i) => dayList(per[i], false),
        aria: `Dépenses cumulées ${periodLabel(rel).toLowerCase()} : ${money(cum[n - 1])}${plan.has ? ` pour ${money(plan.out)} prévus` : ""}.`,
      });
    } else {
      const acc = rel.comptes.find((c) => RL.isCourant(c.nom)) || rel.comptes[0];
      $("bk-curve-title").textContent = `Mon compte courant jour après jour`;
      const per = opsOn((o) => o.compteNom === acc.nom);
      const vals = [];
      per.forEach((list, i) => { vals.push((i ? vals[i - 1] : Number(acc.soldeDebut) || 0) + list.reduce((s, o) => s + o.montant, 0)); });
      const l1 = el("span"); l1.append(el("i", { class: "sw solde" }), `Solde de ${RL.joli(acc.nom)} en fin de journée`);
      legend.append(l1);
      const minV = Math.min(...vals);
      if (minV < 0) { const l2 = el("span"); l2.append(el("i", { class: "box neg" }), "À découvert"); legend.append(l2); }
      bkLineChart(box, {
        n, series: [{ name: "Solde", cls: "solde", vals }], negBand: true, tick: (i) => dShort(day(i)),
        title: (i) => dateLong(day(i)),
        extra: (i) => dayList(per[i], true),
        aria: `Solde du compte courant ${periodLabel(rel).toLowerCase()} : de ${money(vals[0])} à ${money(vals[n - 1])}, au plus bas ${money(minV)}.`,
      });
    }
  }

  function renderBkEvo(m, plan, rel) {
    const box = $("bk-evo");
    const { W, narrow } = chartBox(box);
    const rels = m.releves;
    const stats = rels.map((r) => periodStats(m, r.id));
    const H = narrow ? 230 : 280;
    const mg = { t: 18, r: narrow ? 10 : 16, b: 30, l: narrow ? 56 : 66 };
    const iw = W - mg.l - mg.r, ih = H - mg.t - mg.b;
    const maxV = Math.max(1, ...stats.map((s) => Math.max(s.inn, s.out)), plan.has ? plan.out : 0);
    const step = niceStep(maxV, narrow ? 4 : 5);
    const top = Math.ceil(maxV / step) * step;
    const n = rels.length;
    const gw = iw / Math.max(n, 1);
    const bw = Math.min(34, Math.max(6, (gw - 14) / 2));
    const y = (v) => mg.t + ih - (Math.max(0, v) / top) * ih;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", tabindex: "0",
      "aria-label": `Entrées et dépenses de ${n} relevé${n > 1 ? "s" : ""}. ` + rels.map((r, i) => `${periodChip(r)} : ${money(stats[i].inn)} rentrés, ${money(stats[i].out)} dépensés`).join(" ; ") });
    rels.forEach((r, i) => { if (r.id === rel.id) svg.append(sv("rect", { class: "sel-band", x: mg.l + i * gw + 2, y: mg.t - 6, width: gw - 4, height: ih + 6, rx: 6 })); });
    const g = sv("g", { class: "grid" }), ax = sv("g", { class: "axis" });
    for (let v = 0; v <= top + 1e-9; v += step) {
      g.append(sv("line", { x1: mg.l, x2: W - mg.r, y1: y(v), y2: y(v) }));
      ax.append(sv("text", { x: mg.l - 8, y: y(v) + 4, "text-anchor": "end" }, EUR0.format(v)));
    }
    svg.append(g);
    const bar = (cls, x0, v) => {
      const h = y(0) - y(v);
      if (h <= 0.5) return sv("rect", { class: `bar ${cls}`, x: x0, y: y(0) - 1, width: bw, height: 1 });
      const r = Math.min(4, bw / 2, h);
      const yt = y(v);
      return sv("path", { class: `bar ${cls}`, d: `M${x0},${y(0)}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x0 + bw - r}Q${x0 + bw},${yt} ${x0 + bw},${yt + r}V${y(0)}Z` });
    };
    const lblW = narrow ? 44 : 76;
    const lblEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / lblW))));
    const lbl = (r) => { const p = dParts(r.fin); return narrow && p ? MOIS_COURT[p.m - 1] : dShort(r.fin); };
    rels.forEach((r, i) => {
      const cx = mg.l + i * gw + gw / 2;
      svg.append(bar("in", cx - bw - 1, stats[i].inn), bar("out", cx + 1, stats[i].out));
      if ((n - 1 - i) % lblEvery === 0) ax.append(sv("text", { x: cx, y: H - 10, "text-anchor": "middle" }, lbl(r)));
    });
    svg.append(sv("line", { class: "baseline", x1: mg.l, x2: W - mg.r, y1: y(0), y2: y(0) }));
    if (plan.has && plan.out > 0) {
      svg.append(sv("line", { class: "ref", x1: mg.l, x2: W - mg.r, y1: y(plan.out), y2: y(plan.out) }));
      svg.append(sv("text", { class: "ref-label", x: mg.l + 4, y: y(plan.out) - 6, "text-anchor": "start" }, `Prévu ${EUR0.format(plan.out)}`));
    }
    svg.append(ax);
    const hit = sv("g");
    rels.forEach((r, i) => {
      const h = sv("rect", { x: mg.l + i * gw, y: mg.t, width: gw, height: ih, fill: "transparent", "data-i": i, style: "cursor:pointer" });
      hit.append(h);
    });
    svg.append(hit);
    box.append(svg);
    const tip = el("div", { class: "tip", hidden: "" });
    box.append(tip);
    const show = (i) => {
      const s = stats[i];
      tip.textContent = "";
      tip.append(el("h3", {}, periodChip(rels[i])));
      tip.append(tipRow("Rentré", money(s.inn), "in"), tipRow("Dépensé", money(s.out), "out"));
      const p = el("div", { class: "parts" });
      const r1 = el("div", { class: "row" }); r1.append(el("span", {}, "Reste"), el("span", { class: "num" }, signed(s.reste)));
      const r2 = el("div", { class: "row" }); r2.append(el("span", {}, "Mis de côté"), el("span", { class: "num" }, signed(s.epargne)));
      p.append(r1, r2, el("div", { class: "tag" }, "Touchez pour afficher ce relevé"));
      tip.append(p);
      placeTip(box, tip, W, mg.l + i * gw + gw / 2, y(Math.max(s.inn, s.out)));
    };
    hit.addEventListener("pointermove", (ev) => { const i = Number(ev.target.getAttribute("data-i")); if (i >= 0) show(i); });
    hit.addEventListener("click", (ev) => { const i = Number(ev.target.getAttribute("data-i")); if (i >= 0 && rels[i]) selectPeriod(rels[i].id); });
    svg.addEventListener("pointerleave", () => { tip.hidden = true; });
    // tableau
    const t = $("bk-evo-table");
    t.textContent = "";
    const head = el("tr");
    ["Relevé", "Rentré", "Dépensé", "Reste", "Mis de côté"].forEach((h, i) => head.append(el("th", i ? { class: "r" } : {}, h)));
    const thead = el("thead"); thead.append(head);
    const tb = el("tbody");
    rels.slice().reverse().forEach((r) => {
      const s = stats[rels.indexOf(r)];
      const tr = el("tr", r.id === rel.id ? { class: "hl" } : {});
      tr.append(el("td", {}, periodChip(r)), el("td", { class: "r num" }, money(s.inn)), el("td", { class: "r num" }, money(s.out)),
        el("td", { class: "r num" }, signed(s.reste)), el("td", { class: "r num" }, signed(s.epargne)));
      tb.append(tr);
    });
    if (plan.has) {
      const tr = el("tr", { class: "total" });
      tr.append(el("td", {}, "Prévu chaque mois"), el("td", { class: "r num" }, money(plan.inn)), el("td", { class: "r num" }, money(plan.out)),
        el("td", { class: "r num" }, signed(plan.reste)), el("td", { class: "r num" }, signed(plan.epargne)));
      tb.append(tr);
    }
    t.append(thead, tb);
  }

  /* --- liste des opérations --- */
  function catSelect(m) {
    const s = el("select", { class: "op-cat" });
    const group = (label, items) => {
      if (!items.length) return;
      const og = el("optgroup", { label });
      items.forEach(([v, t]) => og.append(el("option", { value: v }, t)));
      s.append(og);
    };
    group("Mon budget : ce qui rentre", (m.budget.recettes || []).map((l) => ["b:" + l.id, l.nom]));
    group("Mon budget : mes dépenses", (m.budget.depenses || []).map((l) => ["b:" + l.id, l.nom]));
    group("Hors budget : dépenses", RL.CATS.filter((c) => c.sens === "out").map((c) => ["c:" + c.id, c.nom]));
    group("Hors budget : rentrées", RL.CATS.filter((c) => c.sens === "in").map((c) => ["c:" + c.id, c.nom]));
    group("Ni dépense ni rentrée", [["c:interne", "Entre mes comptes (épargne)"]]);
    return s;
  }
  function renderBkOps(m) {
    const rels = m.releves;
    const rel = rels.find((r) => r.id === S.bk.rel) || rels[rels.length - 1];
    const box = $("bk-ops");
    box.textContent = "";
    if (!rel) return;
    // filtres
    const fcat = $("bk-fcat");
    const used = new Set(m.b.ops.map((o) => m.cat.get(o.id)));
    if (S.bk.fcat) used.add(S.bk.fcat);
    fcat.textContent = "";
    fcat.append(el("option", { value: "" }, "Tous les classements"));
    [...used].map((c) => [c, catName(m, c)]).sort((a, b) => a[1].localeCompare(b[1], "fr")).forEach(([c, t]) => fcat.append(el("option", { value: c }, t)));
    fcat.value = S.bk.fcat;
    const facc = $("bk-facc");
    const accs = [...new Set(m.b.ops.map((o) => o.compteNom))];
    facc.textContent = "";
    facc.append(el("option", { value: "" }, "Tous les comptes"));
    accs.forEach((a) => facc.append(el("option", { value: a }, RL.joli(a))));
    facc.value = accs.includes(S.bk.facc) ? S.bk.facc : "";
    facc.hidden = accs.length < 2;
    $("bk-fscope").value = S.bk.scope;
    if (document.activeElement !== $("bk-q")) $("bk-q").value = S.bk.q;
    // question en attente
    const ask = $("bk-ask");
    ask.textContent = "";
    ask.hidden = !S.bk.ask;
    if (S.bk.ask) {
      const a = S.bk.ask;
      ask.append(`Classer aussi ${a.n > 1 ? `les ${a.n} autres opérations` : "l'autre opération"} « ${a.nom} » dans « ${catName(m, a.value)} » ? Les prochains relevés seront classés pareil.`);
      const yes = el("button", { class: "btn btn-primary", type: "button" }, "Oui, toutes");
      yes.addEventListener("click", () => answerAsk(true));
      const no = el("button", { class: "btn btn-quiet", type: "button" }, "Non, seulement celle-ci");
      no.addEventListener("click", () => answerAsk(false));
      ask.append(" ", yes, " ", no);
    }
    const q = RL.flat(S.bk.q || "");
    const qNum = (S.bk.q || "").replace(/\s/g, "").replace(".", ",");
    let list = (S.bk.scope === "tout" ? m.b.ops : m.b.ops.filter((o) => o.rel === rel.id)).filter((o) => {
      if (S.bk.fcat && m.cat.get(o.id) !== S.bk.fcat) return false;
      if (S.bk.facc && o.compteNom !== S.bk.facc) return false;
      if (q) {
        const d = m.info.get(o.id).d;
        const hay = `${RL.flat(d.texte)} ${RL.flat(catName(m, m.cat.get(o.id)))}`;
        const amt = Math.abs(o.montant).toFixed(2).replace(".", ",");
        if (!hay.includes(q) && !(qNum && /\d/.test(qNum) && amt.includes(qNum))) return false;
      }
      return true;
    });
    list = list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id < a.id ? -1 : 1));
    const total = list.reduce((s, o) => s + o.montant, 0);
    $("bk-ops-count").textContent = `${list.length} opération${list.length > 1 ? "s" : ""}${S.bk.fcat || q ? ` · ${signed(total)}` : ""}`;
    if (!list.length) { box.append(el("p", { class: "muted" }, "Aucune opération ne correspond.")); return; }
    const tpl = catSelect(m);
    const MAX = 400;
    list.slice(0, MAX).forEach((o) => {
      const x = m.info.get(o.id);
      const c = m.cat.get(o.id);
      const how = m.how.get(o.id);
      const row = el("div", { class: "op" });
      row.append(el("span", { class: "op-date" }, dNum(o.date)));
      const main = el("div", { class: "op-main" });
      const name = el("div", { class: "op-name" }, RL.joli(x.d.tiers));
      const TAG = { carte: "Carte", prlv: "Prélèvement", vir: "Virement", retrait: "Retrait", frais: "Frais", impaye: "Rejeté" };
      if (TAG[x.d.type]) name.append(el("span", { class: `tag${x.d.type === "impaye" ? " warn" : ""}` }, TAG[x.d.type]));
      main.append(name);
      const sub = [];
      if (x.d.lieu) sub.push(x.d.fx ? x.d.lieu : RL.joli(x.d.lieu));
      if (accs.length > 1 && !RL.isCourant(o.compteNom || "")) sub.push(RL.joli(o.compteNom));
      if (S.bk.scope === "tout") { const r = rels.find((k) => k.id === o.rel); if (r) sub.push(`relevé ${periodChip(r)}`); }
      if (how === "regle") sub.push("classé comme d'habitude");
      if (sub.length) main.append(el("div", { class: "op-sub" }, sub.join(" · ")));
      row.append(main);
      const sel = tpl.cloneNode(true);
      sel.setAttribute("aria-label", `Classement de ${RL.joli(x.d.tiers)} du ${dNum(o.date)}`);
      if (how !== "auto") {
        sel.prepend(el("option", { value: "auto" }, "↺ Remettre en automatique"));
        sel.classList.add("manuel");
      }
      sel.value = c;
      sel.addEventListener("change", () => setOpCat(o.id, sel.value));
      row.append(sel);
      row.append(el("span", { class: `op-amt num${o.montant > 0 ? " in" : ""}` }, signed(o.montant)));
      box.append(row);
    });
    if (list.length > MAX) box.append(el("p", { class: "muted" }, `Et ${list.length - MAX} de plus : affinez la recherche pour les voir.`));
  }

  function renderBkDocs(m) {
    const box = $("bk-docs");
    box.textContent = "";
    m.releves.slice().reverse().forEach((r) => {
      const row = el("div", { class: "hist-row" });
      const info = el("div", { class: "doc-info" });
      const n = m.b.ops.filter((o) => o.rel === r.id).length;
      info.append(el("b", {}, periodLabel(r)));
      const ok = r.comptes.every((c) => c.verifie);
      info.append(el("div", { class: "op-sub" }, `${n} opérations · ${ok ? "✓ totaux vérifiés" : "⚠ totaux à vérifier"} · ${r.fichier || "relevé"}`));
      row.append(info);
      const act = el("span", { class: "actions" });
      if (S.bk.confirmDel === r.id) {
        act.append(el("span", { class: "muted" }, "Retirer ce relevé et ses opérations ?"));
        const yes = el("button", { class: "btn", type: "button" }, "Oui, retirer");
        yes.addEventListener("click", () => removeReleve(r.id));
        const no = el("button", { class: "btn btn-quiet", type: "button" }, "Non");
        no.addEventListener("click", () => { S.bk.confirmDel = null; renderBkDocs(bankModel()); });
        act.append(yes, no);
      } else {
        if (r.pdf) {
          const open = el("button", { class: "btn", type: "button" }, "Ouvrir le PDF");
          open.addEventListener("click", () => openPdf(r));
          act.append(open);
        }
        const del = el("button", { class: "btn btn-quiet", type: "button", "aria-label": `Retirer le relevé ${periodChip(r)}` }, "Retirer");
        del.addEventListener("click", () => { S.bk.confirmDel = r.id; renderBkDocs(bankModel()); });
        act.append(del);
      }
      row.append(act);
      box.append(row);
    });
  }

  /* --- commandes --- */
  ["bk-add", "bk-add-first"].forEach((id) => $(id).addEventListener("click", () => $("bk-file").click()));
  $("bk-file").addEventListener("change", (e) => { const f = Array.from(e.target.files || []); e.target.value = ""; importFiles(f); });
  {
    const zone = $("tab-banque");
    zone.addEventListener("dragover", (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) { e.preventDefault(); zone.classList.add("drop"); } });
    zone.addEventListener("dragleave", (e) => { if (e.target === zone) zone.classList.remove("drop"); });
    zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("drop"); importFiles(e.dataTransfer && e.dataTransfer.files); });
  }
  document.querySelectorAll("[data-bkcurve]").forEach((b) => b.addEventListener("click", () => {
    S.bk.curve = b.dataset.bkcurve;
    try { localStorage.setItem("patrimoine-bk-curve", S.bk.curve); } catch (e) {}
    const m = bankModel();
    const rel = m.releves.find((r) => r.id === S.bk.rel);
    if (rel) renderBkCurve(m, periodStats(m, rel.id), planTotals(), rel);
  }));
  let qTimer = 0;
  $("bk-q").addEventListener("input", (e) => { S.bk.q = e.target.value; clearTimeout(qTimer); qTimer = setTimeout(() => renderBkOps(bankModel()), 120); });
  $("bk-fcat").addEventListener("change", (e) => { S.bk.fcat = e.target.value; renderBkOps(bankModel()); });
  $("bk-facc").addEventListener("change", (e) => { S.bk.facc = e.target.value; renderBkOps(bankModel()); });
  $("bk-fscope").addEventListener("change", (e) => { S.bk.scope = e.target.value; renderBkOps(bankModel()); });
  {
    let w1 = 0, w2 = 0, raf = 0;
    const ro2 = new ResizeObserver(() => {
      const a = $("bk-curve").clientWidth, b = $("bk-evo").clientWidth;
      if (Math.abs(a - w1) < 2 && Math.abs(b - w2) < 2) return;
      w1 = a; w2 = b;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if ($("tab-banque").hidden || $("bk-main").hidden) return;
        const m = bankModel();
        const rel = m.releves.find((r) => r.id === S.bk.rel);
        if (!rel) return;
        renderBkCurve(m, periodStats(m, rel.id), planTotals(), rel);
        renderBkEvo(m, planTotals(), rel);
      });
    });
    ro2.observe($("bk-curve"));
    ro2.observe($("bk-evo"));
  }

  /* ---------------- savings lever ---------------- */
  function setSaving(v, persist) {
    v = Math.max(0, Math.round((Number(v) || 0) * 100) / 100);
    S.saving = v;
    render();
    if (!persist || !S.dbRef || S.canWrite === false || !S.doc) return;
    clearTimeout(S.saveTimer);
    $("saved-note").textContent = "";
    S.saveTimer = setTimeout(async () => {
      try {
        await S.dbRef.update({ epargneMensuelle: v });
        $("saved-note").textContent = "Enregistré";
      } catch (e) {
        $("saved-note").textContent = e && e.code === "invalid_argument"
          ? "Simulation : ce montant n'est pas enregistré."
          : "Pas enregistré : réessayez dans un instant.";
      }
    }, 700);
  }
  $("save-num").addEventListener("input", (e) => { if (e.target.value !== "") setSaving(e.target.value, true); });
  $("save-range").addEventListener("input", (e) => setSaving(e.target.value, true));
  $("save-minus").addEventListener("click", () => setSaving(saving() - 10, true));
  $("save-plus").addEventListener("click", () => setSaving(saving() + 10, true));
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    S.view = b.dataset.view; try { localStorage.setItem("patrimoine-view", S.view); } catch (e) {} render();
  }));
  document.querySelectorAll("[data-age]").forEach((b) => b.addEventListener("click", () => {
    S.age = Number(b.dataset.age); try { localStorage.setItem("patrimoine-age", String(S.age)); } catch (e) {} render();
  }));
  $("btn-edit").addEventListener("click", openEdit);
  $("ed-cancel").addEventListener("click", closeEdit);
  $("ed-save").addEventListener("click", saveEdit);
  $("ed-add").addEventListener("click", () => {
    S.draft.rows.push({ id: "", nom: "", solde: "", tauxPct: 0, isNew: true });
    renderEditGrid();
    const i = S.draft.rows.length - 1;
    const n = $(`ed-name-${i}`); if (n) n.focus();
  });

  let rz = 0;
  const ro = new ResizeObserver(() => {
    const w = $("chart").clientWidth;
    if (Math.abs(w - chartW) < 2) return;
    cancelAnimationFrame(rz); rz = requestAnimationFrame(renderChart);
  });
  ro.observe($("chart"));

  render();

  /* ---------------- export & offline copy ---------------- */
  const MARK_OPEN = '<script type="application/json" id="donnees">';
  const MARK_CLOSE = "<" + "/script>";
  let EMBED = null;
  try { EMBED = JSON.parse(($("donnees") && $("donnees").textContent) || "null"); } catch (e) { EMBED = null; }

  /** Same calls as the online store, kept in this browser: used by an exported copy opened from a file. */
  function localStore(key, initial) {
    const read = () => { try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v && typeof v === "object" ? v : null; } catch (e) { return null; } };
    const write = (d) => { try { localStorage.setItem(key, JSON.stringify(d)); } catch (e) {} };
    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
    const merge = (a, b) => {
      const out = { ...(a || {}) };
      for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
      return out;
    };
    let doc = read() || initial;
    return {
      get doc() { return doc; },
      async set(d) { doc = JSON.parse(JSON.stringify(d)); write(doc); },
      async update(p) { doc = merge(doc, p); write(doc); S.doc = doc; },
    };
  }
  function showOffline(text) { const o = $("offline"); o.textContent = text; o.hidden = false; }

  async function exportHtml() {
    const note = $("export-note");
    note.textContent = "";
    if (!S.downloads || !S.doc) return;
    const btn = $("btn-export");
    btn.disabled = true;
    try {
      let tpl;
      try {
        const r = await fetch("patrimoine-hors-ligne.html", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        tpl = await r.text();
      } catch (e) { note.textContent = "L'export n'a pas pu être préparé. Réessayez dans un instant."; return; }
      const data = { ...S.doc, _export: todayIso() };
      if (S.saving != null) data.epargneMensuelle = S.saving;
      if (S.rate != null) data.rendementCible = S.rate;
      const json = JSON.stringify(data).replace(/</g, "\\u003c");
      const marker = MARK_OPEN + "null" + MARK_CLOSE;
      if (!tpl.includes(marker)) { note.textContent = "L'export n'a pas pu être préparé."; return; }
      const html = tpl.replace(marker, () => MARK_OPEN + json + MARK_CLOSE);
      try {
        await S.downloads.save({ filename: `mon-patrimoine-${todayIso()}.html`, data: html });
        note.textContent = "Fichier exporté avec vos chiffres.";
      } catch (e) {
        if (e && e.code === "declined") return;
        note.textContent = e && e.code === "rate_limited" ? "Un téléchargement est déjà en cours." : "L'export n'a pas abouti.";
      }
    } finally { btn.disabled = false; }
  }
  $("btn-export").addEventListener("click", exportHtml);

  /* ---------------- installed app: data on this device ---------------- */
  function showNotice(text, actions) {
    const o = $("offline");
    o.textContent = "";
    o.append(text);
    (actions || []).forEach(([label, fn], k) => {
      const b = el("button", { class: k ? "btn btn-quiet" : "btn", type: "button" }, label);
      b.style.marginLeft = "10px";
      b.addEventListener("click", fn);
      o.append(b);
    });
    o.hidden = false;
  }
  function hideNotice() { $("offline").hidden = true; }
  function parseImport(text) {
    let obj = null;
    const t = text.trim();
    if (t.startsWith("{")) obj = JSON.parse(t);
    else {
      const i = text.indexOf(MARK_OPEN);
      if (i >= 0) obj = JSON.parse(text.slice(i + MARK_OPEN.length, text.indexOf(MARK_CLOSE, i)));
    }
    if (obj && obj.data && typeof obj.data === "object" && !obj.comptes && !obj.budget) obj = obj.data;
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || (!Array.isArray(obj.comptes) && !obj.budget)) throw new Error("format");
    const out = { ...obj };
    delete out._export;
    return out;
  }
  async function applyImport(obj) {
    await S.dbRef.set(obj);
    S.doc = S.dbRef.doc;
    S.saving = null; S.rate = null; S.sim = {};
    try { localStorage.removeItem("patrimoine-sim"); } catch (e) {}
    showNotice("Données importées.", [["OK", hideNotice]]);
    render();
  }
  $("btn-import").addEventListener("click", () => $("file-import").click());
  $("file-import").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    let obj;
    try { obj = parseImport(await f.text()); }
    catch (err) {
      showNotice("Ce fichier ne contient pas de données de Mon patrimoine. Choisissez votre fichier de données (.json) ou une page exportée (.html).", [["OK", hideNotice]]);
      return;
    }
    if (S.doc) showNotice("Remplacer les données de cet appareil par celles du fichier ?", [["Oui, remplacer", () => applyImport(obj)], ["Annuler", hideNotice]]);
    else applyImport(obj);
  });
  $("btn-backup").addEventListener("click", async () => {
    if (!S.doc) return;
    const data = { ...S.doc, _export: todayIso() };
    if (S.saving != null) data.epargneMensuelle = S.saving;
    if (S.rate != null) data.rendementCible = S.rate;
    const text = JSON.stringify(data, null, 1);
    const name = `patrimoine-donnees-${todayIso()}.json`;
    // Android app: write the file, then let the phone's share menu save or send it
    const Cap = window.Capacitor;
    if (Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform()) {
      try {
        const plug = (n) => (typeof Cap.registerPlugin === "function" ? Cap.registerPlugin(n) : Cap.Plugins[n]);
        const r = await plug("Filesystem").writeFile({ path: name, data: text, directory: "CACHE", encoding: "utf8" });
        await plug("Share").share({ title: "Mes données Mon patrimoine", files: [r.uri], dialogTitle: "Garder la sauvegarde" });
        showNotice("Choisissez où garder la sauvegarde : Drive, e-mail, Fichiers…", [["OK", hideNotice]]);
      } catch (e) {
        if (!/cancel/i.test(String(e && e.message))) showNotice("La sauvegarde n'a pas pu être créée.", [["OK", hideNotice]]);
      }
      return;
    }
    const blob = new Blob([text], { type: "application/json" });
    const a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    showNotice("Sauvegarde téléchargée. Gardez ce fichier : il sert aussi à mettre vos données sur un autre appareil.", [["OK", hideNotice]]);
  });

  /* ---------------- store ---------------- */
  (async () => {
    if (window.PATRIMOINE_APP) {
      // a build that ships with data uses it only until something is saved on this device
      let seed = null;
      if (EMBED && typeof EMBED === "object") { seed = { ...EMBED }; delete seed._export; }
      const store = localStore("patrimoine-app", seed);
      S.app = true;
      S.dbRef = store;
      S.doc = store.doc;
      S.loaded = true;
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
      render();
      return;
    }
    const cl = window.claude;
    const inViewer = !!(cl && typeof cl.use === "function");
    const [db, user, dl] = inViewer
      ? await Promise.all([cl.use("db"), cl.use("user"), cl.use("downloads")])
      : [null, null, null];
    S.downloads = dl;
    if (user) {
      try { S.canWrite = await user.can("data.write"); } catch (e) { S.canWrite = null; }
    }
    if (!db) {
      if (EMBED && typeof EMBED === "object") {
        const store = localStore("patrimoine-hors-ligne-" + (EMBED._export || "copie"), EMBED);
        S.dbRef = store;
        S.doc = store.doc;
        S.offline = true;
        S.loaded = true;
        const d = dateLong(EMBED._export);
        showOffline(`Copie hors ligne${d ? " du " + d : ""}. Vos changements ici restent sur cet appareil : votre page en ligne n'est pas modifiée.`);
      } else {
        S.noDb = true;
        S.loaded = true;
        if (!inViewer) showOffline("Cette copie ne contient pas vos chiffres. Ouvrez votre page en ligne et cliquez sur « Exporter en HTML » pour obtenir une copie remplie.");
      }
      render();
      return;
    }
    S.dbRef = db.doc("patrimoine/etat");
    S.dbRef.onSnapshot((snap) => {
      S.loaded = true;
      S.doc = snap.exists ? snap.data() : null;
      if (S.saving != null && S.doc && Number(S.doc.epargneMensuelle) === S.saving) S.saving = null;
      if (S.rate != null && S.doc && Number(S.doc.rendementCible) === S.rate) S.rate = null;
      if (!S.editing) render();
      else { renderFigures(); renderChart(); renderAccounts(); renderHistory(); renderBudget(); renderFreedom(); renderSim(); }
    }, () => { S.loaded = true; S.noDb = true; render(); });
  })();
})();
