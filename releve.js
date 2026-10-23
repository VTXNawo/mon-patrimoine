// Mon patrimoine : lecture des relevés PDF du Crédit Mutuel et classement des opérations.
// Fonctions pures : elles servent dans l'app et dans les tests (node).
(function (root) {
  "use strict";

  /* ---------------- outils ---------------- */
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const words = (s) => norm(s).split(/[^A-Z0-9]+/).filter(Boolean);
  const RE_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const RE_AMOUNT = /^[+-]?\d{1,3}(?:\.\d{3})*,\d{2}$/;
  const iso = (d) => { const m = RE_DATE.exec(d); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
  const amount = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));
  const cents = (v) => Math.round(v * 100) / 100;
  const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };

  /** Regroupe les morceaux de texte d'une page en lignes, de haut en bas. */
  function toRows(items) {
    const list = items
      .filter((i) => i && typeof i.s === "string" && i.s.trim() && i.x >= 30) // lettres de marge à gauche
      .map((i) => ({ s: i.s.trim(), x: i.x, y: i.y, w: i.w, r: i.x + i.w }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of list) {
      const row = rows.length && Math.abs(rows[rows.length - 1].y - it.y) < 2.5 ? rows[rows.length - 1] : null;
      if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
    }
    rows.forEach((r) => { r.items.sort((a, b) => a.x - b.x); r.text = r.items.map((i) => i.s).join(" "); });
    return rows;
  }

  const JUNK = [/^<<\s*Suite/i, /^Information sur la protection/i, /garantiedesdepots/i, /^Remarque\s*:/i, /^Sous r[ée]serve/i,
    /^Page \d+$/i, /^UN\.\d/, /^CAISSE DE CREDIT/i, /^TVA intra/i, /^M[ée]diateur/i, /^Pour toute demande/i, /QXBAN|IBAN\s*:/,
    /^Vous disposez d'une carte/i, /^d'un m[êe]me commer/i, /^votre espace client/i, /^RELEVE ET INFORMATIONS/i, /^\(\s*GE/];

  /**
   * Lit un relevé à partir du texte positionné de chaque page (pdf.js : {s, x, y, w}).
   * Renvoie la date, le titulaire, chaque compte (soldes de début et de fin, opérations),
   * les autres comptes cités et le total des frais. Lève une erreur si ce n'est pas un relevé lisible.
   */
  function parseReleve(pages) {
    const out = { date: null, titulaire: null, comptes: [], autres: [], frais: null };
    let mode = "none";      // ops | after | autres | frais | ignore
    let acct = null, cols = null, last = null;
    for (const page of pages) {
      const rows = toRows(page);
      let headerSeen = false;
      for (const row of rows) {
        const t = row.text;
        if (/SITUATION DE VOS AUTRES COMPTES/i.test(t)) { mode = "autres"; last = null; continue; }
        if (/TOTAL MENSUEL DES FRAIS/i.test(t)) { mode = "frais"; last = null; continue; }
        if (/INFORMATION PREALABLE/i.test(t)) { mode = "ignore"; last = null; continue; }
        const sec = /^(.+?)\s+N°\s*(\d{6,})\s+en euros/.exec(t);
        if (sec && !/^COMPTE N°/i.test(t)) {
          const numero = sec[2];
          let a = out.comptes.find((c) => c.numero === numero);
          if (!a) {
            a = { nom: sec[1].replace(/^C\/C\s+/i, "").trim(), titre: sec[1].trim(), numero, soldeDebut: null, debut: null, soldeFin: null, fin: null, ops: [] };
            out.comptes.push(a);
          }
          if (a !== acct) last = null;
          acct = a;
          mode = a.fin ? "after" : "ops";
          continue;
        }
        const tit = /^TITULAIRE\(S\)\s*:\s*(.+)$/i.exec(t);
        if (tit) { if (!out.titulaire) out.titulaire = tit[1].trim(); continue; }
        const deb = row.items.find((i) => /^D[ée]bit/i.test(i.s));
        const cre = row.items.find((i) => /^Cr[ée]dit/i.test(i.s));
        if (deb && cre) {
          const op = row.items.find((i) => /^Op[ée]ration/i.test(i.s));
          cols = { debit: deb.r, credit: cre.r, lib: op ? op.x - 13.2 : null };
          headerSeen = true;
          continue;
        }
        const dl = /^(\d{1,2}) ([a-zéû]+) (\d{4})$/i.exec(t);
        if (dl && MOIS[norm(dl[2]).toLowerCase()]) {
          if (!out.date) out.date = `${dl[3]}-${String(MOIS[norm(dl[2]).toLowerCase()]).padStart(2, "0")}-${dl[1].padStart(2, "0")}`;
          continue;
        }
        if (mode === "autres") {
          const last2 = row.items[row.items.length - 1];
          const eurI = row.items.findIndex((i) => i.s === "EUR");
          if (eurI > 0 && RE_AMOUNT.test(last2.s)) {
            const name = row.items.slice(0, eurI).map((i) => i.s).filter((s) => !/^\d+$/.test(s)).join(" ").replace(/\s*\((GD|GE)\)\s*$/, "").trim();
            if (name) out.autres.push({ nom: name, solde: amount(last2.s) });
          }
          continue;
        }
        if (mode === "frais") {
          const fm = /TOTAL DES FRAIS EN ([A-Z]+) (\d{4})/i.exec(t);
          const v = row.items[row.items.length - 1];
          if (fm && RE_AMOUNT.test(v.s)) out.frais = { mois: `${fm[1]} ${fm[2]}`, montant: amount(v.s) };
          continue;
        }
        if (mode !== "ops" || !acct || !cols) continue;
        const so = /SOLDE (CREDITEUR|DEBITEUR) AU (\d{2}\/\d{2}\/\d{4})/i.exec(t);
        if (so) {
          const v = row.items.filter((i) => RE_AMOUNT.test(i.s)).pop();
          const val = v ? amount(v.s) * (/DEBITEUR/i.test(so[1]) ? -1 : 1) : 0;
          if (acct.soldeDebut == null) { acct.soldeDebut = val; acct.debut = iso(so[2]); }
          else { acct.soldeFin = val; acct.fin = iso(so[2]); mode = "after"; }
          last = null;
          continue;
        }
        if (!headerSeen || JUNK.some((re) => re.test(t))) continue;
        const near = (i, edge) => Math.abs(i.r - edge) < 8;
        const isAmt = (i) => RE_AMOUNT.test(i.s) && (near(i, cols.debit) || near(i, cols.credit));
        const first = row.items[0];
        if (RE_DATE.test(first.s) && first.x < 120) {
          const dates = [];
          let k = 0;
          while (k < row.items.length && k < 2 && RE_DATE.test(row.items[k].s) && row.items[k].x < 160) dates.push(row.items[k++].s);
          const rest = row.items.slice(k);
          const amt = rest.filter(isAmt);
          const lib = rest.filter((i) => !amt.includes(i)).map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();
          if (!amt.length) { last = null; continue; } // ligne d'information sans montant
          const a = amt[amt.length - 1];
          const debit = Math.abs(a.r - cols.debit) <= Math.abs(a.r - cols.credit);
          const op = { date: iso(dates[0]), valeur: iso(dates[1] || dates[0]), libelle: lib, detail: "", montant: cents(amount(a.s) * (debit ? -1 : 1)) };
          acct.ops.push(op);
          last = op;
          if (cols.lib == null) cols.lib = rest[0] ? rest[0].x : null;
          continue;
        }
        // suite du libellé de l'opération précédente (commerçant, référence…)
        if (last && cols.lib != null && Math.abs(first.x - cols.lib) < 6 && !row.items.some(isAmt)) {
          last.detail = (last.detail ? last.detail + " " : "") + t.replace(/\s+/g, " ").trim();
        }
      }
    }
    if (!out.comptes.length || !out.comptes.some((c) => c.debut && c.fin)) throw new Error("pas-un-releve");
    out.comptes.forEach((c) => {
      const sum = c.ops.reduce((s, o) => s + o.montant, 0);
      c.verifie = c.soldeDebut != null && c.soldeFin != null && Math.abs(cents(c.soldeDebut + sum) - c.soldeFin) < 0.005;
    });
    const main = out.comptes.find((c) => isCourant(c.nom) && c.debut && c.fin) || out.comptes.find((c) => c.debut && c.fin);
    out.debut = main.debut;
    out.fin = main.fin;
    out.principal = main.numero;
    return out;
  }
  const isCourant = (nom) => /EUROCOMPTE|COMPTE|CHEQUE|C\/C/i.test(nom) && !/LIVRET|EPARGNE|PEL|CEL/i.test(nom);

  /* ---------------- description d'une opération ---------------- */
  const CIV = /^(M|MR|MME|MLE|MLLE|MELLE|MONSIEUR|MADAME)\s+/;
  /** Type, tiers (à qui / de qui), clé du commerçant pour retenir un classement. */
  function describe(op) {
    const lib = norm(op.libelle).replace(/\s+/g, " ").trim();
    const det = norm(op.detail).replace(/\s+/g, " ").trim();
    let type = "autre", tiers = lib, lieu = "", fx = false;
    let m;
    if ((m = /^(?:PAIEMENT (?:CB|PSC|MOB|SANS CONTACT)|\d+ PAIEMENTS)\s+(\d{4})\s*(.*)$/.exec(lib))) {
      type = "carte";
      lieu = /\d/.test(m[2].split(" ")[0] || "") ? "" : m[2].replace(/\s\d.*$/, "").trim();
      tiers = det.replace(/\s*CARTE\s+\d{4}.*$/, "").trim() || lieu || "Paiement par carte";
      const cur = /(\d+,\d{2})\s+(USD|GBP|CHF|CAD|EUR)/.exec(m[2]);
      if (cur && cur[2] !== "EUR") { lieu = `${cur[1]} ${cur[2]}`; fx = true; }
    } else if ((m = /^RETRAIT (?:DAB)?\s*(\d{4})?\s*(.*)$/.exec(lib))) {
      type = "retrait"; tiers = "Retrait d'espèces"; lieu = (m[2] || "").trim();
    } else if ((m = /^IMPAYE\s*-?\s*PRLV SEPA\s+(.*)$/.exec(lib))) {
      type = "impaye"; tiers = m[1];
    } else if ((m = /^PRLV SEPA\s+(.*)$/.exec(lib))) {
      type = "prlv"; tiers = m[1];
    } else if ((m = /^VIR(?:EMENT)?\s+(?:SEPA\s+|INST\s+)?(?:WERO\s+)?(?:DE\s+)?(.*)$/.exec(lib))) {
      type = "vir"; tiers = m[1].replace(CIV, "");
    } else if (/^F\s|^FRAIS|^COMMISSION|^COTIS/.test(lib)) {
      type = "frais";
    } else if (/^INTERETS|^INT\.? CREDITEURS/.test(lib)) {
      type = "interets";
    }
    const key = (type === "carte" || type === "prlv" || type === "impaye" ? "" : type + ":") +
      words(tiers).filter((w) => !/^\d+$/.test(w) && !/^(CARTE|CB)$/.test(w)).join(" ");
    return { type, tiers: tiers || lib, lieu, fx, key, texte: `${lib} ${det}`.trim() };
  }

  /** Mise en forme lisible : « ALDI MARCHE 159 » → « Aldi Marche 159 ». */
  const joli = (s) => String(s || "").toLowerCase().replace(/(^|[\s.*'\-/(])([a-zà-ÿ])/g, (a, p, c) => p + c.toUpperCase());

  /* ---------------- catégories ---------------- */
  // mots : marques ou mots repérés dans le libellé. theme : mots qui, dans le nom d'une ligne du budget,
  // disent que cette ligne couvre la catégorie. unique : un seul fournisseur en général (la marque suffit).
  const CATS = [
    { id: "logement", nom: "Logement et énergie", sens: "out", unique: true,
      mots: ["ENGIE", "EDF", "TOTALENERGIES", "ENI GAS", "VEOLIA", "SUEZ", "SAUR", "LOYER", "ENERCOOP", "EKWATEUR", "OHM ENERGIE", "MINT ENERGIE"],
      theme: ["LOYER", "LOGEMENT", "ELECTRICITE", "GAZ", "ENERGIE", "EAU", "CHAUFFAGE"] },
    { id: "telecom", nom: "Téléphone et internet", sens: "out",
      mots: ["BOUYGUES", "ORANGE", "SFR", "FREE MOBILE", "FREE TELECOM", "FREEBOX", "SOSH", "RED BY SFR", "B YOU", "PRIXTEL", "NRJ MOBILE", "LA POSTE MOBILE", "SYMA"],
      theme: ["TELEPHONE", "FORFAIT", "INTERNET", "BOX", "MOBILE", "FIBRE", "PORTABLE"] },
    { id: "assurance", nom: "Assurances", sens: "out", unique: true,
      mots: ["AXA", "MAAF", "MACIF", "MATMUT", "ALLIANZ", "GROUPAMA", "MMA", "GMF", "MAIF", "GENERALI", "DIRECT ASSURANCE", "OLIVIER ASSURANCE", "LEOCARE", "LUKO", "ASSURANCE", "ASSURANCES", "ASSU"],
      theme: ["ASSURANCE", "ASSURANCES", "ASSU", "MUTUELLE"] },
    { id: "abonnements", nom: "Abonnements et applis", sens: "out",
      mots: ["GOOGLE", "YOUTUBE", "YOUTU", "YOUTUBEPR", "NETFLIX", "SPOTIFY", "DEEZER", "DISNEY", "AMAZON PRIME", "AMZ DIGITAL", "PRIME VIDEO", "APPLE COM", "ITUNES", "ICLOUD",
        "MICROSOFT", "CLAUDE", "ANTHROPIC", "OPENAI", "CHATGPT", "CANAL", "DAZN", "ADOBE", "NOTION", "CRUNCHYROLL", "TWITCH"],
      theme: ["ABONNEMENT", "ABONNEMENTS", "APPLI", "APPLIS", "STREAMING"] },
    { id: "courses", nom: "Courses", sens: "out",
      mots: ["ALDI", "LECLERC", "CARREFOUR", "AUCHAN", "LIDL", "INTERMARCHE", "CASINO", "MONOPRIX", "FRANPRIX", "SUPER U", "HYPER U", "MARCHE U", "U EXPRESS", "NETTO",
        "LEADER PRICE", "GRAND FRAIS", "PICARD", "BIOCOOP", "SPAR", "COCCINELLE", "PROXI", "CORA", "GEANT", "SYSTEME U"],
      theme: ["COURSES", "ALIMENTATION", "NOURRITURE", "SUPERMARCHE"] },
    { id: "restos", nom: "Restos et sorties", sens: "out",
      mots: ["RESTAURANT", "RESTO", "PATATERIE", "EAT", "MCDO", "MC DONALD", "MAC DONALD", "MCDONALD", "MCDONALDS", "BURGER", "KFC", "SUBWAY", "DOMINO", "DOMINOS", "PIZZA", "SUSHI", "KEBAB",
        "TACOS", "UBER EATS", "DELIVEROO", "JUST EAT", "BAR", "PUB", "CAFE", "BRASSERIE", "BOULANGERIE", "PATISSERIE", "STARBUCKS", "COLUMBUS", "BUFFALO", "COURTEPAILLE",
        "HIPPOPOTAMUS", "POKE", "CREPERIE", "BISTROT"],
      theme: ["RESTAURANT", "RESTAURANTS", "RESTO", "RESTOS", "SORTIE", "SORTIES"] },
    { id: "shopping", nom: "Shopping", sens: "out",
      mots: ["AMAZON", "AMZN", "ACTION", "CULTURA", "FNAC", "DARTY", "BOULANGER", "ZARA", "H M", "PRIMARK", "KIABI", "IKEA", "LEROY MERLIN", "CASTORAMA", "BRICO", "GIFI",
        "FOIR FOUILLE", "ALIEXPRESS", "SHEIN", "TEMU", "VINTED", "LEBONCOIN", "CELIO", "JULES", "BERSHKA", "SNIPES", "FOOT LOCKER", "COURIR", "JD SPORTS",
        "MAISONS DU MONDE", "NOZ", "STOKOMANI", "CDISCOUNT", "UNDIZ", "ETAM", "CAMAIEU", "PIMKIE", "PROMOD"],
      theme: ["SHOPPING", "VETEMENTS", "ACHATS", "HABITS"] },
    { id: "sport", nom: "Sport et loisirs", sens: "out",
      mots: ["FITNESS", "FITN", "ON AIR", "BASIC FIT", "KEEP COOL", "NEONESS", "ORANGE BLEUE", "INTERSPORT", "DECATHLON", "GO SPORT", "SPORT 2000", "CINEMA", "CGR", "PATHE",
        "GAUMONT", "MEGARAMA", "STEAM", "PLAYSTATION", "NINTENDO", "XBOX", "BOWLING", "KARTING", "PISCINE", "CLIMBING", "ESCALADE"],
      theme: ["SPORT", "SALLE", "LOISIRS", "FITNESS", "GYM", "MUSCU"] },
    { id: "carburant", nom: "Carburant", sens: "out",
      mots: ["ESSO", "SHELL", "BP", "AVIA", "DYNEFF", "AGIP", "STATION", "CARBU", "CARBURANT", "TOTAL ACCESS", "RELAIS"],
      theme: ["CARBURANT", "ESSENCE", "GASOIL", "GAZOLE", "PLEIN"] },
    { id: "transport", nom: "Transport et parking", sens: "out",
      mots: ["SNCF", "OUIGO", "TER", "BLABLACAR", "UBER", "BOLT", "TISSEO", "RATP", "NAVIGO", "PEAGE", "VINCI", "APRR", "ASF", "SANEF", "PARKING", "INDIGO", "EFFIA",
        "FLIXBUS", "RYANAIR", "EASYJET", "AIR FRANCE", "TRANSAVIA", "LIME"],
      theme: ["TRANSPORT", "TRANSPORTS", "TRAIN", "BUS", "PEAGE", "VOITURE", "PARKING"] },
    { id: "sante", nom: "Santé et beauté", sens: "out",
      mots: ["PHARMA", "PHARMACIE", "PHIE", "PHCIE", "MEDECIN", "DOCTEUR", "DR", "DENTISTE", "DENTAIRE", "OPTIC", "OPTIQUE", "KRYS", "AFFLELOU", "COIFF", "COIFFURE", "COIFFEUR", "BARBER",
        "BARBIER", "PASCAL COSTE", "DESSANGE", "SAINT ALGUE", "FRANCK PROVOST", "TCHIP", "LABO", "LABORATOIRE", "HOPITAL", "CLINIQUE", "KINE", "OSTEO", "NOCIBE",
        "MARIONNAUD", "YVES ROCHER", "DOCTOLIB", "SEPHORA"],
      theme: ["SANTE", "COIFFEUR", "COIFFURE", "MEDECIN", "PHARMACIE", "BEAUTE", "SOINS"] },
    { id: "trading", nom: "Trading et paris", sens: "out",
      mots: ["APEX TRADER", "TRADER", "TRADING", "TOPSTEP", "FTMO", "TRADINGVIEW", "BINANCE", "COINBASE", "KRAKEN", "BITPANDA", "ETORO", "DEGIRO", "TRADE REPUBLIC",
        "WINAMAX", "BETCLIC", "UNIBET", "PMU", "FDJ", "PARIONS", "ZEBET", "POKER", "CASINO BARRIERE"],
      theme: ["TRADING", "BOURSE", "PARIS", "CRYPTO"] },
    { id: "banque", nom: "Frais de la banque", sens: "out", unique: true,
      mots: ["F COTIS", "COTIS", "COTISATION", "FRAIS TENUE"],
      theme: ["COTISATION", "BANCAIRE", "BANQUE", "BANCAIRES"] },
    { id: "incidents", nom: "Frais d'incident", sens: "out", alerte: true,
      mots: ["F COMM INTERVENTION", "COMMISSION INTERVENTION", "COMM INTERVENTION", "F FRAIS PRLV IMP", "FRAIS PRLV IMP", "REJET", "F LETTRE", "LETTRE INFO", "AGIOS", "INTERETS DEBITEURS", "F FRAIS"],
      theme: ["INCIDENT", "INCIDENTS", "AGIOS"] },
    { id: "retraits", nom: "Retraits d'espèces", sens: "out", mots: ["RETRAIT DAB", "RETRAIT"], theme: ["RETRAIT", "RETRAITS", "ESPECES", "LIQUIDE"] },
    { id: "envoyes", nom: "Virements envoyés", sens: "out", mots: [], theme: [] },
    { id: "autres-dep", nom: "Autres dépenses", sens: "out", mots: [], theme: [] },
    { id: "revenus", nom: "Revenus", sens: "in",
      mots: ["FRANCE TRAVAIL", "POLE EMPLOI", "SALAIRE", "PAIE", "CAF", "ALLOCATION", "ALLOCATIONS", "APL", "PRIME D ACTIVITE", "CROUS", "URSSAF"],
      theme: ["REVENU", "REVENUS", "SALAIRE", "PAIE", "ALLOCATION", "ALLOCATIONS", "CHOMAGE"] },
    { id: "rembourse", nom: "Remboursements", sens: "in",
      mots: ["DDFIP", "DGFIP", "IMPOT", "IMPOTS", "TRESOR PUBLIC", "REMBOURSEMENT", "REMB", "REMBT", "CPAM", "AMELI", "MUTUELLE", "AVOIR", "ANNULATION"],
      theme: ["REMBOURSEMENT", "REMBOURSEMENTS"] },
    { id: "interets", nom: "Intérêts", sens: "in", mots: ["INTERETS"], theme: ["INTERETS"] },
    { id: "recus", nom: "Virements reçus", sens: "in", mots: [], theme: [] },
    { id: "autres-ent", nom: "Autres rentrées", sens: "in", mots: [], theme: [] },
    { id: "interne", nom: "Entre mes comptes", sens: "neutre", mots: [], theme: [] },
  ];
  const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
  const hasWord = (text, phrase) => new RegExp(`(^|[^A-Z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Z0-9])`).test(text);
  const flat = (s) => words(s).join(" ");

  /** Catégorie générale d'une opération d'après des mots connus. */
  function guessCat(op, d, side) {
    const text = flat(d.texte);
    if (d.type === "frais") {
      if (/COTIS/.test(text) && !/INTERVENTION|IMP|REJET/.test(text)) return "banque";
      return "incidents";
    }
    if (d.type === "retrait") return "retraits";
    if (d.type === "carte" && /(^| )TOTAL( |$)/.test(text)) return "carburant";
    // le mot connu le plus long l'emporte : « ORANGE BLEUE » (salle de sport) avant « ORANGE »
    let hit = null;
    for (const c of CATS) {
      if (c.sens !== side) continue;
      for (const w of c.mots) if ((!hit || w.length > hit.len) && hasWord(text, w)) hit = { id: c.id, len: w.length };
    }
    if (hit) return hit.id;
    if (d.type === "vir") return side === "out" ? "envoyes" : "recus";
    if (d.type === "interets") return "interets";
    return side === "out" ? "autres-dep" : "autres-ent";
  }

  const STOP = new Set(["VIREMENT", "VIR", "PRLV", "PRELEVEMENT", "PAIEMENT", "CARTE", "ABONNEMENT", "MENSUEL", "MENSUELLE", "LES", "DES", "POUR",
    "SUR", "AUX", "MON", "MES", "UNE", "AVEC", "PAR", "ET", "DE", "DU", "LA", "LE", "EN", "AU", "MA", "UN", "D", "L"]);
  const lineTokens = (nom) => words(nom).filter((w) => w.length >= 3 && !STOP.has(w));
  const tokMatch = (w, t) => w === t || (Math.min(w.length, t.length) >= 4 && (w.startsWith(t) || t.startsWith(w)));

  /** La ligne du budget couvre-t-elle cette catégorie ? */
  function absorbs(line, catId) {
    const c = CAT[catId];
    if (!c) return false;
    const ws = words(line.nom);
    if (ws.some((w) => c.theme.includes(w))) return true;
    return !!c.unique && c.mots.some((m) => hasWord(flat(line.nom), m));
  }

  /**
   * Classement automatique d'une opération : une ligne de mon budget (« b:id ») quand c'est clair,
   * sinon une catégorie hors budget (« c:id »).
   */
  function autoClass(op, d, budget, side) {
    const lines = (budget && Array.isArray(budget[side === "out" ? "depenses" : "recettes"]) ? budget[side === "out" ? "depenses" : "recettes"] : [])
      .filter((l) => l && l.id && l.nom);
    const opWords = words(d.texte);
    const amt = Math.abs(op.montant);
    let best = null;
    for (const l of lines) {
      const toks = lineTokens(l.nom);
      if (!toks.length) continue;
      const m = toks.filter((t) => opWords.some((w) => tokMatch(w, t))).length;
      if (!m) continue;
      const full = m === toks.length;
      const plan = Number(l.montant) || 0;
      const diff = Math.abs(amt - plan);
      if (!full && diff > Math.max(2, 0.5 * plan)) continue;
      const score = [m, full ? 1 : 0, -diff];
      if (!best || score[0] > best.s[0] || (score[0] === best.s[0] && (score[1] > best.s[1] || (score[1] === best.s[1] && score[2] > best.s[2])))) best = { l, s: score };
    }
    if (best) return "b:" + best.l.id;
    if (d.type === "prlv") {
      const same = lines.filter((l) => Math.abs(amt - (Number(l.montant) || 0)) < 0.005);
      if (same.length === 1) return "b:" + same[0].id;
    }
    const cat = guessCat(op, d, side);
    const abs = lines.filter((l) => absorbs(l, cat));
    if (abs.length) {
      abs.sort((a, b) => Math.abs(amt - (Number(a.montant) || 0)) - Math.abs(amt - (Number(b.montant) || 0)));
      return "b:" + abs[0].id;
    }
    return "c:" + cat;
  }

  /**
   * Infos calculées pour chaque opération : description, virement entre mes comptes,
   * prélèvement rejeté relié au prélèvement d'origine.
   */
  function enrich(releves, ops) {
    const rel = new Map((releves || []).map((r) => [r.id, r]));
    const info = new Map();
    (ops || []).forEach((op) => info.set(op.id, { d: describe(op), interne: false, lie: null }));
    (ops || []).forEach((op) => {
      const x = info.get(op.id);
      const r = rel.get(op.rel);
      if (x.d.type !== "vir" || !r) return;
      const text = flat(x.d.texte);
      const owner = r.titulaire ? flat(norm(r.titulaire).replace(CIV, "")) : "";
      const own = flat(op.compteNom || "");
      const names = [...(r.comptes || []).map((c) => c.nom), ...(r.autres || []).map((a) => a.nom)].map(flat).filter((n) => n && n !== own);
      if ((owner && owner.split(" ").length >= 2 && hasWord(text, owner)) || names.some((n) => hasWord(text, n))) x.interne = true;
    });
    const used = new Set();
    const sorted = (ops || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    sorted.forEach((op) => {
      const x = info.get(op.id);
      if (x.d.type !== "impaye") return;
      const t0 = Date.parse(op.date);
      let pick = null;
      sorted.forEach((o) => {
        if (o === op || used.has(o.id) || o.compte !== op.compte || o.montant >= 0) return;
        if (Math.abs(Math.abs(o.montant) - Math.abs(op.montant)) > 0.005) return;
        const dt = (t0 - Date.parse(o.date)) / 864e5;
        if (dt < 0 || dt > 45 || info.get(o.id).d.type !== "prlv") return;
        if (!pick || o.date > pick.date) pick = o;
      });
      if (pick) { used.add(pick.id); x.lie = pick.id; }
    });
    return info;
  }

  /**
   * Classe toutes les opérations. Ordre : mon choix pour cette opération, ma règle pour ce commerçant,
   * virement entre mes comptes, classement automatique. Un commerçant relié à une ligne du budget
   * l'est pour toutes ses opérations ; un prélèvement rejeté suit le prélèvement d'origine.
   * Renvoie { cat: Map(id → "b:ligne" | "c:catégorie"), how: Map(id → "manuel" | "regle" | "auto") }.
   */
  function classifyAll(ops, info, budget, regles) {
    const ids = new Set([...((budget && budget.depenses) || []), ...((budget && budget.recettes) || [])].map((l) => l && l.id));
    const valid = (c) => typeof c === "string" && (c.startsWith("c:") ? !!CAT[c.slice(2)] : c.startsWith("b:") && ids.has(c.slice(2)));
    const cat = new Map(), how = new Map();
    (ops || []).forEach((op) => {
      const x = info.get(op.id);
      if (valid(op.cat)) { cat.set(op.id, op.cat); how.set(op.id, "manuel"); return; }
      const r = regles && regles[x.d.key];
      if (valid(r)) { cat.set(op.id, r); how.set(op.id, "regle"); return; }
      how.set(op.id, "auto");
      if (x.interne) { cat.set(op.id, "c:interne"); return; }
      const side = op.montant < 0 || x.d.type === "impaye" ? "out" : "in";
      cat.set(op.id, autoClass(op, x.d, budget, side));
    });
    const memo = new Map();
    (ops || []).forEach((op) => {
      const c = cat.get(op.id);
      if (how.get(op.id) !== "auto" || !c.startsWith("b:")) return;
      const k = info.get(op.id).d.key;
      if (!memo.has(k)) memo.set(k, new Set());
      memo.get(k).add(c);
    });
    (ops || []).forEach((op) => {
      const c = cat.get(op.id);
      if (how.get(op.id) !== "auto" || !c.startsWith("c:") || c === "c:interne") return;
      const s = memo.get(info.get(op.id).d.key);
      if (s && s.size === 1) cat.set(op.id, [...s][0]);
    });
    (ops || []).forEach((op) => {
      const x = info.get(op.id);
      if (x.lie && how.get(op.id) === "auto" && cat.has(x.lie)) cat.set(op.id, cat.get(x.lie));
    });
    return { cat, how };
  }

  const api = { parseReleve, enrich, classifyAll, describe, joli, CATS, CAT, autoClass, guessCat, absorbs, isCourant, norm, words, flat, hasWord };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PatrimoineReleve = api;
})(typeof window !== "undefined" ? window : globalThis);
