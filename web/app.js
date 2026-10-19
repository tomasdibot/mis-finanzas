// Mis finanzas — app. Reads raw movements through lib/api.js (only the Owner can), interprets them with rules.js,
// and shows: the month in four numbers, spending per month, every category of the month (amount + how many
// times), and — tapping a category — everything that makes it up. Facts only: sums and counts, no advice.
import rules from "./rules.js";
import { enrich, enrichIn, liveBalance, keywordCategory, learnedWords, learnedCategory, wordsToLearn } from "./lib/model.js";
import { monthlyBars, horizontalBars, categoryBars, categoryTable } from "./lib/charts.js";
import { api, DEMO } from "./lib/api.js";
import { iconSvg } from "./lib/icons.js";
import { brandOf, brandSvg } from "./lib/brands.js";
import { DIMS, dimsFor, valueLook, lookHtml, groupRows } from "./lib/breakdown.js";

const $ = (s) => document.querySelector(s);
const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES3 = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const money = (v) => "$ " + nf.format(Math.round(v)); // no-break space: "$" never wraps away from the number
// Plain Spanish short amounts: $950 · $70 mil · $1,2 M (Intl's compact "k"/"K" is inconsistent in es-AR)
const short = (v) => {
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1).replace(".", ",").replace(",0", "")} M`;
  if (a >= 1e3) return `${sign}$${nf.format(Math.round(a / 1e3))} mil`;
  return `${sign}$${nf.format(Math.round(a))}`;
};
const store = {
  get: (k, d) => { try { const v = localStorage.getItem("mpf." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("mpf." + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
// a category's own color (rules.tints) for its icon, as an inline style attribute (or nothing)
const tintStyle = (cat) => (rules.tints?.[cat] ? ` style="--t:${rules.tints[cat]}"` : "");
const monthName = (key, withYear = false) => { const [y, m] = key.split("-"); return MES[+m - 1] + (withYear ? " " + y : ""); };
const monthShort = (key) => MES3[+key.split("-")[1] - 1];
const nowKey = () => { const d = new Date(Date.now() - 3 * 3600e3); return d.toISOString().slice(0, 7); }; // Argentina
const prevKey = (key) => { let [y, m] = key.split("-").map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
const wide = () => matchMedia("(min-width: 1100px)").matches; // desktop: the detail sits on the right

let rowsOut = [];         // enriched money-out rows (spending, transfers, payouts)
let rowsIn = [];          // enriched money-in rows (deposits, transfers received)
let balance = null;       // { available, as_of, fetched_at } latest balance verified by Mercado Pago
let rawRows = [];         // raw movements, for the live balance
// dim: how the month is broken down (category by default); item: the value whose detail is open
let S = { view: "out", range: store.get("range", 6), month: null, dim: "category", item: null, channel: "", nonCons: false, showN: 30,
  trendCat: "" }; // trendCat: the category in the per-month-and-category chart
const rows = () => (S.view === "in" ? rowsIn : rowsOut);
const WORDS = { out: { monthly: "Gastos por mes", what: "Gastos" }, in: { monthly: "Ingresos por mes", what: "Ingresos" } };
const byWhat = () => DIMS[S.dim].by[S.view]; // "categoría", "medio de pago"…
const RANGE = { 3: "3 meses", 6: "6 meses", 12: "12 meses", 0: "Todo" };
const PALETTES = ["coral", "indigo", "bosque", "ciruela", "oceano"];

// ------------------------------------------------------------ theme
function applyTheme() {
  const t = store.get("theme", "auto");
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
  $("#theme").value = t;
  const p = PALETTES.includes(store.get("palette", "coral")) ? store.get("palette", "coral") : "coral";
  document.documentElement.dataset.palette = p;
  document.querySelectorAll("#palette button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === p)));
}

// ------------------------------------------------------------ data
function allMonths() {
  const keys = rowsOut.concat(rowsIn).map((r) => r.month).concat(nowKey()).sort();
  const out = [];
  let [y, m] = keys[0].split("-").map(Number);
  const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) { out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
function rangeMonths() { const all = allMonths(); return S.range ? all.slice(-S.range) : all; }
function base() {
  return rows().filter((r) => (S.view === "in" || S.nonCons || r.consumption) && (!S.channel || r.channel === S.channel));
}
const sum = (list) => list.reduce((a, r) => a + r.amount, 0);
const times = (list) => list.filter((r) => r.amount > 0).length; // how many times money went there (refunds aren't a time)
function groupBy(list, key) {
  const m = new Map();
  list.forEach((r) => { const k = r[key]; const g = m.get(k) ?? { key: k, name: k, value: 0, n: 0 }; g.value += r.amount;
    if (r.amount > 0) g.n++; m.set(k, g); });
  return [...m.values()].filter((g) => g.value > 0.5).sort((a, b) => b.value - a.value);
}

// ------------------------------------------------------------ render
function render() {
  const months = rangeMonths();
  if (!S.month || !months.includes(S.month)) S.month = months[months.length - 1];
  const b = base();
  const cur = nowKey(), isCur = S.month === cur, pk = prevKey(S.month);
  const today = +new Date(Date.now() - 3 * 3600e3).toISOString().slice(8, 10);
  const sameYear = S.month.slice(0, 4) === cur.slice(0, 4);
  const multiYear = months[0].slice(0, 4) !== months[months.length - 1].slice(0, 4);
  const colLabel = (m) => monthShort(m) + (multiYear ? " " + m.slice(2, 4) : "");

  // ---- filter bar
  document.querySelectorAll("#view button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.view === S.view)));
  $("#monthLabel").textContent = monthName(S.month, !sameYear);
  $("#prevMonth").disabled = months.indexOf(S.month) <= 0;
  $("#nextMonth").disabled = months.indexOf(S.month) >= months.length - 1;
  $("#fRange").value = String(S.range); $("#rangeLabel").textContent = RANGE[S.range] ?? "6 meses";
  $("#pChannel").classList.toggle("active", !!S.channel); $("#pChannel .pv").textContent = S.channel || "Canal";
  $("#fChannel").value = S.channel;
  $("#pNonCons").hidden = S.view === "in"; $("#pNonCons").setAttribute("aria-pressed", String(S.nonCons));

  // ---- month summary (whole account). A month in progress is compared with the previous one up to the same day.
  const upTo = (list, m) => (isCur && m === pk ? list.filter((r) => +r.date.slice(8, 10) <= today) : list);
  const vsPrev = (now, before) => {
    if (isCur) return `${monthShort(pk)} al día ${today}: ${short(before)}`;
    if (!before) return `${monthShort(pk)}: sin movimientos`;
    const pct = Math.round(((now - before) / before) * 100);
    return `${pct > 0 ? "▲" : pct < 0 ? "▼" : "="} ${Math.abs(pct)}% vs ${monthShort(pk)}`;
  };
  const live = liveBalance(rawRows, balance);
  const cents = (v) => "$ " + Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $("#balanceSub").textContent = live ? "" : "Deslizá hacia abajo o tocá ↻ para cargarlo.";
  countTo("#balanceValue", live ? live.value : null, cents);
  const spend = (m) => upTo(rowsOut.filter((r) => r.month === m && (S.nonCons || r.consumption)), m);
  const earn = (m) => upTo(rowsIn.filter((r) => r.month === m), m);
  const gOut = sum(spend(S.month)), gIn = sum(earn(S.month));
  countTo("#kIn", gIn, money); countTo("#kOut", gOut, money);
  if (!$("#kInIco").firstChild) { $("#kInIco").innerHTML = iconSvg("inbox", 13); $("#kOutIco").innerHTML = iconSvg("outbox", 13); }
  // how many movements, then the comparison with the previous month
  const nIn = times(earn(S.month)), nOut = times(spend(S.month));
  $("#kInSub").textContent = `${nIn} ${nIn === 1 ? "ingreso" : "ingresos"} · ${vsPrev(gIn, sum(earn(pk)))}`;
  $("#kOutSub").textContent = `${nOut} ${nOut === 1 ? "gasto" : "gastos"} · ${vsPrev(gOut, sum(spend(pk)))}`;

  // ---- spending per month (tap a month)
  const per = months.map((m) => ({ key: m, label: colLabel(m), value: sum(b.filter((r) => r.month === m)), partial: m === cur }));
  $("#trendTitle").textContent = WORDS[S.view].monthly;
  $("#trend").innerHTML = monthlyBars(per, S.month, { width: $("#trend").clientWidth || 700, fmt: short });

  // ---- the same months for one category (slide the chart sideways; the button picks the category)
  const inRange = b.filter((r) => months.includes(r.month));
  const byCat = groupBy(inRange, "category"); // largest in the period first
  const cm = new Map();
  inRange.forEach((r) => { const k = `${r.category}|${r.month}`; cm.set(k, (cm.get(k) ?? 0) + r.amount); });
  const series = (cat) => months.map((m) => ({ key: m, label: colLabel(m), value: Math.max(0, cm.get(`${cat}|${m}`) ?? 0), partial: m === cur }));
  const tw = $("#trend").clientWidth || 300;
  $("#trendOneTitle").textContent = `${WORDS[S.view].what} por mes y ${DIMS.category.by[S.view]}`;
  if (!byCat.some((g) => g.key === S.trendCat)) S.trendCat = byCat[0]?.key ?? "";
  trendCats = byCat;
  const tc = byCat.find((g) => g.key === S.trendCat);
  $("#trendCatBtn").hidden = !tc;
  if (tc) $("#trendCatBtn").innerHTML = `<span class="cbi"${tintStyle(tc.key)}>${iconSvg(rules.icons?.[tc.key] ?? "box", 17)}</span>
    <span class="tcn">${escapeHtml(tc.key)}<small>${escapeHtml(short(tc.value))} en ${escapeHtml(periodWords())}</small></span>
    <span class="tcc" aria-hidden="true">${iconSvg("chevrons", 16)}</span>`;
  $("#trendOne").innerHTML = S.trendCat ? monthlyBars(series(S.trendCat), S.month, { width: tw, fmt: short })
    : `<div class="empty">No hay movimientos en este período.</div>`;
  syncTrend();

  // ---- the month broken down (by category unless you pick another way): amount, how many times, share
  // (tap one for its detail)
  const monthRows = b.filter((r) => r.month === S.month);
  const total = sum(monthRows);
  const dims = dimsFor(S.view), dim = DIMS[S.dim];
  const tab = `Por ${byWhat()}`;
  $("#swipeTabs [data-p='1']").textContent = tab;
  $("#goCats").textContent = `Ver ${WORDS[S.view].what.toLowerCase()} por ${byWhat()} →`;
  $(".p-cat").setAttribute("aria-label", `${WORDS[S.view].what} ${tab.toLowerCase()}`);
  $("#dims").style.setProperty("--n", dims.length);
  $("#dims").innerHTML = dims.map((k) => `<button type="button" data-dim="${k}" aria-pressed="${k === S.dim}">${iconSvg(DIMS[k].icon, 18)}
    <span>${escapeHtml(DIMS[k].label[S.view])}</span></button>`).join("");
  const items = groupRows(monthRows, S.dim).map((g) => ({ ...g, ...valueLook(S.dim, g.key, g.rows, rules),
    label: S.dim === "category" ? rules.shortNames?.[g.key] ?? g.key : g.key }));
  if (wide() && (!S.item || !items.some((c) => c.key === S.item))) S.item = items[0]?.key ?? null;
  $("#catTitle").innerHTML = `${WORDS[S.view].what} por ${escapeHtml(byWhat())} <em>· ${monthName(S.month, !sameYear)}${isCur ? " (en curso)" : ""}</em>`;
  $("#catTotal").textContent = `${items.length} ${items.length === 1 ? byWhat() : dim.many[S.view]} · ${money(total)}`;
  // horizontal bars, all of them fit (merchants: the largest 8, the rest folded): icon or brand, name, amount, and
  // under the name its bar with "N veces · %". (categoryColumns in lib/charts.js is the vertical-column version.)
  const sel = wide() ? S.item : null;
  $("#catChart").innerHTML = categoryBars(items, { fmt: short, selected: sel, max: dim.max ?? 0, label: `${WORDS[S.view].what} del mes por ${byWhat()}` });
  $("#catHint").hidden = true;
  $("#cats").innerHTML = categoryTable(items, { fmt: money, head: dim.label[S.view] });

  // ---- detail of the chosen value: right column on a desktop, a sheet on a phone
  $("#detail").hidden = !wide();
  if (wide()) $("#detail").innerHTML = detailHtml(S.item, { months, colLabel, cur });
  else if ($("#detailSheet").open) $("#detailSheetBody").innerHTML = detailHtml(S.item, { months, colLabel, cur });

  // ---- all movements of the month
  const list = monthRows.slice().sort((a, b) => b.date.localeCompare(a.date));
  $("#mlist").innerHTML = list.slice(0, S.showN).map(moveLi).join("") || `<li class="empty">No hay movimientos este mes.</li>`;
  $("#moves summary h2").textContent = `Todos los movimientos de ${monthName(S.month)} (${list.length})`;
  $("#more").hidden = list.length <= S.showN;
  syncSwipe(); // the top strip follows the height of the section on screen
}

function moveLi(r, withCategory = true) {
  const [, m, d] = r.date.split("-");
  // every movement opens its sheet (write what it was, pick a category; transfers: name the recipient)
  const cls = r.recipient_key && !r.recipient_named ? "named-no" : r.note ? "noted" : "";
  const tag = r.recipient_key && !r.recipient_named ? `<span class="rtag">✎ Poner nombre</span>` : r.note ? `<span class="rtag soft">✎</span>` : "";
  const brand = brandOf(r.merchant); // SUBE, Mercado Libre, Macro…: its logo next to the name
  return `<li data-mid="${escapeHtml(r.id)}" data-dir="${S.view === "in" || rowsIn.includes(r) ? "in" : "out"}" class="${cls}">
    <span class="m">${brand ? brandSvg(brand, 20) : ""}${escapeHtml(r.merchant)}${tag}</span><span class="a${r.amount < 0 ? " neg" : ""}">${money(r.amount)}</span>
    <span class="d">${+d} ${MES3[+m - 1]}${r.detail ? " · " + escapeHtml(r.detail) : ""}</span>${withCategory ? `<span class="c">${escapeHtml(r.category)}</span>` : ""}</li>`;
}

// ------------------------------------------------------------ notes (what each movement was, in your words)
const NKEY = DEMO ? "demoNotes" : "notes";
let notes = store.get(NKEY, {});   // { movementId | "m:<merchant>": { note, category } }
function reenrich() { rowsOut = enrich(rawRows, rules, recipients, notes); rowsIn = enrichIn(rawRows, rules, notes); fillFilters(); render(); }
const outCategories = () => [...new Set([...Object.keys(rules.groups), ...rules.nonConsumption])].sort((a, b) => a.localeCompare(b, "es"));
const isGenericMerchant = (m) => /^(Transferencia|Destinatario|Sin nombre|Compra online|Mercado Libre$)/.test(m);
function openMoveSheet(id, dir) {
  const r = (dir === "in" ? rowsIn : rowsOut).find((x) => x.id === id); if (!r) return;
  const own = notes[id] ?? {}, rule = notes[`m:${r.merchant}`];
  const f = $("#moveSheet"); f.dataset.id = id; f.dataset.dir = dir; f.dataset.merchant = r.merchant;
  $("#mvDate").textContent = `${shortDate(r.date)} · ${money(r.amount)}`;
  $("#mvTitle").textContent = r.merchant;
  $("#mvInfo").textContent = (r.auto_detail ?? r.detail) || "";
  $("#mvNote").value = own.note ?? "";
  const cats = dir === "in" ? rules.incomeCategories : outCategories();
  $("#mvCategory").innerHTML = `<option value="">Automática (${escapeHtml(r.merchant_rule || r.note ? "según tu nota o regla" : r.category)})</option>` +
    cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  $("#mvCategory").value = own.category ?? "";
  // "always this category for this merchant": only for real merchants (not transfers or generic labels)
  const canRule = dir === "out" && !r.recipient_key && !isGenericMerchant(r.merchant);
  $("#mvAllRow").hidden = !canRule; $("#mvAll").checked = !!rule?.category;
  $("#mvAllLabel").textContent = `Usar la categoría elegida para todo lo de "${r.merchant}"`;
  $("#mvRecipient").hidden = !r.recipient_key; $("#mvRecipient").dataset.rk = r.recipient_key || "";
  $("#mvClear").hidden = !notes[id];
  updateGuess();
  ["#detailSheet", "#recipientsSheet"].forEach((s) => { if ($(s).open) $(s).close(); });
  f.showModal();
}
const wordList = (dir) => (dir === "in" ? rules.keywordsIn : rules.keywords);
function updateGuess() {
  const dir = $("#moveSheet").dataset.dir, text = $("#mvNote").value, list = wordList(dir);
  const g = keywordCategory(text, list), l = g ? null : learnedCategory(text, learnedWords(notes, dir));
  $("#mvGuess").textContent = !text.trim() ? "Escribí en qué fue: por las palabras, la app elige la categoría (podés cambiarla abajo)."
    : g ? `Por lo que escribiste: ${g}.` : l ? `Por lo que escribiste: ${l} (palabra que aprendí de vos).`
    : "No reconozco la categoría por las palabras: elegila abajo y la próxima vez la voy a reconocer.";
}
async function saveNote({ id, merchant, dir }, note, category, allMerchant) {
  note = note.trim().slice(0, 80);
  const next = { ...notes }, writes = [], deletes = [];
  if (note || (category && !allMerchant)) { next[id] = { note, category: allMerchant ? null : category || null }; writes.push({ id, ...next[id] }); }
  else if (notes[id]) { delete next[id]; deletes.push(id); }
  const ruleId = `m:${merchant}`;
  if (dir === "out" && allMerchant && category) { next[ruleId] = { note: null, category }; writes.push({ id: ruleId, ...next[ruleId] }); }
  else if (dir === "out" && !allMerchant && notes[ruleId] && $("#mvAllRow").hidden === false) { delete next[ruleId]; deletes.push(ruleId); }
  // you picked a category the words didn't give: remember the unknown words for next time ("flores" → Regalos)
  const learn = wordsToLearn(note, category, wordList(dir), learnedWords(notes, dir));
  learn.forEach((w) => { const wid = `w:${dir}:${w}`; next[wid] = { note: w, category }; writes.push({ id: wid, ...next[wid] }); });
  try {
    if (writes.length || deletes.length) await api.saveNotes(writes, deletes);
    notes = next; store.set(NKEY, notes); reenrich();
    showBanner(learn.length ? `Guardado. Aprendí: ${learn.join(", ")} → ${category}.` : writes.length ? "Guardado." : "Nota borrada.",
      learn.length ? 3500 : 2000);
  } catch (e) {
    showBanner(`No se pudo guardar: ${e.message}`);
  }
}

function renderWordList() {
  const rows = ["out", "in"].flatMap((dir) => [...learnedWords(notes, dir)].map(([w, c]) => ({ id: `w:${dir}:${w}`, w, c, dir })))
    .sort((a, b) => a.w.localeCompare(b.w, "es"));
  $("#wlist").innerHTML = rows.map((r) => `<li><span class="m">${escapeHtml(r.w)}</span>
      <span class="a"><button type="button" class="iconbtn" data-forget="${escapeHtml(r.id)}" aria-label="Olvidar ${escapeHtml(r.w)}">✕</button></span>
      <span class="d">→ ${escapeHtml(r.c)}${r.dir === "in" ? " (ingresos)" : ""}</span></li>`).join("")
    || `<li class="empty">Todavía no aprendió ninguna. Escribí una nota en un movimiento y elegí su categoría.</li>`;
}
async function forgetWord(id) {
  try {
    await api.saveNotes([], [id]);
    const next = { ...notes }; delete next[id]; notes = next; store.set(NKEY, notes); reenrich(); renderWordList();
    showBanner(`Olvidé "${id.split(":").slice(2).join(":")}".`, 2000);
  } catch (e) { showBanner(`No se pudo olvidar: ${e.message}`); }
}

// ------------------------------------------------------------ recipients (names you give to transfer recipients)
const RKEY = DEMO ? "demoRecipients" : "recipients"; // demo names never mix with the real ones
let recipients = store.get(RKEY, {});   // { key: { name, category } }
function recipientStats() {
  const m = new Map();
  rowsOut.filter((r) => r.recipient_key && !r.refund).forEach((r) => {
    const g = m.get(r.recipient_key) ?? { key: r.recipient_key, n: 0, total: 0, last: "", label: r.merchant };
    g.n++; g.total += r.amount; if (r.date > g.last) { g.last = r.date; g.label = r.merchant; } m.set(r.recipient_key, g);
  });
  return [...m.values()].sort((a, b) => b.last.localeCompare(a.last));
}
const shortDate = (iso) => { const [, m, d] = iso.split("-"); return `${+d} ${MES3[+m - 1]}`; };
function openNameSheet(key) {
  const st = recipientStats().find((s) => s.key === key), cur = recipients[key];
  $("#nameSheet").dataset.key = key;
  $("#nameInfo").textContent = st ? `${st.n} ${st.n === 1 ? "transferencia" : "transferencias"} · ${money(st.total)} en total · la última el ${shortDate(st.last)}` : "";
  $("#rName").value = cur?.name ?? "";
  const cats = [...new Set(Object.keys(rules.groups))].sort((a, b) => a.localeCompare(b, "es"));
  $("#rCategory").innerHTML = `<option value="">Automática (transferencia)</option>` +
    cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  $("#rCategory").value = cur?.category ?? "";
  $("#rClear").hidden = !cur;
  if ($("#recipientsSheet").open) $("#recipientsSheet").close();
  if ($("#detailSheet").open) $("#detailSheet").close();
  $("#nameSheet").showModal(); setTimeout(() => $("#rName").focus(), 50);
}
async function saveRecipient(key, name, category) {
  name = name.trim().slice(0, 60);
  const next = { ...recipients };
  if (name) next[key] = { name, category: category || null }; else delete next[key];
  try {
    await api.saveRecipient(key, name, category || null);
    recipients = next; store.set(RKEY, recipients); reenrich();
    showBanner(name ? `Listo: "${name}".` : "Nombre quitado.", 2500);
  } catch (e) { showBanner(`No se pudo guardar el nombre: ${e.message}`); }
}
function renderRecipientList() {
  const list = recipientStats();
  $("#rlist").innerHTML = list.map((s) => `<li data-rk="${escapeHtml(s.key)}" class="named-${recipients[s.key] ? "yes" : "no"}">
      <span class="m">${escapeHtml(recipients[s.key]?.name ?? s.label)}<span class="rtag">${recipients[s.key] ? "✎" : "✎ Poner nombre"}</span></span>
      <span class="a">${money(s.total)}</span><span class="d">${s.n} ${s.n === 1 ? "vez" : "veces"} · la última el ${shortDate(s.last)}</span></li>`).join("")
    || `<li class="empty">Todavía no hay transferencias con destinatario reconocible.
        (Si recién corriste la migración, esperá un minuto y deslizá para actualizar.)</li>`;
}

/** Everything that makes up one value of the breakdown (a category, a payment method, a merchant…) in the selected
 *  month: total, times, average, times per month, where (or, for a merchant, in which categories), each movement. */
function detailHtml(key, { months, colLabel, cur }) {
  if (!key) return `<div class="empty">Elegí una barra para ver su detalle.</div>`;
  const of = DIMS[S.dim].of;
  const b = base().filter((r) => of(r) === key);
  const mine = b.filter((r) => r.month === S.month).sort((x, y) => y.date.localeCompare(x.date));
  const value = sum(mine), n = times(mine);
  const freq = months.map((m) => ({ key: m, label: colLabel(m), value: times(b.filter((r) => r.month === m)), partial: m === cur }));
  const split = S.dim === "merchant" ? "category" : "merchant";
  const where = groupBy(mine, split).map((g) => ({ ...g, note: g.n > 1 ? `×${g.n}` : "" }));
  const width = Math.max(280, (wide() ? $("#detail").clientWidth : Math.min(innerWidth, 520)) - 44);
  const look = lookHtml(valueLook(S.dim, key, mine.length ? mine : b, rules, 38));
  return `<div class="dhead"><div class="dtitle">${look}
      <div><div class="dkicker">${monthName(S.month)}</div><h2>${escapeHtml(key)}</h2></div></div>
      <button class="iconbtn dclose" data-close aria-label="Cerrar">✕</button></div>
    <div class="dstats"><div><b>${money(value)}</b><span>total</span></div><div><b>${n}</b><span>${n === 1 ? "vez" : "veces"}</span></div>
      <div><b>${n ? money(value / n) : "—"}</b><span>promedio por vez</span></div></div>
    <h3>Veces por mes</h3>
    <div class="dfreq">${monthlyBars(freq, S.month, { width, fmt: (v) => String(v) })}</div>
    ${where.length ? `<h3>${split === "category" ? "En qué" : "Dónde"}</h3>${horizontalBars(where, null, { fmt: short, max: 6, otherLabel: "Otros" })}` : ""}
    <h3>Movimientos (${mine.length})</h3>
    <ul class="mlist">${mine.map((r) => moveLi(r, false)).join("") || `<li class="empty">Sin movimientos este mes.</li>`}</ul>`;
}

function openDetail(key) {
  S.item = key;
  if (wide()) { render(); return; }
  $("#detailSheetBody").innerHTML = ""; $("#detailSheet").showModal(); render();
  $("#detailSheetBody").scrollTop = 0;
}

function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function fillFilters() {
  const opt = (v, t) => `<option value="${escapeHtml(v)}">${escapeHtml(t)}</option>`;
  const pool = rows().filter((r) => S.view === "in" || S.nonCons || r.consumption);
  const uniq = [...new Set(pool.map((r) => r.channel))].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  $("#fChannel").innerHTML = opt("", "Todos los canales") + uniq.map((c) => opt(c, c)).join("");
}

// ------------------------------------------------------------ opening animation
// The logo animates while the data loads; the splash leaves only when the FRESH data is in (not the copy saved on
// the device), so cards, bars and numbers animate exactly once — never twice (cached figures, then fresh ones).
let intro = false, introDone = false;
function countTo(sel, target, fmt) {
  const el = $(sel), run = el._run = (el._run ?? 0) + 1; // a newer render of this number cancels the running count
  if (target == null) { el.textContent = "—"; return; }
  if (!intro) { el.textContent = fmt(target); return; }
  const t0 = performance.now(), ms = 900;
  const tick = (t) => { if (run !== el._run) return;
    const k = Math.min(1, (t - t0) / ms); el.textContent = fmt(target * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
const T0 = performance.now();
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
// the app's styles load without blocking the first paint: the splash waits for them before revealing the app
const stylesReady = () => getComputedStyle(document.documentElement).getPropertyValue("--radius").trim() !== "";
function hideSplash(force = false) {
  const sp = $("#splash"); if (!sp || sp.dataset.leaving) return;
  if (!force && !stylesReady()) { setTimeout(hideSplash, 80); return; }
  document.documentElement.classList.add("ready");
  sp.dataset.leaving = "1";
  setTimeout(() => {
    sp.classList.add("out"); sp.addEventListener("transitionend", () => sp.remove(), { once: true }); setTimeout(() => sp.remove(), 900);
    if (!$("#app").hidden && !calm && !introDone) {
      introDone = true; document.body.classList.add("intro"); intro = true; render();
      setTimeout(() => { document.body.classList.remove("intro"); intro = false; }, 1800);
    }
  }, Math.max(0, (calm ? 200 : 1250) - (performance.now() - T0)));
}


// ------------------------------------------------------------ events
// ------------------------------------------------------------ the two top sections (Resumen | Por categoría)
// On a phone they're one screen wide each: swipe, tap a tab, or "Ver gastos por categoría →". The strip takes the
// height of the section on screen, so the page below doesn't jump or leave a gap. On a desktop both are visible.
const swipeOn = () => !matchMedia("(min-width: 1100px)").matches;
function swipeIndex() { const s = $("#swipe"); return Math.round(s.scrollLeft / Math.max(1, s.clientWidth)); }
function syncSwipe() {
  const s = $("#swipe"), panels = s.querySelectorAll(".panel");
  if (!swipeOn()) { s.style.height = ""; return; }
  const i = Math.min(panels.length - 1, swipeIndex());
  document.querySelectorAll("#swipeTabs button").forEach((b) => b.setAttribute("aria-selected", String(+b.dataset.p === i)));
  document.querySelectorAll("#swipeDots i").forEach((d, k) => d.classList.toggle("on", k === i));
  s.style.height = `${panels[i].offsetHeight}px`;
}
// Option B's category picker: a sheet with every category of the period (icon, name, total, share), largest first.
let trendCats = [];
const periodWords = () => (S.range ? `los últimos ${S.range} meses` : "todo el historial");
function openCatPick() {
  const total = trendCats.reduce((a, g) => a + g.value, 0) || 1;
  $("#catPickNote").textContent = `Lo que sumó cada una en ${periodWords()}.`;
  $("#catPickList").innerHTML = trendCats.map((g) => {
    const on = g.key === S.trendCat;
    return `<button type="button" role="option" aria-selected="${on}" data-cat="${escapeHtml(g.key)}">
      <span class="cbi"${tintStyle(g.key)}>${iconSvg(rules.icons?.[g.key] ?? "box", 16)}</span>
      <span class="cpn">${escapeHtml(g.key)}<small>${g.n} ${g.n === 1 ? "vez" : "veces"} · ${Math.round((g.value / total) * 100)}%</small></span>
      <span class="cpv">${escapeHtml(short(g.value))}</span></button>`;
  }).join("");
  $("#catPick").showModal();
}
// The chart card's own slides (per month | A | B): its height follows the slide on screen, like the strip.
function syncTrend() {
  const s = $("#tslides"), sl = s.querySelectorAll(".tslide");
  const i = Math.min(sl.length - 1, Math.round(s.scrollLeft / Math.max(1, s.clientWidth)));
  document.querySelectorAll("#tdots button").forEach((d, k) => d.setAttribute("aria-selected", String(k === i)));
  s.style.height = `${sl[i].offsetHeight}px`;
}
function goPanel(i) {
  const s = $("#swipe"), left = i * s.clientWidth, from = s.scrollLeft;
  s.scrollTo({ left, behavior: "smooth" });
  // some browsers skip smooth scrolling (battery saver, reduced motion): then jump straight there
  setTimeout(() => { if (s.scrollLeft === from && from !== left) { s.scrollLeft = left; syncSwipe(); } }, 450);
}
function wireSwipe() {
  // while sliding, the strip's height follows the finger (a blend of both sections' heights), so the page below
  // moves along smoothly instead of jumping once the slide ends
  let t;
  $("#swipe").addEventListener("scroll", () => {
    clearTimeout(t); t = setTimeout(() => { $("#swipe").classList.remove("moving"); syncSwipe(); }, 80);
    if (!swipeOn()) return;
    const s = $("#swipe"), [a, b] = s.querySelectorAll(".panel"), f = Math.min(1, Math.max(0, s.scrollLeft / Math.max(1, s.clientWidth)));
    s.classList.add("moving"); s.style.height = `${Math.round(a.offsetHeight + (b.offsetHeight - a.offsetHeight) * f)}px`;
  }, { passive: true });
  $("#swipeTabs").addEventListener("click", (e) => { const p = e.target.closest("[data-p]")?.dataset.p; if (p != null) goPanel(+p); });
  $("#goCats").addEventListener("click", () => goPanel(1));
  // A sideways swipe just outside the strip (the tabs, the dots, the margins) also changes section — but only
  // while the strip is on screen: down in the movements a sideways swipe does nothing (no jump back up). The strip
  // itself scrolls natively, so its own touches are left alone, as are the filter bar and form fields.
  let x0 = null, y0 = 0, t0 = 0;
  const stripInView = () => { const r = $("#swipe").getBoundingClientRect(), bar = $(".fbar").getBoundingClientRect().bottom;
    return r.bottom > bar + 120 && r.top < innerHeight - 120; };
  addEventListener("touchstart", (e) => {
    x0 = null;
    if (!swipeOn() || e.touches.length !== 1 || $("#app").hidden || document.querySelector("dialog[open]")) return;
    if (e.target.closest("#swipe, .fbar, .grid, input, select, textarea") || !stripInView()) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = performance.now();
  }, { passive: true });
  addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy) || performance.now() - t0 > 800) return;
    const cur = swipeIndex(), next = Math.max(0, Math.min(1, cur + (dx < 0 ? 1 : -1)));
    if (next !== cur) goPanel(next);
  }, { passive: true });
}

function wire() {
  wireSwipe();
  $("#view").addEventListener("click", (e) => {
    const v = e.target.dataset?.view; if (!v || v === S.view) return;
    Object.assign(S, { view: v, dim: "category", item: null, channel: "", nonCons: false, showN: 30 });
    fillFilters(); render();
  });
  $("#fRange").addEventListener("change", (e) => { S.range = +e.target.value; store.set("range", S.range); render(); });
  $("#fChannel").addEventListener("change", (e) => { S.channel = e.target.value; render(); });
  $("#pNonCons").addEventListener("click", () => { S.nonCons = !S.nonCons; fillFilters(); render(); });
  const pickMonth = (e) => { const k = e.target.closest("[data-key]")?.dataset.key; if (k) { S.month = k; render(); } };
  const keys = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); } };
  $("#trend").addEventListener("click", pickMonth); $("#trend").addEventListener("keydown", keys);
  $("#trendOne").addEventListener("click", pickMonth);
  $("#trendCatBtn").addEventListener("click", openCatPick);
  $("#catPickList").addEventListener("click", (e) => { const c = e.target.closest("[data-cat]")?.dataset.cat; if (!c) return;
    S.trendCat = c; $("#catPick").close(); render(); });
  $("#catPick").addEventListener("click", (e) => { if (e.target === $("#catPick")) $("#catPick").close(); }); // tap outside
  let tt; $("#tslides").addEventListener("scroll", () => { clearTimeout(tt); tt = setTimeout(() => { syncTrend(); syncSwipe(); }, 80); }, { passive: true });
  $("#tdots").addEventListener("click", (e) => { const i = e.target.closest("[data-t]")?.dataset.t; if (i == null) return;
    const s = $("#tslides"), left = +i * s.clientWidth; s.scrollTo({ left, behavior: "smooth" });
    setTimeout(() => { if (Math.abs(s.scrollLeft - left) > 2) { s.scrollLeft = left; syncTrend(); syncSwipe(); } }, 450); });
  $("#cats").addEventListener("click", (e) => { const k = e.target.closest("[data-key]")?.dataset.key; if (k) openDetail(k); });
  $("#catChart").addEventListener("click", (e) => { const k = e.target.closest("[data-key]")?.dataset.key; if (k) openDetail(k); });
  $("#catChart").addEventListener("keydown", keys);
  // how to break the month down: category (default), payment method, channel, merchant, weekday
  $("#dims").addEventListener("click", (e) => { const d = e.target.closest("[data-dim]")?.dataset.dim;
    if (d && d !== S.dim) { S.dim = d; S.item = null; render(); } });
  // inside the detail: close, or tap a month in "Veces por mes"
  [$("#detail"), $("#detailSheetBody")].forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) { $("#detailSheet").close(); return; }
      const k = e.target.closest("svg [data-key]")?.dataset.key; if (k) { S.month = k; render(); }
    });
    el.addEventListener("keydown", keys);
  });
  $("#detailSheet").addEventListener("close", () => { if (!wide()) S.item = null; });
  $("#detailSheet").addEventListener("click", (e) => { if (e.target === $("#detailSheet")) $("#detailSheet").close(); }); // tap outside
  const step = (d) => { const ms = rangeMonths(); const i = ms.indexOf(S.month) + d; if (ms[i]) { S.month = ms[i]; render(); } };
  $("#prevMonth").addEventListener("click", () => step(-1));
  $("#nextMonth").addEventListener("click", () => step(1));
  $("#more").addEventListener("click", () => { S.showN += 50; render(); });
  $("#csv").addEventListener("click", downloadCsv);

  $("#openSettings").addEventListener("click", () => $("#settings").showModal());
  $("#theme").addEventListener("change", (e) => { store.set("theme", e.target.value); applyTheme(); });
  $("#palette").addEventListener("click", (e) => { const p = e.target.closest("[data-p]")?.dataset.p; if (!p) return; store.set("palette", p); applyTheme(); });
  $("#settings").addEventListener("close", async () => {
    if ($("#settings").returnValue === "logout" && !DEMO) {
      await api.signOut();
      try { ["rows", "balance", "recipients", "notes"].forEach((k) => localStorage.removeItem("mpf." + k)); } catch { /* ignore */ }
      location.reload();
    }
  });
  $("#refresh").addEventListener("click", syncNow);
  // tap any movement (list, category detail) for its sheet; in the recipients list, tap to name them
  document.addEventListener("click", (e) => {
    const mv = e.target.closest("li[data-mid]"); if (mv) { openMoveSheet(mv.dataset.mid, mv.dataset.dir); return; }
    const li = e.target.closest("li[data-rk]"); if (li) openNameSheet(li.dataset.rk);
  });
  $("#mvNote").addEventListener("input", updateGuess);
  $("#mvRecipient").addEventListener("click", () => { const rk = $("#mvRecipient").dataset.rk; $("#moveSheet").close("cancel"); openNameSheet(rk); });
  $("#moveSheet").addEventListener("close", () => {
    const f = $("#moveSheet"), v = f.returnValue, ctx = { id: f.dataset.id, merchant: f.dataset.merchant, dir: f.dataset.dir };
    if (v === "save") saveNote(ctx, $("#mvNote").value, $("#mvCategory").value, !$("#mvAllRow").hidden && $("#mvAll").checked);
    else if (v === "clear") saveNote(ctx, "", "", false);
  });
  $("#moveForm").addEventListener("submit", (e) => { if (e.submitter == null) { e.preventDefault(); $("#moveSheet").close("save"); } }); // Enter = Guardar
  $("#openWords").addEventListener("click", () => { $("#settings").close(); renderWordList(); $("#wordsSheet").showModal(); });
  $("#wlist").addEventListener("click", (e) => { const id = e.target.closest("[data-forget]")?.dataset.forget; if (id) forgetWord(id); });
  $("#openRecipients").addEventListener("click", () => { $("#settings").close(); renderRecipientList(); $("#recipientsSheet").showModal(); });
  $("#nameSheet").addEventListener("close", () => {
    const v = $("#nameSheet").returnValue, key = $("#nameSheet").dataset.key;
    if (v === "save") saveRecipient(key, $("#rName").value, $("#rCategory").value);
    else if (v === "clear") saveRecipient(key, "", "");
  });
  $("#nameForm").addEventListener("submit", (e) => { if (e.submitter == null) { e.preventDefault(); $("#nameSheet").close("save"); } }); // Enter = Guardar
  let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => {
    if (wide() && $("#detailSheet").open) $("#detailSheet").close();
    render();
  }, 150); });
}

function downloadCsv() {
  const months = rangeMonths();
  const list = base().filter((r) => months.includes(r.month)); // every movement of the period shown
  const q = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const csv = ["Fecha;Comercio;Detalle;Categoría;Medio;Monto"].concat(list.sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => [r.date, q(r.merchant), q(r.detail), q(r.category), q(r.channel), String(r.amount).replace(".", ",")].join(";"))).join("\r\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })),
    download: `movimientos-${months[0]}-a-${months[months.length - 1]}.csv` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ------------------------------------------------------------ cloud
function ago(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién"; if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60); if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}
async function loadStatus() {
  if (DEMO) { $("#updated").textContent = "demo"; $("#syncInfo").textContent = "Modo demostración: datos inventados."; return; }
  const data = await api.syncLog().catch(() => []);
  const lastOk = (data ?? []).find((r) => r.ok);
  const last = data?.[0];
  $("#updated").textContent = lastOk ? ago(lastOk.finished_at) : "";
  $("#syncInfo").textContent = last ? (last.ok ? `OK ${ago(last.finished_at)} (${last.rows} registros)` :
    last.finished_at ? `Falló ${ago(last.finished_at)}: ${last.detail}` : "En curso…") : "Todavía no se sincronizó.";
  // a failed update is shown quietly next to ↻ (details in Ajustes), never as a banner on opening
  if (last && last.ok === false) { $("#updated").textContent = "⚠ sin actualizar"; $("#updated").title = last.detail ?? ""; }
}
function setData(raw, bal) {
  rawRows = raw; rowsOut = enrich(raw, rules, recipients, notes); rowsIn = enrichIn(raw, rules, notes); balance = bal ?? balance;
  fillFilters(); render();
}
async function loadRows() {
  // demo: invented data only, never the cached real rows (and demo names/notes never mix with the real ones)
  if (!DEMO) { const cached = store.get("rows", null); if (cached) setData(cached, store.get("balance", null)); } // instant, offline
  let data;
  try { data = await api.load(); } catch (e) { showBanner(`No se pudieron leer los datos: ${e.message}`); return; }
  const { rows: all, balance: bal, recipients: rec, notes: nts } = data;
  if (rec) { recipients = Object.fromEntries(rec.map((r) => [r.key, { name: r.name, category: r.category }])); store.set(RKEY, recipients); }
  if (nts) { notes = Object.fromEntries(nts.map((n) => [n.id, { note: n.note ?? "", category: n.category }])); store.set(NKEY, notes); }
  if (!DEMO) {
    if (bal) store.set("balance", bal);
    // first visit after the Claim: the first download (13 months) starts by itself, once
    if (!all.length && !firstSync) { firstSync = true; setTimeout(syncNow, 0); }
    store.set("rows", all);
  }
  setData(all, bal ?? null);
}
let syncing = false, firstSync = false;
async function syncNow() {
  if (syncing) return;
  if (DEMO) { await loadRows(); showBanner("En modo demostración no hay nada que actualizar.", 2500); return; }
  syncing = true;
  const btn = $("#refresh"); btn.classList.add("spin"); btn.disabled = true;
  showBanner("Actualizando con Mercado Pago…");
  try {
    const MES_ = (key) => monthName(key, true);
    const data = await api.sync((s) => showBanner(`Descargando de Mercado Pago: ${MES_(s.month)} (${Math.round(s.progress * 100)} %)…`));
    if (!data?.ok) throw new Error(data?.error || "error");
    await loadRows();
    showBanner(data.note ? `Movimientos al día. ${data.note}` : "Al día: movimientos actualizados.", 3500);
    // Mercado Pago's balance report finishes in the background (~1 min): pick it up quietly
    [60e3, 120e3].forEach((ms) => setTimeout(() => api.collectReports().then(loadRows).catch(() => {}), ms));
  } catch (e) { showBanner(`No se pudo actualizar: ${e.message}`); }
  finally { btn.classList.remove("spin"); btn.disabled = false; syncing = false; loadStatus(); }
}

// Pull to refresh: dragging down from the very top of the page updates everything (movements and balance)
function pullToRefresh() {
  const ptr = $("#ptr"), GO = 70, MAX = 120;
  let y0 = null, x0 = 0, pull = 0, dir = null;
  const set = (p) => { ptr.style.transform = `translate(-50%, ${p - 56}px) rotate(${p * 2.6}deg)`;
    ptr.style.opacity = String(Math.min(1, p / GO)); ptr.classList.toggle("ready", p >= GO); };
  const canStart = () => scrollY <= 0 && !$("#app").hidden && !document.querySelector("dialog[open]");
  addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || !canStart() || ptr.classList.contains("busy")) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; pull = 0; dir = null; ptr.classList.remove("snap");
  }, { passive: true });
  addEventListener("touchmove", (e) => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (!dir && Math.hypot(dx, dy) > 8) dir = Math.abs(dy) > Math.abs(dx) && dy > 0 ? "down" : "other";
    if (dir !== "down" || scrollY > 0) { if (pull) { pull = 0; set(0); } return; }
    pull = Math.min(MAX, dy * 0.5); set(pull);
    if (e.cancelable) e.preventDefault(); // no page bounce while pulling
  }, { passive: false });
  addEventListener("touchend", async () => {
    if (y0 == null) return; y0 = null;
    ptr.classList.add("snap");
    if (pull < GO) { set(0); return; }
    ptr.classList.add("busy"); set(GO);
    try { await syncNow(); } finally { ptr.classList.remove("busy"); set(0); }
  });
}
// A small notice floating at the bottom (it never pushes the page down). Short ones hide by themselves; the rest
// hide when tapped.
let toastTimer = 0;
function showBanner(text, ms) {
  const b = $("#banner"); b.textContent = text; b.hidden = false; clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { b.hidden = true; }, ms);
}

// ------------------------------------------------------------ auth
function showLogin() {
  $("#login").hidden = false; $("#app").hidden = true; hideSplash();
  // "Entrar con Mercado Pago" (ADR 0002) is a plain link to the Worker; it comes back here with ?login_error if refused
  const err = new URLSearchParams(location.search).get("login_error");
  const why = {
    denied: "No se completó el ingreso en Mercado Pago. Probá de nuevo.",
    state: "El ingreso tardó demasiado o se abrió en otra pestaña. Probá de nuevo.",
    not_owner: "Esta app solo acepta la cuenta de Mercado Pago dueña de la app de Mercado Pago con la que se instaló.",
    config: "Falta configurar la app de Mercado Pago de esta instalación (ver la guía de instalación).",
    mp: "Mercado Pago no respondió bien. Probá de nuevo en unos minutos.",
  }[err];
  if (why) { $("#loginNote").textContent = why; history.replaceState(null, "", location.pathname); }
}
async function startApp() {
  $("#login").hidden = true; $("#app").hidden = false;
  if (DEMO) $("#updated").textContent = "demo (datos inventados)";
  try { await loadRows(); } finally { hideSplash(); } // the splash leaves once the fresh data is drawn (or failed)
  await loadStatus();
}

// The app never zooms: Safari on iPhone ignores the viewport's user-scalable=no, so pinches are stopped here too
// (double-tap zoom is off in styles.css); on a computer, ctrl + wheel and ctrl +/−/0 don't zoom either.
function noZoom() {
  ["gesturestart", "gesturechange"].forEach((ev) => addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) e.preventDefault(); });
}

async function main() {
  applyTheme(); wire(); pullToRefresh(); noZoom();
  // the splash name appears only once its font is there (no jump from a fallback font to DM Serif)
  const fontsIn = () => document.documentElement.classList.add("fonts-ready"), f0 = performance.now();
  (function waitFont() {
    const faces = document.fonts ? [...document.fonts].filter((f) => f.family.replace(/["']/g, "") === "DM Serif Display") : [];
    if (faces.some((f) => f.status === "loaded") || performance.now() - f0 > 1500) return fontsIn();
    faces.forEach((f) => f.status === "unloaded" && f.load().catch(() => {}));
    setTimeout(waitFont, 60);
  })();
  $("#banner").addEventListener("click", () => { $("#banner").hidden = true; });
  setTimeout(() => { document.documentElement.classList.add("ready"); hideSplash(true); }, 6000); // never stuck behind the splash
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  if (DEMO) return startApp();
  // offline: open with the last data seen (the session is checked again on the next request)
  if (await api.session().catch(() => "offline")) startApp(); else showLogin();
}
main();
