// Optional lock: the app asks for this device's fingerprint, face or PIN when it opens (a passkey kept by the device,
// never sent anywhere). It only guards opening the app; it does not encrypt the data (ADR 0003).

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

/** Creates the device passkey; returns what to remember ({ id }) to ask for it later. */
export async function enableLock() {
  if (!window.PublicKeyCredential || !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.())) {
    throw new Error("este dispositivo no tiene huella, cara o PIN disponible para apps web");
  }
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: challenge(), rp: { name: "Mis finanzas" },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "Mis finanzas", displayName: "Mis finanzas" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
    timeout: 60000,
  } });
  if (!cred) throw new Error("cancelado");
  return { id: b64(cred.rawId) };
}

/** Resolves when the device confirms it's the person; throws if cancelled or failed. */
export async function unlock(lock) {
  const got = await navigator.credentials.get({ publicKey: {
    challenge: challenge(), allowCredentials: [{ type: "public-key", id: unb64(lock.id) }],
    userVerification: "required", timeout: 60000,
  } });
  if (!got) throw new Error("cancelado");
}
