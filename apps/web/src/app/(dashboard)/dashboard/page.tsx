/**
 * Dashboard — uses useTenants() hook (single source of truth — H8).
 * Stats widget and sidebar both derive from the same hook.
 * They CANNOT disagree on tenant count.
 */
export default function DashboardPage() {
  return (
    <div style={{ padding: "2rem", fontFamily: "'Sora',sans-serif" }}>
      <h1 style={{ color: "var(--navy)", fontSize: "22px", fontWeight: 700 }}>
        Good morning, Manager.
      </h1>
      <p style={{ color: "#7A8499", fontSize: "13px", marginTop: "4px" }}>
        Tenant Hub — Sprint 1 scaffold. Wire useTenants() hook here.
      </p>
      {/* Full dashboard wired in Sprint 1 */}
    </div>
  );
}
