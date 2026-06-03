/**
 * Dashboard — composes the sidebar and the stats widget.
 * Both <TenantSidebar /> and <StatsWidget /> call the SAME useTenants() hook,
 * so the count in the widget can never disagree with the list in the sidebar (H8).
 */
import { StatsWidget } from "../../../components/StatsWidget";
import { TenantSidebar } from "../../../components/TenantSidebar";

export default function DashboardPage() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--cream)" }}>
      <TenantSidebar />

      <main style={{ flex: 1, padding: "2rem", fontFamily: "'Sora', sans-serif" }}>
        <h1 style={{ color: "var(--navy)", fontSize: "22px", fontWeight: 700 }}>
          Good morning, Manager.
        </h1>
        <p style={{ color: "#7A8499", fontSize: "13px", marginTop: "4px" }}>
          Tenant Hub — live tenant data via useTenants().
        </p>

        <div style={{ marginTop: "24px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <StatsWidget />
        </div>
      </main>
    </div>
  );
}
