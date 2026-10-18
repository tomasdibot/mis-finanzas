// mis-finanzas Worker: serves the app (web/, static assets) and, under /api/*, the Owner's data.
// Phase 1 (skeleton): only /api/health exists. Sign-in (Mercado Pago OAuth + Claim + sessions, ADR 0002) comes
// in phase 2; until then no data is ever served.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/health") {
      // tells the app the backend and the database are reachable; never returns any data
      const row = await env.DB.prepare("SELECT count(*) AS n FROM d1_migrations").first().catch(() => null);
      return json({ ok: true, db: row ? "ok" : "sin migraciones", signIn: false });
    }
    if (url.pathname.startsWith("/api/")) return json({ ok: false, error: "no disponible todavía" }, 404);
    return env.ASSETS.fetch(req);
  },
};
