/**
 * Tenant Repository — all DB operations for the tenants table.
 * Uses writeWithAudit for every mutation.
 * Reads use rlsClient (respects RLS).
 */
import { rlsClient } from "../client";
import { writeWithAudit } from "../write-with-audit";
import type { CanonicalTenant, TenantCreate, TenantPatch } from "@tenant-hub/validation";

interface ActorContext {
  user_id:   string;
  user_name: string;
  user_role: string;
}

export const TenantRepository = {
  async findAll(ctx: ActorContext) {
    const { data, error } = await rlsClient
      .from("tenants")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`TenantRepository.findAll: ${error.message}`);
    return (data ?? []) as CanonicalTenant[];
  },

  async findById(id: string) {
    const { data, error } = await rlsClient
      .from("tenants")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(`TenantRepository.findById: ${error.message}`);
    return data as CanonicalTenant;
  },

  async create(record: TenantCreate, ctx: ActorContext, prevHash?: string) {
    return writeWithAudit({
      table: "tenants",
      record: record as Record<string, unknown>,
      action: "CREATE",
      ...ctx,
      prev_hash: prevHash,
    });
  },

  async update(patch: TenantPatch, ctx: ActorContext, prevHash?: string) {
    return writeWithAudit({
      table: "tenants",
      record: patch as Record<string, unknown>,
      action: "UPDATE",
      ...ctx,
      prev_hash: prevHash,
    });
  },
};
