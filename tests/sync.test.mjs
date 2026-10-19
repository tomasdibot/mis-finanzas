// npm test   (invented data only; Mercado Pago, Mercado Libre and the Relay are simulated)
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { memoryProfile } from "../web/lib/store.js";
import { createSync, PAGES, FIRST_MONTHS, OPEN_MONTHS } from "../web/lib/sync.js";
import { monthWindows } from "../web/lib/normalize.js";

const ME = "1001", FRIEND = 7770777, ACCOUNT = "0000003100099999999999", RELAY = "https://app.test/api/mp";
const months = monthWindows(13).map((w) => w.label);              // oldest first
const at = (label, day, n = 0) => `${label}-${String(day).padStart(2, "0")}T12:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}.000-03:00`;
const payment = (id, date, over = {}) => ({ id, date_created: date, date_last_updated: date, operation_type: "regular_payment",
  status: "approved", payment_type_id: "account_money", payment_method_id: "account_money", transaction_amount: 1000,
  transaction_details: { total_paid_amount: 1000 }, collector_id: 999, description: "Compra en Súper Ejemplo", refunds: [], ...over });

// 350 payments this month, 1 in each of the 12 older months, 2 transfers to the same friend; a Mercado Libre item
function invented() {
  const now = months.at(-1), old = months.at(-5);
  const list = Array.from({ length: 350 }, (_, i) => payment(10000 + i, at(now, 1 + (i % 9), i)));
  months.slice(0, -1).forEach((m, i) => list.push(payment(500 + i, at(m, 3), i === 8 ? { additional_info: { items: [{ title: "Lámpara Ejemplo", category_id: "MLA1234" }] } } : {})));
  list.push(payment(600, at(old, 4), { operation_type: "money_transfer", collector_id: FRIEND }));
  list.push(payment(601, at(old, 5), { operation_type: "money_transfer", collector_id: FRIEND }));
  return list;
}
const REPORT = ["DATE,SOURCE_ID,EXTERNAL_REFERENCE,RECORD_TYPE,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT,GROSS_AMOUNT,PAYMENT_METHOD,BALANCE_AMOUNT,PAYOUT_BANK_ACCOUNT_NUMBER",
  "2026-09-01T00:00:00.000-03:00,,,initial_available_balance,,0.00,0.00,0.00,,1000.00,",
  "2026-09-03T10:00:01.000-03:00,12,,release,payout,0.00,2000.00,-2000.00,,4000.00," + ACCOUNT,
  "2026-09-04T10:00:00.000-03:00,13,,release,payment,0.00,1500.50,-1500.50,account_money,2499.50,"].join("\n");

let profile, mp, sync, token;
function fakeMp() {
  const s = { payments: invented(), calls: [], status: 200, configured: false, tasks: new Map(), nextTask: 1, ready: false };
  s.fetch = async (url, init = {}) => {
    const u = new URL(String(url)), method = init.method ?? "GET";
    s.calls.push(`${method} ${u.host}${u.pathname}`);
    const ok = (j, status = 200) => new Response(JSON.stringify(j), { status });
    if (u.hostname === "api.mercadolibre.com") return ok({ path_from_root: [{ name: "Hogar, Muebles y Jardín" }, { name: "Iluminación" }] });
    if (init.headers?.authorization !== `Bearer ${token}`) return ok({ message: "unauthorized" }, 401);
    if (u.hostname === "api.mercadopago.com" && u.pathname === "/v1/payments/search") {
      if (s.status !== 200) return ok({ message: "boom" }, s.status);
      const p = Object.fromEntries(u.searchParams), b = new Date(p.begin_date), e = new Date(p.end_date);
      const hits = s.payments.filter((x) => new Date(x.date_created) >= b && new Date(x.date_created) <= e)
        .sort((x, y) => new Date(x.date_created) - new Date(y.date_created));
      const off = Number(p.offset), lim = Number(p.limit);
      assert.ok(lim <= 100);
      return ok({ results: hits.slice(off, off + lim), paging: { total: hits.length, offset: off, limit: lim } });
    }
    // reports must go through the Relay, never straight to Mercado Pago from the browser
    assert.ok(u.href.startsWith(RELAY + "/"), `report call outside the Relay: ${u.href}`);
    const sub = u.pathname.replace("/api/mp", "");
    if (sub === "/config") { if (method === "POST") { s.configured = true; return ok({}, 201); } return s.configured ? ok({}) : ok({}, 404); }
    if (sub === "/report" && method === "POST") { const id = s.nextTask++; s.tasks.set(id, JSON.parse(init.body)); return ok({ id }); }
    const task = sub.match(/^\/task\/(\d+)$/);
    if (task) return ok(s.ready ? { status: "processed", file_name: `rep-${task[1]}.csv` } : { status: "pending" });
    if (/^\/file\/rep-\d+\.csv$/.test(sub)) return new Response(REPORT);
    throw new Error(`unexpected ${method} ${u}`);
  };
  return s;
}

beforeEach(() => {
  profile = memoryProfile(ME); mp = fakeMp(); token = "TOKEN-OK";
  sync = createSync({ profile, token: async () => token, fetch: mp.fetch, relay: RELAY });
});
async function untilDone(opts) {
  const steps = [];
  for (let i = 0; i < 60; i++) {
    const before = mp.calls.length, r = await sync.step(opts);
    steps.push({ ...r, calls: mp.calls.slice(before) });
    if (r.done || !r.ok) return steps;
  }
  throw new Error("never finished");
}
const count = async (t) => (await profile.all(t)).length;

test("first time on a device: 13 months newest first, in steps; the first months are usable early", async () => {
  const steps = await untilDone();
  for (const s of steps) assert.ok(s.calls.filter((c) => c.endsWith("/payments/search")).length <= PAGES);
  assert.equal(await count("movements"), 350 + 12 + 2);
  const searched = steps.flatMap((s) => s.calls).filter((c) => c.endsWith("/payments/search"));
  assert.ok(searched.length >= FIRST_MONTHS);
  const firstUsable = steps.findIndex((s) => s.firstMonths);
  assert.ok(firstUsable >= 0 && firstUsable < steps.length - 1, "the app can show data before the whole download ends");
  assert.ok(await profile.setting("backfill_done"));
  assert.equal(await profile.setting("sync_plan"), null);
  const [log] = await sync.log();
  assert.deepEqual([log.ok, log.rows], [true, 364]);
  assert.equal((await profile.get("movements", "508:payment")).item_category, "Hogar, Muebles y Jardín > Iluminación");
});

test("opening the app again: only the last 2 months, nothing duplicated, changes picked up", async () => {
  await untilDone();
  mp.payments.find((p) => p.id === 10000).status = "refunded";
  const before = mp.calls.length;
  await untilDone();
  const searched = mp.calls.slice(before).filter((c) => c.endsWith("/payments/search")).length;
  assert.ok(searched >= OPEN_MONTHS && searched <= OPEN_MONTHS + 4);
  assert.equal(await count("movements"), 364);
  assert.equal((await profile.get("movements", "10000:payment")).status, "refunded");
});

test("transfers to the same person share a key; their account id is never stored", async () => {
  await untilDone();
  const keys = [(await profile.get("movements", "600:payment")).recipient_key, (await profile.get("movements", "601:payment")).recipient_key];
  assert.equal(keys[0].length, 20);
  assert.equal(keys[0], keys[1]);
  const all = JSON.stringify(await profile.all("movements")) + JSON.stringify(await profile.all("settings"));
  assert.ok(!all.includes(String(FRIEND)));
});

test("balance and transfers to other banks come from the report through the Relay; the account number is never kept", async () => {
  await untilDone();
  assert.ok(mp.configured);
  assert.equal(mp.tasks.size, 2, "one recent + one backfill report requested");
  assert.ok(!mp.calls.some((c) => c.includes("api.mercadopago.com/v1/account")), "never straight from the browser");
  mp.ready = true;
  await sync.collectReports();
  assert.deepEqual((await profile.all("balances")).map((b) => b.available), [2499.5]);
  const payout = (await profile.all("movements")).find((m) => m.row_type === "payout");
  assert.equal(payout.amount, -2000);
  assert.equal(payout.recipient_key.length, 20);
  assert.ok(!JSON.stringify(await profile.all("movements")).includes(ACCOUNT));
  const n = mp.tasks.size; await untilDone();
  assert.equal(mp.tasks.size, n, "at most one new report a day");
});

test("a failure keeps what was saved and the next step continues where it stopped", async () => {
  await sync.step();
  const saved = await count("movements");
  mp.status = 500;
  const r = await sync.step();
  assert.equal(r.ok, false);
  assert.equal(await count("movements"), saved);
  assert.equal((await sync.log())[0].ok, false);
  mp.status = 200;
  await untilDone();
  assert.equal(await count("movements"), 364);
});

test("an expired or refused permission asks to sign in again", async () => {
  token = null;
  const r = await sync.step();
  assert.deepEqual([r.ok, r.signIn], [false, true]);
  token = "TOKEN-OK";
  const refused = createSync({ profile, token: async () => "OTRO", fetch: mp.fetch, relay: RELAY });
  const r2 = await refused.step();
  assert.deepEqual([r2.ok, r2.signIn], [false, true]);
});
