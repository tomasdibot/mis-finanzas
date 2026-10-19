// A small stand-in for Cloudflare D1 over Node's built-in SQLite, with this repo's migrations applied.
// Covers what the Worker uses: prepare().bind().first()/all()/run(), batch(), exec().
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const plain = (row) => (row ? { ...row } : null);

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args); }
  async first() { return plain(this.db.prepare(this.sql).get(...this.args)); }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map(plain), success: true }; }
  async run() { const r = this.db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
  isReader() { return /^\s*(SELECT|WITH)\b/i.test(this.sql) || /\bRETURNING\b/i.test(this.sql); }
}

export function fakeD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)");
  const dir = new URL("../migrations/", import.meta.url);
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(fs.readFileSync(new URL(f, dir), "utf8"));
    db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(f);
  }
  return {
    raw: db,
    prepare: (sql) => new Stmt(db, sql),
    async exec(sql) { db.exec(sql); return { count: 1 }; },
    async batch(stmts) {  // all or nothing, like D1
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push(s.isReader() ? await s.all() : await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}
