-- Migration: 025_add_admin_role.sql
-- FEATURE: Deep RBAC Hardening (Admin vs Manager)
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'admin';
