// Sign-in with Mercado Pago through the app's own Mercado Pago developer app (OAuth code + PKCE; secrets
// MP_CLIENT_ID / MP_CLIENT_SECRET). The Relay only swaps the code for a permission and hands it to the browser that
// asked; nothing is stored or logged here (ADR 0003). Any Mercado Pago account may sign in.
import { redirect, getCookie, setCookie, randomString, sha256B64url } from "./http.js";

const MP_AUTH = "https://auth.mercadopago.com/authorization";
const MP_TOKEN = "https://api.mercadopago.com/oauth/token";
const AUTH_PATH = "/api/auth";

const callbackUrl = (url) => `${url.origin}${AUTH_PATH}/callback`;
const clearPkce = [setCookie("mf_pv", "", { path: AUTH_PATH, maxAge: 0 }), setCookie("mf_ps", "", { path: AUTH_PATH, maxAge: 0 })];
const fail = (code) => redirect(`/?login_error=${code}`, clearPkce);

async function mpToken(body) {
  const r = await fetch(MP_TOKEN, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body),
  });
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
}

/** Only what the browser needs from Mercado Pago's answer. */
const permission = (t) => ({ access_token: t.access_token, refresh_token: t.refresh_token ?? null,
  expires_in: Number(t.expires_in) || 180 * 86400, user_id: String(t.user_id) });

/** GET /api/auth/login: send the browser to Mercado Pago's authorization page. */
export async function login(req, env) {
  if (!env.MP_CLIENT_ID || !env.MP_CLIENT_SECRET) return fail("config");
  const url = new URL(req.url), verifier = randomString(48), state = randomString(16);
  const auth = new URL(MP_AUTH);
  Object.entries({ client_id: env.MP_CLIENT_ID, response_type: "code", platform_id: "mp", state,
    redirect_uri: callbackUrl(url), code_challenge: await sha256B64url(verifier), code_challenge_method: "S256" })
    .forEach(([k, v]) => auth.searchParams.set(k, v));
  return redirect(auth.toString(), [
    setCookie("mf_pv", verifier, { path: AUTH_PATH, maxAge: 600 }), setCookie("mf_ps", state, { path: AUTH_PATH, maxAge: 600 })]);
}

/**
 * GET /api/auth/callback: swap the code for the permission and hand it to this browser in a page that stores it in
 * the user's Profile (web/lib/session.js) and goes to the app. The page is never cached.
 */
export async function callback(req, env) {
  const url = new URL(req.url), code = url.searchParams.get("code");
  if (!code) return fail("denied");
  const state = getCookie(req, "mf_ps");
  if (!state || url.searchParams.get("state") !== state) return fail("state");
  if (!env.MP_CLIENT_ID || !env.MP_CLIENT_SECRET) return fail("config");
  const user = await mpToken({ client_id: env.MP_CLIENT_ID, client_secret: env.MP_CLIENT_SECRET,
    grant_type: "authorization_code", code, redirect_uri: callbackUrl(url), code_verifier: getCookie(req, "mf_pv") });
  if (!user.ok || !user.json.access_token || user.json.user_id == null) return fail("mp");
  // JSON inside <script type="application/json">: "<" escaped so nothing in it can end the script element
  const data = JSON.stringify(permission(user.json)).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="referrer" content="no-referrer"><title>Entrando…</title>
<body style="font:16px system-ui;display:grid;place-content:center;min-height:90vh;color:#666">Entrando…
<script type="application/json" id="permission">${data}</script>
<script type="module">
import { finishSignIn } from "/lib/session.js";
const el = document.getElementById("permission");
finishSignIn(JSON.parse(el.textContent)).then(() => { el.remove(); location.replace("/"); },
  () => location.replace("/?login_error=device"));
</script></body></html>`;
  const headers = new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
    "referrer-policy": "no-referrer" });
  clearPkce.forEach((c) => headers.append("set-cookie", c));
  return new Response(html, { headers });
}

/** POST /api/auth/refresh { refresh_token }: a renewed permission (Mercado Pago also renews the refresh token). */
export async function refresh(env, body) {
  const rt = body?.refresh_token;
  if (typeof rt !== "string" || !rt || rt.length > 500) return Response.json({ ok: false, error: "Falta el permiso." }, { status: 400 });
  const r = await mpToken({ client_id: env.MP_CLIENT_ID, client_secret: env.MP_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: rt });
  if (!r.ok || !r.json.access_token) return Response.json({ ok: false, error: "Mercado Pago no renovó el permiso: volvé a entrar." }, { status: 401 });
  return Response.json({ ok: true, ...permission(r.json) }, { headers: { "cache-control": "no-store" } });
}
