// Interpretation of raw `movements` rows: merchant name, detail, category, group and payment channel.
// Pure functions (no DOM, no network): the app and the Node tests both use them.

const COMPLETED = new Set(["approved", "refunded", "charged_back", "in_mediation"]);

// A purchase with the Mercado Pago card in a shop stays "authorized" (status_detail pending_capture) until the shop
// finishes charging it, which can take days; meanwhile the money is already held: the Releases report debits it at
// once as reserve_for_payment (checked 2026-10-02, tools/check_card.mjs). So money OUT that is authorized counts.
// If the shop never charges it, Mercado Pago marks it cancelled and the next sync drops it.
export const isCompleted = (row) => COMPLETED.has(row.status) || (row.status === "authorized" && row.direction === "out");
export const isPending = (row) => row.status === "authorized";
const SHOP_CARD = "MP_DEBIT_CARD"; // point_of_interaction.type of a purchase with the Mercado Pago card in a shop
export const kindOf = (row) => `${row.direction}:${row.operation_type}:${row.row_type}`;

/** "DIARCO" -> "Diarco", "MOVIMI" -> "Movimi"; short acronyms (DIA, ATC) and mixed case stay as they are. */
export function pretty(s) {
  s = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!s || s !== s.toUpperCase() || s.length <= 4) return s;
  return s.toLowerCase().replace(/(^|[\s/(.-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

function descriptor(row) {
  const m = /MERPAGO\*\s*(\S.*)$/i.exec(row.statement_descriptor || "") || /MERPAGO\*\s*(\S+)/i.exec(row.description || "");
  return m ? m[1].trim() : "";
}

/** { merchant, detail } for a row: who you paid (or who paid you) and what it was. */
export function merchantOf(row, rules) {
  const R = rules.merchants, desc = row.description || "", titles = row.item_titles || "";
  const kind = kindOf(row), unit = row.business_unit || "";
  const sd = descriptor(row), sdName = sd ? (R.aliases[sd.toUpperCase()] ?? pretty(sd)) : "";
  const cleanDesc = desc.replace(/\s*MERPAGO\*\S*/i, "").trim();
  const isGeneric = (s) => !s || /^\d+$/.test(s) || R.generic.includes(s.toLowerCase());
  const fromPattern = () => {
    for (const p of R.patterns) {
      const m = new RegExp(p, "i").exec(cleanDesc);
      if (m && m[1] && !isGeneric(m[1].trim())) return pretty(m[1].trim());
    }
    return "";
  };
  const site = (row.merchant_site || "").replace(/^www\./, "");
  const siteName = Object.entries(R.sites).find(([k]) => site === k || site.endsWith("." + k))?.[1] ?? "";
  const detail = titles || (!isGeneric(cleanDesc) ? cleanDesc : "");

  if (row.operation_type === "payout") {
    return { merchant: "Transferencia a alias/CBU/CVU", detail: "A una cuenta de otro banco o billetera; Mercado Pago no informa el destinatario" };
  }
  if (row.direction === "in") {
    if (row.row_type === "refund") return { merchant: merchantOf({ ...row, direction: "out", row_type: "payment" }, rules).merchant, detail: "Devolución" };
    // money sent to your CVU/alias from any bank: Mercado Pago lists YOU as the payer, so it can't tell whether you
    // moved your own money or someone else sent it (a note can say which)
    if (row.operation_type === "account_fund") return { merchant: "Transferencia recibida (CVU/alias)",
      detail: isGeneric(cleanDesc) || /^bank transfer$/i.test(cleanDesc) ? "Mercado Pago no informa quién la envió" : cleanDesc };
    return { merchant: pretty(row.counterparty) || "Transferencia recibida", detail: cleanDesc };
  }
  if (row.row_type === "refund") return { ...merchantOf({ ...row, row_type: "payment" }, rules), detail: "Devolución" };
  if (kind === "out:money_transfer:payment") {
    return { merchant: pretty(row.holder_name || row.counterparty) || "Transferencia a cuenta de Mercado Pago",
             detail: row.holder_name || row.counterparty ? cleanDesc : "Mercado Pago no informa el destinatario" };
  }
  if (unit.startsWith("credits/")) return { merchant: "Mercado Crédito", detail: cleanDesc };
  if (unit.startsWith("marketplace/")) {  // Mercado Libre: the seller's descriptor, the item as detail
    const seller = sdName && sd.toUpperCase() !== "MERCADOLIBRE" ? sdName : "";
    return { merchant: seller ? `${seller} (Mercado Libre)` : "Mercado Libre", detail: titles || cleanDesc };
  }
  const named = row.holder_name || row.counterparty;
  if (named) return { merchant: pretty(named), detail };
  // In-store QR: the shop's own text reads better than the card descriptor ("Producto de McDonald's")
  const inStore = unit.startsWith("wallet/qr") || unit.startsWith("wallet/proximity");
  const order = inStore ? [fromPattern, () => sdName, () => siteName] : [() => sdName, () => siteName, fromPattern];
  for (const f of order) { const n = f(); if (n) return { merchant: n, detail: detail === n ? "" : detail }; }
  if (R.branches?.[row.branch]) return { merchant: R.branches[row.branch], detail: detail === "SUBE" ? "" : detail };
  if (!isGeneric(cleanDesc) && cleanDesc.length <= 30) return { merchant: pretty(cleanDesc), detail: "" };
  if (titles) return { merchant: "Compra online", detail: titles };
  return { merchant: "Sin nombre", detail: cleanDesc };
}

function mlCategory(path, rules) {
  const hits = Object.keys(rules.mercadoLibre).filter((k) => path === k || path.startsWith(k + " > "));
  return hits.length ? rules.mercadoLibre[hits.sort((a, b) => b.length - a.length)[0]] : null;
}

function companyRe(rules) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\d])(${rules.companyMarkers.map(esc).join("|")})(?![\\p{L}\\d])`, "u");
}

/** Category for a money-out row. Order: MP type, payment method, business unit, MP branch, Mercado Libre
 *  category, keywords, fallbacks. Everything Mercado Pago or Mercado Libre state beats guessing from text. */
/** Lowercase, no accents, punctuation → spaces: "Café con Ana" and "cafe con ana" match the same words. */
export const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ+]+/g, " ");

/** First category whose words appear in `text` (see rules.keywords / rules.keywordsIn), or null. */
export function keywordCategory(text, list) {
  const hay = ` ${fold(text)} `;
  if (!hay.trim()) return null;
  for (const [cat, words] of list) if (words.some((w) => hay.includes(fold(w)))) return cat;
  return null;
}

// ---- words you taught the app: when you pick a category for a note whose words it didn't recognize ("Flores" →
// Regalos), those words are remembered (notes table, id "w:out:<word>" / "w:in:<word>") and used for later notes.
// Words that say nothing about what a purchase was are never learned: connectors, people, generic verbs.
const STOP = new Set(("de del la las el los lo un una unos unas que con sin por para mi mis tu tus su sus se le les me te nos " +
  "es fue era muy mas ese esa esto este esta hoy ayer pago pague pagado compra compre compramos gasto cosa cosas algo " +
  "varios varias otro otra mama papa abuela abuelo hermano hermana novia novio amigo amiga familia hijo hija tio tia " +
  "nene nena casa").split(" "));
/** Spanish plural → singular, roughly: flores → flor, panes → pan, clases → clase, remeras → remera. */
export function stem(w) {
  if (w.length > 4 && /[lrndzj]es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
/** The words of a note that could say what it was: folded, singular, no connectors, people or numbers. */
export function noteWords(text) {
  return [...new Set(fold(text).split(" ").filter((w) => w.length >= 3 && !/\d/.test(w) && !STOP.has(w)).map(stem)
    .filter((w) => !STOP.has(w)))];
}
/** The words you taught for one direction ("out" | "in"): Map word → category. */
export function learnedWords(notes, dir) {
  const p = `w:${dir}:`;
  return new Map(Object.entries(notes ?? {}).filter(([k, v]) => k.startsWith(p) && v?.category).map(([k, v]) => [k.slice(p.length), v.category]));
}
/** The category of the first word in `text` that you taught, or null. */
export function learnedCategory(text, learned) {
  for (const w of noteWords(text)) if (learned?.has(w)) return learned.get(w);
  return null;
}
/** What a note's words say: the built-in words (rules.js) first, then the words you taught. */
export const noteCategory = (text, list, learned) => keywordCategory(text, list) || learnedCategory(text, learned);
/** Words to remember when you pick `category` for a note: only if the app's guess was different, and only the
 *  words rules.js doesn't already know (so "Café con Ana" → Regalos never turns every café into a gift). */
export function wordsToLearn(text, category, list, learned) {
  if (!category || !String(text ?? "").trim() || noteCategory(text, list, learned) === category) return [];
  return noteWords(text).filter((w) => !keywordCategory(w, list) && learned?.get(w) !== category);
}

export function categorize(row, rules, text) {
  let kind = kindOf(row);
  const unit = row.business_unit || "";
  if (kind === "out:money_transfer:payment" && row.holder_name && companyRe(rules).test(row.holder_name.toLowerCase())) {
    kind = ""; // paying a business by transfer is a purchase
  }
  if (rules.types[kind]) return rules.types[kind];
  if (rules.methods[row.payment_method]) return rules.methods[row.payment_method];
  if (rules.units[unit]) return rules.units[unit];
  if (rules.branches[row.branch]) return rules.branches[row.branch];
  if (row.item_category) {
    const c = mlCategory(row.item_category, rules);
    if (c) return c;
    if (rules.unitFallback[unit]) return rules.unitFallback[unit];
  }
  // the shop's card-network category (MCC), when Mercado Pago gives it: a stated fact, so it beats guessing by words
  const byMcc = row.mcc && rules.mcc?.[String(row.mcc).padStart(4, "0")];
  if (byMcc) return byMcc;
  const byWord = keywordCategory(text, rules.keywords);
  if (byWord) return byWord;
  return rules.unitFallback[unit] || rules.typeFallback[kind] || rules.defaultOut;
}

export function categorizeIn(row, rules) {
  return rules.typesIn[kindOf(row)] || rules.defaultIn;
}

/** A note you wrote on a movement ("Café con Ana") wins: its chosen category, else the category its words
 *  point to, else the automatic one. The note becomes the detail you see. */
function withNote(r, notes, list, nonCons, rules, learned) {
  const note = notes[r.id], rule = notes[`m:${r.merchant}`]; // a rule for every movement of this merchant
  const has = note && (note.note || note.category);
  if (!has && !rule?.category) return r;
  const category = (has && (note.category || noteCategory(note.note, list, learned))) || rule?.category || r.category;
  const out = { ...r, note: has ? note.note || "" : "", auto_detail: r.detail, detail: (has && note.note) || r.detail, category,
                merchant_rule: !!rule?.category };
  if (nonCons) Object.assign(out, { group: nonCons.has(category) ? "No consumo" : (rules.groups[category] ?? "Otros"), consumption: !nonCons.has(category) });
  return out;
}

export function channelOf(row) {
  const unit = row.business_unit || "", kind = kindOf(row);
  if (row.operation_type === "payout") return "Transferencia a otro banco";
  if (row.operation_type === "account_fund") return "Transferencia recibida";
  if (kind.startsWith("in:money_transfer")) return "Transferencia recibida";
  if ((row.branch || "").startsWith("Transport")) return "Transporte público";
  if (row.channel === SHOP_CARD) return "Tarjeta Mercado Pago en comercio";
  if (kind.startsWith("out:money_transfer")) return "Transferencia a Mercado Pago";
  const top = unit.split("/")[0];
  return { marketplace: "Mercado Libre", credits: "Mercado Crédito", online_payments: "Pago online" }[top]
    || { "wallet/qr": "QR en comercio", "wallet/proximity_marketplace": "QR en comercio",
         "wallet/single_player": "Pagos desde la app" }[unit] || "Otro";
}

// card networks by Mercado Pago's payment_method_id (debit ids start with "deb")
const NETWORK = { visa: "Visa", debvisa: "Visa", master: "Mastercard", debmaster: "Mastercard", maestro: "Maestro",
  amex: "American Express", naranja: "Naranja X", cabal: "Cabal", debcabal: "Cabal", argencard: "Argencard",
  cencosud: "Cencosud", tarshop: "Tarjeta Shopping", diners: "Diners", cmr: "CMR" };
/** What paid for it (Mercado Pago says the type and the card network, not the issuing bank). */
export function methodOf(row) {
  const type = row.payment_type || "", id = row.payment_method || "";
  if (row.channel === SHOP_CARD) return "Tarjeta Mercado Pago"; // MP says account_money: the card spends it
  if (row.operation_type === "payout" || type === "account_money" || id === "account_money") return "Dinero en cuenta";
  if (["digital_currency", "consumer_credits"].includes(type) || id === "consumer_credits") return "Mercado Crédito";
  if (type === "prepaid_card") return "Tarjeta prepaga Mercado Pago";
  if (type === "debit_card") return `${NETWORK[id] ?? "Tarjeta"} débito`;
  if (type === "credit_card") return `${NETWORK[id] ?? "Tarjeta"} crédito`;
  if (type === "ticket") return "Efectivo";
  if (type === "bank_transfer") return "Transferencia bancaria";
  return type || id ? "Otro medio" : "Sin dato";
}

/** Raw rows -> the rows the app draws: completed money-out payments with merchant, category, group, channel.
 *  Refunds of those payments come in as NEGATIVE spending in the same merchant/category, so a refunded purchase
 *  nets to zero instead of counting as spending. */
export function enrich(rows, rules, recipients = {}, notes = {}) {
  const nonCons = new Set(rules.nonConsumption);
  const out = rows.filter((r) => isCompleted(r) && r.direction === "out").map((r) => {
    let { merchant, detail } = merchantOf(r, rules);
    // the user's own name for this merchant (personal rules, lib/personal.js)
    const merchant_auto = merchant; merchant = rules.renames?.[merchant] ?? merchant;
    // transfers you sent: Mercado Pago doesn't name the recipient; the name is the one you gave (recipients table)
    const isTransfer = r.operation_type === "money_transfer";
    // payouts (to a CVU/alias/CBU at another bank) carry a key too once the report includes the destination account
    const key = isTransfer || r.operation_type === "payout" ? (r.recipient_key || "") : "";
    const who = key ? recipients[key] : null;
    // the "Motivo" you typed when sending (unless it's Mercado Pago's default "Varios")
    const concept = String(r.description ?? "").trim();
    const motive = isTransfer && concept && !(rules.merchants?.generic ?? []).includes(concept.toLowerCase()) ? concept : "";
    if (key && !r.holder_name && !r.counterparty) {
      merchant = who?.name || recipientLabel(key);
      detail = who ? motive : motive || "Sin nombre: tocá la transferencia para ponérselo";
    }
    const text = [merchant, detail, r.description, r.statement_descriptor, r.merchant_site].join(" ");
    if (isPending(r)) detail = [detail, "Pendiente: el comercio todavía no terminó de cobrarla"].filter(Boolean).join(" · ");
    // a category you chose for this person wins; then what the Motivo says ("Alquiler octubre" → Servicios);
    // a name with "S.A.", "S.R.L."… is a business (a purchase)
    const category = who?.category || (motive && keywordCategory(motive, rules.keywords.filter(([c]) => c !== "Transferencias enviadas")))
      || categorize({ ...r, row_type: "payment", holder_name: r.holder_name || who?.name || "" }, rules, text);
    return {
      id: r.id, date: r.date.slice(0, 10), month: r.month, amount: -Number(r.amount),
      merchant, merchant_auto, detail, category, group: nonCons.has(category) ? "No consumo" : (rules.groups[category] ?? "Otros"),
      consumption: !nonCons.has(category), channel: channelOf(r), method: methodOf(r), refund: r.row_type === "refund",
      recipient_key: key, recipient_named: !!who,
      _group: r.row_type === "payment" ? (r.group_id || "") : "", _method: r.payment_type || r.payment_method || "",
    };
  });
  const learned = learnedWords(notes, "out");
  return mergeSplitPayments(out, rules).map((r) => withNote(r, notes, rules.keywords, nonCons, rules, learned));
}

/** Until you name them, recipients get a short stable label from their key ("Destinatario 3FA1"). */
export const recipientLabel = (key) => `Destinatario ${String(key).slice(0, 4).toUpperCase()}`;

const METHOD = { account_money: "dinero en cuenta", prepaid_card: "tarjeta", debit_card: "tarjeta de débito",
  credit_card: "tarjeta de crédito", digital_currency: "Mercado Crédito", consumer_credits: "Mercado Crédito",
  ticket: "efectivo", bank_transfer: "transferencia" };

/** One purchase paid with several methods = one spending: the parts (same group_id) become one row with the
 *  total, described by the largest part, dated at its first part, and noting the methods used. */
export function mergeSplitPayments(list, rules) {
  const groups = new Map();
  list.forEach((r) => { if (r._group) groups.set(r._group, [...(groups.get(r._group) ?? []), r]); });
  const merged = new Map();
  groups.forEach((parts, key) => {
    if (parts.length < 2) return;
    const main = parts.reduce((a, b) => (b.amount > a.amount ? b : a));
    const methods = [...new Set(parts.map((p) => METHOD[p._method] ?? p._method).filter(Boolean))];
    const first = parts.reduce((a, b) => (b.date < a.date ? b : a));
    const used = new Set(parts.map((p) => p.method));
    merged.set(key, { ...main, id: `group:${key}`, date: first.date, month: first.month,
      method: used.size > 1 ? "Varios medios" : main.method,
      amount: Math.round(parts.reduce((a, p) => a + p.amount, 0) * 100) / 100, parts: parts.length,
      detail: [main.detail, `Pagado con ${methods.join(" + ") || `${parts.length} medios`}`].filter(Boolean).join(" · ") });
  });
  const done = new Set();
  return list.flatMap((r) => {
    const g = r._group && merged.get(r._group);
    const clean = ({ _group, _method, ...rest }) => rest;
    if (!g) return [clean(r)];
    if (done.has(r._group)) return [];
    done.add(r._group); return [clean(g)];
  });
}

/**
 * Does this movement change the Mercado Pago available balance? Money in always does; money out only when paid
 * with account money (card payments are charged to the card). Verified 2026-09-29 against a 30-day Releases
 * report: with this rule, credits (1.414.365,84) and debits (433.997,90) match the report to the cent; the only
 * payments absent from the report were 4 prepaid-card payments. Payouts come from the report itself.
 */
export function affectsBalance(r) {
  if (!isCompleted(r) || r.row_type === "payout") return false;
  if (r.direction === "in") return true;
  return r.payment_method === "account_money" || r.payment_type === "account_money";
}

/**
 * Current balance = the last balance Mercado Pago verified (its Releases report, which lags by hours) + every
 * balance-changing movement created after it (the payments list is live). Payouts newer than the report can't be
 * added yet: they appear when Mercado Pago includes them in a report.
 */
export function liveBalance(rawRows, snapshot) {
  if (!snapshot) return null;
  const since = new Date(snapshot.as_of).getTime();
  const after = rawRows.filter((r) => affectsBalance(r) && new Date(r.date).getTime() > since);
  return {
    value: Math.round((Number(snapshot.available) + after.reduce((a, r) => a + Number(r.amount), 0)) * 100) / 100,
    added: after.length, verified: Number(snapshot.available), as_of: snapshot.as_of, fetched_at: snapshot.fetched_at,
  };
}

/** Raw rows -> money IN: transfers received (by CVU/alias or from Mercado Pago accounts); refunds are netted in
 *  spending. A note ("sueldo", "es mío") can set what each one was. */
export function enrichIn(rows, rules, notes = {}) {
  const learned = learnedWords(notes, "in");
  return rows.filter((r) => isCompleted(r) && r.direction === "in" && r.row_type === "payment").map((r) => {
    const { merchant: merchant_auto, detail } = merchantOf(r, rules);
    const merchant = rules.renames?.[merchant_auto] ?? merchant_auto;
    const category = categorizeIn(r, rules);
    const row = { id: r.id, date: r.date.slice(0, 10), month: r.month, amount: Number(r.amount), merchant, merchant_auto, detail,
                  category, group: category, consumption: true, channel: channelOf(r), refund: false };
    const noted = withNote(row, notes, rules.keywordsIn ?? [], null, rules, learned);
    return { ...noted, group: noted.category };
  });
}
