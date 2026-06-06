-- ============================================================
-- 001_initial_schema.sql — Tenant Hub
-- Run in Supabase SQL Editor or via supabase db push
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Roles enum ───────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('manager', 'support_worker', 'tenant');
CREATE TYPE entry_method AS ENUM ('manual', 'ocr', 'voice');
CREATE TYPE brand AS ENUM ('mattys_place', 'ash_shahada', 'reliance');
CREATE TYPE audit_action AS ENUM ('CREATE','UPDATE','DELETE','VERIFY','SIGN','EXPORT','LOGIN');
CREATE TYPE stamp_status AS ENUM ('pending','processing','done','failed','dead_letter');

-- ── Profiles ─────────────────────────────────────────────────
CREATE TABLE profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name   TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'support_worker',
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tenants ──────────────────────────────────────────────────
CREATE TABLE tenants (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title                 TEXT CHECK (title IN ('Mr','Mrs','Ms','Miss','Dr')),
  full_name             TEXT NOT NULL,
  dob                   DATE,
  nino                  TEXT,
  nationality           TEXT,
  date_entry_uk         DATE,
  address               TEXT,
  postcode              TEXT,
  room_number           TEXT,
  moved_in              DATE,
  mobile                TEXT,
  email                 TEXT,
  languages             TEXT,
  benefit_type          TEXT,
  benefit_frequency     TEXT,
  benefit_amount        NUMERIC(10,2),
  nok_name              TEXT,
  nok_relationship      TEXT,
  nok_phone             TEXT,
  nok_address           TEXT,
  doctor                TEXT,
  probation_officer     TEXT,
  photo_url             TEXT,
  brand                 brand DEFAULT 'mattys_place',
  entry_method          entry_method DEFAULT 'manual',
  is_active             BOOLEAN DEFAULT TRUE,
  is_archived           BOOLEAN DEFAULT FALSE,
  blockchain_hash       TEXT,
  tenant_signature_hash TEXT,
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── Sessions ─────────────────────────────────────────────────
CREATE TABLE sessions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  session_type TEXT CHECK (session_type IN ('daily','weekly','monthly')) NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes        TEXT NOT NULL,
  entered_by   UUID REFERENCES profiles(id),
  entered_by_name TEXT,
  blockchain_hash TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── Service Charges ──────────────────────────────────────────
CREATE TABLE service_charges (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL,
  week_label  TEXT NOT NULL,
  due_date    DATE NOT NULL,
  amount      NUMERIC(10,2) NOT NULL DEFAULT 150.00,
  is_paid     BOOLEAN DEFAULT FALSE,
  paid_date   DATE,
  entered_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Audit Logs (append-only) ─────────────────────────────────
CREATE TABLE audit_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  action          audit_action NOT NULL,
  table_name      TEXT NOT NULL,
  record_id       UUID,
  user_id         UUID REFERENCES profiles(id),
  user_name       TEXT,
  user_role       TEXT,
  entry_method    TEXT,
  prev_hash       TEXT NOT NULL,
  blockchain_hash TEXT NOT NULL,
  record_snapshot JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs are append-only — no updates or deletes
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ── Intake Drafts (H5: server-side, never browser storage) ───
CREATE TABLE drafts (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by     UUID REFERENCES profiles(id) NOT NULL,
  machine_state  JSONB NOT NULL,   -- XState snapshot
  step           INTEGER NOT NULL DEFAULT 1,
  canonical_hash TEXT,
  expires_at     TIMESTAMPTZ DEFAULT NOW() + INTERVAL '48 hours',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Stamp Queue (H6: transactional outbox) ───────────────────
CREATE TABLE stamp_queue (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID REFERENCES tenants(id),
  audit_hash  TEXT NOT NULL,
  status      stamp_status DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  tx_hash     TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Intake checklists
CREATE TABLE intake_checklists (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id               UUID REFERENCES tenants(id) ON DELETE CASCADE NOT NULL UNIQUE,
  housing_benefit_claim   BOOLEAN DEFAULT FALSE,
  personal_details_form   BOOLEAN DEFAULT FALSE,
  missing_person_form     BOOLEAN DEFAULT FALSE,
  initial_assessment      BOOLEAN DEFAULT FALSE,
  service_charge_agreement BOOLEAN DEFAULT FALSE,
  confidentiality_form    BOOLEAN DEFAULT FALSE,
  risk_assessment         BOOLEAN DEFAULT FALSE,
  gp_registered           BOOLEAN DEFAULT FALSE,
  uc_claim_progressed     BOOLEAN DEFAULT FALSE,
  key_worker_assigned     BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Auto-update updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── Auto-create profile on signup ────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'support_worker')::user_role,
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
