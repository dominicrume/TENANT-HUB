-- Migration: 009_indexes.sql
-- PERF-03: Create CONCURRENTLY indexes for high-frequency filters

-- Tenants: filtering by active/archived is done on almost every query
CREATE INDEX IF NOT EXISTS idx_tenants_active_archived 
ON tenants(is_active, is_archived);

-- Profiles: frequently filtered by role
CREATE INDEX IF NOT EXISTS idx_profiles_role 
ON profiles(role);

-- Sessions: frequent active sessions lookup
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_active 
ON sessions(tenant_id) WHERE is_active = true;

-- Stamp Queue: worker polls this every 30 seconds
CREATE INDEX IF NOT EXISTS idx_stamp_queue_status 
ON stamp_queue(status);
