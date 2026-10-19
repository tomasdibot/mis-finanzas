// mis-finanzas Worker: serves the app (web/, static assets) and, under /api/*, the Owner's data.
// Everything under /api/ except health and sign-in needs the Owner's session (src/auth.js).
import { json } from "./http.js";
import { login, callback, logout, signedIn } from "./auth.js";
import { state, movements, syncLog, saveNotes, saveRecipient, saveRules } from "./data.js";
import { cronStep, manualStep, collectReports } from "./sync.js";
import { exportMeta, importChunk, deleteAll } from "./backup.js";

const GET = {
  "/api/state": (req, env) => state(env),
  "/api/movements": (req, env, url) => movements(env, url),
  "/api/sync-log": (req, env) => syncLog(env),
  "/api/session": () => json({ ok: true }),
  "/api/export/meta": (req, env) => exportMeta(env),
};
const POST = {
  "/api/notes": (req, env, url, body) => saveNotes(env, body),
  "/api/recipients": (req, env, url, body) => saveRecipient(env, body),
  "/api/rules": (req, env, url, body) => saveRules(env, body),
  "/api/import": (req, env, url, body) => importChunk(env, body),
  "/api/delete-all": (req, env, url, body) => deleteAll(env, body),
  // one step of the sync; the app repeats it until done (each request gets its own CPU allowance)
  "/api/sync": async (req, env) => { const r = await manualStep(env); return json(r, r.ok ? 200 : 502); },
  "/api/sync/reports": async (req, env) => json(await collectReports(env)),
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (path === "/api/health") {
      // tells the app the backend and the database are reachable; never returns any data
      const row = await env.DB.prepare("SELECT count(*) AS n FROM d1_migrations").first().catch(() => null);
      return json({ ok: true, db: row ? "ok" : "sin migraciones", signIn: !!(env.MP_CLIENT_ID && env.MP_CLIENT_SECRET) });
    }
    if (req.method === "GET" && path === "/api/auth/login") return login(req, env);
    if (req.method === "GET" && path === "/api/auth/callback") return callback(req, env);

    // writes only from this site's own pages (the session cookie is SameSite=Lax; this also checks the origin)
    if (req.method !== "GET" && req.headers.get("origin") !== url.origin) return json({ ok: false, error: "Origen no permitido." }, 403);
    if (req.method === "POST" && path === "/api/auth/logout") return logout(req, env);
    if (!(await signedIn(req, env))) return json({ ok: false, error: "Tenés que entrar de nuevo." }, 401);

    const route = req.method === "GET" ? GET[path] : req.method === "POST" ? POST[path] : null;
    if (!route) return json({ ok: false, error: "No existe." }, 404);
    let body = null;
    if (req.method === "POST") {
      if (Number(req.headers.get("content-length") ?? 0) > 1_000_000) return json({ ok: false, error: "Demasiado grande." }, 413);
      body = await req.json().catch(() => null);
    }
    return route(req, env, url, body);
  },

  // Cron (wrangler.toml [triggers]): one step every 30 minutes
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cronStep(env).then((r) => { if (!r.ok) console.log(`sync: ${r.error}`); }));
  },
};
