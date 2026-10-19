// The Owner's data, for the signed-in app only. Raw facts out; the Owner's own notes and recipient names in.
import { json, nowIso } from "./http.js";

export const PAGE = 1000; // movements per page (keeps each request well inside the free plan's CPU limit)

/** GET /api/state: latest balance, recipient names, notes, personal rules. */
export async function state(env) {
  const [bal, rec, nts, pr] = await env.DB.batch([
    env.DB.prepare("SELECT available, as_of, fetched_at FROM balances ORDER BY as_of DESC LIMIT 1"),
    env.DB.prepare("SELECT key, name, category FROM recipients"),
    env.DB.prepare("SELECT id, note, category FROM notes"),
    env.DB.prepare("SELECT kind, match, value FROM personal_rules ORDER BY kind, match"),
  ]);
  return json({ balance: bal.results[0] ?? null, recipients: rec.results, notes: nts.results, rules: pr.results });
}

/** GET /api/movements?page=N: raw movements, oldest first, PAGE at a time. */
export async function movements(env, url) {
  const page = Math.max(0, Math.floor(Number(url.searchParams.get("page")) || 0));
  const { results } = await env.DB.prepare("SELECT * FROM movements ORDER BY date, id LIMIT ?1 OFFSET ?2")
    .bind(PAGE, page * PAGE).all();
  return json({ rows: results, more: results.length === PAGE });
}

/** GET /api/sync-log: the last runs, newest first. */
export async function syncLog(env) {
  const { results } = await env.DB.prepare("SELECT * FROM sync_log ORDER BY id DESC LIMIT 5").all();
  return json({ runs: results.map((r) => ({ ...r, ok: r.ok == null ? null : !!r.ok })) });
}

const text = (v, max) => (v == null || v === "" ? null : String(v).slice(0, max));
const bad = (error) => json({ ok: false, error }, 400);

/** POST /api/notes { writes: [{ id, note, category }], deletes: [id] } */
export async function saveNotes(env, body) {
  const writes = Array.isArray(body?.writes) ? body.writes : [], deletes = Array.isArray(body?.deletes) ? body.deletes : [];
  if (writes.length + deletes.length > 500) return bad("Demasiados cambios juntos.");
  if ([...writes.map((w) => w?.id), ...deletes].some((id) => typeof id !== "string" || !id || id.length > 300)) return bad("Nota inválida.");
  const stamp = nowIso();
  const stmts = [
    ...writes.map((w) => env.DB.prepare(`INSERT INTO notes (id, note, category, updated_at) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (id) DO UPDATE SET note = excluded.note, category = excluded.category, updated_at = excluded.updated_at`)
      .bind(w.id, text(w.note, 80), text(w.category, 80), stamp)),
    ...deletes.map((id) => env.DB.prepare("DELETE FROM notes WHERE id = ?1").bind(id)),
  ];
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
}

/** POST /api/rules { writes: [{ kind, match, value }], deletes: [{ kind, match }] } — personal rules. */
export async function saveRules(env, body) {
  const writes = Array.isArray(body?.writes) ? body.writes : [], deletes = Array.isArray(body?.deletes) ? body.deletes : [];
  if (writes.length + deletes.length > 500) return bad("Demasiados cambios juntos.");
  const okKey = (r) => ["name", "word", "word_in"].includes(r?.kind) && typeof r.match === "string" && r.match.trim() && r.match.length <= 80;
  if (![...writes, ...deletes].every(okKey) || !writes.every((w) => typeof w.value === "string" && w.value.trim())) return bad("Regla inválida.");
  const stamp = nowIso();
  const stmts = [
    ...writes.map((w) => env.DB.prepare(`INSERT INTO personal_rules (kind, match, value, updated_at) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (kind, match) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
      .bind(w.kind, w.match.trim(), w.value.trim().slice(0, 80), stamp)),
    ...deletes.map((d) => env.DB.prepare("DELETE FROM personal_rules WHERE kind = ?1 AND match = ?2").bind(d.kind, d.match.trim())),
  ];
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
}

/** POST /api/recipients { key, name, category } — an empty name forgets the name. */
export async function saveRecipient(env, body) {
  const key = body?.key;
  if (typeof key !== "string" || !key || key.length > 100) return bad("Destinatario inválido.");
  const name = text(typeof body.name === "string" ? body.name.trim() : "", 60);
  if (name) {
    await env.DB.prepare(`INSERT INTO recipients (key, name, category, updated_at) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT (key) DO UPDATE SET name = excluded.name, category = excluded.category, updated_at = excluded.updated_at`)
      .bind(key, name, text(body.category, 80), nowIso()).run();
  } else {
    await env.DB.prepare("DELETE FROM recipients WHERE key = ?1").bind(key).run();
  }
  return json({ ok: true });
}
