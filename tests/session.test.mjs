// npm test   (invented data only)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../web/lib/session.js";
import { memoryProfile } from "../web/lib/store.js";

function device({ refreshTo } = {}) {
  const ls = new Map(), dbs = new Map(), calls = [];
  const storage = { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
  const openProfile = async (id) => { if (!dbs.has(id)) dbs.set(id, memoryProfile(id)); return dbs.get(id); };
  const fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) });
    return refreshTo ? new Response(JSON.stringify(refreshTo)) : new Response("{}", { status: 401 }); };
  return { session: createSession({ storage, openProfile, fetch }), ls, dbs, calls };
}
const perm = (user_id, over = {}) => ({ access_token: `TOKEN-${user_id}`, refresh_token: `R-${user_id}`, expires_in: 15552000, user_id, ...over });

test("signing in opens that account's Profile; the permission is stored encrypted, never in plain text", async () => {
  const d = device();
  assert.equal(await d.session.current(), null);
  const p = await d.session.finishSignIn(perm("111"));
  assert.equal(p.id, "111");
  assert.equal((await d.session.current()).id, "111");
  assert.equal(await d.session.accessToken(p), "TOKEN-111");
  const stored = JSON.stringify([...d.ls.entries()]) + JSON.stringify(await p.all("settings"), (k, v) => (ArrayBuffer.isView(v) || v instanceof ArrayBuffer ? "[bytes]" : v));
  assert.ok(!stored.includes("TOKEN-111") && !stored.includes("R-111"));
});

test("signing out keeps the data; another account on the same device never sees it", async () => {
  const d = device();
  const a = await d.session.finishSignIn(perm("111"));
  await a.put("notes", [{ id: "1:payment", note: "Café con Ana" }]);
  await d.session.signOut();
  assert.equal(await d.session.current(), null);
  assert.equal((await a.all("notes")).length, 1, "data stays");
  assert.equal(await d.session.accessToken(a), null, "permission gone");
  const b = await d.session.finishSignIn(perm("222"));
  assert.deepEqual(await b.all("notes"), []);
  assert.equal((await d.session.current()).id, "222");
  const again = await d.session.finishSignIn(perm("111"));
  assert.equal((await again.all("notes")).length, 1, "back to its own data");
  assert.deepEqual(d.session.profiles().map((p) => p.id), ["111", "222"]);
});

test("the permission is renewed through the Relay before it expires", async () => {
  const d = device({ refreshTo: { ok: true, access_token: "NUEVO", refresh_token: "R2", expires_in: 15552000, user_id: "111" } });
  const p = await d.session.finishSignIn(perm("111", { expires_in: 5 * 86400 }));
  assert.equal(await d.session.accessToken(p), "NUEVO");
  assert.deepEqual(d.calls.map((c) => [c.url, c.body]), [["/api/auth/refresh", { refresh_token: "R-111" }]]);
  assert.equal(await d.session.accessToken(p), "NUEVO");
  assert.equal(d.calls.length, 1, "no renewal while there's time left");
});

test("an expired permission that can't be renewed means signing in again", async () => {
  const d = device();
  const p = await d.session.finishSignIn(perm("111", { expires_in: -10 }));
  assert.equal(await d.session.accessToken(p), null);
  const q = await d.session.finishSignIn(perm("222", { expires_in: 5 * 86400 }));
  assert.equal(await d.session.accessToken(q), "TOKEN-222", "renewal failed but it still works for a few days");
});

test("erasing a Profile removes everything of that account from the device", async () => {
  const d = device();
  const p = await d.session.finishSignIn(perm("111"));
  await p.put("movements", [{ id: "1:payment" }]);
  await d.session.erase("111");
  assert.equal(await d.session.current(), null);
  assert.deepEqual(d.session.profiles(), []);
  assert.deepEqual(await p.all("movements"), []);
});
