-- 069: Stripe-driven subscription funnel (Rume, 2026-10-28). Commit 100 ships a
-- pay-first-then-review funnel: a new user clicks a pricing tier → Stripe
-- Payment Link collects email + card and starts a subscription → the webhook
-- lands a row here in pending_subscriptions. We never auto-create an org from
-- an anonymous payment (apps/web/src/app/page.tsx carries the standing guard:
-- "No self-serve account creation, anywhere" — this preserves it: the only way
-- into Tenant Hub stays a manager-issued invite). The platform owner reviews
-- the pending row, approves it, which creates the org + sends the existing
-- /invite/[token]; the approved row is then linked to the live org via the
-- org_subscriptions row that records the active plan.

CREATE TABLE IF NOT EXISTS public.pending_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Idempotency anchor: Stripe may replay checkout.session.completed on retry;
  -- a UNIQUE on the session id means the second one no-ops cleanly.
  stripe_session_id      TEXT NOT NULL UNIQUE,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  customer_email         TEXT NOT NULL,
  tier                   TEXT NOT NULL CHECK (tier IN ('starter','professional','enterprise','unknown')),
  amount_pence           INTEGER NOT NULL,
  currency               TEXT NOT NULL DEFAULT 'gbp',
  status                 TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','rejected')),
  org_id                 UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  approved_at            TIMESTAMPTZ,
  approved_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at            TIMESTAMPTZ,
  rejected_reason        TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_subscriptions_status_idx
  ON public.pending_subscriptions (status, created_at DESC);

-- The live subscription on an org. One row per org (the UNIQUE on org_id). The
-- stripe_subscription_id is also UNIQUE so a mis-approval can't double-link.
CREATE TABLE IF NOT EXISTS public.org_subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL UNIQUE REFERENCES public.organisations(id) ON DELETE CASCADE,
  stripe_customer_id     TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  tier                   TEXT NOT NULL CHECK (tier IN ('starter','professional','enterprise')),
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','past_due','cancelled','paused')),
  current_period_end     TIMESTAMPTZ,
  cancel_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_subscriptions_status_idx
  ON public.org_subscriptions (status, current_period_end);
