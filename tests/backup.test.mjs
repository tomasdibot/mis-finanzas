// npm test   (invented data only)
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./fake-d1.mjs";
import worker from "../src/worker.js";
import { sha256Hex } from "../src/http.js";

const ORIGIN = "https://mis-finanzas.ejemplo.workers.dev";

// a claimed Deployment with a signed-in browser
async function deployment() {
  const env = { DB: fakeD1(), ASSETS: { fetch: async () => new Response("app") } };
  const sid = "sesion-de-prueba";
  env.DB.raw.prepare("INSERT INTO owner (id, mp_user_id) VALUES (1, '1001')").run();
  env.DB.raw.prepare("INSERT INTO sessions (id_hash, expires_at) VALUES (?, ?)").run(await sha256Hex(sid), "2999-01-01T00:00:00.000Z");
  env.DB.raw.prepare("INSERT INTO mp_token (id, access_token, refresh_token, expires_at) VALUES (1, 'TOKEN-SECRETO', 'REFRESH-SECRETO', '2999-01-01T00:00:00.000Z')").run();
  const call = async (path, body) => {
    const init = body === undefined ? {} : { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) };
    const r = await worker.fetch(new Request(ORIGIN + path, { ...init, headers: { ...init.headers, cookie: `mf_session=${sid}` } }), env);
    return { status: r.status, body: await r.json(), headers: r.headers };
  };
  return { env, call, q: (sql) => env.DB.raw.prepare(sql).all().map((r) => ({ ...r })) };
}

function fill(env) {
  const ins = env.DB.raw.prepare(`INSERT INTO movements (id, payment_id, row_type, date, month, direction, operation_type, status,
    description, recipient_key, amount, h) VALUES (?, ?, 'payment', ?, '2026-09', 'out', 'regular_payment', 'approved', 'Compra en Súper Ejemplo', ?, ?, 'x')`);
  for (let i = 0; i < 1234; i++) ins.run(`${i}:payment`, i, `2026-09-${String(1 + (i % 28)).padStart(2, "0")}T12:00:00-03:00`, i % 10 ? "" : "abcdef0123456789abcd", -100 - i);
  env.DB.raw.exec(`INSERT INTO balances (as_of, available) VALUES ('2026-09-30T12:00:00.000Z', 2499.5);
    INSERT INTO recipients (key, name, category) VALUES ('abcdef0123456789abcd', 'Ana', 'Hogar');
    INSERT INTO notes (id, note, category) VALUES ('1:payment', 'Café con Ana', NULL), ('m:Súper Ejemplo', NULL, 'Verdulería');
    INSERT INTO personal_rules (kind, match, value) VALUES ('name', 'Kioscoejemplo', 'Kiosco'), ('word', 'heladosejemplo', 'Regalos');
    INSERT INTO ml_categories (id, path) VALUES ('MLA1234', 'Hogar, Muebles y Jardín > Iluminación');
    INSERT INTO app_settings (key, value) VALUES ('recipient_salt', '00112233445566778899aabbccddeeff0011223344556677'), ('backfill_done', 'x');`);
}

// what the app does (web/lib/api.js): meta + movement pages; then import in chunks of 300
async function exportAll(call) {
  const meta = (await call("/api/export/meta")).body, movements = [];
  for (let page = 0; ; page++) { const r = (await call(`/api/movements?page=${page}`)).body; movements.push(...r.rows.map(({ h, ...x }) => x)); if (!r.more) break; }
  return { ...meta, movements };
}
async function importAll(call, b) {
  assert.equal((await call("/api/import", { settings: b.settings })).status, 200);
  for (const t of ["personal_rules", "recipients", "notes", "ml_categories", "balances", "movements"]) {
    for (let i = 0; i < b[t].length; i += 300) assert.equal((await call("/api/import", { table: t, rows: b[t].slice(i, i + 300) })).status, 200);
  }
}

test("a backup has all the Owner's data and never the Mercado Pago token, sessions or the Claim", async () => {
  const a = await deployment(); fill(a.env);
  const b = await exportAll(a.call);
  assert.deepEqual([b.format, b.version], ["mis-finanzas", 1]);
  assert.equal(b.movements.length, 1234);
  assert.deepEqual([b.recipients.length, b.notes.length, b.personal_rules.length, b.ml_categories.length, b.balances.length], [1, 2, 2, 1, 1]);
  assert.equal(b.settings.recipient_salt.length, 48);
  const text = JSON.stringify(b);
  for (const secret of ["TOKEN-SECRETO", "REFRESH-SECRETO", "sesion-de-prueba", "mp_user_id", "id_hash"]) assert.ok(!text.includes(secret), secret);
});

test("restoring a backup into a new Deployment gives back the same data, and re-downloads with the copy's key", async () => {
  const a = await deployment(); fill(a.env);
  const b = await exportAll(a.call);
  const fresh = await deployment();
  fresh.env.DB.raw.exec("INSERT INTO app_settings (key, value) VALUES ('recipient_salt', 'ffff0000ffff0000'), ('backfill_done', 'x')");
  await importAll(fresh.call, JSON.parse(JSON.stringify(b)));
  for (const t of ["recipients", "notes", "personal_rules", "ml_categories", "balances"]) {
    const cols = t === "balances" ? "as_of, available" : "*";
    const strip = (rows) => rows.map(({ updated_at, fetched_at, ...r }) => r);
    assert.deepEqual(strip(fresh.q(`SELECT ${cols} FROM ${t} ORDER BY 1, 2`)), strip(a.q(`SELECT ${cols} FROM ${t} ORDER BY 1, 2`)), t);
  }
  const cols = "id, payment_id, date, month, description, recipient_key, amount";
  assert.deepEqual(fresh.q(`SELECT ${cols} FROM movements ORDER BY id`), a.q(`SELECT ${cols} FROM movements ORDER BY id`));
  assert.deepEqual(fresh.q("SELECT key, value FROM app_settings ORDER BY key"), [{ key: "recipient_salt", value: b.settings.recipient_salt }]);
  // importing twice changes nothing
  await importAll(fresh.call, b);
  assert.equal(fresh.q("SELECT count(*) n FROM movements")[0].n, 1234);
});

test("a broken or foreign file is refused", async () => {
  const { call, q } = await deployment();
  const bad = async (body) => assert.equal((await call("/api/import", body)).status, 400, JSON.stringify(body).slice(0, 80));
  await bad({ table: "mp_token", rows: [{ id: 1, access_token: "x" }] });
  await bad({ table: "owner", rows: [{ id: 1, mp_user_id: "2" }] });
  await bad({ table: "movements", rows: [{ id: "1:payment" }] });
  await bad({ table: "notes", rows: Array.from({ length: 301 }, (_, i) => ({ id: String(i) })) });
  await bad({ table: "personal_rules", rows: [{ kind: "sql", match: "x", value: "y" }] });
  await bad({ settings: { recipient_salt: "no es hex" } });
  assert.equal(q("SELECT count(*) n FROM notes")[0].n, 0);
});

test("delete everything: only after typing BORRAR; afterwards the Deployment is new again", async () => {
  const { call, q, env } = await deployment(); fill(env);
  assert.equal((await call("/api/delete-all", { confirm: "borrar?" })).status, 400);
  assert.equal(q("SELECT count(*) n FROM movements")[0].n, 1234);
  const r = await call("/api/delete-all", { confirm: "BORRAR" });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /mf_session=;.*Max-Age=0/);
  for (const t of ["movements", "balances", "recipients", "notes", "personal_rules", "ml_categories", "app_settings", "mp_token", "sessions", "owner", "sync_log", "report_tasks"]) {
    assert.equal(q(`SELECT count(*) n FROM ${t}`)[0].n, 0, t);
  }
  assert.equal((await call("/api/session")).status, 401);
});
