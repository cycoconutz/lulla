import { Hono } from "hono";
import type { Context, HonoRequest } from "hono";
import { cors } from "hono/cors";
import { randomBytes, createHash } from "node:crypto";
import { isIP } from "node:net";
import { Pool } from "pg";
import webpush from "web-push";
import { attachDatabasePool } from "@neon/functions";
import { parseTriggerInvocation } from "@neon/functions/triggers";

const DATABASE_URL = process.env.DATABASE_URL!;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
attachDatabasePool(pool);

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

const MAX_BODY_BYTES = 64 * 1024;
// A full schedule is 400 items, each allowed up to a 4096-char data field.
// Leave generous headroom (including multibyte text) so a server-valid batch
// can never be rejected for size. The item-count cap is the real bound.
const MAX_SCHEDULE_BODY_BYTES = 8 * 1024 * 1024;

async function parseJsonBody<T>(c: Context, maxBytes: number): Promise<{ ok: true; value: T } | { ok: false; status: 400 | 413 }> {
  const declared = Number(c.req.header("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 };
  // Read through the stream rather than buffering via c.req.text(): a chunked
  // request has no content-length, and must still be bounded at maxBytes.
  const stream = c.req.raw.body;
  if (!stream) return { ok: false, status: 400 };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // stream already closed
        }
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as T };
  } catch {
    return { ok: false, status: 400 };
  }
}

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_KEYS = 5000;
const rateHits = new Map<string, number[]>();

// Best-effort per-isolate sliding window. Neon Functions run across multiple
// isolates, so a distributed caller can exceed these; the database caps in
// /schedule are the real backstop. Returns true when the caller is over quota.
function rateLimited(key: string, limit: number): boolean {
  const now = Date.now();
  const cutoff = now - RATE_WINDOW_MS;
  const hits = (rateHits.get(key) ?? []).filter((t) => t > cutoff);
  const over = hits.length >= limit;
  // Do not record a hit once over quota, or retries keep extending the lockout.
  if (!over) hits.push(now);
  rateHits.set(key, hits);
  if (rateHits.size > RATE_MAX_KEYS) {
    // Hard-evict oldest keys. A flood of unique keys makes every key look
    // active, so sweeping only expired keys would let the map grow forever.
    let excess = rateHits.size - RATE_MAX_KEYS;
    for (const k of rateHits.keys()) {
      if (excess <= 0) break;
      rateHits.delete(k);
      excess--;
    }
  }
  return over;
}

function clientIp(req: HonoRequest): string {
  // Trust the rightmost forwarded hop (added by the outermost platform proxy).
  // The leftmost value is caller-controlled, and an unvalidated string can be
  // randomised per request to dodge the cap. Invalid values share the
  // "unknown" bucket.
  const forwarded = req.header("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((s) => s.trim());
    for (let i = hops.length - 1; i >= 0; i--) {
      if (isIP(hops[i])) return hops[i];
    }
  }
  const real = req.header("x-real-ip")?.trim();
  if (real && isIP(real)) return real;
  return "unknown";
}

// Literal-IP blocking only. A hostname that resolves to a private address
// (DNS rebinding) cannot be caught here, but web-push makes the connection
// from Neon's egress, not this function, so the exposure is limited.
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const version = isIP(host);
  if (version === 4) {
    const [a, b, c] = host.split(".").map(Number);
    return (
      a === 0 ||                                  // 0.0.0.0/8
      a === 10 ||                                 // 10/8
      a === 127 ||                                // 127/8
      (a === 100 && b >= 64 && b <= 127) ||       // 100.64/10 CGNAT
      (a === 169 && b === 254) ||                 // 169.254/16 link-local
      (a === 172 && b >= 16 && b <= 31) ||        // 172.16/12
      (a === 192 && b === 0 && c === 0) ||        // 192.0.0/24
      (a === 192 && b === 0 && c === 2) ||        // 192.0.2/24 TEST-NET-1
      (a === 192 && b === 168) ||                 // 192.168/16
      (a === 198 && (b === 18 || b === 19)) ||    // 198.18/15 benchmarking
      (a === 198 && b === 51 && c === 100) ||     // 198.51.100/24 TEST-NET-2
      (a === 203 && b === 0 && c === 113) ||      // 203.0.113/24 TEST-NET-3
      a >= 224                                    // multicast + reserved
    );
  }
  if (version === 6) {
    if (host === "::" || host === "::1") return true;
    if (/^f[cd]/.test(host)) return true; // unique local fc00::/7
    if (/^fe[89ab]/.test(host)) return true; // link-local fe80::/10
    if (/^ff/.test(host)) return true; // multicast ff00::/8
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
    return mapped ? isBlockedHost(mapped[1]) : false;
  }
  return false;
}

type Device = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function deviceForRequest(req: HonoRequest): Promise<Device | null> {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { rows } = await pool.query(
    "SELECT id, endpoint, p256dh, auth FROM lulla.push_devices WHERE secret_hash = $1",
    [sha256(token)],
  );
  return (rows[0] as Device | undefined) ?? null;
}

const app = new Hono();

app.use("*", cors());

app.get("/vapid-key", (c) => c.json({ publicKey: VAPID_PUBLIC_KEY }));

app.post("/register", async (c) => {
  const parsed = await parseJsonBody<{ endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }>(c, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return c.json({ error: parsed.status === 413 ? "body too large" : "invalid json" }, parsed.status);
  }
  const { endpoint, keys } = (parsed.value ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (
    typeof endpoint !== "string" || !endpoint || endpoint.length > 2048 ||
    !keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string" ||
    keys.p256dh.length < 1 || keys.p256dh.length > 256 ||
    keys.auth.length < 1 || keys.auth.length > 128
  ) {
    return c.json({ error: "invalid body: expected {endpoint, keys:{p256dh,auth}}" }, 400);
  }
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    return c.json({ error: "invalid endpoint" }, 400);
  }
  if (endpointUrl.protocol !== "https:") return c.json({ error: "endpoint must be https" }, 400);
  if (endpointUrl.username || endpointUrl.password || isBlockedHost(endpointUrl.hostname)) {
    return c.json({ error: "invalid endpoint" }, 400);
  }
  const endpointOver = rateLimited(`endpoint:${sha256(endpoint)}`, 3);
  const ipOver = rateLimited(`ip:${clientIp(c.req)}`, 10);
  if (endpointOver || ipOver) return c.json({ error: "too many registrations" }, 429);
  const secret = randomBytes(24).toString("base64url");
  const { rows } = await pool.query(
    `INSERT INTO lulla.push_devices (endpoint, p256dh, auth, secret_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, secret_hash = EXCLUDED.secret_hash, updated_at = now()
     RETURNING id`,
    [endpoint, keys.p256dh, keys.auth, sha256(secret)],
  );
  return c.json({ deviceId: rows[0].id, secret }, 201);
});

app.post("/schedule", async (c) => {
  const device = await deviceForRequest(c.req);
  if (!device) return c.json({ error: "unauthorized" }, 401);
  const parsed = await parseJsonBody<{ items?: unknown }>(c, MAX_SCHEDULE_BODY_BYTES);
  if (!parsed.ok) {
    return c.json({ error: parsed.status === 413 ? "body too large" : "invalid json" }, parsed.status);
  }
  const body = parsed.value ?? {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length > 400) return c.json({ error: "too many schedule items" }, 400);
  const now = Date.now();
  const minSendAt = now - 60 * 1000;
  const maxSendAt = now + 60 * 24 * 60 * 60 * 1000;
  const valid: { ruleKey: string; sendAt: string; title: string; body: string; data: unknown }[] = [];
  // Skip malformed items rather than rejecting the whole batch: a single
  // over-long child name or rule label must not silently drop all reminders.
  for (const it of items) {
    const r = it as { ruleKey?: unknown; sendAt?: unknown; title?: unknown; body?: unknown; data?: unknown };
    if (
      typeof r.ruleKey !== "string" || r.ruleKey.length < 1 || r.ruleKey.length > 80 ||
      typeof r.title !== "string" || r.title.length < 1 || r.title.length > 120 ||
      typeof r.body !== "string" || r.body.length < 1 || r.body.length > 240 ||
      typeof r.sendAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(r.sendAt) ||
      Number.isNaN(Date.parse(r.sendAt))
    ) {
      continue;
    }
    const sendAtMs = Date.parse(r.sendAt);
    if (sendAtMs < minSendAt || sendAtMs > maxSendAt) continue;
    const data = r.data ?? {};
    let dataJson: string;
    try {
      dataJson = JSON.stringify(data);
    } catch {
      continue;
    }
    if (typeof dataJson !== "string" || dataJson.length > 4096) continue;
    valid.push({ ruleKey: r.ruleKey, sendAt: new Date(sendAtMs).toISOString(), title: r.title, body: r.body, data });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise concurrent schedule writes for this device so two requests
    // cannot both pass the pending-row cap and duplicate queued reminders.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [device.id]);
    const { rows: countRows } = await client.query(
      "SELECT count(*)::int AS count FROM lulla.push_queue WHERE device_id = $1 AND status = 'pending'",
      [device.id],
    );
    const pending = Number((countRows[0] as { count: number }).count ?? 0);
    if (pending + valid.length > 1000) {
      await client.query("ROLLBACK");
      return c.json({ error: "too many pending notifications" }, 429);
    }
    await client.query("DELETE FROM lulla.push_queue WHERE device_id = $1 AND status = 'pending'", [device.id]);
    for (const it of valid) {
      await client.query(
        `INSERT INTO lulla.push_queue (device_id, rule_key, send_at, title, body, data)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [device.id, it.ruleKey, it.sendAt, it.title, it.body, JSON.stringify(it.data)],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return c.json({ accepted: valid.length });
});

app.post("/unregister", async (c) => {
  const device = await deviceForRequest(c.req);
  if (!device) return c.json({ error: "unauthorized" }, 401);
  await pool.query("DELETE FROM lulla.push_devices WHERE id = $1", [device.id]);
  return c.json({ ok: true });
});

app.post("/dispatch", async (c) => {
  let parsed: Awaited<ReturnType<typeof parseTriggerInvocation>>;
  try {
    parsed = await parseTriggerInvocation(c.req.raw as unknown as Request);
  } catch {
    parsed = await parseTriggerInvocation(c.req as unknown as Request);
  }
  if (!parsed.ok) {
    return c.json({ error: parsed.error }, parsed.error === "invalid_body" ? 400 : 401);
  }
  const { rows } = await pool.query(
    `SELECT q.id, q.title, q.body, q.data, d.endpoint, d.p256dh, d.auth
     FROM lulla.push_queue q
     JOIN lulla.push_devices d ON d.id = q.device_id
     WHERE q.status = 'pending' AND q.send_at <= now()
     LIMIT 100`,
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows as {
    id: number; title: string; body: string; data: unknown;
    endpoint: string; p256dh: string; auth: string;
  }[]) {
    const subscription = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({ title: row.title, body: row.body, data: row.data }),
        { TTL: 15 * 60 },
      );
      await pool.query("UPDATE lulla.push_queue SET status = 'sent' WHERE id = $1", [row.id]);
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await pool.query("DELETE FROM lulla.push_devices WHERE endpoint = $1", [row.endpoint]);
        failed++;
      } else {
        await pool.query(
          `UPDATE lulla.push_queue SET status = 'failed', data = COALESCE(data, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
          [JSON.stringify({ sendError: statusCode != null ? String(statusCode) : (err as Error).message }), row.id],
        );
        failed++;
      }
    }
  }
  return c.json({ due: rows.length, sent, failed, scheduledAt: parsed.data.scheduledAt });
});

export default app;