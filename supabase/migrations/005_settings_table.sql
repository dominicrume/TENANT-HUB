-- ============================================================
-- 005_settings_table.sql
-- Creates the settings table for brand configurations
-- ============================================================

CREATE TABLE settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  brand brand NOT NULL UNIQUE,
  service_charge_default NUMERIC(10,2) NOT NULL DEFAULT 150.00,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Insert default rows for each brand
INSERT INTO settings (brand, service_charge_default) VALUES
  ('mattys_place', 150.00),
  ('ash_shahada', 150.00),
  ('reliance', 150.00)
ON CONFLICT (brand) DO NOTHING;
