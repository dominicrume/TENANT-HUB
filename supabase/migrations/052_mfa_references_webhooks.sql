-- ============================================================
-- 052_mfa_references_webhooks.sql — the "what they have that we don't" set
-- (Rume, 2026-10-09): MFA, tenant referencing, a landlord upload link, and
-- outbound webhooks (the mechanism behind Apex27's "97 integrations" —
-- Zapier/n8n/Integrately all hang off exactly this). Additive; idempotent.
-- ============================================================

-- MFA (TOTP, RFC 6238). Secret stays pending until the person proves they
-- can produce a code; recovery codes are stored hashed, one use each.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_secret           TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_pending_secret   TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_enabled_at       TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS totp_recovery_hashes  TEXT[] NOT NULL DEFAULT '{}';

-- Password accepted, code not yet given: a short-lived, hashed, one-shot
-- challenge — same token/hash pattern as sessions, so no new secret to keep.
CREATE TABLE IF NOT EXISTS public.mfa_challenges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant referencing: a referee (previous landlord, employer, support
-- worker, character) is emailed a one-shot link and answers without an
-- account. Sits beside tenant_id_checks (049) to make "referencing" whole.
CREATE TABLE IF NOT EXISTS public.tenant_references (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('previous_landlord','employer','support_worker','character')),
  referee_name  TEXT NOT NULL,
  referee_email TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','received','declined')),
  decision      TEXT CHECK (decision IN ('positive','negative','unable')),
  response      TEXT,
  notified_at   TIMESTAMPTZ,
  responded_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  requested_by  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenant_references_tenant ON public.tenant_references (tenant_id, created_at DESC);

-- Landlord upload link: the request email now carries a one-shot link the
-- landlord uses to attach the file themselves — no account, no "email it
-- back and we'll file it".
ALTER TABLE public.property_documents ADD COLUMN IF NOT EXISTS upload_token_hash       TEXT UNIQUE;
ALTER TABLE public.property_documents ADD COLUMN IF NOT EXISTS upload_token_expires_at TIMESTAMPTZ;

-- Outbound webhooks: per organisation, a URL + secret + the events it wants.
-- Every delivery is recorded, success or not — an integration that silently
-- stopped is the H9 failure mode in another coat.
CREATE TABLE IF NOT EXISTS public.org_webhooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  secret      TEXT NOT NULL,
  events      TEXT[] NOT NULL DEFAULT '{}',   -- empty = every event
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  label       TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_webhooks_org ON public.org_webhooks (org_id) WHERE active;

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID NOT NULL REFERENCES public.org_webhooks(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  status_code   INT,
  ok            BOOLEAN NOT NULL DEFAULT FALSE,
  error         TEXT,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_hook ON public.webhook_deliveries (webhook_id, attempted_at DESC);

NOTIFY pgrst, 'reload schema';
