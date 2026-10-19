// The app's only door to its data. In demo mode (?demo in the address) everything is invented (lib/demo.js) and
// nothing leaves the browser. Phase 1 (skeleton): demo mode only. From phase 2 the same calls go to this
// Deployment's own Worker (/api/*), which answers only its signed-in Owner (ADR 0002).
import { demoRows, demoBalance } from "./demo.js";

export const DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");

const notYet = () => { throw new Error("todavía no disponible"); };

export const api = {
  /** Is someone signed in? Demo: always. Phase 1: nobody can sign in yet. */
  async session() { return DEMO ? { demo: true } : null; },
  /** Raw movements, latest verified balance, recipient names and notes. */
  async load() {
    if (DEMO) return { rows: demoRows(), balance: demoBalance(), recipients: null, notes: null };
    return notYet();
  },
  /** The last sync runs, newest first: [{ ok, finished_at, rows, detail }]. */
  async syncLog() { return DEMO ? [] : notYet(); },
  /** Ask the Worker to sync with Mercado Pago now. */
  async sync() { return DEMO ? { ok: true } : notYet(); },
  /** Upsert notes ({ id, note, category }) and delete notes by id. Demo: kept only in this browser. */
  async saveNotes(writes, deletes) { if (!DEMO) notYet(); },
  /** Name a transfer recipient (empty name = forget the name). Demo: kept only in this browser. */
  async saveRecipient(key, name, category) { if (!DEMO) notYet(); },
  async signOut() { if (!DEMO) notYet(); },
};
