// The app's only door to its data. In demo mode (?demo in the address) everything is invented (lib/demo.js) and
// nothing leaves the browser. Otherwise every call goes to this Deployment's own Worker (/api/*), which answers
// only its signed-in Owner (ADR 0002). The Mercado Pago token never comes to the browser.
import { demoRows, demoBalance } from "./demo.js";

export const DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");

async function call(path, body) {
  const r = await fetch(path, body === undefined ? { cache: "no-store" }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { location.reload(); throw new Error("Tenés que entrar de nuevo."); } // back to the sign-in
  if (!r.ok) throw new Error(data.error || `error ${r.status}`);
  return data;
}

export const api = {
  /** Is the Owner signed in? Demo: always. */
  async session() {
    if (DEMO) return { demo: true };
    const r = await fetch("/api/session", { cache: "no-store" }).catch(() => null);
    if (r?.ok) return {};
    if (!r) throw new Error("Sin conexión.");
    return null;
  },
  /** Raw movements, latest verified balance, recipient names and notes. */
  async load() {
    if (DEMO) return { rows: demoRows(), balance: demoBalance(), recipients: null, notes: null, rules: null };
    const st = await call("/api/state"), rows = [];
    for (let page = 0; ; page++) {
      const r = await call(`/api/movements?page=${page}`);
      rows.push(...r.rows);
      if (!r.more) break;
    }
    return { rows, balance: st.balance, recipients: st.recipients, notes: st.notes, rules: st.rules, settings: st.settings };
  },
  /** The last sync runs, newest first: [{ ok, finished_at, rows, detail }]. */
  async syncLog() { return DEMO ? [] : (await call("/api/sync-log")).runs; },
  /** Sync with Mercado Pago now: one small step per request until done. onStep({ month, progress }) reports progress. */
  async sync(onStep = () => {}) {
    if (DEMO) return { ok: true };
    for (let i = 0; i < 100; i++) {
      const r = await call("/api/sync", {});
      if (r.done || r.idle) return r;
      onStep(r);
    }
    return { ok: true };
  },
  /** Pick up the balance report Mercado Pago generates in the background after a sync. */
  async collectReports() { if (!DEMO) await call("/api/sync/reports", {}); },
  /** Upsert notes ({ id, note, category }) and delete notes by id. Demo: kept only in this browser. */
  async saveNotes(writes, deletes) { if (!DEMO) await call("/api/notes", { writes, deletes }); },
  /** Name a transfer recipient (empty name = forget the name). Demo: kept only in this browser. */
  async saveRecipient(key, name, category) { if (!DEMO) await call("/api/recipients", { key, name, category }); },
  /** Personal rules: upsert [{ kind, match, value }], delete [{ kind, match }]. Demo: kept only in this browser. */
  async saveRules(writes, deletes) { if (!DEMO) await call("/api/rules", { writes, deletes }); },
  /** The Owner's backup: everything but the Mercado Pago token and sessions (src/backup.js). */
  async exportBackup() {
    const head = { format: "mis-finanzas", version: 1, exported_at: new Date().toISOString() };
    if (DEMO) return { ...head, movements: demoRows(), balances: [], recipients: [], notes: [], personal_rules: [], ml_categories: [], settings: {} };
    const meta = await call("/api/export/meta"), movements = [];
    for (let page = 0; ; page++) {
      const r = await call(`/api/movements?page=${page}`);
      movements.push(...r.rows.map(({ h, ...row }) => row));
      if (!r.more) break;
    }
    return { ...head, ...meta, movements };
  },
  /** Restore a backup in small chunks (adds/replaces, never deletes). onProgress(0..1). */
  async importBackup(b, onProgress = () => {}) {
    if (DEMO) throw new Error("en la demostración no se importan datos");
    if (b?.format !== "mis-finanzas" || b.version !== 1) throw new Error("ese archivo no es una copia de Mis finanzas");
    const tables = ["personal_rules", "recipients", "notes", "ml_categories", "balances", "movements"];
    const total = tables.reduce((n, t) => n + (b[t]?.length ?? 0), 0) || 1;
    let done = 0;
    if (b.settings?.recipient_salt) await call("/api/import", { settings: { recipient_salt: b.settings.recipient_salt } });
    for (const t of tables) {
      const rows = b[t] ?? [];
      for (let i = 0; i < rows.length; i += 300) {
        await call("/api/import", { table: t, rows: rows.slice(i, i + 300) });
        done += Math.min(300, rows.length - i); onProgress(done / total);
      }
    }
    return done;
  },
  /** Erase every row of this Deployment (it goes back to unclaimed). */
  async deleteAll() {
    if (DEMO) throw new Error("en la demostración no hay datos guardados");
    await call("/api/delete-all", { confirm: "BORRAR" });
  },
  /** Version of this Deployment and the Template it updates from. */
  async health() { const r = await fetch("/api/health", { cache: "no-store" }); return r.ok ? r.json() : {}; },
  /** Owner settings ({ github_repo }). */
  async saveSettings(s) { if (DEMO) throw new Error("en la demostración no se guarda"); return call("/api/settings", s); },
  async signOut() { if (!DEMO) await call("/api/auth/logout", {}); },
};
