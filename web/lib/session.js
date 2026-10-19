// Who is signed in on this device, and their Mercado Pago permission (ADR 0003).
// Each Mercado Pago account has its own Profile (lib/store.js); "mf.current" says which one is open. The permission
// is kept encrypted inside the Profile with a key that never leaves this browser (non-extractable Web Crypto key).
// "Cerrar sesión" drops the permission and keeps the Profile's data.
import { idbProfile } from "./store.js";

const DAY = 86400e3, RENEW_DAYS = 30;

export function createSession({ storage = globalThis.localStorage, openProfile = idbProfile,
  fetch = (...a) => globalThis.fetch(...a), base = "" } = {}) {
  const read = (k, d) => { try { const v = storage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { v == null ? storage.removeItem(k) : storage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
  const opened = new Map();
  const open = async (id) => { if (!opened.has(id)) opened.set(id, await openProfile(id)); return opened.get(id); };

  async function key(profile) {
    let k = await profile.setting("device_key");
    if (!k) {
      k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await profile.setSetting("device_key", k);
    }
    return k;
  }
  async function save(profile, p) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(profile), new TextEncoder().encode(JSON.stringify(p)));
    await profile.setSetting("permission", { iv, data });
  }
  async function load(profile) {
    const box = await profile.setting("permission");
    if (!box) return null;
    try {
      return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: box.iv }, await key(profile), box.data)));
    } catch { return null; }
  }

  return {
    /** The open Profile, or null when nobody is signed in on this device. */
    async current() {
      const id = read("mf.current", null);
      if (!id) return null;
      const p = await open(id);
      return (await p.setting("permission")) ? p : null;
    },
    /** Profiles on this device: [{ id, name }] (name = what the user called it, if anything). */
    profiles() { return read("mf.profiles", []); },
    /** Called by the sign-in page with the permission the Relay handed over. */
    async finishSignIn(perm) {
      if (!perm?.access_token || !perm.user_id) throw new Error("permiso incompleto");
      const id = String(perm.user_id), profile = await open(id);
      await save(profile, { access_token: perm.access_token, refresh_token: perm.refresh_token ?? null,
        expires_at: Date.now() + (Number(perm.expires_in) || 180 * 86400) * 1000 });
      const list = read("mf.profiles", []);
      if (!list.some((p) => p.id === id)) write("mf.profiles", [...list, { id }]);
      write("mf.current", id);
      try { await navigator.storage?.persist?.(); } catch { /* the browser may say no; the backup reminder covers it */ }
      return profile;
    },
    /** A usable access token for this Profile (renewed when close to expiring), or null: sign in again. */
    async accessToken(profile) {
      const p = await load(profile);
      if (!p) return null;
      if (p.expires_at - Date.now() > RENEW_DAYS * DAY) return p.access_token;
      if (p.refresh_token) {
        const r = await fetch(`${base}/api/auth/refresh`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: p.refresh_token }) }).catch(() => null);
        const j = r?.ok ? await r.json().catch(() => null) : null;
        if (j?.access_token) {
          await save(profile, { access_token: j.access_token, refresh_token: j.refresh_token ?? p.refresh_token,
            expires_at: Date.now() + (Number(j.expires_in) || 180 * 86400) * 1000 });
          return j.access_token;
        }
      }
      return p.expires_at > Date.now() ? p.access_token : null;
    },
    /** Forget the permission on this device; the Profile's data stays for the next sign-in. */
    async signOut() {
      const id = read("mf.current", null);
      if (id) await (await open(id)).setSetting("permission", null);
      write("mf.current", null);
    },
    /** Erase a Profile from this device entirely. */
    async erase(id) {
      await (await open(id)).destroy();
      opened.delete(id);
      write("mf.profiles", read("mf.profiles", []).filter((p) => p.id !== id));
      if (read("mf.current", null) === id) write("mf.current", null);
    },
  };
}

let shared = null;
export const session = () => (shared ??= createSession());
/** Used by the page the Relay returns after Mercado Pago (src/auth.js). */
export const finishSignIn = (perm) => session().finishSignIn(perm);
