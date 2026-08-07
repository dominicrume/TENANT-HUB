// Only export the RLS-safe client and repositories.
// adminClient is an internal implementation detail and is deliberately NOT
// re-exported — H2 requires the service-role client stay inside packages/db.
// Callers needing elevated reads use a purpose-built module (e.g. notifications).
export { rlsClient } from "./client";
export * from "./repositories/tenant.repo";
export * from "./write-with-audit";
export * from "./worker";
export * from "./invite";
export * from "./notifications";
