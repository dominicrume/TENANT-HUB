/**
 * My Home — Tenant dashboard landing page.
 *
 * Shows a warm welcome, quick summary cards (balance, open tickets, room),
 * and clear action buttons. Designed for vulnerable tenants — large touch
 * targets, plain language, calming colours.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../contexts/AuthContext";

interface TenantSummary {
  tenant: {
    id: string;
    full_name: string;
    room_number: string | null;
    address: string | null;
    moved_in: string | null;
  } | null;
  open_tickets: number;
  balance: {
    total_charged: number;
    total_paid: number;
    outstanding: number;
  };
}

export default function MyHomePage() {
  const { profile } = useAuth();
  const [data, setData] = useState<TenantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/tenant-portal/summary", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load your information");
        const json = await res.json();
        setData(json);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.skeleton}>
          <div style={{ ...styles.skeletonBar, width: "200px", height: "28px" }} />
          <div style={{ ...styles.skeletonBar, width: "260px", height: "16px", marginTop: "8px" }} />
          <div style={styles.cardGrid}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...styles.card, ...styles.skeletonCard }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.errorCard}>
          <span style={{ fontSize: "32px" }}>😔</span>
          <h2 style={styles.errorTitle}>We couldn&apos;t load your information</h2>
          <p style={styles.errorText}>{error}</p>
          <button onClick={() => window.location.reload()} style={styles.retryBtn}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const balance = data?.balance?.outstanding ?? 0;
  const openTickets = data?.open_tickets ?? 0;
  const roomNumber = data?.tenant?.room_number ?? "—";
  const propertyName = data?.tenant?.address;

  return (
    <div style={styles.page}>
      {/* ── Welcome ────────────────────────────────────────── */}
      <div style={styles.welcomeSection}>
        <h1 style={styles.greeting}>
          {greeting}, {firstName} 👋
        </h1>
        <p style={styles.subtitle}>
          Here&apos;s what&apos;s happening with your tenancy.
        </p>
      </div>

      {/* ── Summary Cards ──────────────────────────────────── */}
      <div style={styles.cardGrid}>
        {/* Balance card */}
        <div
          style={{
            ...styles.card,
            borderLeft: `4px solid ${balance > 0 ? "#E85454" : "#3DBB7A"}`,
          }}
        >
          <div style={styles.cardIcon}>💷</div>
          <div style={styles.cardLabel}>Outstanding Balance</div>
          <div
            style={{
              ...styles.cardValue,
              color: balance > 0 ? "#E85454" : "#3DBB7A",
            }}
          >
            £{Math.abs(balance).toFixed(2)}
          </div>
          {balance <= 0 && (
            <div style={styles.cardBadge}>
              ✅ All clear
            </div>
          )}
          {balance > 0 && (
            <div style={{ ...styles.cardBadge, background: "#FEF2F2", color: "#E85454" }}>
              Payment due
            </div>
          )}
        </div>

        {/* Open tickets card */}
        <div
          style={{
            ...styles.card,
            borderLeft: `4px solid ${openTickets > 0 ? "var(--amber)" : "#3DBB7A"}`,
          }}
        >
          <div style={styles.cardIcon}>🛠️</div>
          <div style={styles.cardLabel}>Open Repairs</div>
          <div style={styles.cardValue}>
            {openTickets}
          </div>
          <div style={styles.cardBadge}>
            {openTickets === 0 ? "✅ No open issues" : `${openTickets} in progress`}
          </div>
        </div>

        {/* Room card */}
        <div style={{ ...styles.card, borderLeft: "4px solid var(--navy)" }}>
          <div style={styles.cardIcon}>🏠</div>
          <div style={styles.cardLabel}>Your Room</div>
          <div style={styles.cardValue}>{roomNumber}</div>
          {propertyName && (
            <div style={styles.cardBadge}>{propertyName}</div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ──────────────────────────────────── */}
      <div style={styles.actionsSection}>
        <h2 style={styles.actionsTitle}>Quick Actions</h2>
        <div style={styles.actionsGrid}>
          <Link href="/report-issue" style={styles.actionBtn}>
            <span style={styles.actionIcon}>🛠️</span>
            <span style={styles.actionLabel}>Report an Issue</span>
            <span style={styles.actionDesc}>
              Let us know about something that needs fixing
            </span>
          </Link>

          <Link href="/my-ledger" style={styles.actionBtn}>
            <span style={styles.actionIcon}>💷</span>
            <span style={styles.actionLabel}>View My Ledger</span>
            <span style={styles.actionDesc}>
              See your charges and payment history
            </span>
          </Link>
        </div>
      </div>

      {/* ── Help note ──────────────────────────────────────── */}
      <div style={styles.helpNote}>
        <span style={{ fontSize: "20px" }}>💬</span>
        <div>
          <strong style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
            Need help?
          </strong>
          <span style={{ fontSize: "13px", color: "#7A8494" }}>
            If you need to speak with someone, please contact your support worker
            or call the office during office hours.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px 16px 100px",
    maxWidth: "720px",
    margin: "0 auto",
    fontFamily: "'Sora', sans-serif",
  },

  /* Skeleton loading */
  skeleton: { padding: "8px 0" },
  skeletonBar: {
    background: "#E8E3DC",
    borderRadius: "8px",
    animation: "pulse 1.5s ease-in-out infinite",
  },
  skeletonCard: {
    height: "140px",
    background: "#E8E3DC",
    borderLeft: "4px solid #D5CFC6",
  },

  /* Error */
  errorCard: {
    textAlign: "center",
    padding: "48px 24px",
    background: "#fff",
    borderRadius: "16px",
    marginTop: "24px",
  },
  errorTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: "var(--navy)",
    marginTop: "12px",
  },
  errorText: {
    fontSize: "14px",
    color: "#7A8494",
    marginTop: "8px",
  },
  retryBtn: {
    marginTop: "20px",
    padding: "12px 32px",
    borderRadius: "12px",
    border: "none",
    background: "var(--amber)",
    color: "var(--navy)",
    fontWeight: 700,
    fontSize: "15px",
    fontFamily: "'Sora',sans-serif",
    cursor: "pointer",
  },

  /* Welcome */
  welcomeSection: {
    marginBottom: "24px",
  },
  greeting: {
    fontSize: "24px",
    fontWeight: 700,
    color: "var(--navy)",
    margin: "0 0 4px",
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: "15px",
    color: "#7A8494",
    margin: 0,
    fontWeight: 400,
  },

  /* Cards */
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "14px",
    marginBottom: "32px",
  },
  card: {
    background: "#fff",
    borderRadius: "14px",
    padding: "20px",
    boxShadow: "0 1px 4px rgba(15,28,46,0.06)",
    transition: "box-shadow 0.15s",
  },
  cardIcon: {
    fontSize: "24px",
    marginBottom: "8px",
  },
  cardLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#7A8494",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    marginBottom: "4px",
  },
  cardValue: {
    fontSize: "28px",
    fontWeight: 700,
    color: "var(--navy)",
    lineHeight: 1.2,
    marginBottom: "8px",
  },
  cardBadge: {
    display: "inline-block",
    fontSize: "12px",
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: "20px",
    background: "#ECFDF5",
    color: "#3DBB7A",
  },

  /* Actions */
  actionsSection: {
    marginBottom: "24px",
  },
  actionsTitle: {
    fontSize: "16px",
    fontWeight: 700,
    color: "var(--navy)",
    marginBottom: "14px",
  },
  actionsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "12px",
  },
  actionBtn: {
    display: "flex",
    flexDirection: "column",
    padding: "20px",
    borderRadius: "14px",
    background: "#fff",
    textDecoration: "none",
    boxShadow: "0 1px 4px rgba(15,28,46,0.06)",
    border: "2px solid transparent",
    transition: "border-color 0.15s, box-shadow 0.15s",
    cursor: "pointer",
    minHeight: "80px",
  },
  actionIcon: {
    fontSize: "28px",
    marginBottom: "8px",
  },
  actionLabel: {
    fontSize: "16px",
    fontWeight: 700,
    color: "var(--navy)",
    marginBottom: "4px",
  },
  actionDesc: {
    fontSize: "13px",
    color: "#7A8494",
    lineHeight: 1.4,
  },

  /* Help */
  helpNote: {
    display: "flex",
    alignItems: "flex-start",
    gap: "14px",
    padding: "18px",
    borderRadius: "14px",
    background: "rgba(232,168,76,0.08)",
    border: "1px solid rgba(232,168,76,0.2)",
  },
};
