-- Migration: 016_add_tenant_hub_brand.sql
-- Add tenant_hub to brand enum

ALTER TYPE public.brand ADD VALUE IF NOT EXISTS 'tenant_hub';
