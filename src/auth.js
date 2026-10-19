// Sign-in with Mercado Pago (ADR 0002): OAuth authorization code + PKCE through the Owner's own Mercado Pago
// developer app (secrets MP_CLIENT_ID / MP_CLIENT_SECRET). Only the Mercado Pago account that owns that app is
// accepted; its first sign-in is the Claim. The same flow stores the token used to read movements.
import { redirect, getCookie, setCookie, randomString, sha256Hex, sha256B64url, nowIso } from "./http.js";

const MP_AUTH = "https://auth.mercadopago.com/authorization";
const MP_TOKEN = "https://api.mercadopago.com/oauth/token";
const SESSION_COOKIE = "mf_session";
const SESSION_DAYS = 180;
const DAY = 86400e3;
const AUTH_PATH = "/api/auth";

const callbackUrl = (url) => `${url.origin}${AUTH_PATH}/callback`;
const fail = (code) => redirect(`/?login_error=${code}`, [
  setCookie("mf_pv", "", { path: AUTH_PATH, maxAge: 0 }), setCookie("mf_ps", "", { path: AUTH_PATH, maxAge: 0 })]);

async function mpToken(body) {
  const r = await fetch(MP_TOKEN, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body),
  });
  return { ok: r.ok, json: await r.json().catch(() => ({})) };
}

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

/** GET /api/auth/callback: Mercado Pago comes back here with a code; only the app's owner gets a session. */
export async function callback(req, env) {
  const url = new URL(req.url), code = url.searchParams.get("code");
  if (!code) return fail("denied");
  const state = getCookie(req, "mf_ps");
  if (!state || url.searchParams.get("state") !== state) return fail("state");
  if (!env.MP_CLIENT_ID || !env.MP_CLIENT_SECRET) return fail("config");
  const base = { client_id: env.MP_CLIENT_ID, client_secret: env.MP_CLIENT_SECRET };
  const user = await mpToken({ ...base, grant_type: "authorization_code", code, redirect_uri: callbackUrl(url),
    code_verifier: getCookie(req, "mf_pv") });
  if (!user.ok || !user.json.access_token || user.json.user_id == null) return fail("mp");
  // who owns the developer app: its own client-credentials token says
  const app = await mpToken({ ...base, grant_type: "client_credentials" });
  if (!app.ok || app.json.user_id == null) return fail("mp");
  const who = String(user.json.user_id);
  if (who !== String(app.json.user_id)) return fail("not_owner");
  // Claim: the first accepted account owns this Deployment for good
  await env.DB.prepare("INSERT INTO owner (id, mp_user_id) VALUES (1, ?1) ON CONFLICT (id) DO NOTHING").bind(who).run();
  const owner = await env.DB.prepare("SELECT mp_user_id FROM owner WHERE id = 1").first();
  if (owner?.mp_user_id !== who) return fail("not_owner");

  await saveToken(env, user.json);
  const sid = randomString(32), expires = Date.now() + SESSION_DAYS * DAY;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?1").bind(nowIso()),
    env.DB.prepare("INSERT INTO sessions (id_hash, expires_at) VALUES (?1, ?2)").bind(await sha256Hex(sid), nowIso(expires)),
  ]);
  return redirect("/", [setCookie(SESSION_COOKIE, sid, { maxAge: SESSION_DAYS * 86400 }),
    setCookie("mf_pv", "", { path: AUTH_PATH, maxAge: 0 }), setCookie("mf_ps", "", { path: AUTH_PATH, maxAge: 0 })]);
}

export async function saveToken(env, t) {
  const expires = nowIso(Date.now() + (Number(t.expires_in) || 180 * 86400) * 1000);
  await env.DB.prepare(`INSERT INTO mp_token (id, access_token, refresh_token, expires_at, updated_at) VALUES (1, ?1, ?2, ?3, ?4)
    ON CONFLICT (id) DO UPDATE SET access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, mp_token.refresh_token), expires_at = excluded.expires_at,
      updated_at = excluded.updated_at`).bind(t.access_token, t.refresh_token ?? null, expires, nowIso()).run();
}

/** The token to read movements with, renewed when it has less than `renewDays` left. null = sign in again. */
export async function readToken(env, renewDays = 30) {
  const t = await env.DB.prepare("SELECT access_token, refresh_token, expires_at FROM mp_token WHERE id = 1").first();
  if (!t) return null;
  if (t.expires_at > nowIso(Date.now() + renewDays * DAY)) return t.access_token;
  if (t.refresh_token && env.MP_CLIENT_ID && env.MP_CLIENT_SECRET) {
    const r = await mpToken({ client_id: env.MP_CLIENT_ID, client_secret: env.MP_CLIENT_SECRET,
      grant_type: "refresh_token", refresh_token: t.refresh_token });
    if (r.ok && r.json.access_token) { await saveToken(env, r.json); return r.json.access_token; }
  }
  return t.expires_at > nowIso() ? t.access_token : null;
}

/** true when the request carries a live session cookie. */
export async function signedIn(req, env) {
  const sid = getCookie(req, SESSION_COOKIE);
  if (!sid) return false;
  const row = await env.DB.prepare("SELECT 1 AS ok FROM sessions WHERE id_hash = ?1 AND expires_at > ?2")
    .bind(await sha256Hex(sid), nowIso()).first();
  return !!row;
}

/** POST /api/auth/logout: forget this browser's session. */
export async function logout(req, env) {
  const sid = getCookie(req, SESSION_COOKIE);
  if (sid) await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?1").bind(await sha256Hex(sid)).run();
  return new Response(JSON.stringify({ ok: true }), { headers: {
    "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "set-cookie": setCookie(SESSION_COOKIE, "", { maxAge: 0 }) } });
}
