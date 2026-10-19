// mis-finanzas: serves the app (web/, static assets) and, under /api/*, the Relay (ADR 0003). The Relay stores and
// logs nothing: it swaps the sign-in code for a permission, renews it, and forwards the "Dinero disponible" report
// calls that Mercado Pago does not accept from browsers. Movements are read by the browser itself.
import { json } from "./http.js";
import { login, callback, refresh } from "./auth.js";
import { relayReport } from "./relay.js";
import pkg from "../package.json" with { type: "json" };

/** Requests from other websites are refused (the browser says where a request comes from). */
function foreign(req, url) {
  const origin = req.headers.get("origin"), site = req.headers.get("sec-fetch-site");
  return (origin && origin !== url.origin) || (site && !["same-origin", "none"].includes(site));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (path === "/api/health") return json({ ok: true, version: pkg.version, signIn: !!(env.MP_CLIENT_ID && env.MP_CLIENT_SECRET) });
    // sign-in is a navigation that comes back from Mercado Pago: no origin check there
    if (req.method === "GET" && path === "/api/auth/login") return login(req, env);
    if (req.method === "GET" && path === "/api/auth/callback") return callback(req, env);
    if (foreign(req, url)) return json({ ok: false, error: "Origen no permitido." }, 403);
    if (req.method === "POST" && path === "/api/auth/refresh") return refresh(env, await req.json().catch(() => null));
    if (path.startsWith("/api/mp/")) return relayReport(req, path.slice("/api/mp".length));
    return json({ ok: false, error: "No existe." }, 404);
  },
};
