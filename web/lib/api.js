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
    if (DEMO) return { rows: demoRows(), balance: demoBalance(), recipients: null, notes: null };
    const st = await call("/api/state"), rows = [];
    for (let page = 0; ; page++) {
      const r = await call(`/api/movements?page=${page}`);
      rows.push(...r.rows);
      if (!r.more) break;
    }
    return { rows, balance: st.balance, recipients: st.recipients, notes: st.notes };
  },
  /** The last sync runs, newest first: [{ ok, finished_at, rows, detail }]. */
  async syncLog() { return DEMO ? [] : (await call("/api/sync-log")).runs; },
  /** Ask the Worker to sync with Mercado Pago now. */
  async sync() { return DEMO ? { ok: true } : call("/api/sync", {}); },
  /** Upsert notes ({ id, note, category }) and delete notes by id. Demo: kept only in this browser. */
  async saveNotes(writes, deletes) { if (!DEMO) await call("/api/notes", { writes, deletes }); },
  /** Name a transfer recipient (empty name = forget the name). Demo: kept only in this browser. */
  async saveRecipient(key, name, category) { if (!DEMO) await call("/api/recipients", { key, name, category }); },
  async signOut() { if (!DEMO) await call("/api/auth/logout", {}); },
};
