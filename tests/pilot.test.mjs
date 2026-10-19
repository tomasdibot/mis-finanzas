// npm test   (PILOT, temporary; Mercado Pago simulated, invented data only)
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeD1 } from "./fake-d1.mjs";
import worker from "../src/worker.js";

const ORIGIN = "https://x.ejemplo.workers.dev", OWNER = 1001, FRIEND = 3003;

test("the pilot reports yes/no and counts for another account and stores nothing", async () => {
  const env = { DB: fakeD1(), MP_CLIENT_ID: "123", MP_CLIENT_SECRET: "secreto", ASSETS: { fetch: async () => new Response("app") } };
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)), ok = (j) => new Response(JSON.stringify(j));
    if (u.pathname === "/oauth/token") {
      const b = JSON.parse(init.body);
      return b.grant_type === "client_credentials" ? ok({ access_token: "APP", user_id: OWNER })
        : ok({ access_token: "TOKEN-AMIGO", refresh_token: "R", scope: "offline_access read write", expires_in: 15552000, user_id: FRIEND });
    }
    if (u.pathname === "/users/me") return ok({ id: FRIEND, site_id: "MLA", tags: ["normal"] });
    if (u.pathname === "/v1/payments/search") return ok({ paging: { total: 3 }, results: [{ collector_id: 999 }, { collector_id: 999 }, { collector_id: FRIEND }] });
    if (u.pathname === "/v1/account/release_report/list") return ok([]);
    throw new Error("unexpected " + u);
  };
  try {
    const start = await worker.fetch(new Request(ORIGIN + "/api/pilot/start"), env);
    const ck = Object.fromEntries(start.headers.getSetCookie().map((c) => c.split(";")[0].split("=")));
    assert.equal(ck.mf_pilot, "1");
    const state = new URL(start.headers.get("location")).searchParams.get("state");
    const res = await worker.fetch(new Request(`${ORIGIN}/api/auth/callback?code=c&state=${state}`,
      { headers: { cookie: `mf_pv=${ck.mf_pv}; mf_ps=${ck.mf_ps}; mf_pilot=1` } }), env);
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.match(html, /dejó conectar esta cuenta\? <b>SÍ/);
    assert.match(html, /distinta de la dueña de la app\? <b>SÍ/);
    assert.match(html, /<b>2<\/b> pagos hechos por esta cuenta/);
    assert.match(html, /Dinero disponible"\? <b>SÍ/);
    for (const secret of ["TOKEN-AMIGO", String(FRIEND), "secreto"]) assert.ok(!html.includes(secret), secret);
    assert.ok(!res.headers.getSetCookie().some((c) => c.startsWith("mf_session=") && !c.includes("Max-Age=0")));
    for (const t of ["owner", "sessions", "mp_token"]) assert.equal(env.DB.raw.prepare(`SELECT count(*) n FROM ${t}`).get().n, 0, t);
  } finally { globalThis.fetch = real; }
});
