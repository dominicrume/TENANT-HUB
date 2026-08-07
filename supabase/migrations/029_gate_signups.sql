-- ============================================================
-- 029_gate_signups.sql
-- SECURITY: closes self-service privilege escalation at the trigger.
--
-- BEFORE: handle_new_user() trusted raw_user_meta_data->>'role' and
-- ->>'tenant_id'. Both are attacker-controlled on a self-service signup
-- (POST /auth/v1/signup with the public anon key), which allowed:
--   * arbitrary role assignment, e.g. data:{role:"manager"}
--   * cross-org access, by passing a known tenants.id as tenant_id —
--     the old function copied that tenant's org_id onto the new profile
--   * unbounded organisation creation by anonymous users
--
-- AFTER — access is granted by pre-provisioned identity only:
--   PATH A  an unconsumed, unexpired row in public.pending_invites whose
--           email matches. Only the service-role key can create these
--           (RLS denies all client writes), so the role and org come from
--           a manager's deliberate action.
--   PATH B  self-service signup (password OR Google OAuth) where the email
--           matches exactly one active tenants row. Becomes role 'tenant',
--           bound to that tenant and its organisation.
--   ELSE    rejected. No self-service organisation creation, ever.
--
-- WHY NOT auth.users.invited_at:
-- An earlier draft of this migration keyed PATH A off NEW.invited_at.
-- That is wrong. GoTrue inserts the user via signupNewUser() and only
-- then sets invited_at in a separate tx.UpdateOnly(u, ..., "invited_at")
-- call. This trigger is AFTER INSERT, so invited_at is still NULL when it
-- runs and every staff invite would have been rejected. pending_invites
-- is written by our own code BEFORE the auth user is created, so it is
-- visible to the trigger and does not depend on GoTrue internals.
--
-- NOTE: this trigger fires on INSERT into auth.users only, so existing
-- accounts are unaffected. See the bootstrap block at the foot of this
-- file for creating the first manager of a brand-new organisation.
-- ============================================================

-- ── Pre-provisioned invites ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  role        public.user_role NOT NULL,
  org_id      UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name   TEXT,
  brand       TEXT NOT NULL DEFAULT 'mattys_place',
  invited_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '14 days',
  consumed_at TIMESTAMPTZ
);

-- At most one live invite per email address.
CREATE UNIQUE INDEX IF NOT EXISTS pending_invites_email_live_idx
  ON public.pending_invites (lower(email))
  WHERE consumed_at IS NULL;

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- No INSERT/UPDATE/DELETE policy exists on purpose: only the service-role
-- key (which bypasses RLS) may create invites. Managers get read-only
-- visibility of their own organisation's outstanding invites.
DROP POLICY IF EXISTS "org_invites_select" ON public.pending_invites;
CREATE POLICY "org_invites_select"
  ON public.pending_invites FOR SELECT
  USING (
    org_id = public.get_my_org_id()
    AND public.get_my_role() IN ('manager', 'admin')
  );

-- ── Gated user provisioning ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email     TEXT;
  v_full_name TEXT;
  v_brand     TEXT;
  v_role      public.user_role;
  v_org_id    UUID;
  v_tenant_id UUID;
  v_invite    public.pending_invites%ROWTYPE;
  v_matches   INT;
BEGIN
  v_email := lower(trim(NEW.email));

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Account creation requires an email address.';
  END IF;

  -- ── PATH A: a manager pre-provisioned this person ──
  SELECT * INTO v_invite
  FROM public.pending_invites pi
  WHERE lower(pi.email) = v_email
    AND pi.consumed_at IS NULL
    AND pi.expires_at > now()
  ORDER BY pi.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_role      := v_invite.role;
    v_org_id    := v_invite.org_id;
    v_tenant_id := v_invite.tenant_id;
    v_brand     := v_invite.brand;
    v_full_name := COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(v_invite.full_name, ''),
      split_part(v_email, '@', 1)
    );

    IF v_role = 'tenant'::public.user_role THEN
      IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant invite for % is missing tenant_id.', v_email;
      END IF;
      SELECT t.org_id INTO v_org_id FROM public.tenants t WHERE t.id = v_tenant_id;
      IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Tenant invite for % references an unknown tenant.', v_email;
      END IF;
    ELSE
      IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'Staff invite for % is missing org_id.', v_email;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.organisations o WHERE o.id = v_org_id) THEN
        RAISE EXCEPTION 'Staff invite for % references an unknown organisation.', v_email;
      END IF;
    END IF;

    UPDATE public.pending_invites
       SET consumed_at = now()
     WHERE id = v_invite.id;

  -- ── PATH B: self-service — password signup or Google OAuth ──
  ELSE
    SELECT count(*) INTO v_matches
    FROM public.tenants t
    WHERE lower(t.email) = v_email
      AND COALESCE(t.is_archived, FALSE) = FALSE;

    IF v_matches = 0 THEN
      RAISE EXCEPTION
        'This email address is not recognised. Ask your housing manager to add you before signing in.';
    ELSIF v_matches > 1 THEN
      RAISE EXCEPTION
        'Email % matches more than one tenant record. Contact your housing manager.', v_email;
    END IF;

    SELECT t.id, t.org_id, COALESCE(NULLIF(t.full_name, ''), split_part(v_email, '@', 1))
      INTO v_tenant_id, v_org_id, v_full_name
    FROM public.tenants t
    WHERE lower(t.email) = v_email
      AND COALESCE(t.is_archived, FALSE) = FALSE;

    -- Self-service can never be anything but a tenant.
    v_role  := 'tenant'::public.user_role;
    v_brand := COALESCE(NULLIF(NEW.raw_user_meta_data->>'brand', ''), 'mattys_place');

    -- Prefer the display name the identity provider gave us, if any.
    v_full_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), v_full_name);
  END IF;

  INSERT INTO public.profiles (id, full_name, role, email, org_id, tenant_id, brand)
  VALUES (NEW.id, v_full_name, v_role, NEW.email, v_org_id, v_tenant_id, v_brand)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role      = EXCLUDED.role,
        org_id    = EXCLUDED.org_id,
        tenant_id = EXCLUDED.tenant_id;

  RETURN NEW;
END;
$$;

-- Re-attach the trigger (idempotent).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- PATH B runs on every ungated signup attempt, so keep the lookup indexed.
CREATE INDEX IF NOT EXISTS tenants_email_lower_idx
  ON public.tenants (lower(email))
  WHERE is_archived = FALSE;

-- ============================================================
-- BOOTSTRAP — creating the first manager of a NEW organisation.
--
-- Self-service manager signup is deliberately impossible now. To stand up
-- a new organisation, create the org, pre-provision the invite, and THEN
-- send it with the service-role key (never from the browser):
--
--   INSERT INTO public.organisations (name) VALUES ('Ash Shahada Housing')
--     RETURNING id;
--   INSERT INTO public.pending_invites (email, role, org_id, full_name)
--     VALUES ('manager@example.com', 'manager', '<the id above>', 'General Matlub');
--   -- then, server-side: supabase.auth.admin.inviteUserByEmail(email)
--
-- Promoting an account that already exists (e.g. one created before this
-- migration) is a plain UPDATE:
--   UPDATE public.profiles
--      SET role = 'manager', org_id = '<org id>'
--    WHERE email = 'someone@example.com';
-- ============================================================
