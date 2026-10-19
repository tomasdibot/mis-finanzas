// Sync with Mercado Pago in small steps. The free plan gives each run 10 ms of CPU and 50 outside requests, so one
// step reads at most PAGES pages of payments (≤ 200) and remembers where it stopped (app_settings "sync_plan").
// The Cron (every 30 min) and the app's ↻ button both call step(); the button repeats it until the plan is done.
// Idempotent: every movement is an upsert by id, written only when its facts changed (movements.h).
// The token is only used to READ, except creating the "Dinero disponible" report config and report requests,
// which are Mercado Pago's way of reading the balance and transfers to other banks.
import { monthWindows, mpTime, paymentRows, payoutRows, releaseBalance } from "./lib/normalize.js";
import { hmacHex, fingerprint } from "./lib/crypto.js";
import { readToken } from "./auth.js";
import { nowIso } from "./http.js";

const MP = "https://api.mercadopago.com";
const ML_CATEGORY = "https://api.mercadolibre.com/categories/";
const RR = "/v1/account/release_report";
export const PAGES = 2, PAGE_SIZE = 100;
const ML_PER_STEP = 15;          // new Mercado Libre category names looked up per step (the rest, next time)
const DAY = 86400e3;
const BACKFILL_MONTHS = 13, CRON_MONTHS = 3, MANUAL_MONTHS = 2;
const REPORT_CHUNK_DAYS = 60;    // backfill reports: shorter than Mercado Pago's 90-day maximum, so each is quick to read

const COLS = ["id", "payment_id", "row_type", "date", "month", "direction", "operation_type", "status", "payment_type",
  "payment_method", "channel", "business_unit", "branch", "item_category", "description", "statement_descriptor",
  "item_titles", "merchant_site", "counterparty", "holder_name", "group_id", "recipient_key", "mcc", "amount"];
const UPSERT = `INSERT INTO movements (${COLS.join(", ")}, h, synced_at) VALUES (${COLS.map((_, i) => `?${i + 1}`).join(", ")}, ?${COLS.length + 1}, ?${COLS.length + 2})
  ON CONFLICT (id) DO UPDATE SET ${COLS.slice(1).map((c) => `${c} = excluded.${c}`).join(", ")}, h = excluded.h, synced_at = excluded.synced_at
  WHERE movements.h IS NOT excluded.h`;

// ------------------------------------------------------------ small helpers
const setting = async (env, key) => (await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?1").bind(key).first())?.value ?? null;
const setSetting = (env, key, value) => value == null
  ? env.DB.prepare("DELETE FROM app_settings WHERE key = ?1").bind(key).run()
  : env.DB.prepare("INSERT INTO app_settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(key, String(value)).run();
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");

async function mpFetch(c, path, { method = "GET", params, body, text = false } = {}) {
  const url = new URL(MP + path);
  Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { method, body: body ? JSON.stringify(body) : undefined,
      headers: { authorization: `Bearer ${c.token}`, ...(body ? { "content-type": "application/json" } : {}) } });
    if ([429, 500, 502, 503, 504].includes(r.status) && attempt < 2) { await sleep(1000 * 2 ** attempt); continue; }
    if (text) { if (!r.ok) throw new Error(`Mercado Pago ${path} respondió ${r.status}`); return r.text(); }
    const raw = await r.text();
    return { status: r.status, ok: r.ok, body: raw ? JSON.parse(raw) : {} };
  }
}
async function mpJson(c, path, params) {
  const r = await mpFetch(c, path, { params });
  if (!r.ok) throw new Error(`Mercado Pago ${path} respondió ${r.status}`);
  return r.body;
}

/** Token, the Owner's Mercado Pago id and the recipient salt; null before the Claim. */
async function context(env) {
  const owner = await env.DB.prepare("SELECT mp_user_id FROM owner WHERE id = 1").first();
  if (!owner) return null;
  const token = await readToken(env);
  if (!token) throw new Error("El permiso de Mercado Pago venció: cerrá sesión y volvé a entrar con Mercado Pago.");
  let salt = await setting(env, "recipient_salt");
  if (!salt) {  // server-only key that turns account ids into recipient keys; never leaves the database
    salt = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT INTO app_settings (key, value) VALUES ('recipient_salt', ?1) ON CONFLICT (key) DO NOTHING").bind(salt).run();
    salt = await setting(env, "recipient_salt");
  }
  return { token, meId: owner.mp_user_id, salt };
}

// ------------------------------------------------------------ saving
export async function upsertMovements(env, rows) {
  if (!rows.length) return 0;
  const stamp = nowIso();
  const stmts = rows.map((r) => {
    const vals = COLS.map((c) => r[c] ?? (c === "amount" || c === "payment_id" ? 0 : ""));
    return env.DB.prepare(UPSERT).bind(...vals, fingerprint(JSON.stringify(vals)), stamp);
  });
  const res = await env.DB.batch(stmts);
  return res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
}

/** Mercado Libre category names, cached in ml_categories (public API; only the category id is sent). */
async function categoryResolver(env, payments) {
  const ids = [...new Set(payments.flatMap((p) => (p.additional_info?.items ?? []).map((i) => i.category_id))
    .filter((id) => /^ML[A-Z]\d+$/.test(String(id))))];
  const cache = new Map();
  if (ids.length) {
    const { results } = await env.DB.prepare(`SELECT id, path FROM ml_categories WHERE id IN (${ids.map((_, i) => `?${i + 1}`).join(",")})`)
      .bind(...ids).all();
    results.forEach((r) => cache.set(r.id, r.path));
    const fresh = [];
    for (const id of ids.filter((i) => !cache.has(i)).slice(0, ML_PER_STEP)) {
      try {
        const r = await fetch(ML_CATEGORY + id);
        if (!r.ok) continue;
        const path = ((await r.json()).path_from_root ?? []).map((x) => x.name).join(" > ");
        if (path) { cache.set(id, path); fresh.push([id, path]); }
      } catch { /* looked up again on a later step */ }
    }
    if (fresh.length) await env.DB.batch(fresh.map(([id, path]) =>
      env.DB.prepare("INSERT INTO ml_categories (id, path) VALUES (?1, ?2) ON CONFLICT (id) DO UPDATE SET path = excluded.path").bind(id, path)));
  }
  return (id) => cache.get(id) ?? id;
}

/**
 * Transfers you sent: Mercado Pago gives no recipient name, only the recipient's account id. That id is never
 * stored; its HMAC with the server-only salt is, so transfers to the same person can be grouped and named.
 */
async function savePayments(env, c, payments) {
  const resolve = await categoryResolver(env, payments);
  const keys = new Map();
  for (const p of payments) {
    const to = String(p.collector_id ?? p.collector?.id ?? "");
    if (p.operation_type !== "money_transfer" || !to || to === String(c.meId)) continue;
    keys.set(Number(p.id), (await hmacHex(c.salt, `recipient:${to}`)).slice(0, 20));
  }
  const rows = payments.flatMap((p) => paymentRows(p, c.meId, resolve)).map((r) => ({ ...r, recipient_key: keys.get(r.payment_id) ?? "" }));
  await upsertMovements(env, rows);
  return rows.length;
}

// ------------------------------------------------------------ payments, in steps
function monthBounds(label) {
  const [y, m] = label.split("-").map(Number), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { begin: mpTime(y, m - 1, 1), end: mpTime(y, m - 1, days, 23, 59, 59, 999) };
}

/** Read up to PAGES pages along the plan, starting where it stopped. Mutates and returns the plan. */
async function advance(env, c, plan) {
  for (let pages = 0; pages < PAGES && plan.i < plan.months.length; pages++) {
    const { begin, end } = monthBounds(plan.months[plan.i]);
    const r = await mpJson(c, "/v1/payments/search", { range: "date_created", begin_date: begin, end_date: end,
      sort: "date_created", criteria: "asc", limit: PAGE_SIZE, offset: plan.offset });
    const batch = r.results ?? [];
    plan.rows += await savePayments(env, c, batch);
    plan.offset += batch.length;
    if (!batch.length || plan.offset >= (r.paging?.total ?? 0)) { plan.i++; plan.offset = 0; }
  }
  return plan;
}

// ------------------------------------------------------------ balance + transfers to other banks (Releases reports)
// Payouts and the running balance only exist in Mercado Pago's "Dinero disponible" (Releases) reports, generated
// asynchronously (~40 s) and at most 90 days each. Mercado Pago e-mails the Owner for every report, so they are
// rationed: one short "recent" report at most every minGapHours, plus the backfill chunks riding along until
// 13 months are covered. Reports requested now are collected on a later step.
async function ensureReportConfig(c) {
  const got = await mpFetch(c, RR + "/config");
  if (got.status === 200) return;
  const columns = ["DATE", "SOURCE_ID", "EXTERNAL_REFERENCE", "RECORD_TYPE", "DESCRIPTION", "NET_CREDIT_AMOUNT",
    "NET_DEBIT_AMOUNT", "GROSS_AMOUNT", "PAYMENT_METHOD", "BALANCE_AMOUNT",
    "PAYOUT_BANK_ACCOUNT_NUMBER"].map((key) => ({ key })); // destination of transfers to a CVU/alias (→ recipient_key)
  const made = await mpFetch(c, RR + "/config", { method: "POST", body: { file_name_prefix: "mis-finanzas",
    display_timezone: "GMT-03", include_withdrawal_at_end: false, execute_after_withdrawal: false,
    frequency: { hour: 0, type: "monthly", value: 1 }, columns } });
  if (made.status >= 300) throw new Error(`No se pudo configurar el reporte de saldo (${made.status})`);
}

async function requestReport(env, c, kind, begin, end) {
  const r = await mpFetch(c, RR, { method: "POST", body: { begin_date: iso(begin), end_date: iso(end) } });
  if (r.status >= 300 || !r.body.id) throw new Error(`Mercado Pago rechazó el pedido de reporte (${r.status})`);
  await env.DB.prepare("INSERT INTO report_tasks (task_id, kind, begin_date, end_date, requested_at) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(r.body.id, kind, iso(begin), iso(end), nowIso()).run();
}

const finishTask = (env, id, detail) => env.DB.prepare("UPDATE report_tasks SET processed_at = ?1, detail = ?2 WHERE task_id = ?3")
  .bind(nowIso(), detail, id).run();

async function collect(env, c, t) {
  const task = await mpFetch(c, `${RR}/task/${t.task_id}`);
  if (!task.body.file_name) {
    if (Date.now() - new Date(t.requested_at).getTime() > DAY) await finishTask(env, t.task_id, `vencido (${task.body.status ?? task.status})`);
    return;
  }
  // counted before reading, so a report too big to read is set aside after 3 tries instead of blocking every run
  if (t.attempts >= 3) { await finishTask(env, t.task_id, "no se pudo leer"); return; }
  await env.DB.prepare("UPDATE report_tasks SET attempts = attempts + 1 WHERE task_id = ?1").bind(t.task_id).run();
  const csv = await mpFetch(c, `${RR}/${task.body.file_name}`, { text: true });
  // the destination account becomes a recipient key ("bank:" prefix); the account number itself is never stored
  const payouts = [];
  for (const { dest, ...r } of payoutRows(csv)) payouts.push({ ...r, recipient_key: dest ? (await hmacHex(c.salt, `bank:${dest}`)).slice(0, 20) : "" });
  await upsertMovements(env, payouts);
  const bal = releaseBalance(csv);
  if (bal) await env.DB.prepare(`INSERT INTO balances (as_of, available, fetched_at) VALUES (?1, ?2, ?3)
    ON CONFLICT (as_of) DO UPDATE SET available = excluded.available, fetched_at = excluded.fetched_at`).bind(bal.asOf, bal.balance, nowIso()).run();
  await finishTask(env, t.task_id, `${payouts.length} retiros${bal ? `, saldo al ${bal.asOf}` : ""}`);
}

export async function reportsStep(env, c, minGapHours) {
  if (!(await setting(env, "report_config"))) { await ensureReportConfig(c); await setSetting(env, "report_config", "ok"); }
  const { results: pending } = await env.DB.prepare(`SELECT task_id, requested_at, attempts FROM report_tasks
    WHERE processed_at IS NULL ORDER BY requested_at LIMIT 2`).all();
  for (const t of pending) await collect(env, c, t);
  const now = Date.now();
  const last = await env.DB.prepare("SELECT requested_at FROM report_tasks WHERE kind = 'recent' ORDER BY requested_at DESC LIMIT 1").first();
  if (last && now - new Date(last.requested_at).getTime() <= minGapHours * 3600e3) return;
  await requestReport(env, c, "recent", now - 10 * DAY, now);
  const until = Number(await setting(env, "backfill_until")) || now - 10 * DAY;
  if (until > now - 400 * DAY) {
    await requestReport(env, c, "backfill", until - REPORT_CHUNK_DAYS * DAY, until);
    await setSetting(env, "backfill_until", until - REPORT_CHUNK_DAYS * DAY);
  }
}

// ------------------------------------------------------------ one step
/**
 * One step of the current plan (a new plan if there is none: 13 months the first time, then `months`).
 * Returns { ok, done, month, progress, rows } — or { ok: true, idle: true } before the Claim.
 */
export async function step(env, { trigger, months, reportGapHours }) {
  let c;
  try { c = await context(env); } catch (e) {
    await env.DB.prepare("INSERT INTO sync_log (trigger, finished_at, ok, detail) VALUES (?1, ?2, 0, ?3)").bind(trigger, nowIso(), e.message).run();
    return { ok: false, error: e.message };
  }
  if (!c) return { ok: true, idle: true };
  let plan = JSON.parse((await setting(env, "sync_plan")) ?? "null");
  if (!plan) {
    const backfill = !(await setting(env, "backfill_done"));
    const labels = monthWindows(backfill ? BACKFILL_MONTHS : months).map((w) => w.label);
    plan = { months: labels, i: 0, offset: 0, rows: 0, backfill };
  }
  if (!plan.log) {
    const log = await env.DB.prepare("INSERT INTO sync_log (trigger, months) VALUES (?1, ?2) RETURNING id").bind(trigger, plan.months.length).first();
    plan.log = log.id;
  }
  try {
    await advance(env, c, plan);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await env.DB.prepare("UPDATE sync_log SET finished_at = ?1, ok = 0, detail = ?2 WHERE id = ?3").bind(nowIso(), detail, plan.log).run();
    delete plan.log;   // the plan stays: the next step continues it with a new log line
    await setSetting(env, "sync_plan", JSON.stringify(plan));
    return { ok: false, error: detail };
  }
  const done = plan.i >= plan.months.length;
  if (!done) {
    await env.DB.prepare("UPDATE sync_log SET rows = ?1, detail = ?2 WHERE id = ?3")
      .bind(plan.rows, `descargando ${plan.months[plan.i]}…`, plan.log).run();
    await setSetting(env, "sync_plan", JSON.stringify(plan));
    return { ok: true, done, month: plan.months[plan.i], progress: plan.i / plan.months.length, rows: plan.rows };
  }
  // payments are saved; balance and transfers to other banks must not undo that if they fail
  let note = null;
  try { await reportsStep(env, c, reportGapHours); } catch (e) { note = `Saldo/retiros: ${e instanceof Error ? e.message : e}`; }
  await env.DB.batch([
    env.DB.prepare("UPDATE sync_log SET finished_at = ?1, ok = 1, rows = ?2, detail = ?3 WHERE id = ?4").bind(nowIso(), plan.rows, note, plan.log),
    // a Cron step and an app step that ran at the same time share one plan: the other one's log line ends here too
    env.DB.prepare("UPDATE sync_log SET finished_at = ?1, ok = 1, detail = 'junto con otra actualización' WHERE finished_at IS NULL AND id <> ?2")
      .bind(nowIso(), plan.log),
    env.DB.prepare("DELETE FROM sync_log WHERE id <= (SELECT max(id) FROM sync_log) - 200"),
    env.DB.prepare("DELETE FROM app_settings WHERE key = 'sync_plan'"),
    ...(plan.backfill ? [env.DB.prepare("INSERT INTO app_settings (key, value) VALUES ('backfill_done', ?1) ON CONFLICT (key) DO NOTHING").bind(nowIso())] : []),
  ]);
  return { ok: true, done, progress: 1, rows: plan.rows, note };
}

/** Only pick up reports requested earlier (no new ones): the app calls this a minute after a refresh. */
export async function collectReports(env) {
  const c = await context(env);
  if (c) await reportsStep(env, c, Infinity);
  return { ok: true };
}

export const cronStep = (env) => step(env, { trigger: "cron", months: CRON_MONTHS, reportGapHours: 24 });
export const manualStep = (env) => step(env, { trigger: "owner", months: MANUAL_MONTHS, reportGapHours: 6 });
