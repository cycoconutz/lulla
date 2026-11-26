// Full account deletion: Lulla data first, then the Neon Auth user through the
// Neon Management API. No imports, so it can be unit tested without a database.

type Result = { rows: unknown[]; rowCount?: number | null };
type Query = (sql: string, params?: unknown[]) => Promise<Result>;

export type AccountDb = {
  query: Query;
  connect: () => Promise<{ query: Query; release: () => void }>;
};

export type NeonAdmin = { apiKey: string; projectId: string; branchId: string };

export type DeletionResult =
  | { status: 200; body: { ok: true; authUserDeleted: true } }
  | { status: 502; body: { error: string; dataDeleted: true } }
  | { status: 503; body: { error: string; dataDeleted: false } };

const API_TIMEOUT_MS = 10_000;

export function neonAdminFrom(env: Record<string, string | undefined>): NeonAdmin | null {
  const apiKey = env.LULLA_NEON_API_KEY;
  const projectId = env.LULLA_NEON_PROJECT_ID;
  const branchId = env.LULLA_NEON_BRANCH_ID;
  return apiKey && projectId && branchId ? { apiKey, projectId, branchId } : null;
}

export async function authUserExists(db: Pick<AccountDb, "query">, userId: string): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM neon_auth."user" WHERE id = $1', [userId]);
  return rows.length > 0;
}

// Serialises account deletion against requests that create rows for the same
// user. Take it inside a transaction; false means the account is already gone.
export async function lockActiveUser(client: { query: Query }, userId: string): Promise<boolean> {
  await lockUser(client, userId);
  return authUserExists(client, userId);
}

async function lockUser(client: { query: Query }, userId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
}

// Deletes owned households (with their members, invites and records), the
// caller's memberships and the invites they created, and clears their id from
// invites they redeemed. Entries they added to someone else's household stay:
// they are that family's shared history. Safe to run more than once.
async function deleteAppData(db: AccountDb, userId: string): Promise<void> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await lockUser(client, userId);
    const ownedIds = (
      await client.query("SELECT id FROM lulla.households WHERE owner_user_id = $1", [userId])
    ).rows.map((r) => (r as { id: string }).id);
    if (ownedIds.length > 0) {
      await client.query("DELETE FROM lulla.sync_records WHERE household_id = ANY($1)", [ownedIds]);
      await client.query("DELETE FROM lulla.invites WHERE household_id = ANY($1)", [ownedIds]);
      await client.query("DELETE FROM lulla.members WHERE household_id = ANY($1)", [ownedIds]);
    }
    await client.query("DELETE FROM lulla.households WHERE owner_user_id = $1", [userId]);
    await client.query("DELETE FROM lulla.members WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM lulla.invites WHERE created_by = $1", [userId]);
    await client.query("UPDATE lulla.invites SET used_by = NULL WHERE used_by = $1", [userId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// `userId` must come from a verified token, never from request input.
export async function deleteAccount(
  db: AccountDb,
  admin: NeonAdmin | null,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeletionResult> {
  // Refuse before touching data if the sign-in could not be deleted anyway.
  if (!admin) {
    return {
      status: 503,
      body: { error: "Account deletion is unavailable right now. Nothing was deleted.", dataDeleted: false },
    };
  }

  await deleteAppData(db, userId);

  if (await authUserExists(db, userId)) {
    const url =
      "https://console.neon.tech/api/v2/projects/" +
      `${encodeURIComponent(admin.projectId)}/branches/${encodeURIComponent(admin.branchId)}` +
      `/auth/users/${encodeURIComponent(userId)}`;
    try {
      const res = await fetchImpl(url, {
        method: "DELETE",
        headers: { authorization: `Bearer ${admin.apiKey}`, accept: "application/json" },
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      if (!res.ok) console.error(`auth user delete failed: HTTP ${res.status}`);
    } catch (err) {
      console.error(`auth user delete failed: ${err instanceof Error ? err.name : "unknown"}`);
    }
    // The database decides, not the HTTP status: a lost response may still have
    // deleted the user, and a success against the wrong branch has not.
    if (await authUserExists(db, userId)) {
      return {
        status: 502,
        body: {
          error: "Your family data was removed, but your sign-in account was not. Please try again.",
          dataDeleted: true,
        },
      };
    }
  }

  // Catch anything an in-flight request wrote while the account was being removed.
  await deleteAppData(db, userId);
  return { status: 200, body: { ok: true, authUserDeleted: true } };
}
