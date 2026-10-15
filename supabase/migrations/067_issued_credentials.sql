-- 067: passwords are issued, not chosen (Matloob, 2026-10-15). The admin
-- creates the account with a system-generated password, hands it over with
-- the sign-in link, and keeps a copy in the vault — encrypted at rest with a
-- key that lives only in the platform's secret store (CREDENTIAL_VAULT_KEY),
-- never in the database. Staff cannot change the password; the admin can
-- issue a new one, which supersedes the old row.
CREATE TABLE IF NOT EXISTS public.issued_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_by_name TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_revealed_at TIMESTAMPTZ,
  reveal_count INTEGER NOT NULL DEFAULT 0,
  superseded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS issued_credentials_profile_idx ON public.issued_credentials(profile_id, superseded_at);
