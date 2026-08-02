DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'housing_benefit_status_enum') THEN
        CREATE TYPE housing_benefit_status_enum AS ENUM ('active', 'in_progress', 'suspended');
    END IF;
END$$;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS housing_benefit_status housing_benefit_status_enum NOT NULL DEFAULT 'in_progress';
