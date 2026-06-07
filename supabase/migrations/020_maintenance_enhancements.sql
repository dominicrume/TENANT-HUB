-- Migration: 020_maintenance_enhancements.sql
-- FEATURE: Maintenance & Ticketing Enhancements

ALTER TABLE public.maintenance_tickets 
ADD COLUMN assigned_to UUID REFERENCES public.profiles(id),
ADD COLUMN photo_url TEXT;

-- Configure Supabase Storage Bucket for Maintenance Photos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('maintenance-photos', 'maintenance-photos', true) 
ON CONFLICT (id) DO NOTHING;

-- Bucket Security Policies
-- Anyone logged in can view maintenance photos
CREATE POLICY "Staff can view maintenance photos bucket" ON storage.objects FOR SELECT USING (
    bucket_id = 'maintenance-photos' AND
    (auth.uid() IN (SELECT id FROM public.profiles))
);

-- Anyone logged in can upload maintenance photos
CREATE POLICY "Staff can upload maintenance photos bucket" ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'maintenance-photos' AND
    (auth.uid() IN (SELECT id FROM public.profiles))
);
