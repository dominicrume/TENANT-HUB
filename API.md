# API Documentation

This document outlines the core API routes for Tenant Hub. All API routes require authenticated sessions and enforce strict Role-Based Access Control (RBAC).

## Core Data APIs

### Tenants
- **`GET /api/tenants`**: Fetch all active, non-archived tenants belonging to the user's organisation.
- **`POST /api/tenants`**: Create a new tenant. Input validated via `TenantCreateSchema`.
- **`GET /api/tenants/:id`**: Fetch a specific tenant.
- **`PATCH /api/tenants/:id`**: Update a tenant. Input validated via `TenantPatchSchema`. Empty strings are explicitly converted to `null` to clear fields.
- **`DELETE /api/tenants/:id`**: Soft-delete a tenant (sets `is_archived = true`).

### Support Plan Goals
- **`GET /api/tenants/:id/goals`**: Fetch all goals (and nested updates) for a given tenant.
- **`POST /api/tenants/:id/goals`**: Create a new goal for a tenant. Requires `area` and `sub_category`.
- **`POST /api/goals/:goalId/updates`**: Append a new staff interaction, comment, or completed step to an existing goal. Requires `comment` string.

### Audit Logs
- **`GET /api/audit-logs`**: Fetch the append-only audit trail.
  - Query Params: `limit`, `action` (e.g., `CREATE`, `UPDATE`), `tenant`, `user`.

## Intake Pipeline APIs

- **`GET /api/drafts/:id`**: Fetch the current state of an intake draft.
- **`PATCH /api/drafts/:id`**: Update the machine state or step of an intake draft.
- **`POST /api/intake/ocr`**: Send image or raw text to the Gemini multimodal AI for structured field extraction.
- **`POST /api/intake/commit`**: Finalise an intake draft. Asserts the H4 cryptographic binding between the tenant signature and the reviewed data payload, then writes the tenant to the database.

## Database Write Path: `writeWithAudit`

To guarantee data integrity, *no direct inserts or updates* are made using the standard Supabase client for core models. Instead, the backend uses `writeWithAudit`, which invokes a Postgres RPC function to:
1. Validate the previous hash chain.
2. Insert the data payload.
3. Compute and insert a cryptographic audit log.
4. Enqueue the hash for global blockchain verification via the background worker.
