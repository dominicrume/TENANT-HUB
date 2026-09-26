/**
 * The one database driver (CON step 1, docs/PLATFORM_CONSOLIDATION.md).
 *
 * `pg` is importable ONLY inside packages/db (lint + architecture test). Every
 * read and write in the monorepo goes through a DbClient from this file, so the
 * host can move from the Supabase pooler to Railway Postgres by changing
 * DATABASE_URL and nothing else.
 *
 * The client is an interface so tests can run the identical SQL on an
 * in-process Postgres (pglite) without a server.
 */
import { Pool, type PoolClient } from "pg";
import { env } from "@tenant-hub/env";

export interface QueryResult<T> { rows: T[]; rowCount: number | null }
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}
export interface DbClient extends Queryable {
  /** Runs fn inside BEGIN/COMMIT; any throw rolls back and rethrows. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}

/** Statement timeout for every connection: a stuck query never holds the request. */
export const STATEMENT_TIMEOUT_MS = 30_000;
export const POOL_MAX = 10;

/* ── pg adapter ──────────────────────────────────────────────────────────── */
export function createPgClient(pool: Pool): DbClient {
  const wrap = (c: Pool | PoolClient): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) {
      const r = await c.query(sql, params as unknown[] | undefined);
      return { rows: r.rows as T[], rowCount: r.rowCount };
    },
  });
  return {
    ...wrap(pool),
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(wrap(client));
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    end: () => pool.end(),
  };
}

export function createPool(connectionString: string): Pool {
  const local = /localhost|127\.0\.0\.1/.test(connectionString);
  return new Pool({
    connectionString,
    max: POOL_MAX,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
}

/* ── Process-wide default client ─────────────────────────────────────────── */
let _db: DbClient | null = null;

/** True when DATABASE_URL is configured (the pg path is live). */
export const hasDatabaseUrl = () => Boolean(env.server.DATABASE_URL);

/** The default client. Throws a clear error when DATABASE_URL is missing. */
export function db(): DbClient {
  if (_db) return _db;
  const url = env.server.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. packages/db needs the Postgres connection string " +
      "(Supabase → Settings → Database → transaction pooler URI) to run the pg path.",
    );
  }
  _db = createPgClient(createPool(url));
  return _db;
}

/** Test seam: swap the default client (e.g. for pglite). Returns the previous one. */
export function _setDbClientForTests(client: DbClient | null): DbClient | null {
  const prev = _db; _db = client; return prev;
}

export async function closePool() { if (_db) { await _db.end(); _db = null; } }

/* ── Org scoping (CON step 2 reads this setting in every RLS policy) ─────── */
export interface RequestScope { orgId: string; userId?: string; role?: string; tenantId?: string }

/** Run fn in a transaction with the request settings applied for its duration. */
export async function withScope<T>(client: DbClient, scope: RequestScope, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  return client.transaction(async (tx) => {
    await tx.query("SELECT set_config('app.current_org', $1, true)", [scope.orgId]);
    if (scope.userId) await tx.query("SELECT set_config('app.current_user', $1, true)", [scope.userId]);
    if (scope.role) await tx.query("SELECT set_config('app.current_role', $1, true)", [scope.role]);
    if (scope.tenantId) await tx.query("SELECT set_config('app.current_tenant', $1, true)", [scope.tenantId]);
    return fn(tx);
  });
}
