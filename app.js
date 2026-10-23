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
  const TABS = ["patrimoine", "depenses", "simulateur"];
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
    renderHistory();
    renderTabs();
    renderBudget();
    renderFreedom();
    renderSim();
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
    const t = $("acc-table");
    t.textContent = "";
    const L = latest();
    if (!L) {
      const tr = el("tr");
      tr.append(el("td", { class: "muted" }, S.loaded ? "Aucun compte pour l'instant." : "Chargement de vos comptes…"));
      t.append(tr);
      return;
    }
    const comptes = S.proj.comptes;
    const bal = L.row.sansParts;
    const total = bal.reduce((s, v) => s + v, 0);
    const head = el("tr");
    [["Compte", ""], ["Solde", "r"], ["Part", ""], ["Taux par an", "r"], ["Par mois", "r"], ["Par an", "r"]]
      .forEach(([h, c]) => head.append(el("th", c ? { class: c } : {}, h)));
    const thead = el("thead"); thead.append(head);
    const tb = el("tbody");
    comptes.forEach((c, i) => {
      const tr = el("tr");
      const td = el("td");
      td.append(el("div", { class: "acc-name" }, c.nom));
      if (c.type) td.append(el("div", { class: "acc-type" }, c.type));
      if (c.description) td.append(el("div", { class: "acc-desc" }, c.description));
      const chips = el("div", { class: "chips" });
      if (c.plafondVersements) {
        const room = Math.max(0, c.plafondVersements - bal[i]);
        chips.append(el("span", { class: "chip" }, `Place avant le plafond : ${EUR2.format(room)}`));
      }
      if (c.fermeture) chips.append(el("span", { class: "chip" }, `À fermer fin ${c.fermeture.slice(0, 4)}`));
      if (chips.childNodes.length) td.append(chips);
      tr.append(td);
      tr.append(el("td", { class: "r num" }, EUR2.format(bal[i])));
      const share = total > 0 ? bal[i] / total : 0;
      const sd = el("td");
      const wrap = el("div", { class: "share" });
      const bar = el("div", { class: "bar" });
      const fill = el("i"); fill.style.width = `${(share * 100).toFixed(1)}%`;
      bar.append(fill);
      wrap.append(el("span", { class: "num" }, PCT0.format(share)), bar);
      sd.append(wrap);
      tr.append(sd);
      const rate = Number(c.taux) || 0;
      tr.append(el("td", { class: "r num" }, PCT.format(rate)));
      tr.append(el("td", { class: "r num" }, EUR2.format(bal[i] * rate / 12)));
      tr.append(el("td", { class: "r num" }, EUR2.format(bal[i] * rate)));
      tb.append(tr);
    });
    const yearly = bal.reduce((s, v, i) => s + v * (Number(comptes[i].taux) || 0), 0);
    const tr = el("tr", { class: "total" });
    tr.append(el("td", {}, "Total"), el("td", { class: "r num" }, EUR2.format(total)), el("td", { class: "num" }, total > 0 ? "100 %" : "—"),
      el("td", { class: "r num", title: "Moyenne de vos comptes selon leur poids" }, total > 0 ? PCT.format(yearly / total) : "—"),
      el("td", { class: "r num" }, EUR2.format(yearly / 12)), el("td", { class: "r num" }, EUR2.format(yearly)));
    tb.append(tr);
    t.append(thead, tb);
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
    if (focus) $("t-" + t).focus();
  }
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
    b.addEventListener("keydown", (ev) => {
      const k = TABS.indexOf(S.tab);
      if (ev.key === "ArrowRight") { ev.preventDefault(); setTab(TABS[(k + 1) % TABS.length], true); }
      if (ev.key === "ArrowLeft") { ev.preventDefault(); setTab(TABS[(k + TABS.length - 1) % TABS.length], true); }
    });
  });

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
