import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";

const DATABASE_URL = process.env.DATABASE_URL!;
const NEON_AUTH_JWKS_URL = process.env.NEON_AUTH_JWKS_URL!;
const NEON_AUTH_BASE_URL = process.env.NEON_AUTH_BASE_URL!;

const jwks = createRemoteJWKSet(new URL(NEON_AUTH_JWKS_URL));
const issuer = new URL(NEON_AUTH_BASE_URL).origin;

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
attachDatabasePool(pool);

const KINDS = new Set(["children", "events", "measurements", "medical", "parents"]);

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
const CODE_LENGTH = 8;

const randomCode = (): string => {
  const bytes = new Uint8Array(CODE_LENGTH);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * CODE_ALPHABET.length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b]).join("");
};

type Member = { household_id: string; role: string };

async function memberFor(userId: string): Promise<Member | null> {
  const { rows } = await pool.query(
    "SELECT household_id, role FROM lulla.members WHERE user_id = $1",
    [userId],
  );
  return (rows[0] as Member | undefined) ?? null;
}

const isIso = (s: unknown): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s));

const isRecordId = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(s);

const app = new Hono();

app.use("*", cors());

// Verify the bearer JWT; returns the user id or null.
async function bearerUserId(req: { header: (name: string) => string | undefined }): Promise<string | null> {
  const auth = req.header("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;
  try {
    const { payload } = await jwtVerify(auth.slice(7), jwks, { issuer });
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

// Create a household owned by the caller, becoming its first member.
app.post("/household", async (c) => {
  const userId = await bearerUserId(c.req);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  let body: { name?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
  if (!name) return c.json({ error: "invalid body: expected { name }" }, 400);

  const existing = await memberFor(userId);
  if (existing) return c.json({ error: "already in a household" }, 409);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO lulla.households (name, owner_user_id) VALUES ($1, $2) RETURNING id",
      [name, userId],
    );
    const householdId = rows[0].id as string;
    await client.query(
      "INSERT INTO lulla.members (user_id, household_id, role) VALUES ($1, $2, 'owner')",
      [userId, householdId],
    );
    let code = randomCode();
    for (;;) {
      const dupe = await client.query("SELECT 1 FROM lulla.invites WHERE code = $1", [code]);
      if (dupe.rowCount === 0) break;
      code = randomCode();
    }
    await client.query(
      "INSERT INTO lulla.invites (code, household_id, created_by) VALUES ($1, $2, $3)",
      [code, householdId, userId],
    );
    await client.query("COMMIT");
    return c.json({ householdId, inviteCode: code }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// Join a household with an invite code.
app.post("/household/join", async (c) => {
  const userId = await bearerUserId(c.req);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  let body: { code?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return c.json({ error: "invalid body: expected { code }" }, 400);

  const existing = await memberFor(userId);
  if (existing) return c.json({ error: "already in a household" }, 409);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT household_id FROM lulla.invites
       WHERE code = $1 AND revoked_at IS NULL AND used_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())`,
      [code],
    );
    const inv = rows[0] as { household_id: string } | undefined;
    if (!inv) {
      await client.query("ROLLBACK");
      return c.json({ error: "invalid or expired invite code" }, 404);
    }
    await client.query("INSERT INTO lulla.members (user_id, household_id, role) VALUES ($1, $2, 'member')", [userId, inv.household_id]);
    await client.query("UPDATE lulla.invites SET used_by = $1, used_at = now() WHERE code = $2", [userId, code]);
    await client.query("COMMIT");
    return c.json({ householdId: inv.household_id }, 201);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

// Household overview for the caller (if a member).
app.get("/household", async (c) => {
  const userId = await bearerUserId(c.req);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const member = await memberFor(userId);
  if (!member) return c.json({ error: "not a member" }, 403);

  const { rows: h } = await pool.query("SELECT id, name FROM lulla.households WHERE id = $1", [member.household_id]);
  const { rows: members } = await pool.query(
    `SELECT m.user_id, m.role, m.joined_at, m.last_pull_rev,
            (SELECT count(*) FROM lulla.sync_records r WHERE r.household_id = m.household_id AND NOT r.deleted) AS records
     FROM lulla.members m WHERE m.household_id = $1`,
    [member.household_id],
  );
  const { rows: invites } = await pool.query(
    `SELECT code, created_at, expires_at, used_at, revoked_at FROM lulla.invites
     WHERE household_id = $1 AND used_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC LIMIT 1`,
    [member.household_id],
  );
  return c.json({
    householdId: member.household_id,
    name: (h[0] as { name: string }).name,
    role: member.role,
    members,
    inviteCode: (invites[0] as { code: string } | undefined)?.code ?? null,
  });
});

// Generate a fresh invite code for the household (members may do this).
app.post("/invite", async (c) => {
  const userId = await bearerUserId(c.req);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const member = await memberFor(userId);
  if (!member) return c.json({ error: "not a member" }, 403);

  const code = randomCode();
  await pool.query(
    "INSERT INTO lulla.invites (code, household_id, created_by) VALUES ($1, $2, $3)",
    [code, member.household_id, userId],
  );
  return c.json({ code }, 201);
});

// Leave the household (owner cannot leave via this path).
app.delete("/household/membership", async (c) => {
  const userId = await bearerUserId(c.req);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const member = await memberFor(userId);
  if (!member) return c.json({ error: "not a member" }, 403);
  if (member.role === "owner") return c.json({ error: "owner cannot leave; delete the household instead" }, 400);
  await pool.query("DELETE FROM lulla.members WHERE user_id = $1", [userId]);
  return c.json({ ok: true });
});

// Owner deletes the household, cascade-removing members, invites, and records.
app.delete("/household", async (c) => {
  const userId = await bearerUserId(c.req);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const member = await memberFor(userId);
  if (!member) return c.json({ error: "not a member" }, 403);
  if (member.role !== "owner") return c.json({ error: "only the owner may delete the household" }, 403);
  await pool.query("DELETE FROM lulla.households WHERE id = $1", [member.household_id]);
  return c.json({ ok: true });
});

// Push local records and deletes. LWW by client `updatedAt` (ISO string):
// a stale version never bumps the row's rev, so a late re-push can't clobber
// a newer version another device already wrote.
app.post("/push", async (c) => {
  const userId = await bearerUserId(c.req);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const member = await memberFor(userId);
  if (!member) return c.json({ error: "not a member" }, 403);

  let body: { records?: unknown; deletes?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }
  if (!Array.isArray(body.records) || !Array.isArray(body.deletes)) {
    return c.json({ error: "invalid body: expected { records, deletes }" }, 400);
  }
  if (body.records.length + body.deletes.length > 2000) {
    return c.json({ error: "too many records in one push" }, 400);
  }

  const records: { id: string; kind: string; childId: string | null; data: unknown; updatedAt: string | null }[] = [];
  for (const r of body.records) {
    const rec = r as { id?: unknown; kind?: unknown; childId?: unknown; data?: unknown; updatedAt?: unknown };
    if (!isRecordId(rec.id) || typeof rec.kind !== "string" || !KINDS.has(rec.kind)) continue;
    if (rec.data === null || typeof rec.data !== "object") continue;
    if (rec.childId !== undefined && rec.childId !== null && !isRecordId(rec.childId)) continue;
    if (rec.updatedAt !== undefined && rec.updatedAt !== null && !isIso(rec.updatedAt)) continue;
    records.push({
      id: rec.id,
      kind: rec.kind,
      childId: rec.childId == null ? null : String(rec.childId),
      data: rec.data,
      updatedAt: isIso(rec.updatedAt) ? rec.updatedAt : null,
    });
  }
  const deletes: { id: string; updatedAt: string | null }[] = [];
  for (const d of body.deletes) {
    const del = d as { id?: unknown; updatedAt?: unknown };
    if (!isRecordId(del.id)) continue;
    deletes.push({ id: del.id, updatedAt: isIso(del.updatedAt) ? del.updatedAt : null });
  }

  let recordsApplied = 0;
  let deletesApplied = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const r of records) {
      const { rows } = await client.query(
        `SELECT data->>'updatedAt' AS ua, deleted FROM lulla.sync_records
         WHERE id = $1 AND household_id = $2`,
        [r.id, member.household_id],
      );
      const stored = rows[0] as { ua: string | null; deleted: boolean } | undefined;
      // Skip when the stored version is newer than what the client is pushing.
      if (stored && r.updatedAt && stored.ua && r.updatedAt < stored.ua) continue;
      const rev = await nextRev(client);
      if (!stored) {
        await client.query(
          `INSERT INTO lulla.sync_records (id, household_id, kind, child_id, data, deleted, rev)
           VALUES ($1, $2, $3, $4, $5::jsonb, false, $6)`,
          [r.id, member.household_id, r.kind, r.childId, JSON.stringify(r.data), rev],
        );
      } else {
        await client.query(
          `UPDATE lulla.sync_records
           SET kind = $2, child_id = $3, data = $4::jsonb, deleted = false, rev = $5
           WHERE id = $1 AND household_id = $6`,
          [r.id, r.kind, r.childId, JSON.stringify(r.data), rev, member.household_id],
        );
      }
      recordsApplied++;
    }

    for (const d of deletes) {
      const { rows } = await client.query(
        `SELECT data->>'updatedAt' AS ua, data->>'updated_at' AS ub, deleted FROM lulla.sync_records
         WHERE id = $1 AND household_id = $2`,
        [d.id, member.household_id],
      );
      const stored = rows[0] as { ua: string | null; ub: string | null; deleted: boolean } | undefined;
      if (stored?.deleted) continue; // already deleted, no rev churn
      const storedAt = stored?.ua ?? stored?.ub;
      if (stored && d.updatedAt && storedAt && d.updatedAt < storedAt) continue; // record edited after the delete
      const rev = await nextRev(client);
      if (!stored) {
        await client.query(
          `INSERT INTO lulla.sync_records (id, household_id, kind, child_id, data, deleted, rev)
           VALUES ($1, $2, 'unknown', NULL, NULL, true, $3)`,
          [d.id, member.household_id, rev],
        );
      } else {
        await client.query(
          `UPDATE lulla.sync_records SET data = NULL, deleted = true, rev = $2
           WHERE id = $1 AND household_id = $3`,
          [d.id, rev, member.household_id],
        );
      }
      deletesApplied++;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return c.json({ recordsApplied, deletesApplied });
});

// Pull changes newer than `after` (a server rev cursor).
app.get("/pull", async (c) => {
  const userId = await bearerUserId(c.req);
  if (!userId) return c.json({ error: "unauthorized" }, 401);
  const member = await memberFor(userId);
  if (!member) return c.json({ error: "not a member" }, 403);

  const raw = c.req.query("after") ?? "0";
  const after = /^\d+$/.test(raw) ? Number(raw) : 0;

  const { rows } = await pool.query(
    `SELECT id, kind, child_id, data, deleted, rev
     FROM lulla.sync_records
     WHERE household_id = $1 AND rev > $2
     ORDER BY rev ASC LIMIT 2000`,
    [member.household_id, after],
  );
  const changes = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    childId: r.child_id,
    data: r.data,
    deleted: r.deleted,
    rev: r.rev,
  }));
  const cursor = changes.length > 0 ? (changes[changes.length - 1].rev as number) : after;

  await pool.query(
    "UPDATE lulla.members SET last_pull_rev = GREATEST(COALESCE(last_pull_rev, 0), $2) WHERE user_id = $1",
    [userId, cursor],
  );
  // Prune tombstones every member has already pulled past (strictly less than
  // every member's cursor, so never a tombstone just handed to this client).
  await pool.query(
    `DELETE FROM lulla.sync_records
     WHERE household_id = $1 AND deleted AND rev < (
       SELECT min(COALESCE(last_pull_rev, 0)) FROM lulla.members WHERE household_id = $1
     )`,
    [member.household_id],
  );

  return c.json({ cursor, changes });
});

async function nextRev(client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: { nextval: string }[] }> }): Promise<string> {
  const { rows } = await client.query("SELECT nextval('lulla.sync_records_rev_seq') AS nextval");
  return rows[0].nextval as string;
}

export default app;