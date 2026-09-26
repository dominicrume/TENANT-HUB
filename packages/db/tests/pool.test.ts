import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createPgliteClient } from "./pglite";
import { withScope, createPgClient, createPool, type DbClient } from "../src/pool";

describe("DbClient over an in-process Postgres", () => {
  let db: DbClient;
  beforeAll(async () => { db = await createPgliteClient(); });
  afterAll(async () => { await db.end(); });

  it("round-trips a query", async () => {
    const r = await db.query<{ two: number }>("SELECT 1 + 1 AS two");
    expect(r.rows[0]?.two).toBe(2);
  });

  it("commits a transaction and rolls back on throw", async () => {
    await db.query("CREATE TABLE t (id serial primary key, v text)");
    await db.transaction(async (tx) => { await tx.query("INSERT INTO t (v) VALUES ($1)", ["kept"]); });
    await expect(db.transaction(async (tx) => {
      await tx.query("INSERT INTO t (v) VALUES ($1)", ["lost"]);
      throw new Error("boom");
    })).rejects.toThrow("boom");
    const r = await db.query<{ v: string }>("SELECT v FROM t ORDER BY id");
    expect(r.rows.map((x) => x.v)).toEqual(["kept"]);
  });

  it("withScope sets the request settings for the transaction only", async () => {
    const seen = await withScope(db, { orgId: "org-1", userId: "user-1", role: "manager" }, async (tx) => {
      const r = await tx.query<{ org: string; usr: string; role: string }>(
        "SELECT current_setting('app.current_org', true) org, current_setting('app.current_user', true) usr, current_setting('app.current_role', true) role");
      return r.rows[0];
    });
    expect(seen).toEqual({ org: "org-1", usr: "user-1", role: "manager" });
    const after = await db.query<{ org: string | null }>("SELECT current_setting('app.current_org', true) org");
    expect(after.rows[0]?.org ?? "").toBe("");
  });
});

// The same checks against the real database, when a connection string is present.
const url = process.env.DATABASE_URL;
describe.skipIf(!url)("DbClient over DATABASE_URL", () => {
  it("round-trips a query through the pooler", async () => {
    const db = createPgClient(createPool(url!));
    try {
      const r = await db.query<{ ok: number }>("SELECT 1 AS ok");
      expect(r.rows[0]?.ok).toBe(1);
    } finally { await db.end(); }
  });
});
