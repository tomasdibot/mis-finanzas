// The Owner's copy of their data (Ajustes → Tus datos): export, import, delete everything.
// A backup never includes the Mercado Pago token, sessions or who claimed the Deployment.
// The app builds the backup file itself (meta below + the movement pages of /api/movements) and imports it in
// chunks, so every request stays small for the free plan's CPU limit.
import { json, setCookie } from "./http.js";

export const FORMAT = "mis-finanzas", VERSION = 1, IMPORT_CHUNK = 300;

// what a backup may hold, table by table, and the columns of each (anything else is ignored)
export const TABLES = {
  movements: { key: ["id"], cols: ["id", "payment_id", "row_type", "date", "month", "direction", "operation_type", "status",
    "payment_type", "payment_method", "channel", "business_unit", "branch", "item_category", "description",
    "statement_descriptor", "item_titles", "merchant_site", "counterparty", "holder_name", "group_id", "recipient_key", "mcc",
    "amount", "synced_at"], required: ["id", "payment_id", "row_type", "date", "month", "direction", "amount"] },
  balances: { key: ["as_of"], cols: ["as_of", "available", "fetched_at"], required: ["as_of", "available"] },
  recipients: { key: ["key"], cols: ["key", "name", "category", "updated_at"], required: ["key", "name"] },
  notes: { key: ["id"], cols: ["id", "note", "category", "updated_at"], required: ["id"] },
  personal_rules: { key: ["kind", "match"], cols: ["kind", "match", "value", "updated_at"], required: ["kind", "match", "value"] },
  ml_categories: { key: ["id"], cols: ["id", "path"], required: ["id", "path"] },
};

/** GET /api/export/meta: everything but the movements (those come page by page). */
export async function exportMeta(env) {
  const names = Object.keys(TABLES).filter((t) => t !== "movements");
  const res = await env.DB.batch([
    ...names.map((t) => env.DB.prepare(`SELECT ${TABLES[t].cols.join(", ")} FROM ${t}`)),
    env.DB.prepare("SELECT value FROM app_settings WHERE key = 'recipient_salt'"),
  ]);
  const out = { format: FORMAT, version: VERSION };
  names.forEach((t, i) => { out[t] = res[i].results; });
  // the key that turns account ids into recipient keys: needed so recipient names still match after a restore
  out.settings = { recipient_salt: res.at(-1).results[0]?.value ?? null };
  return json(out);
}

const bad = (error) => json({ ok: false, error }, 400);

/** POST /api/import { table, rows } or { settings: { recipient_salt } }: adds/replaces by key, never deletes. */
export async function importChunk(env, body) {
  if (body?.settings) {
    const salt = body.settings.recipient_salt;
    if (typeof salt !== "string" || !/^[0-9a-f]{16,128}$/.test(salt)) return bad("Copia inválida (clave de destinatarios).");
    // movements synced with another key are downloaded again (13 months), so every recipient key matches the copy
    await env.DB.batch([
      env.DB.prepare("INSERT INTO app_settings (key, value) VALUES ('recipient_salt', ?1) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(salt),
      env.DB.prepare("DELETE FROM app_settings WHERE key IN ('backfill_done', 'sync_plan')"),
    ]);
    return json({ ok: true, rows: 0 });
  }
  const spec = TABLES[body?.table];
  if (!spec) return bad("Copia inválida (tabla desconocida).");
  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows || rows.length > IMPORT_CHUNK) return bad("Copia inválida (bloque).");
  if (!rows.every((r) => r && typeof r === "object" && spec.required.every((c) => r[c] != null && r[c] !== ""))) return bad("Copia inválida (faltan datos).");
  if (body.table === "personal_rules" && !rows.every((r) => ["name", "word", "word_in"].includes(r.kind))) return bad("Copia inválida (regla).");
  const cols = spec.cols, upd = cols.filter((c) => !spec.key.includes(c));
  const sql = `INSERT INTO ${body.table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(", ")})
    ON CONFLICT (${spec.key.join(", ")}) DO UPDATE SET ${upd.map((c) => `${c} = excluded.${c}`).join(", ")}`;
  const now = new Date().toISOString();
  const value = (r, c) => {
    const v = r[c];
    if (v == null) return c.endsWith("_at") ? now : null;  // timestamps default to now
    return typeof v === "object" ? JSON.stringify(v) : v;
  };
  if (rows.length) await env.DB.batch(rows.map((r) => env.DB.prepare(sql).bind(...cols.map((c) => value(r, c)))));
  return json({ ok: true, rows: rows.length });
}

const EVERYTHING = ["movements", "balances", "report_tasks", "recipients", "notes", "personal_rules", "ml_categories",
  "sync_log", "app_settings", "mp_token", "sessions", "owner"];

/** POST /api/delete-all { confirm: "BORRAR" }: erases every row, the token and the Claim (back to a new Deployment). */
export async function deleteAll(env, body) {
  if (body?.confirm !== "BORRAR") return bad("Falta confirmar escribiendo BORRAR.");
  await env.DB.batch(EVERYTHING.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
  return json({ ok: true }, 200, { "set-cookie": setCookie("mf_session", "", { maxAge: 0 }) });
}
