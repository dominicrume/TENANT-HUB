-- ============================================================
-- 053_property_address_backfill.sql — a property saved with only a name
-- ("72 Knowle Road" + postcode, the quick path) had address_line1 NULL, so
-- the quick-add tenancy failed with a bare "String must contain at least 5
-- character(s)" (tenant.address is derived from the property). From now the
-- API carries the name into address_line1; this backfills the rows already
-- there. Idempotent.
-- ============================================================
UPDATE public.properties SET address_line1 = name WHERE address_line1 IS NULL OR btrim(address_line1) = '';
