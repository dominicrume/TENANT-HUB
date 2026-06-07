-- Migration: 018_auto_provision_org.sql
-- PURPOSE: Auto-create an organisation when a user signs up.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_org_id UUID;
  user_full_name TEXT;
BEGIN
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User');
  
  -- 1. Create a dedicated isolated organisation for this user
  INSERT INTO public.organisations (name)
  VALUES (user_full_name || '''s Workspace')
  RETURNING id INTO new_org_id;

  -- 2. Seed default form templates for this new organisation
  -- This ensures the user has Risk Assessment, Needs Assessment etc. ready to go
  PERFORM public.seed_default_form_templates(new_org_id);

  -- 3. Create the user profile linked to the new organisation
  INSERT INTO public.profiles (id, full_name, role, email, org_id)
  VALUES (
    NEW.id,
    user_full_name,
    COALESCE(NEW.raw_user_meta_data->>'role', 'manager')::user_role,
    NEW.email,
    new_org_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
