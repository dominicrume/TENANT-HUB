/**
 * Dashboard — greeting, 4-stat strip, recent audit trail, quick actions, and
 * recent tenants. Active-tenant stats + recent tenants both come from
 * useTenants() (single source of truth, H8). Stats whose APIs land in later
 * sprints degrade gracefully to "—" rather than erroring.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTenants } from "../../../hooks/useTenants";
import { useAuth } from "../../../contexts/AuthContext";
import { BRAND_LABELS, type Brand } from "../../../contexts/BrandContext";
import {
  formatUkDate,
  formatDateTime,
  formatMoney,
  truncateHash,
  initials,
  greeting,
} from "../../../lib/format";

interface AuditRow {
  id: string;
  action: string;
  user_name: string | null;
  blockchain_hash: string | null;
  created_at: string;
  table_name: string;
}

const ACTION_COLOR: Record<string, string> = {
  CREATE: "#34C87A",
  UPDATE: "#E8A84C",
  DELETE: "#E05252",
  SIGN: "#7C3AED",
  VERIFY: "#7C3AED",
  EXPORT: "#7A8499",
  LOGIN: "#0F1C2E",
};

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid #EDE8E1",
  borderRadius: "12px",
  padding: "18px",
};

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ ...card, flex: 1, minWidth: "160px" }}>
      <div style={{ color: "#7A8499", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ color: accent ?? "var(--navy)", fontFamily: "'JetBrains Mono', monospace", fontSize: "30px", fontWeight: 600, marginTop: "6px" }}>
        {value}
      </div>
    </div>
  );
}

/** Fetch a JSON array; return null on any non-OK (endpoint may not exist yet). */
function useArrayEndpoint<T = unknown>(url: string): T[] | null {
  const [data, setData] = useState<T[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(Array.isArray(d) ? d : null))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [url]);
  return data;
}

export default function DashboardPage() {
  const { count, activeTenants } = useTenants();
  const { profile } = useAuth();
  const [now, setNow] = useState<Date | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);

  // Compute date client-side to avoid hydration mismatch.
  useEffect(() => setNow(new Date()), []);

  useEffect(() => {
    let alive = true;
    fetch("/api/audit-logs?limit=10")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => alive && setAudit(Array.isArray(d) ? d : []))
      .catch(() => alive && setAudit([]));
    return () => {
      alive = false;
    };
  }, []);

  const unpaid = useArrayEndpoint<{ amount: number }>("/api/service-charges?unpaid=true");
  const risks = useArrayEndpoint("/api/risk-flags");
  const sessions = useArrayEndpoint("/api/sessions?thisWeek=true");

  const unpaidTotal =
    unpaid === null ? "—" : formatMoney(unpaid.reduce((s, c) => s + Number(c.amount ?? 0), 0));

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif" }}>
      <h1 style={{ color: "var(--navy)", fontSize: "22px", fontWeight: 700 }}>
        {greeting()}, {profile?.full_name?.split(" ")[0] ?? "there"}.
      </h1>
      <p style={{ color: "#7A8499", fontSize: "13px", marginTop: "2px" }}>
        {now ? formatUkDate(now) : " "}
      </p>

      {/* STATS STRIP */}
      <div style={{ display: "flex", gap: "14px", marginTop: "18px", flexWrap: "wrap" }}>
        <StatCard label="Active Tenants" value={String(count)} />
        <StatCard label="Unpaid Charges" value={unpaidTotal} accent="#E05252" />
        <StatCard label="Risk Flags" value={risks === null ? "—" : String(risks.length)} accent="#E8A84C" />
        <StatCard label="Sessions This Week" value={sessions === null ? "—" : String(sessions.length)} />
      </div>

      <div style={{ display: "flex", gap: "16px", marginTop: "20px", flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* LEFT — Recent Audit Trail */}
        <div style={{ ...card, flex: "2 1 420px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 style={{ color: "var(--navy)", fontSize: "15px", fontWeight: 700 }}>Recent Audit Trail</h2>
            <Link href="/audit-log" style={{ color: "#7A8499", fontSize: "12px", textDecoration: "none" }}>
              View all →
            </Link>
          </div>
          {audit === null ? (
            <p style={{ color: "#7A8499", fontSize: "13px" }}>Loading…</p>
          ) : audit.length === 0 ? (
            <p style={{ color: "#7A8499", fontSize: "13px" }}>No audit entries yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {audit.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px", padding: "6px 0", borderBottom: "1px solid #F3EEE7" }}>
                  <span style={{ background: ACTION_COLOR[a.action] ?? "#7A8499", color: "#fff", borderRadius: "5px", padding: "2px 7px", fontSize: "10px", fontWeight: 700, minWidth: "54px", textAlign: "center" }}>
                    {a.action}
                  </span>
                  <span style={{ color: "var(--navy)", flex: 1 }}>{a.user_name ?? "—"}</span>
                  <span style={{ color: "#7A8499", fontFamily: "'JetBrains Mono', monospace" }}>{truncateHash(a.blockchain_hash)}</span>
                  <span style={{ color: "#9AA6BC" }}>{formatDateTime(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — Quick Actions + Recent Tenants */}
        <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ ...card, background: "var(--navy)", border: "none" }}>
            <h2 style={{ color: "#fff", fontSize: "15px", fontWeight: 700, marginBottom: "10px" }}>Quick Actions</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {[
                { href: "/intake/new", label: "Start Intake" },
                { href: "/sessions", label: "Log a Session" },
                { href: "/ledger", label: "Record Payment" },
                { href: "/ai-brain", label: "Generate AI Report" },
                { href: "/reports", label: "Print Weekly Report" },
              ].map((q) => (
                <Link key={q.href} href={q.href} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#C7CFDD", textDecoration: "none", fontSize: "13px", padding: "9px 11px", borderRadius: "8px", background: "rgba(255,255,255,0.06)" }}>
                  {q.label} <span style={{ color: "var(--amber)" }}>→</span>
                </Link>
              ))}
            </div>
          </div>

          <div style={card}>
            <h2 style={{ color: "var(--navy)", fontSize: "15px", fontWeight: 700, marginBottom: "10px" }}>Recent Tenants</h2>
            {activeTenants.length === 0 ? (
              <p style={{ color: "#7A8499", fontSize: "13px" }}>No tenants yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {activeTenants.slice(0, 5).map((t) => (
                  <Link key={t.id} href={`/tenants/${t.id}`} style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
                    <span style={{ width: "30px", height: "30px", borderRadius: "50%", background: "var(--navy)", color: "var(--amber)", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {initials(t.full_name)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", color: "var(--navy)", fontSize: "13px", fontWeight: 500 }}>{t.full_name}</span>
                      <span style={{ display: "block", color: "#7A8499", fontSize: "11px" }}>{t.room_number}</span>
                    </span>
                    <span style={{ fontSize: "10px", color: "#7A8499", border: "1px solid #EDE8E1", borderRadius: "5px", padding: "2px 6px" }}>
                      {BRAND_LABELS[t.brand as Brand]?.split(" ")[0] ?? t.brand}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
