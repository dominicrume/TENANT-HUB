"use client";

import useSWR from "swr";
import { formatMoney } from "../../../lib/format";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function AnalyticsPage() {
  const { data, error, isLoading } = useSWR("/api/analytics", fetcher);

  if (isLoading) return <div style={{ padding: "1.75rem" }}>Loading Innovate UK Analytics...</div>;
  if (error) return <div style={{ padding: "1.75rem" }}>Error loading analytics.</div>;

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ color: "var(--navy)", fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }}>
            Innovate UK Analytics
          </h1>
          <p style={{ color: "#7A8499", fontSize: "13px", margin: 0 }}>
            Real-time performance metrics and efficiency tracking.
          </p>
        </div>
        <button onClick={() => window.print()} style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", color: "var(--navy)", fontWeight: 600, cursor: "pointer" }}>
          🖨 Export PDF Report
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "30px" }}>
        <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #EDE8E1", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
          <h4 style={{ fontSize: "12px", color: "#7A8499", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px 0" }}>Tenants Supported</h4>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "var(--navy)" }}>{data?.totalTenants || 0}</div>
        </div>
        <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #EDE8E1", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
          <h4 style={{ fontSize: "12px", color: "#7A8499", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px 0" }}>Keywork Sessions</h4>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "var(--amber)" }}>{data?.totalSessions || 0}</div>
        </div>
        <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #EDE8E1", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
          <h4 style={{ fontSize: "12px", color: "#7A8499", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px 0" }}>Goals Achieved</h4>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#1E7F4F" }}>{data?.goalsCompleted || 0}</div>
        </div>
        <div style={{ background: "linear-gradient(135deg, var(--navy) 0%, #2A3655 100%)", padding: "20px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(32,43,70,0.15)" }}>
          <h4 style={{ fontSize: "12px", color: "#9AA6BC", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px 0" }}>AI Time Saved</h4>
          <div style={{ fontSize: "32px", fontWeight: 800, color: "#fff" }}>{data?.aiHoursSaved || 0} <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--amber)" }}>hrs</span></div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        
        {/* Arrears Recovery */}
        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #EDE8E1" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy)", marginBottom: "20px" }}>Arrears Recovery (Service Charges)</h3>
          
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "13px", color: "#7A8499" }}>Collection Rate</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--navy)" }}>{data?.arrearsRecoveryRate?.toFixed(1) || 0}%</span>
          </div>
          <div style={{ width: "100%", height: "24px", background: "#F8F4EF", borderRadius: "12px", overflow: "hidden", marginBottom: "20px" }}>
            <div style={{ width: `${data?.arrearsRecoveryRate || 0}%`, height: "100%", background: "var(--amber)", borderRadius: "12px" }} />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "16px", borderTop: "1px solid #EDE8E1" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#7A8499", textTransform: "uppercase" }}>Total Billed</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy)" }}>{formatMoney(data?.totalBilled || 0)}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#7A8499", textTransform: "uppercase" }}>Total Collected</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#1E7F4F" }}>{formatMoney(data?.totalPaid || 0)}</div>
            </div>
          </div>
        </div>

        {/* Goal Progress */}
        <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #EDE8E1" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy)", marginBottom: "20px" }}>Tenant Support Goals</h3>
          
          <div style={{ display: "flex", alignItems: "flex-end", gap: "24px", height: "120px", paddingBottom: "20px", borderBottom: "1px solid #EDE8E1" }}>
            {/* Simple Bar Chart */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy)" }}>{data?.goalsActive || 0}</div>
              <div style={{ width: "40px", height: `${Math.max(10, ((data?.goalsActive || 0) / Math.max(1, (data?.goalsActive || 0) + (data?.goalsCompleted || 0))) * 100)}%`, background: "#4C7CE8", borderRadius: "4px 4px 0 0", minHeight: "10%" }} />
              <div style={{ fontSize: "11px", color: "#7A8499", textTransform: "uppercase" }}>Active</div>
            </div>
            
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--navy)" }}>{data?.goalsCompleted || 0}</div>
              <div style={{ width: "40px", height: `${Math.max(10, ((data?.goalsCompleted || 0) / Math.max(1, (data?.goalsActive || 0) + (data?.goalsCompleted || 0))) * 100)}%`, background: "#1E7F4F", borderRadius: "4px 4px 0 0", minHeight: "10%" }} />
              <div style={{ fontSize: "11px", color: "#7A8499", textTransform: "uppercase" }}>Achieved</div>
            </div>
          </div>
          
          <p style={{ fontSize: "13px", color: "#7A8499", marginTop: "16px", marginBottom: 0 }}>
            Visualisation of the current progress across all Support Plans using the Reliance model (AEW, BH, EAA, Mpc, SS).
          </p>
        </div>
      </div>
    </div>
  );
}
