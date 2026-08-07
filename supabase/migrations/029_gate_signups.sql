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
--   PATH A  invited users (auth.users.invited_at IS NOT NULL, which only
--           the service-role admin API can set) keep their invited role
--           and org. Staff arrive this way.
--   PATH B  self-service signups (password OR Google OAuth) are admitted
--           only when the email matches exactly one active tenants row.
--           They become role 'tenant', bound to that tenant and its org.
--   ELSE    rejected. No self-service organisation creation, ever.
--
-- NOTE: this trigger fires on INSERT into auth.users only, so existing
-- accounts are unaffected. See the bootstrap block at the foot of this
-- file for creating the first manager of a brand-new organisation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email       TEXT;
  v_full_name   TEXT;
  v_brand       TEXT;
  v_role        public.user_role;
  v_org_id      UUID;
  v_tenant_id   UUID;
  v_matches     INT;
BEGIN
  v_email := lower(trim(NEW.email));

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Account creation requires an email address.';
  END IF;

  v_brand := COALESCE(NULLIF(NEW.raw_user_meta_data->>'brand', ''), 'mattys_place');

  -- ── PATH A: invited by a manager (service-role admin API only) ──
  IF NEW.invited_at IS NOT NULL THEN
    v_full_name := COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      split_part(v_email, '@', 1)
    );
    v_role      := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'support_worker')::public.user_role;
    v_org_id    := NULLIF(NEW.raw_user_meta_data->>'org_id', '')::UUID;
    v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::UUID;

    IF v_role = 'tenant'::public.user_role THEN
      IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant invite for % is missing tenant_id.', v_email;
      END IF;

      SELECT t.org_id INTO v_org_id
      FROM public.tenants t
      WHERE t.id = v_tenant_id;

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
    v_role := 'tenant'::public.user_role;

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

-- Match tenants by email quickly and case-insensitively (PATH B runs on
-- every signup attempt, so keep it indexed).
CREATE INDEX IF NOT EXISTS tenants_email_lower_idx
  ON public.tenants (lower(email))
  WHERE is_archived = FALSE;

-- ============================================================
-- BOOTSTRAP — creating the first manager of a NEW organisation.
--
-- Self-service manager signup is deliberately impossible now. To stand up
-- a new organisation, create the org and invite the manager with the
-- service-role key (never from the browser):
--
--   INSERT INTO public.organisations (name) VALUES ('Ash Shahada Housing')
--     RETURNING id;
--   -- then, server-side, using the service-role admin API:
--   -- supabase.auth.admin.inviteUserByEmail(email, {
--   --   data: { role: 'manager', org_id: '<the id above>', full_name: '...' }
--   -- })
--
-- Promoting an account that already exists (e.g. one created before this
-- migration) is a plain UPDATE:
--   UPDATE public.profiles
--      SET role = 'manager', org_id = '<org id>'
--    WHERE email = 'someone@example.com';
-- ============================================================
