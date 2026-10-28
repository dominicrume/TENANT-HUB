/**
 * Platform Owner — Subscriptions inbox (commit 100). Lists:
 *   · pending_subscriptions — paid, awaiting owner review/approval
 *   · org_subscriptions     — live, running
 *
 * The "Approve" button here just marks the pending row cleared; actual org +
 * invite creation stays a deliberate human step in the main Platform Console
 * (/platform) so the "manager-issued invite only" guard on page.tsx stays
 * intact. A later commit will replace this with a one-click approve that
 * creates the org, writes org_subscriptions, and sends the invite in one go.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Pending {
  id: string;
  stripe_session_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  customer_email: string;
  tier: string;
  amount_pence: number;
  currency: string;
  created_at: string;
}
interface Active {
  id: string;
  org_id: string;
  org_name: string | null;
  tier: string;
  status: string;
  stripe_subscription_id: string;
  current_period_end: string | null;
  created_at: string;
}

function money(pence: number, currency = "gbp") {
  const sign = currency.toLowerCase() === "gbp" ? "£" : currency.toUpperCase() + " ";
  return `${sign}${(pence / 100).toFixed(2)}`;
}

function ago(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.round(d / 60000); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);    if (h < 24) return `${h}h ago`;
  const dd = Math.round(h / 24);   if (dd < 30) return `${dd}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const TIER_LABEL: Record<string, string> = {
  starter: "Starter · £49/mo",
  professional: "Professional · £99/mo",
  enterprise: "Enterprise · £300/mo",
  unknown: "Unknown price",
};

export default function SubscriptionsInboxPage() {
  const router = useRouter();
  const [owner, setOwner] = useState<boolean | null>(null);
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [active, setActive] = useState<Active[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/platform/subscriptions", { cache: "no-store" });
      if (!r.ok) throw new Error("load failed");
      const b = await r.json();
      setPending(b.pending ?? []);
      setActive(b.active ?? []);
    } catch (err) {
      setNote({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  useEffect(() => {
    fetch("/api/platform/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const ok = Boolean(j?.isPlatformOwner);
        setOwner(ok);
        if (!ok) { router.replace("/dashboard"); return; }
        void load();
      })
      .catch(() => { setOwner(false); router.replace("/dashboard"); });
  }, [router, load]);

  async function mark(id: string, kind: "approved" | "rejected") {
    const reason = kind === "rejected" ? window.prompt("Why rejecting? (visible only in the pending table)") ?? "" : "";
    if (kind === "rejected" && !reason.trim()) return;
    setBusy(id);
    try {
      const r = await fetch(`/api/platform/subscriptions/${id}/mark-${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "rejected" ? { reason } : {}),
      });
      if (!r.ok) throw new Error("mark failed");
      setNote({ kind: "ok", text: `Marked ${kind}.` });
      await load();
    } catch (err) {
      setNote({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  if (owner === null) return null;

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-6">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Subscriptions</h1>
          <p className="mt-1 text-sm text-slate">Paid, awaiting your approval — then live, running.</p>
        </div>
        <Link href="/platform" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-navy hover:bg-navy/[0.03]">← Platform Console</Link>
      </header>

      {note && (
        <div className={`mb-4 rounded-lg px-3 py-2 text-sm ${note.kind === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>
          {note.text}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate">Pending ({pending?.length ?? 0})</h2>
        {pending === null ? (
          <div className="text-sm text-slate">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-6 text-sm text-slate">No new payments awaiting approval.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-cream/60 text-left text-xs font-bold uppercase tracking-wide text-slate">
                <tr>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Customer email</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Stripe</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="px-4 py-3 text-slate">{ago(p.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-navy">{p.customer_email}</td>
                    <td className="px-4 py-3">{TIER_LABEL[p.tier] ?? p.tier}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink">{money(p.amount_pence, p.currency)}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-2">
                      <div className="truncate" title={p.stripe_subscription_id ?? ""}>{p.stripe_subscription_id?.slice(0, 18) ?? "—"}…</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        disabled={busy === p.id}
                        onClick={() => mark(p.id, "approved")}
                        className="mr-2 rounded-md bg-amber px-3 py-1.5 text-xs font-bold text-navy hover:bg-amber-deep hover:text-cream disabled:opacity-50"
                      >
                        {busy === p.id ? "…" : "Approve"}
                      </button>
                      <button
                        disabled={busy === p.id}
                        onClick={() => mark(p.id, "rejected")}
                        className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-navy hover:bg-navy/[0.03] disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-line bg-cream/40 px-4 py-3 text-xs text-slate">
              Approving here only clears the row. Create the org + send the invite via <Link className="font-semibold text-navy underline" href="/platform">Platform Console</Link>, then come back here and click Approve.
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate">Active ({active?.length ?? 0})</h2>
        {active === null ? (
          <div className="text-sm text-slate">Loading…</div>
        ) : active.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-6 text-sm text-slate">No active subscriptions yet.</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-cream/60 text-left text-xs font-bold uppercase tracking-wide text-slate">
                <tr>
                  <th className="px-4 py-3">Organisation</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Renews</th>
                  <th className="px-4 py-3">Stripe sub</th>
                </tr>
              </thead>
              <tbody>
                {active.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="px-4 py-3 font-medium text-navy">{a.org_name ?? a.org_id}</td>
                    <td className="px-4 py-3">{TIER_LABEL[a.tier] ?? a.tier}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${
                        a.status === "active" ? "bg-emerald-100 text-emerald-800" :
                        a.status === "past_due" ? "bg-amber/20 text-amber-deep" :
                        a.status === "cancelled" ? "bg-red-100 text-red-800" :
                        "bg-slate-100 text-slate-800"
                      }`}>{a.status}</span>
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {a.current_period_end ? new Date(a.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-2">{a.stripe_subscription_id.slice(0, 18)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
