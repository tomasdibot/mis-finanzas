// A Profile's storage (ADR 0003): everything one Mercado Pago account has on this device, in IndexedDB.
// memoryProfile() is the same thing in memory, for tests. Both offer the same async methods.

export const TABLES = {
  movements: "id", balances: "as_of", recipients: "key", notes: "id", personal_rules: ["kind", "match"],
  ml_categories: "id", report_tasks: "task_id", settings: "key",
};
const keyOf = (table, row) => { const k = TABLES[table]; return Array.isArray(k) ? k.map((c) => row[c]).join("\u0000") : row[k]; };
const keyArg = (table, key) => (Array.isArray(TABLES[table]) && Array.isArray(key) ? key.join("\u0000") : key);

/** In-memory Profile (tests). */
export function memoryProfile(id = "test") {
  const t = Object.fromEntries(Object.keys(TABLES).map((n) => [n, new Map()]));
  const clone = (v) => (v == null ? v : structuredClone(v));
  return {
    id,
    async all(table) { return [...t[table].values()].map(clone); },
    async get(table, key) { return clone(t[table].get(keyArg(table, key))) ?? null; },
    async put(table, rows) { for (const r of rows) t[table].set(keyOf(table, r), clone(r)); },
    async del(table, keys) { for (const k of keys) t[table].delete(keyArg(table, k)); },
    async clearTable(table) { t[table].clear(); },
    async setting(key) { return (await this.get("settings", key))?.value ?? null; },
    async setSetting(key, value) { return value == null ? this.del("settings", [key]) : this.put("settings", [{ key, value }]); },
    async destroy() { Object.values(t).forEach((m) => m.clear()); },
  };
}

const done = (req) => new Promise((ok, bad) => { req.onsuccess = () => ok(req.result); req.onerror = () => bad(req.error); });
const finished = (tx) => new Promise((ok, bad) => { tx.oncomplete = () => ok(); tx.onerror = tx.onabort = () => bad(tx.error); });
export const dbName = (id) => `mf-profile-${id}`;

/** The Profile of Mercado Pago account `id` on this device (created on first use). */
export async function idbProfile(id) {
  const open = indexedDB.open(dbName(id), 1);
  open.onupgradeneeded = () => {
    for (const [name, keyPath] of Object.entries(TABLES)) if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name, { keyPath });
  };
  const db = await done(open);
  const store = (table, mode) => db.transaction(table, mode).objectStore(table);
  return {
    id,
    async all(table) { return done(store(table, "readonly").getAll()); },
    async get(table, key) { return (await done(store(table, "readonly").get(key))) ?? null; },
    async put(table, rows) {
      if (!rows.length) return;
      const tx = db.transaction(table, "readwrite"), s = tx.objectStore(table);
      rows.forEach((r) => s.put(r));
      await finished(tx);
    },
    async del(table, keys) {
      if (!keys.length) return;
      const tx = db.transaction(table, "readwrite"), s = tx.objectStore(table);
      keys.forEach((k) => s.delete(k));
      await finished(tx);
    },
    async clearTable(table) { await done(store(table, "readwrite").clear()); },
    async setting(key) { return (await this.get("settings", key))?.value ?? null; },
    async setSetting(key, value) { return value == null ? this.del("settings", [key]) : this.put("settings", [{ key, value }]); },
    async destroy() { db.close(); await done(indexedDB.deleteDatabase(dbName(id))); },
  };
}
