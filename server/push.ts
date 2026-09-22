import { Hono } from "hono";
import type { HonoRequest } from "hono";
import { cors } from "hono/cors";
import { randomBytes, createHash } from "node:crypto";
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
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  const { endpoint, keys } = (body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || !endpoint || !keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
    return c.json({ error: "invalid body: expected {endpoint, keys:{p256dh,auth}}" }, 400);
  }
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
  let body: { items?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  const items = Array.isArray(body.items) ? body.items : [];
  const valid: { ruleKey: string; sendAt: string; title: string; body: string; data: unknown }[] = [];
  for (const it of items) {
    const r = it as { ruleKey?: unknown; sendAt?: unknown; title?: unknown; body?: unknown; data?: unknown };
    if (
      typeof r.ruleKey === "string" && typeof r.sendAt === "string" &&
      typeof r.title === "string" && typeof r.body === "string" &&
      !Number.isNaN(Date.parse(r.sendAt))
    ) {
      valid.push({ ruleKey: r.ruleKey, sendAt: new Date(r.sendAt).toISOString(), title: r.title, body: r.body, data: r.data ?? {} });
    }
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
  const parsed = await parseTriggerInvocation(c.req);
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