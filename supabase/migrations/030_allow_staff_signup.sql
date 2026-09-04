-- Migration 030: Allow Staff (Manager / Support Worker) signup flow & default org auto-provisioning
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
  v_role_meta TEXT;
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
    v_brand := COALESCE(NULLIF(NEW.raw_user_meta_data->>'brand', ''), 'mattys_place');
    v_role_meta := NEW.raw_user_meta_data->>'role';

    -- Check if metadata explicitly requests a staff role (manager / support_worker)
    IF v_role_meta IN ('manager', 'support_worker') THEN
      v_role := v_role_meta::public.user_role;
      v_full_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(v_email, '@', 1));

      -- Fetch existing org or auto-provision default org for brand
      SELECT id INTO v_org_id FROM public.organisations LIMIT 1;
      IF v_org_id IS NULL THEN
        INSERT INTO public.organisations (name) VALUES ('Matty''s Place Organisation') RETURNING id INTO v_org_id;
      END IF;
    ELSE
      -- Standard tenant self-service lookup
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

      v_role  := 'tenant'::public.user_role;
      v_full_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), v_full_name);
    END IF;
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
