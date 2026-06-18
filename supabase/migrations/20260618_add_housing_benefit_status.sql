CREATE TYPE housing_benefit_status_enum AS ENUM ('active', 'in_progress', 'suspended');
ALTER TABLE tenants ADD COLUMN housing_benefit_status housing_benefit_status_enum NOT NULL DEFAULT 'in_progress';
