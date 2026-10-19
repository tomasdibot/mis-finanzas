// PILOT, temporary (remove after the local-first decision). Answers, with ANOTHER person's Mercado Pago account:
//  1. Can an account that doesn't own the developer app authorize it?
//  2. With that token, do their purchases (payments where they are the payer) show up in /v1/payments/search?
//  3. Can that token reach the "Dinero disponible" report endpoints?
// Reuses the registered /api/auth/callback (a cookie marks the sign-in as a pilot). Never claims the Deployment,
// never creates a session, never stores or shows the token, ids, names or amounts: only yes/no, HTTP statuses, counts.
import { redirect, getCookie, setCookie, randomString, sha256B64url } from "./http.js";

const PILOT = "mf_pilot", AUTH_PATH = "/api/auth";
const esc = (s) => String(s).replace(/[<>&"]/g, "");

export const isPilot = (req) => getCookie(req, PILOT) === "1";

const page = (body, status = 200) => new Response(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Prueba</title>
<body style="font:17px system-ui;max-width:34rem;margin:2rem auto;padding:0 1rem;line-height:1.5">
<p style="color:#b33">Prueba de un minuto: no se guarda nada (ni tu permiso ni tus datos).</p>${body}</body>`,
  { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "set-cookie": setCookie(PILOT, "", { path: AUTH_PATH, maxAge: 0 }) } });

/** GET /api/pilot: explanation + button. */
export function pilotHome() {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prueba</title><body style="font:17px system-ui;max-width:34rem;margin:2rem auto;padding:0 1rem;line-height:1.5">
<h1>Prueba de un minuto</h1>
<p>Sirve para saber si la app puede funcionar con <b>tu</b> cuenta de Mercado Pago. No se guarda nada: ni tu permiso
ni tus movimientos. Al final solo vas a ver respuestas de sí/no y cantidades.</p>
<p>Mirá bien qué dice la pantalla de Mercado Pago antes de aceptar (qué nombre de app y de persona muestra).</p>
<p><a href="/api/pilot/start" style="display:inline-block;background:#e0573a;color:#fff;padding:12px 18px;border-radius:9px;text-decoration:none;font-weight:700">Probar con mi cuenta de Mercado Pago</a></p>
</body>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/** GET /api/pilot/start: like login, plus the pilot cookie. */
export async function pilotStart(req, env) {
  if (!env.MP_CLIENT_ID || !env.MP_CLIENT_SECRET) return page("<p>Faltan las credenciales de la app.</p>", 500);
  const url = new URL(req.url), verifier = randomString(48), state = randomString(16);
  const auth = new URL("https://auth.mercadopago.com/authorization");
  Object.entries({ client_id: env.MP_CLIENT_ID, response_type: "code", platform_id: "mp", state,
    redirect_uri: `${url.origin}${AUTH_PATH}/callback`, code_challenge: await sha256B64url(verifier), code_challenge_method: "S256" })
    .forEach(([k, v]) => auth.searchParams.set(k, v));
  const c = { path: AUTH_PATH, maxAge: 600 };
  return redirect(auth.toString(), [setCookie("mf_pv", verifier, c), setCookie("mf_ps", state, c), setCookie(PILOT, "1", c)]);
}

const mpToken = async (body) => {
  const r = await fetch("https://api.mercadopago.com/oauth/token", { method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

/** The callback, when the pilot cookie is set. */
export async function pilotCallback(req, env) {
  const url = new URL(req.url), code = url.searchParams.get("code");
  if (!code) return page(`<h1>No se completó</h1><p>Mercado Pago volvió sin permiso${url.searchParams.get("error") ? ` (${esc(url.searchParams.get("error"))})` : ""}.</p>`, 400);
  if (url.searchParams.get("state") !== getCookie(req, "mf_ps")) return page("<p>La prueba tardó demasiado: empezá de nuevo.</p>", 400);
  const base = { client_id: env.MP_CLIENT_ID, client_secret: env.MP_CLIENT_SECRET };
  const user = await mpToken({ ...base, grant_type: "authorization_code", code, redirect_uri: `${url.origin}${AUTH_PATH}/callback`,
    code_verifier: getCookie(req, "mf_pv") });
  const out = [];
  const yes = (b) => (b ? "SÍ" : "NO");
  out.push(`1. ¿Mercado Pago dejó conectar esta cuenta? <b>${yes(user.status === 200 && user.json.access_token)}</b> (HTTP ${user.status}${user.json.error ? `, ${esc(user.json.error)}` : ""})`);
  if (user.json.access_token) {
    const app = await mpToken({ ...base, grant_type: "client_credentials" });
    const me = String(user.json.user_id ?? "");
    out.push(`2. ¿Es una cuenta distinta de la dueña de la app? <b>${yes(app.json.user_id != null && me !== String(app.json.user_id))}</b>`);
    out.push(`3. Permiso: renovable <b>${yes(!!user.json.refresh_token)}</b> · alcance: ${esc(user.json.scope ?? "?")} · vence en ${Math.round((user.json.expires_in ?? 0) / 86400)} días`);
    const auth = { authorization: `Bearer ${user.json.access_token}` };
    const who = await fetch("https://api.mercadopago.com/users/me", { headers: auth });
    const info = who.ok ? await who.json() : {};
    out.push(`4. Cuenta: de prueba <b>${yes((info.tags ?? []).includes("test_user"))}</b> · país ${esc(info.site_id ?? "?")} (HTTP ${who.status})`);
    let total = 0, asPayer = 0, asCollector = 0, status = 0;
    const r = await fetch("https://api.mercadopago.com/v1/payments/search?limit=100&sort=date_created&criteria=desc&range=date_created&begin_date=NOW-90DAYS&end_date=NOW", { headers: auth });
    status = r.status;
    if (r.ok) {
      const body = await r.json();
      total = body.paging?.total ?? 0;
      for (const p of body.results ?? []) { if (String(p.collector_id ?? p.collector?.id ?? "") === me) asCollector++; else asPayer++; }
    }
    out.push(`5. Movimientos de los últimos 90 días que ve la app: <b>${total}</b> (HTTP ${status})`);
    out.push(`6. De los últimos ${Math.min(total, 100)}: <b>${asPayer}</b> pagos hechos por esta cuenta (compras, transferencias) y <b>${asCollector}</b> cobrados/recibidos`);
    const rep = await fetch("https://api.mercadopago.com/v1/account/release_report/list", { headers: auth });
    out.push(`7. ¿Puede leer los reportes de "Dinero disponible"? <b>${yes(rep.ok)}</b> (HTTP ${rep.status})`);
    // the token is dropped here: never stored, never shown
  }
  return page(`<h1>Resultado</h1><ul>${out.map((l) => `<li>${l}</li>`).join("")}</ul>
    <p>Sacale una captura a esta pantalla y mandásela a Tomás. Ya podés cerrar esta página.</p>
    <p style="color:#666">Si querés quitarle el permiso a la app: en la configuración de seguridad de tu cuenta de Mercado Pago, en la lista de aplicaciones conectadas.</p>`);
}
