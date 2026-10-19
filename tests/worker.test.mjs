// npm test   (invented data only; Mercado Pago is simulated, nothing leaves this computer)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./fake-d1.mjs";
import worker from "../src/worker.js";
import { readToken } from "../src/auth.js";

const ORIGIN = "https://mis-finanzas.ejemplo.workers.dev";
const OWNER_ID = 1001, STRANGER_ID = 2002;
let env, mp, realFetch;

// simulated Mercado Pago token endpoint: who the code belongs to, and who owns the developer app
function fakeMp({ codeUser = OWNER_ID, appOwner = OWNER_ID } = {}) {
  const calls = [];
  return {
    calls, set(o) { codeUser = o.codeUser ?? codeUser; appOwner = o.appOwner ?? appOwner; },
    fetch: async (url, init) => {
      assert.equal(String(url), "https://api.mercadopago.com/oauth/token");
      const body = JSON.parse(init.body); calls.push(body);
      const ok = (j) => new Response(JSON.stringify(j), { status: 200 });
      if (body.grant_type === "authorization_code") {
        return body.code === "codigo-bueno"
          ? ok({ access_token: "TOKEN-USUARIO", refresh_token: "REFRESH-1", expires_in: 15552000, user_id: codeUser })
          : new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      }
      if (body.grant_type === "client_credentials") return ok({ access_token: "TOKEN-APP", user_id: appOwner });
      if (body.grant_type === "refresh_token") return ok({ access_token: "TOKEN-NUEVO", refresh_token: "REFRESH-2", expires_in: 15552000, user_id: OWNER_ID });
      throw new Error("unexpected grant");
    },
  };
}

beforeEach(() => {
  env = { DB: fakeD1(), MP_CLIENT_ID: "123", MP_CLIENT_SECRET: "secreto-de-prueba",
    ASSETS: { fetch: async () => new Response("app") } };
  mp = fakeMp(); realFetch = globalThis.fetch; globalThis.fetch = mp.fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

const req = (path, { method = "GET", cookie, body, origin = method === "GET" ? null : ORIGIN } = {}) => {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  return worker.fetch(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
};
const cookiesOf = (res) => Object.fromEntries(res.headers.getSetCookie().map((c) => { const [kv] = c.split(";"); const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; }));

async function signIn(code = "codigo-bueno") {
  const start = await req("/api/auth/login");
  const c = cookiesOf(start), state = new URL(start.headers.get("location")).searchParams.get("state");
  const back = await req(`/api/auth/callback?code=${code}&state=${state}`, { cookie: `mf_pv=${c.mf_pv}; mf_ps=${c.mf_ps}` });
  const sid = cookiesOf(back).mf_session;
  return { back, cookie: sid ? `mf_session=${sid}` : null, sid };
}

test("without a session, data is refused; the app and health answer", async () => {
  for (const p of ["/api/state", "/api/movements", "/api/sync-log", "/api/session"]) assert.equal((await req(p)).status, 401, p);
  assert.equal(await (await req("/")).text(), "app");
  const h = await (await req("/api/health")).json();
  assert.deepEqual([h.ok, h.db, h.signIn], [true, "ok", true]);
});

test("sign-in starts at Mercado Pago with PKCE and this Deployment's callback", async () => {
  const res = await req("/api/auth/login");
  assert.equal(res.status, 302);
  const to = new URL(res.headers.get("location"));
  assert.equal(to.origin + to.pathname, "https://auth.mercadopago.com/authorization");
  assert.equal(to.searchParams.get("client_id"), "123");
  assert.equal(to.searchParams.get("redirect_uri"), `${ORIGIN}/api/auth/callback`);
  assert.equal(to.searchParams.get("code_challenge_method"), "S256");
  assert.ok(to.searchParams.get("code_challenge").length >= 43);
  for (const c of res.headers.getSetCookie()) assert.match(c, /HttpOnly; Secure; SameSite=Lax/);
  assert.ok(!to.toString().includes("secreto-de-prueba"));
});

test("the app's owner signs in: Claim, session, token stored server-side only", async () => {
  const { back, cookie, sid } = await signIn();
  assert.equal(back.headers.get("location"), "/");
  assert.ok(cookie);
  const exchange = mp.calls.find((c) => c.grant_type === "authorization_code");
  assert.ok(exchange.code_verifier.length >= 43);
  assert.equal(exchange.redirect_uri, `${ORIGIN}/api/auth/callback`);
  assert.equal((await env.DB.prepare("SELECT mp_user_id FROM owner").first()).mp_user_id, String(OWNER_ID));
  assert.equal((await env.DB.prepare("SELECT access_token FROM mp_token").first()).access_token, "TOKEN-USUARIO");
  // only a hash of the session cookie is kept
  const s = await env.DB.prepare("SELECT id_hash FROM sessions").first();
  assert.notEqual(s.id_hash, sid);
  assert.equal((await req("/api/session", { cookie })).status, 200);
  const st = await (await req("/api/state", { cookie })).text();
  assert.ok(!st.includes("TOKEN"));
});

test("anyone else is refused, before and after the Claim", async () => {
  mp.set({ codeUser: STRANGER_ID });            // someone who doesn't own the developer app
  let r = await signIn();
  assert.equal(r.back.headers.get("location"), "/?login_error=not_owner");
  assert.equal(r.cookie, null);
  assert.equal(await env.DB.prepare("SELECT * FROM owner").first(), null);
  mp.set({ codeUser: OWNER_ID }); await signIn(); // the owner claims
  mp.set({ codeUser: STRANGER_ID, appOwner: STRANGER_ID }); // even if the app's credentials changed hands
  r = await signIn();
  assert.equal(r.back.headers.get("location"), "/?login_error=not_owner");
  assert.equal(r.cookie, null);
});

test("a forged or stale callback is refused", async () => {
  const start = await req("/api/auth/login"), c = cookiesOf(start);
  const forged = await req("/api/auth/callback?code=codigo-bueno&state=otro", { cookie: `mf_pv=${c.mf_pv}; mf_ps=${c.mf_ps}` });
  assert.equal(forged.headers.get("location"), "/?login_error=state");
  assert.equal((await req("/api/auth/callback?error=access_denied")).headers.get("location"), "/?login_error=denied");
  assert.equal((await signIn("codigo-malo")).back.headers.get("location"), "/?login_error=mp");
  delete env.MP_CLIENT_SECRET;
  assert.equal((await req("/api/auth/login")).headers.get("location"), "/?login_error=config");
});

test("notes and recipient names: saved, read back, deleted; writes only from this site", async () => {
  const { cookie } = await signIn();
  assert.equal((await req("/api/notes", { method: "POST", cookie, body: { writes: [] }, origin: "https://otro.ejemplo" })).status, 403);
  assert.equal((await req("/api/notes", { method: "POST", body: { writes: [] } })).status, 401);
  const w = await req("/api/notes", { method: "POST", cookie, body: {
    writes: [{ id: "41:payment", note: "Café con Ana", category: null }, { id: "m:Verdulería Ejemplo", note: null, category: "Verdulería" }],
    deletes: [] } });
  assert.equal(w.status, 200);
  await req("/api/recipients", { method: "POST", cookie, body: { key: "abc", name: "  Ana  ", category: "Hogar" } });
  let st = await (await req("/api/state", { cookie })).json();
  assert.deepEqual(st.notes.map((n) => n.id).sort(), ["41:payment", "m:Verdulería Ejemplo"]);
  assert.deepEqual(st.recipients, [{ key: "abc", name: "Ana", category: "Hogar" }]);
  await req("/api/notes", { method: "POST", cookie, body: { writes: [], deletes: ["41:payment"] } });
  await req("/api/recipients", { method: "POST", cookie, body: { key: "abc", name: "" } });
  st = await (await req("/api/state", { cookie })).json();
  assert.deepEqual([st.notes.length, st.recipients.length], [1, 0]);
  assert.equal((await req("/api/notes", { method: "POST", cookie, body: { writes: [{ id: 5 }] } })).status, 400);
});

test("movements come in pages, oldest first", async () => {
  const { cookie } = await signIn();
  const ins = env.DB.raw.prepare(`INSERT INTO movements (id, payment_id, row_type, date, month, direction, amount)
    VALUES (?, ?, 'payment', ?, '2026-09', 'out', -100)`);
  for (let i = 0; i < 1001; i++) ins.run(`${i}:payment`, i, `2026-09-01T00:00:${String(i % 60).padStart(2, "0")}.${String(i).padStart(4, "0")}Z`);
  const p0 = await (await req("/api/movements?page=0", { cookie })).json();
  const p1 = await (await req("/api/movements?page=1", { cookie })).json();
  assert.deepEqual([p0.rows.length, p0.more, p1.rows.length, p1.more], [1000, true, 1, false]);
  assert.ok(p0.rows[0].date <= p0.rows[999].date);
});

test("signing out ends the session", async () => {
  const { cookie } = await signIn();
  const out = await req("/api/auth/logout", { method: "POST", cookie });
  assert.match(out.headers.get("set-cookie"), /mf_session=;.*Max-Age=0/);
  assert.equal((await req("/api/session", { cookie })).status, 401);
});

test("the Mercado Pago token is renewed before it expires, and the new refresh token is kept", async () => {
  await signIn();
  assert.equal(await readToken(env), "TOKEN-USUARIO");               // 180 days left: as is
  env.DB.raw.prepare("UPDATE mp_token SET expires_at = ?").run(new Date(Date.now() + 5 * 86400e3).toISOString());
  assert.equal(await readToken(env), "TOKEN-NUEVO");
  assert.equal(mp.calls.at(-1).refresh_token, "REFRESH-1");
  assert.equal((await env.DB.prepare("SELECT refresh_token FROM mp_token").first()).refresh_token, "REFRESH-2");
});

test("personal rules: saved, read back with the state, removed; bad ones refused", async () => {
  const { cookie } = await signIn();
  const save = (body) => req("/api/rules", { method: "POST", cookie, body });
  assert.equal((await save({ writes: [{ kind: "name", match: "Kioscoejemplo", value: "Kiosco" },
    { kind: "word", match: "heladosejemplo", value: "Regalos" }] })).status, 200);
  let st = await (await req("/api/state", { cookie })).json();
  assert.deepEqual(st.rules, [{ kind: "name", match: "Kioscoejemplo", value: "Kiosco" }, { kind: "word", match: "heladosejemplo", value: "Regalos" }]);
  await save({ deletes: [{ kind: "word", match: "heladosejemplo" }] });
  st = await (await req("/api/state", { cookie })).json();
  assert.equal(st.rules.length, 1);
  assert.equal((await save({ writes: [{ kind: "otro", match: "x", value: "y" }] })).status, 400);
  assert.equal((await save({ writes: [{ kind: "word", match: "x", value: "" }] })).status, 400);
});
