-- Migration: 011_deduplicate.sql
-- BUG-01: Prevents duplicate tenant record creation from React StrictMode / double clicks.

-- Postgres UNIQUE constraints automatically allow multiple NULLs.
-- We can just add the constraint directly.
ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_tenant_signature_hash_key UNIQUE (tenant_signature_hash);
