const fs = require("fs");
const path = require("path");
const STATE = process.env.LULLA_E2E_STATE || path.join("C:/Users/cyco/AppData/Local/Temp/opencode", "lulla-e2e-state.json");

// Pinned in the app at src/domain/syncConfig.ts; duplicated here so the spec
// can prove server state without importing app code.
const AUTH = "https://ep-tiny-surf-b4rd0mzo.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth";
const SYNC = "https://br-bitter-frost-b4p0l50q-sync.compute.c-6.us-east-2.aws.neon.tech";

const serverChildNames = `(async () => {
  const t = await (await fetch(${JSON.stringify(`${AUTH}/token`)}, { credentials: "include" })).json();
  if (!t || !t.token) return { error: "no session token" };
  const r = await fetch(${JSON.stringify(`${SYNC}/pull?after=0`)}, { headers: { authorization: "Bearer " + t.token } });
  if (!r.ok) return { error: "pull " + r.status };
  const j = await r.json();
  const names = (j.changes || []).filter((c) => c.kind === "children" && !c.deleted).map((c) => c.data && c.data.name);
  return { names, cursor: j.cursor };
})()`;

const PASSWORD = "password-123";
const EMAIL = `alice-${Date.now().toString(36)}@example.com`;

const setNative = (sel, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const readChildren = `(async () => {
  const o = await new Promise((res, rej) => { const rq = indexedDB.open('lulla'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  const q = o.transaction('children', 'readonly').objectStore('children').getAll();
  return await new Promise((res, rej) => { q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
})()`;

const wait = async (t, expr, label, timeoutMs = 30000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await t.eval(expr)) return true;
    } catch (e) {
      void e;
    }
    await t.wait(500);
  }
  t.check(label, false, "timed out");
  return false;
};

const clicked = async (t, clickExpr, label, timeoutMs = 30000) => wait(t, clickExpr, label, timeoutMs);
const clickWhenText = (txt) =>
  `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(txt)}); if (b && !b.disabled) { b.click(); return true; } return false; })()`;
const clickWhenSel = (sel) =>
  `(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b && !b.disabled) { b.click(); return true; } return false; })()`;

module.exports = async (t) => {
  t.check("loads lulla", (await t.eval("document.title")).includes("Lulla"));

  // -- Onboarding --
  await wait(t, `!!document.querySelector('[placeholder="Name"]')`, "name input");
  await t.eval(setNative('[placeholder="Name"]', "Milo"));
  await clicked(t, clickWhenText("Add child"), "add child");
  await clicked(t, clickWhenText("Done — open Lulla"), "done onboarding", 30000);
  await wait(t, `!!document.querySelector('button[aria-label="Settings"]')`, "main app", 45000);

  // -- Open Settings, account card (slow: Neon auth cold start) --
  await clicked(t, clickWhenSel('button[aria-label="Settings"]'), "open settings");
  const card = await wait(t, `document.body.innerText.toLowerCase().includes('account & family sync')`, "account card", 90000);
  t.check("account card shown", card);

  // -- Create an account --
  await clicked(t, clickWhenText("Create account"), "switch to create-account tab", 30000);
  await wait(t, `!!document.querySelector('[placeholder="Your name"]')`, "name field", 30000);
  await t.eval(setNative('[placeholder="Your name"]', "Alice"));
  await t.eval(setNative('[placeholder="Email"]', EMAIL));
  await t.eval(setNative('[placeholder="Password (8+ characters)"]', PASSWORD));
  await clicked(t, clickWhenSel('button.btn-gold'), "submit signup", 30000);
  const signedIn = await wait(t, `document.body.innerText.includes('Start a family household')`, "signed in", 90000);
  t.check("signed in", signedIn, EMAIL);

  // -- Create household. token() can 401 for a moment right after sign-up, so
  //    settle briefly and retry if the store reports "Please sign in first." --
  await t.wait(4000);
  const errExpr = `document.body.innerText.includes('Please sign in first.')`;
  const created = async () => {
    for (let i = 0; i < 4; i++) {
      await t.eval(clickWhenText("Start a family household"));
      const owner = await wait(t, `document.body.innerText.includes('Our family · owner')`, "household ready", 20000);
      if (owner) return true;
      if (await t.eval(errExpr)) { await t.wait(4000); continue; }
      await t.wait(2000);
    }
    return false;
  };
  const ready = await created();
  t.check("household ready", ready);

  // -- Invite code --
  await wait(t, `[...document.querySelectorAll('.font-mono')].some(e => (e.textContent.trim() || '').length >= 8)`, "invite code", 60000);
  const code = await t.eval(
    `[...document.querySelectorAll('.font-mono')].map(e => e.textContent.trim()).find(s => s && s.length >= 8)`,
  );
  t.check("invite code visible", !!code, String(code));
  fs.writeFileSync(STATE, JSON.stringify({ email: EMAIL, password: PASSWORD, code: code || "" }));

  // -- Local child --
  const kids = await t.evalAsync(readChildren);
  t.check("Milo local on A", kids.map((k) => k.name).includes("Milo"), JSON.stringify(kids.map((k) => k.name)));

  // -- Server-side proof --
  // Asserting only on local state is how a broken push read as PASS: the row
  // was never rekeyed, so pushLocalState dropped it every time, and the child
  // only ever existed in this browser. Poll the real server until it lands.
  let server = { names: [] };
  for (let i = 0; i < 12; i++) {
    server = await t.evalAsync(serverChildNames);
    if (server && Array.isArray(server.names) && server.names.includes("Milo")) break;
    await t.wait(2500);
  }
  t.check("Milo reached the sync server", !!(server && server.names && server.names.includes("Milo")), JSON.stringify(server));

  await t.shot("device-a-settings.png");
};