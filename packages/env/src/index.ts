/**
 * @tenant-hub/env
 * THE ONLY reader of process.env in the monorepo.
 * Fails fast at startup if required vars are missing.
 * Imported by packages/db and apps/* — never by packages/ui, audit, validation.
 */
import { z } from "zod";

// ── Server-side schema (never exposed to browser) ────────────────────────
const serverSchema = z.object({
  SUPABASE_URL:              z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // One of these powers the AI features. Both optional; the AI gateway picks a
  // provider at runtime (OpenAI preferred when present). See DECISIONS.md D3.
  RUNCRATE_API_KEY:          z.string().optional(),
  ANTHROPIC_API_KEY:         z.string().optional(),
  OPENAI_API_KEY:            z.string().optional(),
  POLYGON_RPC_URL:           z.string().url().optional(),
  STAMP_WALLET_PRIVATE_KEY:  z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
    console.error("❌ Environment validation failed:\n" + errors.map(e => `  • ${e}`).join("\n"));
    if (process.env["NODE_ENV"] === "production") process.exit(1);
  }

  return {
    server: server.success ? server.data : ({} as z.infer<typeof serverSchema>),
    client: client.success ? client.data : ({} as z.infer<typeof clientSchema>),
  };
}

export const env = parseEnv();
export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;
