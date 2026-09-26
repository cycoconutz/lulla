#!/usr/bin/env node
"use strict";
/*
 * cdp-run.js <url> <assertions.cjs>
 *   [--timeout-ms N]  overall limit (default 90000)
 *   [--settle-ms N]   extra wait after load (default 1800)
 *   [--width N] [--height N]   viewport (default 1280x900)
 *   [--chrome PATH]    override Chrome binary (or set CHROME_PATH)
 *   [--host-resolver-rules RULES]  pass --host-resolver-rules to Chrome (e.g. "MAP host 1.2.3.4")
 *
 * assertions.cjs:
 *   module.exports = async (t) => {
 *     t.check("title", (await t.eval("document.title")) === "Ledger");
 *     await t.click("#btn-bubbly");
 *     await t.shot("bubbly.png");
 *   };
 *
 * t API: eval, click, set, text, wait, reload, shot, check.
 * Exits 0 if all checks pass and no console exceptions, else 1.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function findChrome() {
  const candidates = [];
  if (process.env.CHROME_PATH) candidates.push(process.env.CHROME_PATH);
  const pw = path.join(os.homedir(), "AppData/Local/ms-playwright");
  if (fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw)) {
      const p = path.join(pw, d, "chrome-win64/chrome.exe");
      if (fs.existsSync(p)) candidates.push(p);
    }
  }
  candidates.push(
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium"
  );
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("Chrome not found; set CHROME_PATH or pass --chrome");
}

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(name);
  return i === -1 ? def : args[i + 1];
};
const URL = args[0];
const SPEC = args[1];
if (!URL || !SPEC || !fs.existsSync(SPEC)) {
  console.error("usage: node cdp-run.js <url> <assertions.cjs> [--timeout-ms N] [--settle-ms N] [--width W] [--height H] [--chrome PATH]");
  process.exit(1);
}

const PORT = 9400 + Math.floor(Math.random() * 500);
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), "cdp-"));
const CHROME = flag("--chrome", process.env.CHROME_PATH || "");
// Browser-side equivalent of curl --resolve. Needed when the local resolver cannot
// answer for the target host but public DNS can, e.g.
//   --host-resolver-rules "MAP lulla.dev 185.199.108.153"
// Omitted entirely when unset, so ordinary runs are unchanged. TLS still validates
// the real cert for the hostname, so scope/mixed-content checks stay meaningful.
const HOST_RESOLVER_RULES = flag("--host-resolver-rules", "");
const chromeBin = CHROME || findChrome();
const chrome = spawn(chromeBin, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--disable-extensions",
  ...(HOST_RESOLVER_RULES ? [`--host-resolver-rules=${HOST_RESOLVER_RULES}`] : []),
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJson = async (u) => { const r = await fetch(u); return r.json(); };

async function connect() {
  let list = [];
  for (let i = 0; i < 60; i++) {
    try { list = await getJson(`http://127.0.0.1:${PORT}/json`); if (list.length) break; } catch {}
    await sleep(200);
  }
  if (!list.length) throw new Error("CDP target not available");
  const target = list.find((t) => t.type === "page") || list[0];
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0;
  const pending = new Map();
  const events = new Map();
  const exceptions = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) {
      if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params.exceptionDetails.text || "exception");
      const set = events.get(m.method);
      if (set) { for (const r of set) r(m); set.clear(); }
    }
  };
  const send = (method, params = {}) => new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const once = (method, ms) => new Promise((res) => {
    const set = events.get(method) || new Set();
    set.add(res);
    events.set(method, set);
    setTimeout(() => { set.delete(res); res(undefined); }, ms);
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: Number(flag("--width", 1280)),
    height: Number(flag("--height", 900)),
    deviceScaleFactor: 1,
    mobile: false,
  });
  return { send, once, exceptions, ws };
}

async function main() {
  const overall = Number(flag("--timeout-ms", 90000));
  const settleMs = Number(flag("--settle-ms", 1800));
  const timer = setTimeout(() => { console.error("TIMEOUT after " + overall + "ms"); process.exit(2); }, overall);
  const cleanup = (ws) => { try { if (ws) ws.close(); } catch {} try { chrome.kill(); } catch {} try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {} };
  let conn;
  try {
    conn = await connect();
    const { send, once, exceptions, ws } = conn;
    const evaluate = async (expr, awaitPromise = false) => {
      const m = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise });
      if (m.result && m.result.exceptionDetails) {
        const d = m.result.exceptionDetails;
        throw new Error((d.exception && d.exception.description) || d.text);
      }
      return m.result && m.result.result ? m.result.result.value : undefined;
    };
    const runs = [];
    let failed = false;
    const raw = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
    const t = {
      eval: evaluate,
      evalAsync: async (expr) => evaluate(expr, true),
      click: async (sel, waitMs = 250) => { await evaluate(raw(sel) + ".click()"); await sleep(waitMs); },
      realClick: async (sel, waitMs = 400) => {
        const pos = await evaluate(`(() => { const el = ${raw(sel)}; const r = el.getBoundingClientRect();
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
        await sleep(waitMs);
      },
      set: async (sel, value) => {
        await evaluate(`(() => { const el = ${raw(sel)}; el.value = ${JSON.stringify(value)};
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true })); })()`);
      },
      text: async (sel) => evaluate(raw(sel) + ".textContent"),
      wait: (ms) => sleep(ms),
      reload: async () => { await send("Page.reload", { ignoreCache: true }); await once("Page.loadEventFired", 15000); await sleep(settleMs); },
      shot: async (file) => {
        const r = await send("Page.captureScreenshot", { format: "png" });
        if (r.result && r.result.data) fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
      },
      check: (name, ok, extra) => {
        runs.push({ name, ok, extra: extra || "" });
        if (!ok) failed = true;
      },
    };

    await send("Page.navigate", { url: URL });
    await once("Page.loadEventFired", 20000);
    await sleep(settleMs);

    const spec = require(path.resolve(SPEC));
    await spec(t);

    for (const r of runs) console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.extra ? " \u2014 " + r.extra : ""}`);
    if (exceptions.length) {
      failed = true;
      for (const e of exceptions) console.error("EXC " + e);
    }
    clearTimeout(timer);
    cleanup(ws);
    process.exit(failed ? 1 : 0);
  } catch (e) {
    clearTimeout(timer);
    console.error("ERR " + e.message);
    cleanup(conn && conn.ws);
    process.exit(1);
  }
}
main();