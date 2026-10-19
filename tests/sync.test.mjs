// npm test   (invented data only; Mercado Pago and Mercado Libre are simulated, nothing leaves this computer)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./fake-d1.mjs";
import { cronStep, manualStep, collectReports, PAGES } from "../src/sync.js";
import { monthWindows } from "../src/lib/normalize.js";

const ME = 1001, FRIEND = 7770777, ACCOUNT = "0000003100099999999999";
let env, mp, realFetch;

const months = monthWindows(13).map((w) => w.label);              // oldest first
const at = (label, day, n = 0) => `${label}-${String(day).padStart(2, "0")}T12:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}.000-03:00`;
const payment = (id, date, over = {}) => ({ id, date_created: date, date_last_updated: date, operation_type: "regular_payment",
  status: "approved", payment_type_id: "account_money", payment_method_id: "account_money", transaction_amount: 1000,
  transaction_details: { total_paid_amount: 1000 }, collector_id: 999, description: "Compra en Súper Ejemplo", refunds: [], ...over });

// 250 payments this month, 1 four months ago, 2 transfers to the same friend; a Mercado Libre item
function invented() {
  const now = months.at(-1), old = months.at(-5);
  const list = Array.from({ length: 250 }, (_, i) => payment(10000 + i, at(now, 1 + (i % 9), i)));
  list.push(payment(500, at(old, 3), { additional_info: { items: [{ title: "Lámpara Ejemplo", category_id: "MLA1234" }] } }));
  list.push(payment(600, at(old, 4), { operation_type: "money_transfer", collector_id: FRIEND }));
  list.push(payment(601, at(old, 5), { operation_type: "money_transfer", collector_id: FRIEND }));
  return list;
}
const REPORT = ["DATE,SOURCE_ID,EXTERNAL_REFERENCE,RECORD_TYPE,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT,GROSS_AMOUNT,PAYMENT_METHOD,BALANCE_AMOUNT,PAYOUT_BANK_ACCOUNT_NUMBER",
  "2026-09-01T00:00:00.000-03:00,,,initial_available_balance,,0.00,0.00,0.00,,1000.00,",
  "2026-09-03T10:00:01.000-03:00,12,,release,payout,0.00,2000.00,-2000.00,,4000.00," + ACCOUNT,
  "2026-09-04T10:00:00.000-03:00,13,,release,payment,0.00,1500.50,-1500.50,account_money,2499.50,"].join("\n");

function fakeMp() {
  const s = { payments: invented(), calls: [], failSearch: false, configured: false, tasks: new Map(), nextTask: 1, ready: false };
  s.fetch = async (url, init = {}) => {
    const u = new URL(String(url)), method = init.method ?? "GET";
    s.calls.push(`${method} ${u.pathname}`);
    const ok = (j, status = 200) => new Response(JSON.stringify(j), { status });
    if (u.hostname === "api.mercadolibre.com") return ok({ path_from_root: [{ name: "Hogar, Muebles y Jardín" }, { name: "Iluminación" }] });
    assert.equal(init.headers?.authorization, "Bearer TOKEN-OK");
    if (u.pathname === "/v1/payments/search") {
      if (s.failSearch) return ok({ message: "unauthorized" }, 401);
      const p = Object.fromEntries(u.searchParams), b = new Date(p.begin_date), e = new Date(p.end_date);
      const hits = s.payments.filter((x) => new Date(x.date_created) >= b && new Date(x.date_created) <= e)
        .sort((x, y) => new Date(x.date_created) - new Date(y.date_created));
      const off = Number(p.offset), lim = Number(p.limit);
      assert.ok(lim <= 100);
      return ok({ results: hits.slice(off, off + lim), paging: { total: hits.length, offset: off, limit: lim } });
    }
    if (u.pathname === "/v1/account/release_report/config") {
      if (method === "POST") { s.configured = true; return ok({}, 201); }
      return s.configured ? ok({}) : ok({}, 404);
    }
    if (u.pathname === "/v1/account/release_report" && method === "POST") { const id = s.nextTask++; s.tasks.set(id, JSON.parse(init.body)); return ok({ id }); }
    const task = u.pathname.match(/\/release_report\/task\/(\d+)$/);
    if (task) return ok(s.ready ? { status: "processed", file_name: `rep-${task[1]}.csv` } : { status: "pending" });
    if (/\/release_report\/rep-\d+\.csv$/.test(u.pathname)) return new Response(REPORT);
    throw new Error(`unexpected ${method} ${u}`);
  };
  return s;
}

beforeEach(async () => {
  env = { DB: fakeD1(), MP_CLIENT_ID: "123", MP_CLIENT_SECRET: "secreto-de-prueba" };
  mp = fakeMp(); realFetch = globalThis.fetch; globalThis.fetch = mp.fetch;
  const far = new Date(Date.now() + 150 * 86400e3).toISOString();
  env.DB.raw.prepare("INSERT INTO owner (id, mp_user_id) VALUES (1, ?)").run(String(ME));
  env.DB.raw.prepare("INSERT INTO mp_token (id, access_token, refresh_token, expires_at) VALUES (1, 'TOKEN-OK', 'R', ?)").run(far);
});
afterEach(() => { globalThis.fetch = realFetch; });

const q = (sql, ...a) => env.DB.raw.prepare(sql).all(...a).map((r) => ({ ...r }));
async function untilDone(stepFn, max = 40) {
  const steps = [];
  for (let i = 0; i < max; i++) {
    const before = mp.calls.length, r = await stepFn(env);
    steps.push({ ...r, calls: mp.calls.slice(before) });
    if (r.done || r.idle || !r.ok) return steps;
  }
  throw new Error("never finished");
}

test("before the Claim, a step does nothing", async () => {
  env.DB.raw.exec("DELETE FROM owner");
  assert.deepEqual(await cronStep(env), { ok: true, idle: true });
  assert.equal(mp.calls.length, 0);
});

test("first download: 13 months in small steps, every movement saved once, within the free plan's limits", async () => {
  const steps = await untilDone(manualStep);
  for (const s of steps) {
    assert.ok(s.calls.filter((c) => c.endsWith("/payments/search")).length <= PAGES, "≤ 2 pages of payments per step");
    assert.ok(s.calls.length < 45, "well under 50 outside requests per step");
  }
  assert.ok(steps.length > 1);
  assert.equal(q("SELECT count(*) n FROM movements")[0].n, 253);
  const searched = new Set(mp.calls.filter((c) => c.endsWith("/payments/search")));
  assert.ok(searched.size === 1);
  assert.ok(q("SELECT value FROM app_settings WHERE key = 'backfill_done'").length);
  assert.equal(q("SELECT value FROM app_settings WHERE key = 'sync_plan'").length, 0);
  const log = q("SELECT trigger, months, ok, rows FROM sync_log");
  assert.deepEqual(log, [{ trigger: "owner", months: 13, ok: 1, rows: 253 }]);
  assert.equal(q("SELECT item_category FROM movements WHERE payment_id = 500")[0].item_category, "Hogar, Muebles y Jardín > Iluminación");
});

test("rerunning changes nothing that didn't change; a change is picked up", async () => {
  await untilDone(manualStep);
  const before = q("SELECT id, synced_at, h FROM movements ORDER BY id");
  mp.payments.find((p) => p.id === 10000).status = "refunded";
  await new Promise((ok) => setTimeout(ok, 5));
  const steps = await untilDone(cronStep);
  assert.equal(steps.at(-1).ok, true);
  assert.equal(q("SELECT months FROM sync_log ORDER BY id DESC LIMIT 1")[0].months, 3, "later runs look at the last 3 months");
  const after = q("SELECT id, synced_at, h FROM movements ORDER BY id");
  assert.equal(after.length, before.length, "no duplicates");
  const changed = after.filter((r, i) => r.synced_at !== before[i].synced_at).map((r) => r.id);
  assert.deepEqual(changed, ["10000:payment"]);
});

test("transfers to the same person share a key; their account id is never stored", async () => {
  await untilDone(manualStep);
  const keys = q("SELECT recipient_key FROM movements WHERE payment_id IN (600, 601)").map((r) => r.recipient_key);
  assert.equal(keys[0].length, 20);
  assert.equal(keys[0], keys[1]);
  const all = JSON.stringify(q("SELECT * FROM movements")) + JSON.stringify(q("SELECT * FROM app_settings"));
  assert.ok(!all.includes(String(FRIEND)));
});

test("balance and transfers to other banks arrive from the report on a later step; the account number is never kept", async () => {
  await untilDone(manualStep);
  assert.ok(mp.configured, "report columns configured once");
  assert.deepEqual([...mp.tasks.values()].length, 2, "one recent + one backfill report requested");
  assert.equal(q("SELECT count(*) n FROM balances")[0].n, 0);
  mp.ready = true;
  await collectReports(env);
  assert.deepEqual(q("SELECT available FROM balances"), [{ available: 2499.5 }]);
  const [payout] = q("SELECT amount, recipient_key FROM movements WHERE row_type = 'payout'");
  assert.equal(payout.amount, -2000);
  assert.equal(payout.recipient_key.length, 20);
  const all = JSON.stringify(q("SELECT * FROM movements")) + JSON.stringify(q("SELECT * FROM report_tasks"));
  assert.ok(!all.includes(ACCOUNT));
  assert.equal(q("SELECT count(*) n FROM report_tasks WHERE processed_at IS NULL")[0].n, 0);
  // a new report only after the minimum gap
  const n = mp.tasks.size; await untilDone(manualStep);
  assert.equal(mp.tasks.size, n);
});

test("a failure is logged, keeps what was saved, and the next step continues the plan", async () => {
  await manualStep(env);                       // first step saves some months
  const saved = q("SELECT count(*) n FROM movements")[0].n;
  mp.failSearch = true;
  const r = await manualStep(env);
  assert.equal(r.ok, false);
  assert.match(r.error, /401/);
  assert.equal(q("SELECT count(*) n FROM movements")[0].n, saved);
  assert.equal(q("SELECT ok FROM sync_log ORDER BY id DESC LIMIT 1")[0].ok, 0);
  mp.failSearch = false;
  await untilDone(manualStep);
  assert.equal(q("SELECT count(*) n FROM movements")[0].n, 253);
});

test("an expired Mercado Pago permission is explained, not hidden", async () => {
  env.DB.raw.prepare("UPDATE mp_token SET expires_at = ?, refresh_token = NULL").run(new Date(Date.now() - 1000).toISOString());
  const r = await cronStep(env);
  assert.equal(r.ok, false);
  assert.match(r.error, /volvé a entrar con Mercado Pago/);
  assert.equal(q("SELECT ok FROM sync_log")[0].ok, 0);
});

test("when the Cron and the app sync at the same time, no log line stays 'running' forever", async () => {
  await untilDone(manualStep);                  // first download done
  await cronStep(env);                          // the Cron starts a plan…
  env.DB.raw.exec("DELETE FROM app_settings WHERE key = 'sync_plan'"); // …and the app's step replaces it
  await untilDone(manualStep);
  assert.equal(q("SELECT count(*) n FROM sync_log WHERE finished_at IS NULL")[0].n, 0);
});
