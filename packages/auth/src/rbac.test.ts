import { describe, it, expect } from "vitest";
import { can, PERMISSIONS } from "./rbac";

describe("RBAC matrix", () => {
  it("manager can do everything on tenants", () => {
    expect(can("manager", "tenants", "read")).toBe(true);
    expect(can("manager", "tenants", "delete")).toBe(true);
    expect(can("manager", "audit_logs", "read")).toBe(true);
  });

  it("support_worker cannot delete tenants", () => {
    expect(can("support_worker", "tenants", "delete")).toBe(false);
  });

  it("tenant can only read own record", () => {
    expect(can("tenant", "tenants", "read")).toBe(true);
    expect(can("tenant", "tenants", "create")).toBe(false);
    expect(can("tenant", "audit_logs", "read")).toBe(false);
  });

  it("no role can read audit_logs except manager", () => {
    expect(can("support_worker", "audit_logs", "read")).toBe(false);
    expect(can("tenant", "audit_logs", "read")).toBe(false);
    expect(can("manager", "audit_logs", "read")).toBe(true);
  });
});
