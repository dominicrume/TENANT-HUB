/**
 * Test-only DbClient over pglite: a real Postgres running in-process, so the
 * SQL in packages/db is exercised for real without a server.
 */
import { PGlite } from "@electric-sql/pglite";
import type { DbClient, Queryable } from "../src/pool";

export async function createPgliteClient(): Promise<DbClient & { raw: PGlite }> {
  const pg = new PGlite();
  await pg.waitReady;
  const wrap = (q: { query: PGlite["query"] }): Queryable => ({
    async query<T>(sql: string, params?: unknown[]) {
      const r = await q.query<T>(sql, params as unknown[] | undefined);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  });
  return {
    ...wrap(pg),
    transaction: <T>(fn: (tx: Queryable) => Promise<T>) => pg.transaction((tx) => fn(wrap(tx))),
    end: () => pg.close(),
    raw: pg,
  };
}
