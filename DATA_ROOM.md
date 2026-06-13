# Tenant Hub - Data Room

## 1. Architecture Overview
Tenant Hub uses a monorepo architecture (`pnpm` + `Turborepo`) separating the `apps/web` (Next.js App Router frontend) from `packages` (db, validation, audit, auth, ui) and `apps/worker` (Node.js background tasks).

## 2. Security & Compliance
- **Authentication**: Managed by Supabase Auth with Google OAuth integration.
- **Data Isolation**: Strict Multi-Tenant isolation using Row Level Security (RLS) policies based on `org_id`.
- **RBAC**: Role-Based Access Control mapped dynamically to Supabase Auth custom claims, backed by robust parity tests (`rbac.test.ts`).
- **Data Erasure**: Built-in GDPR Right-to-Erasure API (`/api/gdpr/erasure-request`).

## 3. Immutability
- **Audit Logs**: The database enforces an append-only architecture for the `audit_logs` table via triggers.
- **Audited Writes**: All CRUD operations go through the `write_with_audit` RPC, producing an immutable cryptographic trail.
- **Blockchain Anchoring**: Background worker asynchronously submits the Merkle root of the `audit_logs` hashes to a blockchain ledger.

## 4. Performance & Scalability
- **Caching**: Aggressive Vercel Edge caching and static generation for static assets.
- **Client Fetching**: React Server Components paired with `SWR` for real-time, responsive client components.
- **Database Indexing**: High-frequency filters (active sessions, profiles, stamp queue, tenants) are fully indexed for scale.

## 5. Commercial Viability
- Complete Stripe integration with Billing Portal for managing subscriptions across multiple tiers (Starter, Professional, Enterprise).
- Fully documented SaaS onboarding flows and automated organisation provisioning.
