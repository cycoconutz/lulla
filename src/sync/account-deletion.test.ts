import { describe, expect, it, vi } from 'vitest'
import { deleteAccount, neonAdminFrom, type AccountDb } from '../../server/account'

const admin = { apiKey: 'test-key', projectId: 'proj', branchId: 'br' }

/** Fake database: `exists` answers each successive "does the user exist?" check. */
function fakeDb(exists: boolean[], failOn?: string) {
  const log: string[] = []
  const query = async (sql: string) => {
    log.push(sql)
    if (failOn && sql.startsWith(failOn)) throw new Error('db down')
    if (sql.includes('neon_auth')) return { rows: exists.shift() ? [{}] : [] }
    if (sql.startsWith('SELECT id FROM lulla.households')) return { rows: [{ id: 'house-1' }] }
    return { rows: [] }
  }
  const release = vi.fn()
  const db: AccountDb = { query, connect: async () => ({ query, release }) }
  const commits = () => log.filter((s) => s === 'COMMIT').length
  return { db, log, commits, release }
}

const http = (status: number) => vi.fn(async () => new Response(null, { status }))

describe('deleteAccount (server)', () => {
  it('deletes nothing when the admin key is not configured', async () => {
    const f = fakeDb([])
    const fetchSpy = http(204)

    const res = await deleteAccount(f.db, null, 'user-1', fetchSpy)

    expect(res.status).toBe(503)
    expect(f.log).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('deletes data, then the auth user, then sweeps the data again', async () => {
    const f = fakeDb([true, false])
    const fetchSpy = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      expect(f.commits()).toBe(1)
      return new Response(null, { status: 204 })
    })

    const res = await deleteAccount(f.db, admin, 'user-1', fetchSpy)

    expect(res).toEqual({ status: 200, body: { ok: true, authUserDeleted: true } })
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      'https://console.neon.tech/api/v2/projects/proj/branches/br/auth/users/user-1',
    )
    expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe('DELETE')
    expect(f.commits()).toBe(2)
    expect(f.release).toHaveBeenCalledTimes(2)
  })

  it.each([204, 404, 401, 500])('reports failure if the user still exists after HTTP %i', async (status) => {
    const f = fakeDb([true, true])

    const res = await deleteAccount(f.db, admin, 'user-1', http(status))

    expect(res.status).toBe(502)
    expect(res.body).toMatchObject({ dataDeleted: true })
    expect(f.commits()).toBe(1)
  })

  it('succeeds when the response is lost but the user is gone', async () => {
    const f = fakeDb([true, false])

    const res = await deleteAccount(f.db, admin, 'user-1', vi.fn(async () => Promise.reject(new Error('timeout'))))

    expect(res.status).toBe(200)
  })

  it('is safe to retry once the user is already gone', async () => {
    const f = fakeDb([false])
    const fetchSpy = http(204)

    const res = await deleteAccount(f.db, admin, 'user-1', fetchSpy)

    expect(res.status).toBe(200)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rolls back and keeps the auth user if the data delete fails', async () => {
    const f = fakeDb([], 'DELETE FROM lulla.members')
    const fetchSpy = http(204)

    await expect(deleteAccount(f.db, admin, 'user-1', fetchSpy)).rejects.toThrow('db down')

    expect(f.log).toContain('ROLLBACK')
    expect(f.release).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('needs all three settings', () => {
    const env = { LULLA_NEON_API_KEY: 'k', LULLA_NEON_PROJECT_ID: 'p', LULLA_NEON_BRANCH_ID: 'b' }
    expect(neonAdminFrom(env)).toEqual({ apiKey: 'k', projectId: 'p', branchId: 'b' })
    for (const key of Object.keys(env)) expect(neonAdminFrom({ ...env, [key]: '' })).toBeNull()
  })
})
