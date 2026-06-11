-- ============================================================
-- 022_tenant_portal.sql
-- Links a tenant Auth user profile to their actual tenants record.
-- ============================================================

-- 1. Add tenant_id to profiles (if it doesn't exist)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

-- 2. Allow tenants to update their own profile
DROP POLICY IF EXISTS "tenant_update_own_profile" ON public.profiles;
CREATE POLICY "tenant_update_own_profile"
  ON public.profiles FOR UPDATE USING (id = auth.uid());

-- 3. Fix the existing profiles that have null org_id.
-- For each existing profile that has org_id IS NULL:
-- Create a new organisation (e.g. "User's Workspace"), seed default templates, and update the profile.
DO $$
DECLARE
  r RECORD;
  new_org_id UUID;
BEGIN
  FOR r IN SELECT id, full_name FROM public.profiles WHERE org_id IS NULL LOOP
    -- Create organization
    INSERT INTO public.organisations (name)
    VALUES (COALESCE(r.full_name, 'New User') || '''s Workspace')
    RETURNING id INTO new_org_id;
    
    -- Seed default templates
    PERFORM public.seed_default_form_templates(new_org_id);
    
    -- Link profile
    UPDATE public.profiles
    SET org_id = new_org_id
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- 4. Re-define handle_new_user trigger function with full qualification and correct search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  user_full_name TEXT;
  user_role public.user_role;
  user_tenant_id UUID;
BEGIN
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'support_worker')::public.user_role;
  user_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::UUID;

  IF user_role = 'tenant'::public.user_role AND user_tenant_id IS NOT NULL THEN
    -- Get org_id from the tenant
    SELECT org_id INTO new_org_id FROM public.tenants WHERE id = user_tenant_id;
  ELSE
    -- Create a new organisation
    INSERT INTO public.organisations (name)
    VALUES (user_full_name || '''s Workspace')
    RETURNING id INTO new_org_id;

    -- Seed default templates
    PERFORM public.seed_default_form_templates(new_org_id);
  END IF;

  -- Create the profile
  INSERT INTO public.profiles (id, full_name, role, email, org_id, tenant_id)
  VALUES (
    NEW.id,
    user_full_name,
    user_role,
    NEW.email,
    new_org_id,
    user_tenant_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
