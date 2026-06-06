# Tenant Hub

Tenant Hub is an enterprise-grade SaaS application for HMO (House in Multiple Occupation) management.
It has been rigorously hardened to meet Apple/Stripe-level standards for security, reliability, and cryptographic data integrity.

## Architecture & Hardening
See `HARDENING_AUDIT.md` and `docs/HARDENING.md` for the H1-H8 principles.
This repository strictly isolates:
- **DB Layer**: Only `packages/db` may write to Supabase or hold the Service Role key.
- **Audit Layer**: Every write chains a SHA-256 hash.
- **Blockchain Layer**: An asynchronous worker commits the audit chain to Polygon.
- **AI Layer**: Deeply isolated from the database and acts as read-only or proposal-only.

## Setup
1. `pnpm install`
2. `supabase start`
3. `pnpm dev`
