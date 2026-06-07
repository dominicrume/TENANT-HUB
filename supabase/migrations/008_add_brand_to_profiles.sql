-- Migration: Add 'brand' to profiles and update handle_new_user trigger
-- This ensures each staff member belongs to a specific tenant workspace.

ALTER TABLE profiles ADD COLUMN brand TEXT NOT NULL DEFAULT 'mattys_place';

-- Recreate the trigger function to capture brand from user metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role, email, brand)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'support_worker')::public.user_role,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'brand', 'mattys_place')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
