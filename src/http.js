// Small HTTP helpers shared by the Worker's routes.

export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
});

export const redirect = (location, cookies = []) => new Response(null, {
  status: 302, headers: [["location", location], ["cache-control", "no-store"], ...cookies.map((c) => ["set-cookie", c])],
});

export const getCookie = (req, name) => (req.headers.get("cookie") ?? "").split(/;\s*/)
  .find((c) => c.startsWith(name + "="))?.slice(name.length + 1);

/** A cookie only this site's pages can send, never readable by scripts. maxAge 0 deletes it. */
export const setCookie = (name, value, { path = "/", maxAge }) =>
  `${name}=${value}; Path=${path}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const randomString = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256Hex = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha256B64url = async (text) => b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

export const nowIso = (ms = Date.now()) => new Date(ms).toISOString();
