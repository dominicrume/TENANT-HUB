/**
 * My Ledger — Read-only view of service charges & payments.
 *
 * Shows a balance summary header, then two tabbed sections: Charges and
 * Payments. Colour-coded rows (green = paid/received, red = unpaid/due).
 * No mutation capabilities — tenants can only view.
 */
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";

interface Charge {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  status: "paid" | "unpaid" | "partial" | string;
  period?: string;
}

interface Payment {
  id: string;
  amount: number;
  date: string;
  method?: string;
  reference?: string;
  notes?: string;
}

interface LedgerData {
  charges: Charge[];
  payments: Payment[];
  balance?: number;
}

type Tab = "charges" | "payments";

export default function MyLedgerPage() {
  const { profile } = useAuth();
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("charges");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/tenant-portal/ledger", { cache: "no-store" });
        if (!res.ok) throw new Error("Unable to load your ledger");
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

  /* ── Derived values ──────────────────────────────────────── */
  const totalCharges = data?.charges?.reduce((s, c) => s + c.amount, 0) ?? 0;
  const totalPayments = data?.payments?.reduce((s, p) => s + p.amount, 0) ?? 0;
  const balance = data?.balance ?? totalCharges - totalPayments;

  /* ── Loading state ───────────────────────────────────────── */
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.balanceHeaderSkeleton} />
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <div style={{ ...styles.skeletonBar, width: "100px", height: "36px" }} />
          <div style={{ ...styles.skeletonBar, width: "100px", height: "36px" }} />
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ ...styles.skeletonBar, height: "60px", marginBottom: "8px" }} />
        ))}
      </div>
    );
  }

  /* ── Error state ─────────────────────────────────────────── */
  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.errorCard}>
          <span style={{ fontSize: "32px" }}>😔</span>
          <h2 style={styles.errorTitle}>We couldn&apos;t load your ledger</h2>
          <p style={styles.errorText}>{error}</p>
          <button onClick={() => window.location.reload()} style={styles.retryBtn}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const charges = data?.charges ?? [];
  const payments = data?.payments ?? [];

  return (
    <div style={styles.page}>
      {/* ── Page title ──────────────────────────────────────── */}
      <h1 style={styles.pageTitle}>My Ledger</h1>
      <p style={styles.pageSubtitle}>
        A summary of your charges and payments.
      </p>

      {/* ── Balance Summary ─────────────────────────────────── */}
      <div style={styles.balanceHeader}>
        <div style={styles.balanceItem}>
          <div style={styles.balanceLabel}>Total Charges</div>
          <div style={{ ...styles.balanceValue, color: "#E85454" }}>
            £{totalCharges.toFixed(2)}
          </div>
        </div>
        <div style={styles.balanceDivider} />
        <div style={styles.balanceItem}>
          <div style={styles.balanceLabel}>Total Paid</div>
          <div style={{ ...styles.balanceValue, color: "#3DBB7A" }}>
            £{totalPayments.toFixed(2)}
          </div>
        </div>
        <div style={styles.balanceDivider} />
        <div style={styles.balanceItem}>
          <div style={styles.balanceLabel}>Balance</div>
          <div
            style={{
              ...styles.balanceValue,
              color: balance > 0 ? "#E85454" : "#3DBB7A",
              fontSize: "22px",
            }}
          >
            £{Math.abs(balance).toFixed(2)}
            {balance <= 0 && (
              <span style={{ fontSize: "14px", marginLeft: "6px" }}>✅</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────── */}
      <div style={styles.tabRow}>
        <button
          onClick={() => setTab("charges")}
          style={{
            ...styles.tabBtn,
            ...(tab === "charges" ? styles.tabBtnActive : {}),
          }}
        >
          💷 Charges ({charges.length})
        </button>
        <button
          onClick={() => setTab("payments")}
          style={{
            ...styles.tabBtn,
            ...(tab === "payments" ? styles.tabBtnActive : {}),
          }}
        >
          ✅ Payments ({payments.length})
        </button>
      </div>

      {/* ── Charges List ────────────────────────────────────── */}
      {tab === "charges" && (
        <div style={styles.listContainer}>
          {charges.length === 0 ? (
            <div style={styles.emptyState}>
              <span style={{ fontSize: "32px" }}>📋</span>
              <p style={styles.emptyText}>No charges to show yet.</p>
            </div>
          ) : (
            charges.map((c) => {
              const isPaid = c.status === "paid";
              return (
                <div
                  key={c.id}
                  style={{
                    ...styles.row,
                    borderLeft: `4px solid ${isPaid ? "#3DBB7A" : "#E85454"}`,
                  }}
                >
                  <div style={styles.rowTop}>
                    <div style={styles.rowDesc}>{c.description}</div>
                    <div
                      style={{
                        ...styles.rowAmount,
                        color: isPaid ? "#3DBB7A" : "#E85454",
                      }}
                    >
                      £{c.amount.toFixed(2)}
                    </div>
                  </div>
                  <div style={styles.rowBottom}>
                    <span style={styles.rowDate}>
                      Due: {formatDate(c.due_date)}
                    </span>
                    {c.period && (
                      <span style={styles.rowMeta}>{c.period}</span>
                    )}
                    <span
                      style={{
                        ...styles.statusBadge,
                        background: isPaid ? "#ECFDF5" : "#FEF2F2",
                        color: isPaid ? "#3DBB7A" : "#E85454",
                      }}
                    >
                      {isPaid ? "Paid" : c.status === "partial" ? "Partial" : "Unpaid"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Payments List ───────────────────────────────────── */}
      {tab === "payments" && (
        <div style={styles.listContainer}>
          {payments.length === 0 ? (
            <div style={styles.emptyState}>
              <span style={{ fontSize: "32px" }}>💳</span>
              <p style={styles.emptyText}>No payments recorded yet.</p>
            </div>
          ) : (
            payments.map((p) => (
              <div
                key={p.id}
                style={{
                  ...styles.row,
                  borderLeft: "4px solid #3DBB7A",
                }}
              >
                <div style={styles.rowTop}>
                  <div style={styles.rowDesc}>
                    Payment received
                    {p.method ? ` — ${p.method}` : ""}
                  </div>
                  <div style={{ ...styles.rowAmount, color: "#3DBB7A" }}>
                    £{p.amount.toFixed(2)}
                  </div>
                </div>
                <div style={styles.rowBottom}>
                  <span style={styles.rowDate}>{formatDate(p.date)}</span>
                  {p.reference && (
                    <span style={styles.rowMeta}>Ref: {p.reference}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={styles.infoNote}>
        <span style={{ fontSize: "18px" }}>ℹ️</span>
        <span style={{ fontSize: "13px", color: "#7A8494" }}>
          This is a read-only summary. If you believe there&apos;s an error,
          please contact your support worker.
        </span>
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────────── */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/* ── Styles ────────────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px 16px 100px",
    maxWidth: "720px",
    margin: "0 auto",
    fontFamily: "'Sora', sans-serif",
  },

  pageTitle: {
    fontSize: "22px",
    fontWeight: 700,
    color: "var(--navy)",
    margin: "0 0 4px",
  },
  pageSubtitle: {
    fontSize: "14px",
    color: "#7A8494",
    margin: "0 0 20px",
  },

  /* Skeleton */
  balanceHeaderSkeleton: {
    height: "100px",
    borderRadius: "14px",
    background: "#E8E3DC",
    marginBottom: "20px",
  },
  skeletonBar: {
    borderRadius: "10px",
    background: "#E8E3DC",
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

  /* Balance header */
  balanceHeader: {
    display: "flex",
    gap: "0",
    background: "#fff",
    borderRadius: "14px",
    padding: "20px",
    boxShadow: "0 1px 4px rgba(15,28,46,0.06)",
    marginBottom: "24px",
    flexWrap: "wrap",
    justifyContent: "space-around",
  },
  balanceItem: {
    textAlign: "center",
    flex: 1,
    minWidth: "80px",
    padding: "4px 0",
  },
  balanceDivider: {
    width: "1px",
    background: "#EDE8E1",
    margin: "0 8px",
    alignSelf: "stretch",
  },
  balanceLabel: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#7A8494",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: "6px",
  },
  balanceValue: {
    fontSize: "20px",
    fontWeight: 700,
    color: "var(--navy)",
  },

  /* Tabs */
  tabRow: {
    display: "flex",
    gap: "8px",
    marginBottom: "16px",
  },
  tabBtn: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: "12px",
    border: "2px solid #EDE8E1",
    background: "#fff",
    fontSize: "14px",
    fontWeight: 600,
    fontFamily: "'Sora',sans-serif",
    cursor: "pointer",
    color: "#7A8494",
    transition: "all 0.15s",
    minHeight: "48px",
  },
  tabBtnActive: {
    background: "var(--navy)",
    color: "#fff",
    borderColor: "var(--navy)",
  },

  /* List */
  listContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    marginBottom: "24px",
  },
  row: {
    background: "#fff",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(15,28,46,0.05)",
  },
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "8px",
  },
  rowDesc: {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--navy)",
    flex: 1,
    paddingRight: "12px",
  },
  rowAmount: {
    fontSize: "16px",
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  rowBottom: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  rowDate: {
    fontSize: "12px",
    color: "#7A8494",
  },
  rowMeta: {
    fontSize: "12px",
    color: "#9AA6BC",
    background: "#F5F1EB",
    padding: "2px 8px",
    borderRadius: "6px",
  },
  statusBadge: {
    fontSize: "11px",
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: "20px",
  },

  /* Empty */
  emptyState: {
    textAlign: "center",
    padding: "40px 16px",
    background: "#fff",
    borderRadius: "14px",
  },
  emptyText: {
    fontSize: "14px",
    color: "#7A8494",
    marginTop: "8px",
  },

  /* Info */
  infoNote: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "14px 16px",
    borderRadius: "12px",
    background: "rgba(232,168,76,0.08)",
    border: "1px solid rgba(232,168,76,0.2)",
  },
};
