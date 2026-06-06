-- Sprint 4: Communications & Alerts

CREATE TABLE IF NOT EXISTS public.communications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sms', 'email')),
  recipient text NOT NULL,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.communications_log ENABLE ROW LEVEL SECURITY;

-- Allow org staff to view their logs
CREATE POLICY "Staff can view org communications"
ON public.communications_log FOR SELECT
TO authenticated
USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Staff can insert org communications"
ON public.communications_log FOR INSERT
TO authenticated
WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));
