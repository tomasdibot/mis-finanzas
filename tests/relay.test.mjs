// npm test   (Mercado Pago simulated; the Relay must store nothing and forward only the report calls)
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const ORIGIN = "https://mis-finanzas.ejemplo.workers.dev";
let env, calls, real;
beforeEach(() => {
  env = { MP_CLIENT_ID: "123", MP_CLIENT_SECRET: "secreto-de-prueba", ASSETS: { fetch: async () => new Response("app") } };
  calls = []; real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)); calls.push({ url: u.href, method: init.method ?? "GET", init });
    if (u.pathname === "/oauth/token") {
      const b = JSON.parse(init.body);
      if (b.grant_type === "authorization_code") return b.code === "bueno"
        ? new Response(JSON.stringify({ access_token: "TOKEN-USUARIO", refresh_token: "R1", expires_in: 15552000, user_id: 3003, scope: "x" }))
        : new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      if (b.grant_type === "refresh_token") return b.refresh_token === "R1"
        ? new Response(JSON.stringify({ access_token: "TOKEN-NUEVO", refresh_token: "R2", expires_in: 15552000, user_id: 3003 }))
        : new Response("{}", { status: 400 });
    }
    if (u.pathname.startsWith("/v1/account/release_report")) return new Response(u.pathname.endsWith(".csv") ? "DATE,X\n" : '{"ok":1}', { status: 200 });
    throw new Error("unexpected " + u);
  };
});
afterEach(() => { globalThis.fetch = real; });
const req = (path, { method = "GET", headers = {}, body } = {}) =>
  worker.fetch(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
const cookies = (res) => Object.fromEntries(res.headers.getSetCookie().map((c) => { const [kv] = c.split(";"); const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; }));

test("any Mercado Pago account signs in: the permission goes to that browser only, in a page that is never cached", async () => {
  const start = await req("/api/auth/login");
  const to = new URL(start.headers.get("location")), ck = cookies(start);
  assert.equal(to.searchParams.get("redirect_uri"), `${ORIGIN}/api/auth/callback`);
  assert.equal(to.searchParams.get("code_challenge_method"), "S256");
  const back = await req(`/api/auth/callback?code=bueno&state=${to.searchParams.get("state")}`, { headers: { cookie: `mf_pv=${ck.mf_pv}; mf_ps=${ck.mf_ps}` } });
  assert.equal(back.status, 200);
  assert.equal(back.headers.get("cache-control"), "no-store");
  const html = await back.text();
  const data = JSON.parse(html.match(/<script type="application\/json" id="permission">(.*)<\/script>/)[1]);
  assert.deepEqual(data, { access_token: "TOKEN-USUARIO", refresh_token: "R1", expires_in: 15552000, user_id: "3003" });
  assert.match(html, /import \{ finishSignIn \} from "\/lib\/session.js"/);
  assert.ok(!html.includes("secreto-de-prueba"));
  assert.equal(calls.find((c) => c.url.endsWith("/oauth/token")).init.body.includes("code_verifier"), true);
});

test("a forged or failed sign-in goes back with a reason", async () => {
  const start = await req("/api/auth/login"), ck = cookies(start);
  assert.equal((await req("/api/auth/callback?code=bueno&state=otro", { headers: { cookie: `mf_ps=${ck.mf_ps}` } })).headers.get("location"), "/?login_error=state");
  assert.equal((await req("/api/auth/callback?error=access_denied")).headers.get("location"), "/?login_error=denied");
  const s2 = await req("/api/auth/login"), c2 = cookies(s2), st = new URL(s2.headers.get("location")).searchParams.get("state");
  assert.equal((await req(`/api/auth/callback?code=malo&state=${st}`, { headers: { cookie: `mf_pv=${c2.mf_pv}; mf_ps=${c2.mf_ps}` } })).headers.get("location"), "/?login_error=mp");
  delete env.MP_CLIENT_SECRET;
  assert.equal((await req("/api/auth/login")).headers.get("location"), "/?login_error=config");
});

test("renewing a permission", async () => {
  const ok = await req("/api/auth/refresh", { method: "POST", headers: { origin: ORIGIN }, body: { refresh_token: "R1" } });
  assert.deepEqual(await ok.json(), { ok: true, access_token: "TOKEN-NUEVO", refresh_token: "R2", expires_in: 15552000, user_id: "3003" });
  assert.equal((await req("/api/auth/refresh", { method: "POST", headers: { origin: ORIGIN }, body: { refresh_token: "otro" } })).status, 401);
  assert.equal((await req("/api/auth/refresh", { method: "POST", headers: { origin: "https://otro.sitio" }, body: { refresh_token: "R1" } })).status, 403);
});

test("only the balance-report calls are forwarded, with the user's own permission", async () => {
  const auth = { authorization: "Bearer APP_USR-123-abc" };
  for (const [method, path, mp] of [["GET", "/api/mp/config", "/config"], ["POST", "/api/mp/config", "/config"], ["POST", "/api/mp/report", ""],
    ["GET", "/api/mp/task/42", "/task/42"], ["GET", "/api/mp/file/mis-finanzas-1.csv", "/mis-finanzas-1.csv"]]) {
    calls = [];
    const r = await req(path, { method, headers: auth, body: method === "POST" ? { a: 1 } : undefined });
    assert.equal(r.status, 200, path);
    assert.equal(calls[0].url, `https://api.mercadopago.com/v1/account/release_report${mp}`);
    assert.equal(calls[0].init.headers.authorization, auth.authorization);
  }
  calls = [];
  for (const [method, path] of [["GET", "/api/mp/../payments/search"], ["DELETE", "/api/mp/config"], ["GET", "/api/mp/file/x.exe"], ["POST", "/api/mp/task/1"]]) {
    assert.notEqual((await req(path, { method, headers: auth })).status, 200, path);
  }
  assert.equal((await req("/api/mp/config")).status, 401, "needs the user's permission");
  assert.equal((await req("/api/mp/config", { headers: { ...auth, "sec-fetch-site": "cross-site" } })).status, 403, "not from other sites");
  assert.equal(calls.length, 0);
});

test("the app itself and the version", async () => {
  assert.equal(await (await req("/")).text(), "app");
  const h = await (await req("/api/health")).json();
  assert.deepEqual([h.ok, h.signIn, typeof h.version], [true, true, "string"]);
});
