// "Actualizar": brings the Owner's copy up to the Template's latest Release. Runs in the Owner's own GitHub copy
// (.github/workflows/actualizar.yml, "Run workflow"); the push it makes is deployed by Cloudflare as usual.
// Only the Template's own files (template.json "owned") are replaced. The Owner's data and personal rules live in
// their database and are never touched; from wrangler.toml the Owner's Worker name and database are kept.
// No keys: the Release is public, and the push uses the workflow's own GITHUB_TOKEN.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Upstream wrangler.toml, keeping the Owner's Worker name and D1 database name/id. */
export function mergeWrangler(upstream, mine) {
  const top = (toml, key) => toml.split(/^\[/m)[0].match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"))?.[1];
  const d1 = (toml, key) => toml.match(/^\[\[d1_databases\]\][\s\S]*?(?=^\[|(?![\s\S]))/m)?.[0].match(new RegExp(`^${key}\\s*=\\s*(.+)$`, "m"))?.[1];
  let out = upstream;
  const name = top(mine, "name");
  if (name) out = out.replace(/^name\s*=.*$/m, `name = ${name}`);
  out = out.replace(/^\[\[d1_databases\]\][\s\S]*?(?=^\[|(?![\s\S]))/m, (block) => {
    let b = block;
    for (const key of ["database_name", "database_id"]) {
      const v = d1(mine, key);
      if (!v) continue;
      b = new RegExp(`^${key}\\s*=`, "m").test(b) ? b.replace(new RegExp(`^${key}\\s*=.*$`, "m"), `${key} = ${v}`)
        : b.replace(/^(database_name\s*=.*)$/m, `$1\n${key} = ${v}`);
    }
    return b;
  });
  return out;
}

/** Replace the owned paths in `dest` with those in `src` (deleting what the new Release no longer has). */
export function copyOwned(src, dest, owned) {
  for (const p of owned) {
    fs.rmSync(path.join(dest, p), { recursive: true, force: true });
    if (fs.existsSync(path.join(src, p))) fs.cpSync(path.join(src, p), path.join(dest, p), { recursive: true });
  }
  const up = path.join(src, "wrangler.toml"), mine = path.join(dest, "wrangler.toml");
  if (fs.existsSync(up)) {
    fs.writeFileSync(mine, fs.existsSync(mine) ? mergeWrangler(fs.readFileSync(up, "utf8"), fs.readFileSync(mine, "utf8")) : fs.readFileSync(up, "utf8"));
  }
}

async function main() {
  const root = process.cwd();
  const { repo } = JSON.parse(fs.readFileSync(path.join(root, "template.json"), "utf8"));
  if (!repo) throw new Error("template.json no dice de dónde actualizar (repo vacío).");
  if (process.env.GITHUB_REPOSITORY === repo) { console.log("Esta es la plantilla misma: no hay nada que actualizar."); return; }
  const headers = { accept: "application/vnd.github+json", "user-agent": "mis-finanzas-actualizar",
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const rel = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (!rel.ok) throw new Error(`No se pudo leer la última versión de ${repo} (HTTP ${rel.status}).`);
  const { tag_name: tag } = await rel.json();
  const mine = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  console.log(`Tenés la versión ${mine}; la última es ${tag}.`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mf-")), tgz = path.join(tmp, "release.tgz");
  const tar = await fetch(`https://api.github.com/repos/${repo}/tarball/${tag}`, { headers });
  if (!tar.ok) throw new Error(`No se pudo descargar ${tag} (HTTP ${tar.status}).`);
  fs.writeFileSync(tgz, Buffer.from(await tar.arrayBuffer()));
  const out = path.join(tmp, "x"); fs.mkdirSync(out);
  execFileSync("tar", ["-xzf", tgz, "-C", out, "--strip-components=1"]);
  const { owned } = JSON.parse(fs.readFileSync(path.join(out, "template.json"), "utf8"));
  copyOwned(out, root, owned);
  console.log(`Listo: archivos de la versión ${tag} copiados. Cloudflare la publica cuando se guarden.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
