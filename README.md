# Tenant Hub
**The Enterprise HMO Management Platform**

Tenant Hub is a secure, multi-tenant SaaS application engineered to streamline housing association operations, case worker intake flows, and tenant data compliance. Built on a hardened, append-only architectural foundation, Tenant Hub delivers unmatched auditability and scale.

## Core Features
*   **Immutable Audit Log:** Every write operation is inextricably tied to a cryptographic hash in an append-only ledger (`write_with_audit` RPC).
*   **Enterprise Authentication & RBAC:** Fine-grained role-based access control mirrored strictly by Row Level Security (RLS) policies.
*   **SaaS Multi-tenancy:** Strict data isolation using `org_id` across all database operations.
*   **End-to-End Compliance:** Built-in GDPR Right-to-Erasure workflows and automated data anonymisation.
*   **Blockchain Verification:** Background worker process asynchronously anchors audit logs to a blockchain for immutable proof-of-state.

## Tech Stack
*   **Frontend & API:** Next.js 14 (App Router), React, Tailwind CSS
*   **Database & Auth:** Supabase (PostgreSQL), Supabase Auth
*   **State Management & Performance:** SWR, Vercel Edge caching
*   **Validation:** Zod
*   **Infrastructure:** Vercel (Web), Custom polling workers (Blockchain)
*   **Monorepo:** Turborepo, pnpm

## Commercial Model
Tenant Hub operates on a standard B2B SaaS subscription model:
-   **Starter:** Up to 100 active tenants.
-   **Professional:** Up to 500 active tenants, advanced analytics.
-   **Enterprise:** Unlimited tenants, priority SLA, custom SSO integrations.

Payments and subscriptions are securely managed via **Stripe**.

## Development
```bash
# Install dependencies
pnpm install

# Run the development server
pnpm dev

# Run tests
pnpm test
```

## Security & Compliance
This repository adheres to strict hardening rules. For complete details, see `docs/HARDENING.md`.
