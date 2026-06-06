-- Migration: 012_support_goals.sql
-- FEATURE: Dynamic Support Plan & Goals System

CREATE TABLE IF NOT EXISTS public.tenant_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    area TEXT NOT NULL, -- e.g., 'Achieve Economic Wellbeing (AEW)'
    sub_category TEXT NOT NULL, -- e.g., 'Accessing benefits'
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    review_date TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 months')
);

CREATE TABLE IF NOT EXISTS public.tenant_goal_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES public.tenant_goals(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    entered_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tenant_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_goal_updates ENABLE ROW LEVEL SECURITY;

-- Policies for tenant_goals
CREATE POLICY "Staff can view goals"
    ON public.tenant_goals FOR SELECT
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('manager', 'support_worker')
    );

CREATE POLICY "Staff can insert goals"
    ON public.tenant_goals FOR INSERT
    WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('manager', 'support_worker')
    );

CREATE POLICY "Staff can update goals"
    ON public.tenant_goals FOR UPDATE
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('manager', 'support_worker')
    );

-- Policies for tenant_goal_updates
CREATE POLICY "Staff can view goal updates"
    ON public.tenant_goal_updates FOR SELECT
    USING (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('manager', 'support_worker')
    );

CREATE POLICY "Staff can insert goal updates"
    ON public.tenant_goal_updates FOR INSERT
    WITH CHECK (
        (SELECT role FROM public.users WHERE id = auth.uid()) IN ('manager', 'support_worker')
    );
