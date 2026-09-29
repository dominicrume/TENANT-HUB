-- ============================================================
-- 042_contractor_trade_read.sql — a contractor can read their OWN trade row
-- (BUILD_PLAN C33, the contractor /jobs page)
--
-- Bug found while rebuilding /jobs: org_dispatch_read (migration 036) lets a
-- contractor see jobs "trade_id IN (SELECT id FROM trades WHERE profile_id =
-- current_app_user())" — but that subquery runs AS the contractor, and RLS on
-- trades (org_trades_all) requires is_staff(). So the subquery always came
-- back empty for a contractor, and the OR clause was always false: no
-- contractor could ever see a job dispatched to them. Silent — no error, the
-- job list was just always empty. This is the same shape of bug CLAUDE.md's
-- "Problem This Solves" section calls out (a list that quietly comes back
-- wrong), just found here instead of in the old prototype.
--
-- Fix: add one SELECT policy so a contractor can read their own trade row.
-- org_trades_all (staff, full org) is untouched — this only adds a second,
-- narrower way in for the trade's own contractor login. Additive; idempotent.
-- ============================================================

DROP POLICY IF EXISTS "own_trade_read" ON public.trades;
CREATE POLICY "own_trade_read" ON public.trades FOR SELECT
  USING (profile_id = public.current_app_user());

-- Same shape of gap, one table over: maintenance_tickets' own SELECT policy
-- (migration 032) only opens to is_staff() OR the reporting tenant — a
-- contractor embedding the ticket behind their dispatch_jobs row got `null`
-- back for it, RLS silently stripping the very description/room the job
-- list exists to show. A contractor may now also read a ticket that has a
-- job dispatched to their own trade.
DROP POLICY IF EXISTS "contractor_own_ticket_read" ON public.maintenance_tickets;
CREATE POLICY "contractor_own_ticket_read" ON public.maintenance_tickets FOR SELECT
  USING (id IN (
    SELECT dj.ticket_id FROM public.dispatch_jobs dj
    JOIN public.trades t ON t.id = dj.trade_id
    WHERE t.profile_id = public.current_app_user()
  ));

NOTIFY pgrst, 'reload schema';
