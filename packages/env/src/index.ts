/**
 * @tenant-hub/env
 * THE ONLY reader of process.env in the monorepo.
 * Fails fast at startup if required vars are missing.
 * Imported by packages/db and apps/* — never by packages/ui, audit, validation.
 */
import { z } from "zod";

// ── Server-side schema (never exposed to browser) ────────────────────────
// Every field below ends in .catch(...) rather than plain .optional()/
// .default(). Found live on Railway (DECISIONS D27 deploy): zod's
// safeParse() on an object schema is all-or-nothing — one malformed
// optional var (a stray pasted Supabase key, say) failed validation and
// took the ENTIRE server object down with it, including a perfectly valid
// DATABASE_URL, which silently broke login with no trace of why. .catch()
// makes each field fail independently: a bad value for one var can never
// erase an unrelated, valid one.
const serverSchema = z.object({
  // Required only by the legacy write_with_audit RPC fallback (packages/db,
  // removed at C43) and by apps/web's Supabase-client reads, which still run
  // through @supabase/ssr rather than packages/db. The worker needs neither
  // once DATABASE_URL is set — writeWithAudit's pg-transaction path never
  // touches adminClient — so these can no longer be blanket-required across
  // every runtime in the monorepo (DECISIONS D25).
  SUPABASE_URL:              z.string().url().optional().catch(undefined),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional().catch(undefined),
  // The one database connection (docs/PLATFORM_CONSOLIDATION.md step 1). Supabase's
  // transaction pooler URI today, Railway Postgres after step 5. Optional until then.
  DATABASE_URL:              z.string().url().optional().catch(undefined),
  // One of these powers the AI features. Both optional; the AI gateway picks a
  // provider at runtime (OpenAI preferred when present). See DECISIONS.md D3.
  RUNCRATE_API_KEY:          z.string().optional().catch(undefined),
  ANTHROPIC_API_KEY:         z.string().optional().catch(undefined),
  OPENAI_API_KEY:            z.string().optional().catch(undefined),
  POLYGON_RPC_URL:           z.string().url().optional().catch(undefined),
  STAMP_WALLET_PRIVATE_KEY:  z.string().optional().catch(undefined),
  NODE_ENV: z.enum(["development", "test", "production"]).catch("development"),
  // ── Agent runtime (docs/BUILD_PLAN.md C13/C14) ─────────────────────────
  LOG_LEVEL:          z.enum(["debug", "info", "warn", "error"]).catch("info"),
  WORKER_POLL_MS:     z.coerce.number().int().positive().catch(30_000),
  WORKER_MAX_RETRIES: z.coerce.number().int().positive().catch(3),
  APP_URL:            z.string().url().optional().catch(undefined),
  // Adapter modes: live | simulated. Declared here, badged on screen (H9). Only regulation is live by default.
  ADAPTER_MODE_REGULATION: z.enum(["live", "simulated"]).catch("live"),
  ADAPTER_MODE_NOTIFY:     z.enum(["live", "simulated"]).catch("simulated"),
  ADAPTER_MODE_BANK:       z.enum(["live", "simulated"]).catch("simulated"),
  ADAPTER_MODE_INSURANCE:  z.enum(["live", "simulated"]).catch("simulated"),
  ADAPTER_MODE_IDCHECK:    z.enum(["live", "simulated"]).catch("simulated"),
  ADAPTER_MODE_STT:        z.enum(["live", "simulated"]).catch("simulated"),
  // Live adapters switch on only when their credentials exist.
  RESEND_API_KEY:          z.string().optional().catch(undefined),
  NOTIFY_FROM:             z.string().optional().catch(undefined),
  TRUELAYER_ACCESS_TOKEN:  z.string().optional().catch(undefined),
  TRUELAYER_ACCOUNT_ID:    z.string().optional().catch(undefined),
  INSURANCE_QUOTE_URL:     z.string().url().optional().catch(undefined),
  INSURANCE_QUOTE_KEY:     z.string().optional().catch(undefined),
  // Right-to-rent / ID verification (Credas by default — see packages/adapters).
  CREDAS_BASE_URL:         z.string().url().optional().catch(undefined),
  CREDAS_API_KEY:          z.string().optional().catch(undefined),
  CREDAS_WEBHOOK_SECRET:   z.string().optional().catch(undefined),
});

// ── Client-safe schema (NEXT_PUBLIC_ prefix) ─────────────────────────────
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL:      z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_NAME:          z.string().default("Tenant Hub"),
  NEXT_PUBLIC_APP_VERSION:       z.string().default("1.0.0"),
});

// ── Parse and export ─────────────────────────────────────────────────────
function parseEnv() {
  const server = serverSchema.safeParse(process.env);
  const client = clientSchema.safeParse(process.env);

  const errors: string[] = [];
  if (!server.success) errors.push(...server.error.issues.map(i => `SERVER: ${i.path.join(".")} — ${i.message}`));
  if (!client.success) errors.push(...client.error.issues.map(i => `CLIENT: ${i.path.join(".")} — ${i.message}`));

  if (errors.length > 0) {
    if (process.env.SKIP_ENV_VALIDATION) {
      console.warn("⚠️ Skipping environment validation for CI build.");
    } else {
      console.error("❌ Environment validation failed:\n" + errors.map(e => `  • ${e}`).join("\n"));
      if (process.env["NODE_ENV"] === "production") process.exit(1);
    }
  }

  return {
    server: server.success ? server.data : ({} as z.infer<typeof serverSchema>),
    client: client.success ? client.data : ({} as z.infer<typeof clientSchema>),
  };
}

export const env = parseEnv();
export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;
