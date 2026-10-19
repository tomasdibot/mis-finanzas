// The app's only door to its data. Everything is in this device's Profile (lib/store.js, ADR 0003); Mercado Pago is
// read from here (lib/sync.js) and the Relay is only used for sign-in, renewals and the balance report.
// Demo mode (?demo in the address): invented data (lib/demo.js), nothing stored, nothing sent anywhere.
import { demoRows, demoBalance } from "./demo.js";
import { session } from "./session.js";
import { createSync } from "./sync.js";

export const DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");
export const FORMAT = "mis-finanzas", VERSION = 1;
const BACKUP_TABLES = ["personal_rules", "recipients", "notes", "ml_categories", "balances", "movements"];

let profile = null, sync = null;
async function open() {
  if (profile) return profile;
  profile = await session().current();
  if (!profile) { const e = new Error("Tenés que entrar con Mercado Pago."); e.signIn = true; throw e; }
  sync = createSync({ profile, token: () => session().accessToken(profile) });
  return profile;
}

export const api = {
  /** Is someone signed in on this device? (Demo: always.) */
  async session() { return DEMO ? { demo: true } : (await session().current()) ? {} : null; },
  /** Raw movements, latest balance, recipient names, notes and personal rules of this Profile. */
  async load() {
    if (DEMO) return { rows: demoRows(), balance: demoBalance(), recipients: null, notes: null, rules: null };
    const p = await open();
    const [rows, balances, recipients, notes, rules] = await Promise.all(
      ["movements", "balances", "recipients", "notes", "personal_rules"].map((t) => p.all(t)));
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const balance = balances.sort((a, b) => b.as_of.localeCompare(a.as_of))[0] ?? null;
    return { rows, balance, recipients, notes, rules };
  },
  /** The last sync runs, newest first: [{ ok, finished_at, rows, detail }]. */
  async syncLog() { if (DEMO) return []; await open(); return sync.log(); },
  /**
   * Sync with Mercado Pago now, step by step until done. onStep(result) after each step (progress, firstMonths).
   * Returns the last result; { ok: false, signIn: true } means the permission must be renewed by signing in.
   */
  async sync(onStep = () => {}, opts) {
    if (DEMO) return { ok: true, done: true };
    await open();
    for (let i = 0; i < 200; i++) {
      const r = await sync.step(opts);
      if (!r.ok || r.done) return r;
      onStep(r);
    }
    return { ok: true, done: false };
  },
  /** Pick up the balance report Mercado Pago generates in the background after a sync. */
  async collectReports() { if (!DEMO) { await open(); await sync.collectReports(); } },
  async saveNotes(writes, deletes) {
    if (DEMO) return;
    const p = await open(), stamp = new Date().toISOString();
    await p.put("notes", writes.map((w) => ({ id: w.id, note: w.note ?? null, category: w.category ?? null, updated_at: stamp })));
    await p.del("notes", deletes);
  },
  async saveRecipient(key, name, category) {
    if (DEMO) return;
    const p = await open();
    name = String(name ?? "").trim().slice(0, 60);
    if (name) await p.put("recipients", [{ key, name, category: category || null, updated_at: new Date().toISOString() }]);
    else await p.del("recipients", [key]);
  },
  async saveRules(writes, deletes) {
    if (DEMO) return;
    const p = await open(), stamp = new Date().toISOString();
    await p.put("personal_rules", writes.map((w) => ({ kind: w.kind, match: w.match.trim(), value: w.value.trim().slice(0, 80), updated_at: stamp })));
    await p.del("personal_rules", deletes.map((d) => [d.kind, d.match.trim()]));
  },
  /** A Backup of this Profile: everything but the Mercado Pago permission. */
  async exportBackup() {
    const head = { format: FORMAT, version: VERSION, exported_at: new Date().toISOString() };
    if (DEMO) return { ...head, movements: demoRows(), balances: [], recipients: [], notes: [], personal_rules: [], ml_categories: [], settings: {} };
    const p = await open(), out = { ...head };
    for (const t of BACKUP_TABLES) out[t] = await p.all(t);
    out.settings = { recipient_salt: await p.setting("recipient_salt") };
    return out;
  },
  /** Restore a Backup into this Profile (adds/replaces, never deletes). onProgress(0..1). */
  async importBackup(b, onProgress = () => {}) {
    if (DEMO) throw new Error("en la demostración no se importan datos");
    if (b?.format !== FORMAT || b.version !== VERSION) throw new Error("ese archivo no es una copia de Mis finanzas");
    const p = await open(), total = BACKUP_TABLES.reduce((n, t) => n + (b[t]?.length ?? 0), 0) || 1;
    let done = 0;
    for (const t of BACKUP_TABLES) {
      const rows = (Array.isArray(b[t]) ? b[t] : []).filter((r) => r && typeof r === "object");
      for (let i = 0; i < rows.length; i += 500) {
        await p.put(t, rows.slice(i, i + 500).map(({ h, synced_at, ...r }) => r));
        done += Math.min(500, rows.length - i); onProgress(done / total);
      }
    }
    // the copy's recipient key: movements are downloaded again (13 months) so every recipient name keeps matching
    const salt = b.settings?.recipient_salt;
    if (typeof salt === "string" && /^[0-9a-f]{16,128}$/.test(salt)) {
      await p.setSetting("recipient_salt", salt);
      await p.setSetting("backfill_done", null);
      await p.setSetting("sync_plan", null);
    }
    return done;
  },
  /** Erase this Profile from this device (the Mercado Pago account itself doesn't change). */
  async deleteAll() {
    if (DEMO) throw new Error("en la demostración no hay datos guardados");
    const p = await open();
    await session().erase(p.id);
    profile = null; sync = null;
  },
  /** App version (from the Relay). */
  async health() { const r = await fetch("/api/health", { cache: "no-store" }).catch(() => null); return r?.ok ? r.json() : {}; },
  /** Forget the permission on this device; the data stays for the next sign-in. */
  async signOut() { if (!DEMO) { await session().signOut(); profile = null; sync = null; } },
};
