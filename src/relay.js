// Forwards the "Dinero disponible" (Releases) report calls to Mercado Pago with the user's own permission, because
// Mercado Pago refuses them from browsers. Only these calls are allowed; nothing is stored, logged or changed.
import { json } from "./http.js";

const RR = "https://api.mercadopago.com/v1/account/release_report";

/** "/config" | "/report" | "/task/<id>" | "/file/<name>.csv" -> [method allowed, Mercado Pago URL] */
function target(method, sub) {
  if (sub === "/config" && (method === "GET" || method === "POST")) return RR + "/config";
  if (sub === "/report" && method === "POST") return RR;
  let m = sub.match(/^\/task\/(\d{1,20})$/);
  if (m && method === "GET") return `${RR}/task/${m[1]}`;
  m = sub.match(/^\/file\/([\w.-]{1,200}\.csv)$/);
  if (m && method === "GET") return `${RR}/${m[1]}`;
  return null;
}

export async function relayReport(req, sub) {
  const to = target(req.method, sub);
  if (!to) return json({ ok: false, error: "No existe." }, 404);
  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer [\w.-]{10,400}$/.test(auth)) return json({ ok: false, error: "Falta el permiso." }, 401);
  let body;
  if (req.method === "POST") {
    body = await req.text();
    if (body.length > 10_000) return json({ ok: false, error: "Demasiado grande." }, 413);
  }
  const r = await fetch(to, { method: req.method, body,
    headers: { authorization: auth, ...(body ? { "content-type": "application/json" } : {}) } });
  return new Response(r.body, { status: r.status, headers: {
    "content-type": r.headers.get("content-type") ?? "application/octet-stream", "cache-control": "no-store" } });
}
