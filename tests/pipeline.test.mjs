// npm test   (invented data only)
import { test } from "node:test";
import assert from "node:assert/strict";
import { localIso, mpTime, monthWindows, paymentRows, parseCsv, parseAmount, releaseBalance, payoutRows }
  from "../web/lib/normalize.js";
import rules from "../web/rules.js";
import { merchantOf, categorize, enrich, enrichIn, pretty, channelOf, liveBalance, keywordCategory, noteWords, stem,
  wordsToLearn, learnedWords, learnedCategory } from "../web/lib/model.js";
import { monthlyBars, horizontalBars, categoryColumns, categoryBars, categoryTable } from "../web/lib/charts.js";
import { demoRows } from "../web/lib/demo.js";
import { ICONS } from "../web/lib/icons.js";
import { brandOf, brandSvg, BRAND_KEYS } from "../web/lib/brands.js";
import { DIMS, dimsFor, groupRows, valueLook } from "../web/lib/breakdown.js";

const ME = 111;
const SECRETS = ["vendedor@ejemplo.com", "20123456789", "1144445555", "0000003100012345678901", "10.0.0.1"];
const pay = (over = {}) => ({
  id: 5001, operation_type: "regular_payment", status: "approved", payment_type_id: "account_money",
  payment_method_id: "account_money", date_created: "2026-08-31T22:30:00.000-04:00",
  date_last_updated: "2026-08-31T22:30:05.000-04:00", transaction_amount: 1000, transaction_amount_refunded: 0,
  transaction_details: { total_paid_amount: 1100, net_received_amount: 1000 }, payer_id: ME,
  collector: { id: 999, email: SECRETS[0], identification: { type: "CUIT", number: SECRETS[1] }, phone: { number: SECRETS[2] } },
  description: "Compra en Súper Ejemplo - Suc. 12", statement_descriptor: null,
  additional_info: { ip_address: SECRETS[4], items: [] },
  point_of_interaction: { type: "INSTORE", business_info: { unit: "wallet", sub_unit: "qr", branch: "QR" },
    transaction_data: { bank_info: { collector: { account_id: SECRETS[3] } } } },
  refunds: [], ...over,
});

// ------------------------------------------------------------ normalize (cloud side)
test("dates are converted to Argentina time, so a late-night payment stays in its month", () => {
  assert.equal(localIso("2026-08-31T22:30:00.000-04:00"), "2026-08-31T23:30:00-03:00");
  const [row] = paymentRows(pay(), ME);
  assert.equal(row.month, "2026-08");
});

test("MP date format and month windows", () => {
  assert.equal(mpTime(2026, 8, 1), "2026-09-01T00:00:00.000-03:00");
  const w = monthWindows(12, new Date("2026-09-29T02:00:00Z")); // 28 Sep 23:00 in Argentina
  assert.equal(w[0].label, "2025-10");
  assert.equal(w.at(-1).label, "2026-09");
  assert.equal(w.at(-1).end, "2026-09-30T23:59:59.999-03:00");
});

test("outgoing payment row: signed total paid, facts only, never contact/ID/account data", () => {
  const [row] = paymentRows(pay(), ME);
  assert.equal(row.amount, -1100);
  assert.equal(row.direction, "out");
  assert.equal(row.business_unit, "wallet/qr");
  assert.equal(row.id, "5001:payment");
  const text = JSON.stringify(row);
  for (const s of SECRETS) assert.ok(!text.includes(s), s);
});

test("refunds become their own rows with opposite sign; rejected refunds are ignored", () => {
  const rows = paymentRows(pay({ status: "refunded", transaction_amount_refunded: 1000, refunds: [
    { id: 1, amount: 600, status: "approved", date_created: "2026-09-02T10:00:00.000-04:00" },
    { id: 2, amount: 999, status: "rejected", date_created: "2026-09-03T10:00:00.000-04:00" }] }), ME);
  assert.deepEqual(rows.map((r) => [r.id, r.amount, r.month]), [["5001:payment", -1100, "2026-08"], ["5001:refund:1", 600, "2026-09"]]);
});

test("Mercado Libre category ids are resolved through the given resolver", () => {
  const [row] = paymentRows(pay({ additional_info: { items: [{ title: "Lámpara", category_id: "MLA1584" }] } }), ME,
    (id) => (id === "MLA1584" ? "Hogar, Muebles y Jardín > Lámparas" : id));
  assert.equal(row.item_category, "Hogar, Muebles y Jardín > Lámparas");
  assert.equal(row.item_titles, "Lámpara");
});

// ------------------------------------------------------------ model (app side)
const raw = (over) => ({ ...paymentRows(pay(), ME)[0], ...over });

test("merchant names from descriptors, description patterns, sites and aliases", () => {
  const m = (over) => merchantOf(raw(over), rules).merchant;
  assert.equal(m({ description: "Compra en Carrefour - Suc. 430" }), "Carrefour");
  assert.equal(m({ description: "Producto de McDonald's" }), "McDonald's");
  assert.equal(m({ description: "Pago con Mercado Pago en DIARCO" }), "Diarco");
  assert.equal(m({ description: "Pago Online", statement_descriptor: "MERPAGO*HELADOSEJEMPLO" }), "Heladosejemplo");
  assert.equal(m({ description: "Inflables Ejemplo - Servicio de inflado" }), "Inflables Ejemplo");
  assert.equal(m({ description: "Pago de cuota", business_unit: "online_payments/checkout_pro",
                   merchant_site: "services.apps.medicus.com.ar" }), "Medicus");
  assert.equal(m({ description: "", statement_descriptor: "MERPAGO*SUBEVIAJES", business_unit: "wallet/single_player",
                   branch: "Transport - QRC" }), "SUBE (viajes)");
  assert.equal(m({ description: "SUBE", business_unit: "wallet/single_player",
                   branch: "Transport - Public transport recharge" }), "SUBE (carga)");
});

test("Mercado Libre: the seller as merchant, the item as detail", () => {
  const r = raw({ business_unit: "marketplace/checkout_on", statement_descriptor: "MERPAGO*TECNOEJEMPLO",
                  description: "Auriculares Ejemplo", item_titles: "Auriculares Ejemplo" });
  assert.deepEqual(merchantOf(r, rules), { merchant: "Tecnoejemplo (Mercado Libre)", detail: "Auriculares Ejemplo" });
  assert.equal(merchantOf({ ...r, statement_descriptor: "MERPAGO*MERCADOLIBRE" }, rules).merchant, "Mercado Libre");
});

test("transfers say plainly that Mercado Pago doesn't name the recipient", () => {
  const r = raw({ operation_type: "money_transfer", description: "Varios", business_unit: "digital_accounts_cards/money_outflows" });
  assert.deepEqual(merchantOf(r, rules), { merchant: "Transferencia a cuenta de Mercado Pago", detail: "Mercado Pago no informa el destinatario" });
  const [e] = enrich([{ ...r, id: "t1", date: "2026-09-10T10:00:00-03:00", month: "2026-09", amount: -5000 }], rules);
  assert.deepEqual([e.category, e.consumption, e.group], ["Transferencias enviadas", true, "Transferencias"], "transfers count as spending");
});

test("categories follow MP labels before keywords", () => {
  const c = (over, text = "") => categorize(raw(over), rules, text);
  assert.equal(c({ operation_type: "recurring_payment", business_unit: "wallet/single_player", branch: "Transport - QRC" }), "Transporte");
  assert.equal(c({ business_unit: "marketplace/checkout_on", item_category: "Electrónica, Audio y Video > Cables" }, "cable hdmi"), "Tecnología");
  assert.equal(c({ business_unit: "marketplace/checkout_on", item_category: "Belleza y Cuidado Personal > Cremas" }, "crema cuidado personal"), "Belleza y cuidado personal");
  assert.equal(c({ business_unit: "marketplace/checkout_on", item_category: "Bebés > Cochecitos" }, "cochecito"), "Compras varias", "an ML category without a mapping: the fallback");
  assert.equal(c({ payment_method: "consumer_credits", business_unit: "marketplace/checkout_on" }), "Compras financiadas (se cuentan por cuota)");
  assert.equal(c({ business_unit: "credits/core" }), "Cuotas de créditos");
  assert.equal(c({}, "carrefour"), "Supermercado y almacén");
  assert.equal(c({ operation_type: "money_transfer" }, "juan"), "Transferencias enviadas");
});

test("enrich: completed money-out only; refunds net against the purchase", () => {
  const rows = paymentRows(pay({ status: "refunded", transaction_amount_refunded: 500,
    refunds: [{ id: 9, amount: 500, status: "approved", date_created: "2026-09-05T10:00:00.000-04:00" }] }), ME)
    .concat(paymentRows(pay({ id: 7, status: "rejected" }), ME))
    .concat(paymentRows(pay({ id: 8, collector_id: ME, collector: null, operation_type: "account_fund" }), ME));
  const e = enrich(rows, rules);
  assert.deepEqual(e.map((r) => [r.id, r.amount, r.merchant, r.category]), [
    ["5001:payment", 1100, "Súper Ejemplo", "Supermercado y almacén"],
    ["5001:refund:9", -500, "Súper Ejemplo", "Supermercado y almacén"]]);
});

test("one purchase paid with two methods counts as ONE spending; lone payments of an order stay as they are", () => {
  const ml = { operation_type: "regular_payment", description: "Lámpara Ejemplo", additional_info: { items: [{ title: "Lámpara Ejemplo" }] },
    point_of_interaction: { type: "CHECKOUT", business_info: { unit: "marketplace", sub_unit: "checkout_on" } },
    statement_descriptor: "MERPAGO*CASAEJEMPLO", order: { id: 99, type: "mercadolibre" },
    metadata: { payments_group_uuid: "u-1", payments_group_size: 2 } };
  const a = pay({ ...ml, id: 21, payment_type_id: "account_money", payment_method_id: "account_money", transaction_amount: 3000,
    transaction_details: { total_paid_amount: 3000 }, date_created: "2026-09-12T10:00:00.000-04:00" });
  const b = pay({ ...ml, id: 22, payment_type_id: "prepaid_card", payment_method_id: "visa", transaction_amount: 1850,
    transaction_details: { total_paid_amount: 1850 }, date_created: "2026-09-12T10:00:02.000-04:00" });
  const solo = pay({ id: 23, order: { id: 100 }, date_created: "2026-09-13T10:00:00.000-04:00" });
  assert.equal(paymentRows(a, ME)[0].group_id, "g:u-1");
  assert.equal(paymentRows(solo, ME)[0].group_id, "o:100");
  assert.equal(paymentRows(pay({ id: 24 }), ME)[0].group_id, "");
  const e = enrich([a, b, solo].flatMap((p) => paymentRows(p, ME)), rules);
  assert.equal(e.length, 2, "the two parts became one row; the lone order payment is untouched");
  const [m] = e;
  assert.equal(m.amount, 4850);
  assert.equal(m.parts, 2);
  assert.equal(m.merchant, "Casaejemplo (Mercado Libre)");
  assert.match(m.detail, /Pagado con dinero en cuenta \+ tarjeta/);
  assert.ok(!("_group" in m) && !("_group" in e[1]), "internal fields don't leak");
});

test("transfer recipients: a stable label until named; your name and category apply to every transfer to them", () => {
  const t = (id, over = {}) => ({ ...paymentRows(pay({ id, operation_type: "money_transfer", description: "Varios",
    point_of_interaction: { business_info: { unit: "digital_accounts_cards", sub_unit: "money_outflows" } } }), ME)[0],
    recipient_key: "3fa1c0ffee00000000aa", ...over });
  const [u] = enrich([t(31)], rules);
  assert.deepEqual([u.merchant, u.category, u.recipient_key, u.recipient_named], ["Destinatario 3FA1", "Transferencias enviadas", "3fa1c0ffee00000000aa", false]);
  const named = enrich([t(31), t(32, { description: "Alquiler octubre" })], rules, { "3fa1c0ffee00000000aa": { name: "Juan", category: "Hogar" } });
  assert.deepEqual(named.map((r) => [r.merchant, r.category, r.detail]), [["Juan", "Hogar", ""], ["Juan", "Hogar", "Alquiler octubre"]]);
  const [biz] = enrich([t(33)], rules, { "3fa1c0ffee00000000aa": { name: "Consorcio Ejemplo S.A.", category: null } });
  assert.notEqual(biz.category, "Transferencias enviadas", "a business name makes it a purchase");
  const [plain] = enrich([t(34, { recipient_key: "" })], rules);
  assert.equal(plain.merchant, "Transferencia a cuenta de Mercado Pago", "without a key nothing changes");
});

test("pretty names and channels", () => {
  assert.equal(pretty("DIARCO"), "Diarco");
  assert.equal(pretty("DIA"), "DIA");
  assert.equal(pretty("McDonald's"), "McDonald's");
  assert.equal(channelOf(raw({})), "QR en comercio");
  assert.equal(channelOf(raw({ business_unit: "marketplace/checkout_on" })), "Mercado Libre");
});

// ------------------------------------------------------------ charts
test("charts: the selection gets the accent, values are written on the marks", () => {
  const svg = monthlyBars([{ key: "2026-08", label: "ago", value: 100 }, { key: "2026-09", label: "sep", value: 50, partial: true }],
    "2026-09", { width: 400, fmt: (v) => `$${v}` });
  assert.match(svg, /class="bar on partial"/);
  assert.match(svg, />\$100</);
  assert.ok(!/axis|grid/.test(svg));
  const h = horizontalBars([{ key: "a", name: "A", value: 70 }, { key: "b", name: "B", value: 30 }], "b", { total: 100 });
  assert.match(h, /<button class="hrow on" data-key="b"/);
  assert.match(h, /<button class="hrow dim" data-key="a"/);
  assert.match(h, /30 · 30%/);
  assert.match(horizontalBars([], null), /No hay gastos/);
});

test("category columns: one color, height ∝ amount, each column labeled with icon, name, times and %; scrolls when crowded", () => {
  const items = [{ key: "A", name: "Supermercado y almacén", value: 60, n: 7, pct: 60, icon: "cart" },
    { key: "B", name: "Transporte", value: 30, n: 1, pct: 30, icon: "bus" }];
  const c = categoryColumns(items, { width: 400, fmt: (v) => `$${v}` });
  const heights = [...c.matchAll(/class="bar"[^>]*d="M[\d.]+,([\d.]+)V([\d.]+)/g)].map((m) => +m[1] - +m[2]);
  assert.equal(heights.length, 2);
  assert.ok(Math.abs(heights[0] / heights[1] - 2) < 0.1, "twice the money, about twice the height");
  assert.ok(!/--s:|style="fill/.test(c), "no per-category colors: identity is the label, not the color");
  assert.equal((c.match(/class="cicon"/g) ?? []).length, 2, "a vector icon (not an emoji) under each column");
  assert.match(c, new RegExp(ICONS.cart.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "the cart drawing for the supermarket");
  assert.match(c, />Supermercado y</); assert.match(c, />almacén</);
  assert.match(c, />7 veces</); assert.match(c, />1 vez</); assert.match(c, />\$60</);
  assert.match(c, /class="pct"[^>]*>60%</); assert.match(c, /class="pct"[^>]*>30%</);
  assert.match(c, /data-key="A"/);
  assert.ok(!/scrolls/.test(c));
  const many = Array.from({ length: 11 }, (_, i) => ({ key: `k${i}`, name: `Cat ${i}`, value: 10 + i, n: 1, pct: 9 }));
  assert.match(categoryColumns(many, { width: 360 }), /class="ccols scrolls"/, "11 categories on a phone scroll sideways");
  assert.match(categoryColumns([]), /No hay movimientos/);
  const t = categoryTable(items, { fmt: (v) => `$${v}` });
  assert.match(t, /<svg class="icon ticon"[\s\S]*?<\/svg>Supermercado y almacén<\/td><td>\$60<\/td><td>7<\/td><td>60%<\/td>/);
});

test("category bars: every category in one list, one color, length ∝ amount, icon + name + amount + times + %", () => {
  const items = [{ key: "A", name: "Supermercado y almacén", value: 60, n: 7, pct: 60, icon: "cart" },
    { key: "B", name: "Transporte", value: 30, n: 1, pct: 30, icon: "bus" }];
  const h = categoryBars(items, { fmt: (v) => `$${v}` });
  const lengths = [...h.matchAll(/class="cbb"[^>]*--f:([\d.]+)/g)].map((m) => +m[1]);
  assert.deepEqual(lengths, [1, 0.5], "twice the money, twice the length");
  assert.ok(!/background:|fill:/.test(h), "no per-category colors");
  assert.equal((h.match(/<svg class="icon"/g) ?? []).length, 2, "a vector icon on each row");
  assert.match(h, /class="cbn">Supermercado y almacén</); assert.match(h, /class="cbv">\$60</);
  assert.match(h, /class="cbm">7 veces · 60%</); assert.match(h, /class="cbm">1 vez · 30%</);
  assert.match(h, /data-key="B"/);
  const many = Array.from({ length: 14 }, (_, i) => ({ key: `k${i}`, name: `Cat ${i}`, value: 10 + i, n: 1, pct: 7 }));
  assert.equal((categoryBars(many).match(/class="cb[ "]/g) ?? []).length, 14, "all 14 categories, none folded");
  const folded = categoryBars(many, { max: 8 });
  assert.equal((folded.match(/data-key=/g) ?? []).length, 8, "max 8: the largest 8 tappable…");
  assert.match(folded, /class="cbn">Resto \(6\)</, "…and the rest in one row");
  assert.match(categoryBars([{ key: "SUBE", name: "SUBE", value: 5, n: 1, pct: 100, ico: "<svg class=\"brand\"></svg>" }]),
    /class="cbico"><svg class="brand">/, "a ready-made badge replaces the icon");
  assert.match(categoryBars([]), /No hay movimientos/);
});

test("breakdowns: by payment method, channel, merchant and weekday; brands get their logo", () => {
  const r = (date, amount, over = {}) => ({ date, month: date.slice(0, 7), amount, category: "Transporte", method: "Dinero en cuenta",
    channel: "QR en comercio", merchant: "Kiosco", ...over });
  const list = [r("2026-09-28", 100), r("2026-09-28", 50, { method: "Visa débito", merchant: "SUBE" }), r("2026-09-27", 300),
    r("2026-09-29", -20)];
  assert.deepEqual(groupRows(list, "method").map((g) => [g.key, g.value, g.n]), [["Dinero en cuenta", 380, 2], ["Visa débito", 50, 1]],
    "a refund nets in but isn't a time");
  assert.deepEqual(groupRows(list, "weekday").map((g) => g.key), ["Lunes", "Domingo"], "weekdays Monday first (a day with only a refund is left out)");
  assert.equal(groupRows(list, "merchant")[0].pct, 88);
  assert.deepEqual(dimsFor("out"), ["category", "method", "channel", "merchant", "weekday"]);
  assert.deepEqual(dimsFor("in"), ["category", "merchant", "weekday"]);
  for (const [text, key] of [["SUBE", "sube"], ["Transporte público", "sube"], ["Mercado Libre", "mercadolibre"],
    ["Dinero en cuenta", "mercadopago"], ["Banco Macro", "macro"], ["Visa débito", "visa"], ["Macroeconomía", null]]) {
    assert.equal(brandOf(text), key, text);
  }
  assert.match(valueLook("method", "Dinero en cuenta", [], rules).ico, /<svg class="brand"/);
  assert.equal(valueLook("channel", "QR en comercio", [], rules).icon, "qr");
  assert.equal(valueLook("merchant", "Kiosco", [{ category: "Transporte" }], rules).icon, rules.icons.Transporte);
  assert.match(valueLook("weekday", "Miércoles", [], rules).ico, />Mi</);
  for (const k of BRAND_KEYS) assert.match(brandSvg(k), /^<svg class="brand"[\s\S]*<\/svg>$/, k);
  for (const d of Object.values(DIMS)) assert.ok(ICONS[d.icon], d.icon);
});

test("every category in the rules has an icon that exists", () => {
  const cats = new Set([...Object.keys(rules.groups), ...rules.nonConsumption, ...rules.incomeCategories]);
  const missing = [...cats].filter((c) => !ICONS[rules.icons[c]]);
  assert.deepEqual(missing, []);
  assert.deepEqual([...cats].filter((c) => !/^#[0-9a-f]{6}$/i.test(rules.tints?.[c] ?? "")), [], "and its own color for that icon");
  const bars = categoryBars([{ key: "A", name: "Súper", value: 5, n: 1, pct: 100, icon: "cart", tint: "#2e9d6a" }]);
  assert.match(bars, /class="cbi" style="--t:#2e9d6a"/, "the icon carries the category's color…");
  assert.ok(!/class="cbb"[^>]*--t:/.test(bars), "…the bar doesn't");
});

// ------------------------------------------------------------ balance, payouts, money in
const REPORT = [
  "DATE,SOURCE_ID,EXTERNAL_REFERENCE,RECORD_TYPE,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT,GROSS_AMOUNT,PAYMENT_METHOD,BALANCE_AMOUNT",
  "2026-09-01T00:00:00.000-03:00,,,initial_available_balance,,0.00,0.00,0.00,,1000.00",
  "2026-09-02T10:00:00.000-03:00,11,,release,payment,5000.00,0.00,5000.00,cvu,6000.00",
  "2026-09-03T10:00:00.000-03:00,12,,release,reserve_for_payout,2000.00,2000.00,0.00,,6000.00",
  "2026-09-03T10:00:01.000-03:00,12,,release,payout,0.00,2000.00,-2000.00,,4000.00",
  "2026-09-04T10:00:00.000-03:00,13,,release,payment,0.00,1500.50,-1500.50,account_money,2499.50",
  ",,,total,,5000.00,3500.50,,,0.00",
].join("\n");

test("balance = running balance of the last movement, not the summary total line", () => {
  assert.deepEqual(releaseBalance(REPORT), { balance: 2499.5, asOf: "2026-09-04T13:00:00.000Z" });
  assert.equal(releaseBalance("DATE,RECORD_TYPE,BALANCE_AMOUNT\n"), null);
});

test("payouts (transfers to an alias/CBU/CVU at another bank) become spending rows", () => {
  const p = payoutRows(REPORT);
  assert.deepEqual(p.map((r) => [r.row_type, r.amount, r.month]), [["payout", -2000, "2026-09"]]);
  const [e] = enrich(p, rules);
  assert.deepEqual([e.merchant, e.category, e.consumption, e.channel],
    ["Transferencia a alias/CBU/CVU", "Transferencias a otros bancos", true, "Transferencia a otro banco"]);
  assert.equal(p[0].dest, "", "no destination column in the report: nothing to name");
});

test("payouts with the destination account: same recipient = same key, named by the owner, account never kept", () => {
  const withDest = REPORT.replace("PAYMENT_METHOD,BALANCE_AMOUNT", "PAYMENT_METHOD,BALANCE_AMOUNT,PAYOUT_BANK_ACCOUNT_NUMBER")
    .split("\n").map((l, i) => (i === 0 ? l : l + (l.includes(",payout,") ? ",0000003100099999999999" : ","))).join("\n");
  const [p] = payoutRows(withDest);
  assert.equal(p.dest, "0000003100099999999999", "read from the report (the sync turns it into a key and drops it)");
  // the sync stores only recipient_key; here, a key the owner named
  const { dest, ...stored } = p;
  const row = { ...stored, recipient_key: "abc123def456abc123de" };
  const [unnamed] = enrich([row], rules);
  assert.deepEqual([unnamed.merchant, unnamed.recipient_key, unnamed.recipient_named], ["Destinatario ABC1", "abc123def456abc123de", false]);
  const [named] = enrich([row], rules, { abc123def456abc123de: { name: "Alquiler (Juan)", category: "Hogar" } });
  assert.deepEqual([named.merchant, named.category, named.channel], ["Alquiler (Juan)", "Hogar", "Transferencia a otro banco"]);
  assert.ok(!JSON.stringify(stored).includes("0000003100099999999999"));
});

test("CSV parser handles quotes, semicolons and Argentine amounts", () => {
  assert.deepEqual(parseCsv('﻿a;b\n"x;1";"1.234,56"\n'), [{ a: "x;1", b: "1.234,56" }]);
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("-1234.5"), -1234.5);
});

test("money in: CVU/alias arrivals are transfers received (Mercado Pago can't tell who sent them); a note can say", () => {
  const rows = paymentRows(pay({ id: 21, collector_id: ME, collector: null, operation_type: "account_fund", description: "Bank Transfer" }), ME)
    .concat(paymentRows(pay({ id: 22, collector_id: ME, collector: null, operation_type: "money_transfer",
      payer: { id: 5, first_name: "Ana", last_name: "Ejemplo", email: SECRETS[0] } }), ME));
  const e = enrichIn(rows, rules);
  assert.deepEqual(e.map((r) => [r.amount, r.merchant, r.category, r.channel]), [
    [1000, "Transferencia recibida (CVU/alias)", "Transferencias recibidas", "Transferencia recibida"],
    [1000, "Ana Ejemplo", "Transferencias recibidas", "Transferencia recibida"]]);
  assert.equal(enrich(rows, rules).length, 0); // never counted as spending
  const [s] = enrichIn(rows, rules, { "21:payment": { note: "Sueldo de septiembre" } });
  assert.deepEqual([s.category, s.detail], ["Sueldo", "Sueldo de septiembre"]);
  const [own] = enrichIn(rows, rules, { "21:payment": { note: "", category: "Dinero propio (desde tu banco)" } });
  assert.equal(own.category, "Dinero propio (desde tu banco)");
});

test("notes and the transfer's Motivo pick the category by their words, without caring about accents", () => {
  const qr = paymentRows(pay({ id: 41, description: "Pago QR" }), ME);
  const [c] = enrich(qr, rules, {}, { "41:payment": { note: "Café con Ana" } });
  assert.deepEqual([c.category, c.detail, c.note], ["Comida afuera y delivery", "Café con Ana", "Café con Ana"]);
  const [chosen] = enrich(qr, rules, {}, { "41:payment": { note: "algo raro", category: "Regalos" } });
  assert.equal(chosen.category, "Regalos");
  const merchant = enrich(qr, rules)[0].merchant;
  const [ruled] = enrich(qr, rules, {}, { [`m:${merchant}`]: { category: "Verdulería" } });
  assert.deepEqual([ruled.category, ruled.merchant_rule], ["Verdulería", true], "a rule for the merchant applies to all its movements");
  const [both] = enrich(qr, rules, {}, { [`m:${merchant}`]: { category: "Verdulería" }, "41:payment": { note: "Café con Ana" } });
  assert.equal(both.category, "Comida afuera y delivery", "a note on the movement beats the merchant rule");
  const [kept] = enrich(qr, rules, {}, { "41:payment": { note: "no sé qué fue" } });
  assert.equal(kept.category, enrich(qr, rules)[0].category, "a note without known words keeps the automatic category");
  const t = (desc) => enrich(paymentRows(pay({ id: 42, operation_type: "money_transfer", description: desc,
    point_of_interaction: { business_info: { unit: "digital_accounts_cards", sub_unit: "money_outflows" } } }), ME), rules)[0].category;
  assert.equal(t("Alquiler octubre"), "Servicios e impuestos");
  assert.equal(t("Verdulería del barrio"), "Verdulería");
  assert.equal(t("Varios"), "Transferencias enviadas");
});

test("a broader vocabulary: everyday purchases find their category, short words only at the start of a word", () => {
  const k = (s) => keywordCategory(s, rules.keywords);
  assert.equal(k("Ferretería del centro"), "Hogar");
  assert.equal(k("Heladera nueva"), "Hogar", "heladera is not helado");
  assert.equal(k("Helado con Juli"), "Comida afuera y delivery");
  assert.equal(k("Óptica - anteojos"), "Salud");
  assert.equal(k("Cargador notebook"), "Tecnología");
  assert.equal(k("Buzo y medias"), "Ropa");
  assert.equal(k("Fotocopias apuntes"), "Libros y educación");
  assert.equal(k("Veterinaria Toby"), "Mascotas");
  // the common categories added 2026-10-10
  assert.equal(k("Panadería La Espiga"), "Panadería");
  assert.equal(k("Medialunas y café"), "Panadería", "bakery words win over café");
  assert.equal(k("Carnicería Don José"), "Carnicería");
  assert.equal(k("Peluquería"), "Belleza y cuidado personal");
  assert.equal(k("Cuota gimnasio"), "Deportes y gimnasio");
  assert.equal(k("Cancha de fútbol 5"), "Deportes y gimnasio");
  assert.equal(k("Hotel en Bariloche"), "Viajes");
  assert.equal(k("Nafta YPF"), "Auto");
  assert.equal(k("Seguro del auto"), "Auto", "not Servicios");
  assert.equal(k("SUBE (viajes)"), "Transporte", "not Viajes");
  assert.equal(k("Pasaje Flecha Bus"), "Transporte");
  assert.equal(k("Empanadas de carne"), "Comida afuera y delivery", "not Carnicería");
  assert.equal(k("Pasaje Flecha Bus"), "Transporte");
  assert.equal(k("lentejas"), null, "' lentes' doesn't catch lentejas");
  // no keyword appears twice (a second copy would never win and only confuses whoever edits rules.js)
  const all = rules.keywords.flatMap(([, ws]) => ws.map((w) => w.trim()));
  assert.deepEqual(all.filter((w, i) => all.indexOf(w) !== i), []);
});

test("words you teach: an unknown note word + the category you pick is remembered for later notes", () => {
  assert.deepEqual(noteWords("Flores para mamá!! x2"), ["flor"], "connectors, family words and numbers are skipped; plural → singular");
  assert.deepEqual(["panes", "clases", "remeras", "luz", "gas"].map(stem), ["pan", "clase", "remera", "luz", "gas"]);
  // first time: nothing recognizes "Flores", you pick Regalos → learn "flor"
  assert.deepEqual(wordsToLearn("Flores", "Regalos", rules.keywords, new Map()), ["flor"]);
  // words rules.js knows are never learned; a note whose guess already matches teaches nothing
  assert.deepEqual(wordsToLearn("Café con Ana", "Regalos", rules.keywords, new Map()), ["ana"]);
  assert.deepEqual(wordsToLearn("Café", "Comida afuera y delivery", rules.keywords, new Map()), []);
  assert.deepEqual(wordsToLearn("Flores", "", rules.keywords, new Map()), [], "automatic category: nothing to learn");
  // picking another category later re-teaches the word
  assert.deepEqual(wordsToLearn("flor", "Hogar", rules.keywords, new Map([["flor", "Regalos"]])), ["flor"]);
  const notes = { "w:out:flor": { note: "flor", category: "Regalos" }, "w:in:alquiler": { note: "alquiler", category: "Ventas" } };
  assert.deepEqual([...learnedWords(notes, "out")], [["flor", "Regalos"]]);
  assert.equal(learnedCategory("Ramo de flores", learnedWords(notes, "out")), "Regalos");
  // applied to a movement: the note "Flores" now gets Regalos without choosing it; built-in words still win
  const qr = paymentRows(pay({ id: 43, description: "Pago QR" }), ME);
  assert.equal(enrich(qr, rules, {}, { ...notes, "43:payment": { note: "Flores" } })[0].category, "Regalos");
  assert.equal(enrich(qr, rules, {}, { ...notes, "43:payment": { note: "Café y flores" } })[0].category, "Comida afuera y delivery");
  assert.equal(enrich(qr, rules, {}, { "43:payment": { note: "Flores" } })[0].category, enrich(qr, rules)[0].category, "not learned yet: automatic");
});

test("Mercado Pago card in a shop: 'authorized' counts as spending and lowers the balance, marked as pending", () => {
  const shop = pay({ id: 61, status: "authorized", status_detail: "pending_capture", description: "Kiosco Ejemplo",
    point_of_interaction: { type: "MP_DEBIT_CARD" } });
  const rows = paymentRows(shop, ME);
  const [e] = enrich(rows, rules);
  assert.ok(e, "the purchase is a movement");
  assert.deepEqual([e.channel, e.method], ["Tarjeta Mercado Pago en comercio", "Tarjeta Mercado Pago"]);
  assert.match(e.detail, /Pendiente/);
  const snap = { available: 1000, as_of: "2026-08-31T00:00:00.000Z", fetched_at: "2026-08-31T00:00:00.000Z" };
  assert.equal(liveBalance(rows, snap).value, 1000 - 1100, "the money is already held: the balance drops");
  // once the shop finishes charging it, it's the same movement (same id), now approved and no longer pending
  const [done] = enrich(paymentRows({ ...shop, status: "approved" }, ME), rules);
  assert.deepEqual([done.id, /Pendiente/.test(done.detail)], [e.id, false]);
  // cancelled by the shop: gone; and money IN that is only authorized doesn't count
  assert.equal(enrich(paymentRows({ ...shop, status: "cancelled" }, ME), rules).length, 0);
  assert.equal(enrichIn(paymentRows({ ...shop, collector_id: ME, payer_id: 5, status: "authorized" }, ME), rules).length, 0);
});

test("the shop's card-network code (MCC) picks the category; an unknown code leaves it to the words", () => {
  const shop = (mcc, description = "Comercio Ejemplo") => pay({ id: 62, status: "authorized", description,
    point_of_interaction: { type: "MP_DEBIT_CARD", transaction_data: { commerce: { mcc } } } });
  const [row] = paymentRows(shop("5411"), ME);
  assert.equal(row.mcc, "5411", "the sync keeps the code");
  const cat = (mcc, d) => enrich(paymentRows(shop(mcc, d), ME), rules)[0].category;
  assert.equal(cat("5411"), "Supermercado y almacén");
  assert.equal(cat("5912", "Kiosco Ejemplo"), "Salud", "the stated shop type beats a word in the name");
  assert.equal(cat("5992"), "Regalos", "florists");
  assert.equal(cat("1234", "Farmacia Ejemplo"), "Salud", "unknown code: the words decide");
  assert.equal(paymentRows(pay({ id: 63 }), ME)[0].mcc, "", "no code: empty");
  const known = new Set([...Object.keys(rules.groups), ...rules.nonConsumption]);
  assert.deepEqual(Object.values(rules.mcc).filter((c) => !known.has(c)), [], "every MCC maps to an existing category");
  assert.ok(Object.keys(rules.mcc).every((k) => /^\d{4}$/.test(k)), "codes are 4 digits");
});

test("live balance = last verified balance + balance-changing movements after it", () => {
  const snap = { available: 1000, as_of: "2026-09-28T20:00:00.000Z", fetched_at: "2026-09-29T04:00:00.000Z" };
  const mk = (id, date, over) => ({ id, payment_id: id, row_type: "payment", status: "approved", date, ...over });
  const rows = [
    mk(1, "2026-09-28T16:00:00-03:00", { direction: "in", operation_type: "account_fund", amount: 500 }),        // before: already in
    mk(2, "2026-09-29T00:53:00-03:00", { direction: "in", operation_type: "money_transfer", amount: 300 }),      // +300
    mk(3, "2026-09-29T01:00:00-03:00", { direction: "out", payment_method: "account_money", amount: -120.5 }),   // -120,50
    mk(4, "2026-09-29T01:10:00-03:00", { direction: "out", payment_type: "prepaid_card", payment_method: "visa", amount: -999 }), // card: no
    mk(5, "2026-09-29T01:20:00-03:00", { direction: "out", payment_method: "account_money", status: "rejected", amount: -50 }),  // rejected: no
    { ...mk(3, "2026-09-29T02:00:00-03:00", { direction: "out", payment_method: "account_money", amount: 20 }), row_type: "refund", id: "3:refund:1" }, // +20
  ];
  assert.deepEqual(liveBalance(rows, snap), { value: 1199.5, added: 3, verified: 1000, as_of: snap.as_of, fetched_at: snap.fetched_at });
  assert.equal(liveBalance(rows, null), null);
});

test("demo data is well-formed and fully categorized", () => {
  const e = enrich(demoRows(new Date("2026-09-28T12:00:00Z")), rules);
  assert.ok(e.length > 150);
  assert.ok(e.every((r) => r.merchant && r.category && r.month));
  assert.ok(!e.some((r) => r.merchant === "Sin nombre"));
});
