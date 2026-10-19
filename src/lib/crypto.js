// Hashes used by the sync. Web Crypto only: runs in Workers and in Node (tests).

/** Hex HMAC-SHA256. Recipient keys = hmacHex(recipient_salt, "recipient:<id>" | "bank:<account>"), first 20 chars. */
export async function hmacHex(key, text) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fast 32-bit FNV-1a fingerprint (not for security): tells whether a row's facts changed. */
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
