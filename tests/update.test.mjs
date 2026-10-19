// npm test   (no network: the Release is a folder made here)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mergeWrangler, copyOwned } from "../scripts/update.mjs";
import { fakeD1 } from "./fake-d1.mjs";
import worker from "../src/worker.js";
import { sha256Hex } from "../src/http.js";
import template from "../template.json" with { type: "json" };

const UPSTREAM = `name = "mis-finanzas"
main = "src/worker.js"
compatibility_date = "2027-01-01"

[[d1_databases]]
binding = "DB"
database_name = "mis-finanzas"
migrations_dir = "migrations"

[triggers]
crons = ["*/15 * * * *"]
`;
const MINE = `name = "finanzas-de-ana"
main = "src/worker.js"
compatibility_date = "2026-10-01"

[[d1_databases]]
binding = "DB"
database_name = "finanzas-de-ana-db"
database_id = "11111111-2222-3333-4444-555555555555"
migrations_dir = "migrations"
`;

test("an update takes the Template's wrangler.toml but keeps the Owner's Worker and database", () => {
  const out = mergeWrangler(UPSTREAM, MINE);
  assert.match(out, /^name = "finanzas-de-ana"$/m);
  assert.match(out, /^database_name = "finanzas-de-ana-db"$/m);
  assert.match(out, /^database_id = "11111111-2222-3333-4444-555555555555"$/m);
  assert.match(out, /compatibility_date = "2027-01-01"/);
  assert.match(out, /crons = \["\*\/15 \* \* \* \*"\]/);
  assert.equal(mergeWrangler(UPSTREAM, UPSTREAM), UPSTREAM);
});

test("an update replaces only the Template's own files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mf-test-")), up = path.join(tmp, "up"), me = path.join(tmp, "me");
  const put = (root, file, text) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text); };
  put(up, "src/worker.js", "nuevo"); put(up, "web/app.js", "nuevo"); put(up, "wrangler.toml", UPSTREAM);
  put(me, "src/worker.js", "viejo"); put(me, "src/borrado.js", "ya no existe"); put(me, "web/app.js", "viejo");
  put(me, "wrangler.toml", MINE); put(me, ".github/workflows/actualizar.yml", "del dueño"); put(me, "notas-mias.txt", "mío");
  copyOwned(up, me, ["src", "web", "migrations"]);
  const read = (f) => (fs.existsSync(path.join(me, f)) ? fs.readFileSync(path.join(me, f), "utf8") : null);
  assert.deepEqual([read("src/worker.js"), read("src/borrado.js"), read("web/app.js")], ["nuevo", null, "nuevo"]);
  assert.deepEqual([read(".github/workflows/actualizar.yml"), read("notas-mias.txt")], ["del dueño", "mío"]);
  assert.match(read("wrangler.toml"), /finanzas-de-ana/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("the Template's owned list covers the code and never the Owner's config or workflows", () => {
  for (const p of ["src", "web", "migrations", "package.json", "package-lock.json", "scripts"]) assert.ok(template.owned.includes(p), p);
  for (const p of ["wrangler.toml", ".github", ".github/workflows", ".dev.vars"]) assert.ok(!template.owned.includes(p), p);
});

test("the Owner's GitHub copy is remembered; health tells the version", async () => {
  const env = { DB: fakeD1(), ASSETS: { fetch: async () => new Response("app") } };
  env.DB.raw.prepare("INSERT INTO owner (id, mp_user_id) VALUES (1, '1')").run();
  env.DB.raw.prepare("INSERT INTO sessions (id_hash, expires_at) VALUES (?, '2999-01-01T00:00:00.000Z')").run(await sha256Hex("s"));
  const ORIGIN = "https://x.ejemplo.workers.dev";
  const post = (body) => worker.fetch(new Request(ORIGIN + "/api/settings", { method: "POST",
    headers: { origin: ORIGIN, cookie: "mf_session=s", "content-type": "application/json" }, body: JSON.stringify(body) }), env);
  assert.deepEqual(await (await post({ github_repo: "https://github.com/ana-ejemplo/mis-finanzas.git" })).json(), { ok: true, github_repo: "ana-ejemplo/mis-finanzas" });
  assert.equal((await post({ github_repo: "esto no es un repo" })).status, 400);
  const st = await (await worker.fetch(new Request(ORIGIN + "/api/state", { headers: { cookie: "mf_session=s" } }), env)).json();
  assert.deepEqual(st.settings, { github_repo: "ana-ejemplo/mis-finanzas" });
  const h = await (await worker.fetch(new Request(ORIGIN + "/api/health"), env)).json();
  assert.equal(h.version, JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url))).version);
  // server-only settings never reach the app
  env.DB.raw.prepare("INSERT INTO app_settings (key, value) VALUES ('recipient_salt', 'secreto')").run();
  const again = await (await worker.fetch(new Request(ORIGIN + "/api/state", { headers: { cookie: "mf_session=s" } }), env)).text();
  assert.ok(!again.includes("secreto"));
});
