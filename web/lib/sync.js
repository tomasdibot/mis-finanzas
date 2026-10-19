// Sync with Mercado Pago from this device, in small steps (ADR 0003): movements are read directly from Mercado Pago;
// the "Dinero disponible" report goes through the Relay (/api/mp), which Mercado Pago requires.
// The first time, 13 months newest first (the app can show the first months while the rest keeps loading);
// afterwards, the last 2 months each time the app is opened or refreshed. Every movement is stored by id, so
// re-running never duplicates anything. A plan that stops (closed app, no signal) continues on the next step.
// The permission is only used to READ, except creating the report configuration and report requests, which is how
// Mercado Pago gives the balance and transfers to other banks.
import { monthWindows, mpTime, paymentRows, payoutRows, releaseBalance } from "./normalize.js";
import { hmacHex } from "./crypto.js";

const MP = "https://api.mercadopago.com";
const ML_CATEGORY = "https://api.mercadolibre.com/categories/";
export const PAGES = 3, PAGE_SIZE = 100;
export const FIRST_MONTHS = 13, OPEN_MONTHS = 2;
const ML_PER_STEP = 15, DAY = 86400e3, REPORT_CHUNK_DAYS = 60, LOG_SIZE = 10;
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * profile: lib/store.js; token(): an access token or null; fetch: the browser's (or a simulated one in tests);
 * relay: where the Relay's report calls live.
 */
export function createSync({ profile, token, fetch = (...a) => globalThis.fetch(...a), relay = "/api/mp" }) {
  async function auth() {
    const t = await token();
    if (!t) { const e = new Error("El permiso de Mercado Pago venció: volvé a entrar con Mercado Pago."); e.signIn = true; throw e; }
    return { authorization: `Bearer ${t}` };
  }
  async function get(url, { text = false, method = "GET", body } = {}) {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(url, { method, headers: { ...(await auth()), ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      if ([429, 500, 502, 503, 504].includes(r.status) && attempt < 2) { await sleep(1000 * 2 ** attempt); continue; }
      if (r.status === 401) { const e = new Error("Mercado Pago no aceptó el permiso: volvé a entrar con Mercado Pago."); e.signIn = true; throw e; }
      if (text) { if (!r.ok) throw new Error(`Mercado Pago respondió ${r.status}`); return r.text(); }
      const raw = await r.text();
      return { status: r.status, ok: r.ok, body: raw ? JSON.parse(raw) : {} };
    }
  }

  async function salt() {
    let s = await profile.setting("recipient_salt");
    if (!s) {  // turns account ids into recipient keys; stays in this Profile (and its backups)
      s = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
      await profile.setSetting("recipient_salt", s);
    }
    return s;
  }

  /** Mercado Libre category names, cached in the Profile (public API; only the category id is sent). */
  async function categoryResolver(payments) {
    const ids = [...new Set(payments.flatMap((p) => (p.additional_info?.items ?? []).map((i) => i.category_id))
      .filter((id) => /^ML[A-Z]\d+$/.test(String(id))))];
    const cache = new Map();
    for (const id of ids) { const c = await profile.get("ml_categories", id); if (c) cache.set(id, c.path); }
    const fresh = [];
    for (const id of ids.filter((i) => !cache.has(i)).slice(0, ML_PER_STEP)) {
      try {
        const r = await fetch(ML_CATEGORY + id);
        if (!r.ok) continue;
        const path = ((await r.json()).path_from_root ?? []).map((x) => x.name).join(" > ");
        if (path) { cache.set(id, path); fresh.push({ id, path }); }
      } catch { /* looked up again on a later step */ }
    }
    await profile.put("ml_categories", fresh);
    return (id) => cache.get(id) ?? id;
  }

  /**
   * Transfers you sent: Mercado Pago gives no recipient name, only their account id. That id is never stored; its HMAC
   * with this Profile's salt is, so transfers to the same person can be grouped and named.
   */
  async function savePayments(payments, meId) {
    const resolve = await categoryResolver(payments), s = await salt(), keys = new Map();
    for (const p of payments) {
      const to = String(p.collector_id ?? p.collector?.id ?? "");
      if (p.operation_type !== "money_transfer" || !to || to === String(meId)) continue;
      keys.set(Number(p.id), (await hmacHex(s, `recipient:${to}`)).slice(0, 20));
    }
    const rows = payments.flatMap((p) => paymentRows(p, meId, resolve)).map((r) => ({ ...r, recipient_key: keys.get(r.payment_id) ?? "" }));
    await profile.put("movements", rows);
    return rows.length;
  }

  function monthBounds(label) {
    const [y, m] = label.split("-").map(Number), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { begin: mpTime(y, m - 1, 1), end: mpTime(y, m - 1, days, 23, 59, 59, 999) };
  }

  async function advance(plan) {
    for (let pages = 0; pages < PAGES && plan.i < plan.months.length; pages++) {
      const { begin, end } = monthBounds(plan.months[plan.i]);
      const u = new URL(MP + "/v1/payments/search");
      Object.entries({ range: "date_created", begin_date: begin, end_date: end, sort: "date_created", criteria: "asc",
        limit: PAGE_SIZE, offset: plan.offset }).forEach(([k, v]) => u.searchParams.set(k, String(v)));
      const r = await get(u.toString());
      if (!r.ok) throw new Error(`Mercado Pago respondió ${r.status} al leer movimientos`);
      const batch = r.body.results ?? [];
      plan.rows += await savePayments(batch, plan.me);
      plan.offset += batch.length;
      if (!batch.length || plan.offset >= (r.body.paging?.total ?? 0)) { plan.i++; plan.offset = 0; }
    }
  }

  // ------------------------------------------------------------ balance + transfers to other banks (via the Relay)
  // Generated asynchronously (~40 s), at most 90 days each, and Mercado Pago e-mails the user for every report: at
  // most one short "recent" report per minGapHours, plus backfill chunks riding along until 13 months are covered.
  async function ensureReportConfig() {
    if (await profile.setting("report_config")) return;
    const got = await get(`${relay}/config`);
    if (got.status !== 200) {
      const columns = ["DATE", "SOURCE_ID", "EXTERNAL_REFERENCE", "RECORD_TYPE", "DESCRIPTION", "NET_CREDIT_AMOUNT",
        "NET_DEBIT_AMOUNT", "GROSS_AMOUNT", "PAYMENT_METHOD", "BALANCE_AMOUNT",
        "PAYOUT_BANK_ACCOUNT_NUMBER"].map((key) => ({ key })); // destination of transfers to a CVU/alias (→ recipient key)
      const made = await get(`${relay}/config`, { method: "POST", body: { file_name_prefix: "mis-finanzas",
        display_timezone: "GMT-03", include_withdrawal_at_end: false, execute_after_withdrawal: false,
        frequency: { hour: 0, type: "monthly", value: 1 }, columns } });
      if (made.status >= 300) throw new Error(`No se pudo configurar el reporte de saldo (${made.status})`);
    }
    await profile.setSetting("report_config", "ok");
  }
  async function requestReport(kind, begin, end) {
    const r = await get(`${relay}/report`, { method: "POST", body: { begin_date: iso(begin), end_date: iso(end) } });
    if (r.status >= 300 || !r.body.id) throw new Error(`Mercado Pago rechazó el pedido de reporte (${r.status})`);
    await profile.put("report_tasks", [{ task_id: r.body.id, kind, begin_date: iso(begin), end_date: iso(end), requested_at: now(), attempts: 0 }]);
  }
  async function collect(t) {
    const task = await get(`${relay}/task/${t.task_id}`);
    const finish = (detail) => profile.put("report_tasks", [{ ...t, processed_at: now(), detail }]);
    if (!task.body.file_name) {
      if (Date.now() - new Date(t.requested_at).getTime() > DAY) await finish(`vencido (${task.body.status ?? task.status})`);
      return;
    }
    if (t.attempts >= 3) { await finish("no se pudo leer"); return; }
    await profile.put("report_tasks", [{ ...t, attempts: t.attempts + 1 }]);
    const csv = await get(`${relay}/file/${encodeURIComponent(task.body.file_name)}`, { text: true });
    const s = await salt(), payouts = [];
    // the destination account becomes a recipient key ("bank:" prefix); the account number itself is never stored
    for (const { dest, ...r } of payoutRows(csv)) payouts.push({ ...r, recipient_key: dest ? (await hmacHex(s, `bank:${dest}`)).slice(0, 20) : "" });
    await profile.put("movements", payouts);
    const bal = releaseBalance(csv);
    if (bal) await profile.put("balances", [{ as_of: bal.asOf, available: bal.balance, fetched_at: now() }]);
    await profile.put("report_tasks", [{ ...t, attempts: t.attempts + 1, processed_at: now(),
      detail: `${payouts.length} retiros${bal ? `, saldo al ${bal.asOf}` : ""}` }]);
  }
  async function reportsStep(minGapHours) {
    await ensureReportConfig();
    const tasks = await profile.all("report_tasks");
    for (const t of tasks.filter((x) => !x.processed_at).sort((a, b) => a.requested_at.localeCompare(b.requested_at)).slice(0, 2)) await collect(t);
    const t = Date.now();
    const last = tasks.filter((x) => x.kind === "recent").map((x) => x.requested_at).sort().at(-1);
    if (last && t - new Date(last).getTime() <= minGapHours * 3600e3) return;
    await requestReport("recent", t - 10 * DAY, t);
    const until = Number(await profile.setting("backfill_until")) || t - 10 * DAY;
    if (until > t - 400 * DAY) {
      await requestReport("backfill", until - REPORT_CHUNK_DAYS * DAY, until);
      await profile.setSetting("backfill_until", until - REPORT_CHUNK_DAYS * DAY);
    }
  }

  async function log(entry) {
    const list = (await profile.setting("sync_log")) ?? [];
    await profile.setSetting("sync_log", [entry, ...list].slice(0, LOG_SIZE));
  }

  return {
    /**
     * One step of the current plan. Returns { ok, done, month, progress, rows, note }, or { ok: false, error, signIn }.
     * `firstMonths` tells when the first months are in (the app can show them while the rest keeps loading).
     */
    async step({ reportGapHours = 24 } = {}) {
      let plan = await profile.setting("sync_plan");
      if (!plan) {
        const backfill = !(await profile.setting("backfill_done"));
        plan = { months: monthWindows(backfill ? FIRST_MONTHS : OPEN_MONTHS).map((w) => w.label).reverse(),
          i: 0, offset: 0, rows: 0, backfill, started_at: now(), me: profile.id };
      }
      try {
        await advance(plan);
      } catch (e) {
        await profile.setSetting("sync_plan", plan);   // continues where it stopped
        await log({ started_at: plan.started_at, finished_at: now(), ok: false, rows: plan.rows, detail: e.message });
        return { ok: false, error: e.message, signIn: !!e.signIn };
      }
      const done = plan.i >= plan.months.length;
      if (!done) {
        await profile.setSetting("sync_plan", plan);
        return { ok: true, done, month: plan.months[plan.i], progress: plan.i / plan.months.length, rows: plan.rows,
          firstMonths: plan.i >= 3 };
      }
      let note = null;
      try { await reportsStep(reportGapHours); } catch (e) { note = `Saldo/retiros: ${e.message}`; }
      if (plan.backfill) await profile.setSetting("backfill_done", now());
      await profile.setSetting("sync_plan", null);
      await log({ started_at: plan.started_at, finished_at: now(), ok: true, rows: plan.rows, detail: note });
      return { ok: true, done, progress: 1, rows: plan.rows, note, firstMonths: true };
    },
    /** Only pick up reports requested earlier (no new ones). */
    async collectReports() { await reportsStep(Infinity); },
    async log() { return (await profile.setting("sync_log")) ?? []; },
  };
}
