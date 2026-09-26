const fs = require("fs");
const path = require("path");
const STATE = process.env.LULLA_E2E_STATE || path.join("C:/Users/cyco/AppData/Local/Temp/opencode", "lulla-e2e-state.json");

const PASSWORD = "password-123";
const EMAIL = `bob-${Date.now().toString(36)}@example.com`;

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
  const { code } = JSON.parse(fs.readFileSync(STATE, "utf8"));
  t.check("loads lulla", (await t.eval("document.title")).includes("Lulla"));
  t.check("state file has code", !!code, String(code));

  // -- Device B onboards its own local child first --
  await wait(t, `!!document.querySelector('[placeholder="Name"]')`, "name input");
  await t.eval(setNative('[placeholder="Name"]', "Nina"));
  await clicked(t, clickWhenText("Add child"), "add child");
  await clicked(t, clickWhenText("Done — open Lulla"), "done onboarding", 30000);
  await wait(t, `!!document.querySelector('button[aria-label="Settings"]')`, "main app", 45000);

  // -- Settings -> create a fresh account (B is a NEW user) --
  await clicked(t, clickWhenSel('button[aria-label="Settings"]'), "open settings");
  await wait(t, `document.body.innerText.toLowerCase().includes('account & family sync')`, "account card", 90000);
  t.check("account card shown", true);
  await clicked(t, clickWhenText("Create account"), "switch to create-account tab", 30000);
  await wait(t, `!!document.querySelector('[placeholder="Your name"]')`, "name field", 30000);
  await t.eval(setNative('[placeholder="Your name"]', "Bob"));
  await t.eval(setNative('[placeholder="Email"]', EMAIL));
  await t.eval(setNative('[placeholder="Password (8+ characters)"]', PASSWORD));
  await clicked(t, clickWhenSel('button.btn-gold'), "submit signup", 30000);
  const signedIn = await wait(t, `document.body.innerText.includes('Start a family household')`, "signed in", 90000);
  t.check("signed in", signedIn, EMAIL);

  // -- Join A's household via the invite code --
  await t.wait(3000);
  await wait(t, `!!document.querySelector('[placeholder="Have an invite code?"]')`, "code input", 30000);
  await t.eval(setNative('[placeholder="Have an invite code?"]', code));
  await clicked(t, clickWhenText("Join"), "join household", 30000);
  const joined = await wait(t, `document.body.innerText.includes('Our family · member')`, "joined household", 120000);
  t.check("joined household", joined);

  // Auto-sync now: B must have pulled A's Milo AND kept its own Nina.
  await t.wait(4000);
  const kids = await t.evalAsync(readChildren);
  const names = kids.map((k) => k.name).sort();
  t.check("B has both children", names.includes("Milo") && names.includes("Nina"), JSON.stringify(names));

  await t.shot("device-b-joined.png");
};