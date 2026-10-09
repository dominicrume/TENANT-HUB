/**
 * Audit Log — tamper-proof trail. Filters by action/date, paginates client-side,
 * expandable rows show the full hash + record snapshot. Manager CSV export.
 */
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../../contexts/AuthContext";
import { formatDateTime, truncateHash } from "../../../lib/format";
import { ImpactCard } from "../../../components/ImpactCard";

interface Row {
  id: string;
  created_at: string;
  action: string;
  table_name: string;
  user_name: string | null;
  tenant_id: string | null;
  blockchain_hash: string | null;
  record_snapshot: unknown;
}

const ACTIONS = ["", "CREATE", "UPDATE", "DELETE", "SIGN", "VERIFY", "EXPORT", "LOGIN"];
const chip: React.CSSProperties = { background: "rgba(232,168,76,.16)", color: "var(--amber-deep)", border: "none", cursor: "pointer", fontFamily: "inherit" };
const COLOR: Record<string, string> = { CREATE: "#34C87A", UPDATE: "#E8A84C", DELETE: "#E05252", SIGN: "#7C3AED", VERIFY: "#7C3AED", EXPORT: "#7A8499", LOGIN: "#0F1C2E" };
const PAGE = 20;

export default function AuditLogPage() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [action, setAction] = useState(searchParams.get("action") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  // Drill-down filters arriving from the dashboard's impact card (by agent,
  // by table, or "everything the agents did") — shown as chips the person
  // can clear, so it's always obvious why the list is narrowed.
  const [agent, setAgent] = useState(searchParams.get("agent") ?? "");
  const [table, setTable] = useState(searchParams.get("table") ?? "");
  const [systemOnly, setSystemOnly] = useState(searchParams.get("system") === "1");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ limit: "200" });
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (agent) params.set("agent", agent);
    if (table) params.set("table", table);
    if (systemOnly) params.set("system", "1");
    fetch(`/api/audit-logs?${params}`).then((r) => (r.ok ? r.json() : [])).then((d) => { setRows(Array.isArray(d) ? d : []); setPage(0); }).catch(() => {});
  }, [action, from, agent, table, systemOnly]);

  const pageRows = useMemo(() => rows.slice(page * PAGE, page * PAGE + PAGE), [rows, page]);
  const pages = Math.ceil(rows.length / PAGE);

  function exportCsv() {
    const header = "timestamp,action,table,user,tenant,hash\n";
    const body = rows.map((r) => [r.created_at, r.action, r.table_name, r.user_name ?? "", r.tenant_id ?? "", r.blockchain_hash ?? ""].join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([header + body], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "audit-log.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ padding: "1.75rem", fontFamily: "'Sora', sans-serif" }}>
      <div style={{ background: "var(--navy)", borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
        <h1 style={{ color: "#fff", fontSize: "18px", fontWeight: 700 }}>Audit Trail: Tamper-Proof Record</h1>
        <p style={{ color: "#9AA6BC", fontSize: "12px", marginTop: "4px" }}>Every mutation is cryptographically hashed. This log cannot be edited or deleted.</p>
      </div>

      <ImpactCard />

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
        <select aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} style={{ minHeight: "40px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #EDE8E1" }}>
          {ACTIONS.map((a) => <option key={a} value={a}>{a || "All actions"}</option>)}
        </select>
        <input aria-label="Filter from date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ minHeight: "40px", padding: "6px 10px", borderRadius: "8px", border: "1px solid #EDE8E1" }} />
        {profile?.role === "manager" && (
          <button onClick={exportCsv} style={{ minHeight: "40px", padding: "0 14px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", cursor: "pointer", fontSize: "13px" }}>Export CSV</button>
        )}
        {(agent || table || systemOnly) && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
            <span className="muted">Showing:</span>
            {systemOnly && <button type="button" className="tag" onClick={() => setSystemOnly(false)} style={chip}>only what the agents did ✕</button>}
            {agent && <button type="button" className="tag" onClick={() => setAgent("")} style={chip}>agent · {agent} ✕</button>}
            {table && <button type="button" className="tag" onClick={() => setTable("")} style={chip}>table · {table} ✕</button>}
            <Link href="/dashboard" className="muted" style={{ fontSize: 12.5 }}>← back to the card</Link>
          </div>
        )}
      </div>
      <p className="muted" style={{ margin: "0 0 10px" }}>{rows.length === 200 ? "Showing the latest 200 rows" : `${rows.length} row${rows.length === 1 ? "" : "s"}`} · every row is one write, hashed and chained to the one before it.</p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#7A8499", textTransform: "uppercase", fontSize: "10px" }}>
            <th style={{ padding: "6px" }}>Timestamp</th><th style={{ padding: "6px" }}>Action</th><th style={{ padding: "6px" }}>Table</th><th style={{ padding: "6px" }}>User</th><th style={{ padding: "6px" }}>Hash</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: "12px 6px", color: "#7A8499" }}>No audit entries.</td></tr>
          ) : pageRows.map((r) => (
            <Fragment key={r.id}>
              <tr onClick={() => setExpanded(expanded === r.id ? null : r.id)} style={{ borderTop: "1px solid #F3EEE7", cursor: "pointer" }}>
                <td style={{ padding: "6px", fontFamily: "'JetBrains Mono',monospace" }}>{formatDateTime(r.created_at)}</td>
                <td style={{ padding: "6px" }}><span style={{ background: COLOR[r.action] ?? "#7A8499", color: "#fff", borderRadius: "5px", padding: "2px 7px", fontSize: "10px", fontWeight: 700 }}>{r.action}</span></td>
                <td style={{ padding: "6px" }}>{r.table_name}</td>
                <td style={{ padding: "6px" }}>{r.user_name ?? "—"}</td>
                <td style={{ padding: "6px", fontFamily: "'JetBrains Mono',monospace" }}>{truncateHash(r.blockchain_hash, 12)}</td>
              </tr>
              {expanded === r.id && (
                <tr>
                  <td colSpan={5} style={{ padding: "8px", background: "#F8F4EF", fontFamily: "'JetBrains Mono',monospace", fontSize: "11px", wordBreak: "break-all" }}>
                    <div>Full hash: {r.blockchain_hash ?? "—"}</div>
                    <pre style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{JSON.stringify(r.record_snapshot, null, 2)}</pre>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {pages > 1 && (
        <div style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "center" }}>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", cursor: "pointer" }}>Prev</button>
          <span style={{ fontSize: "12px", color: "#7A8499" }}>Page {page + 1} / {pages}</span>
          <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} style={{ padding: "6px 12px", borderRadius: "8px", border: "1px solid #EDE8E1", background: "#fff", cursor: "pointer" }}>Next</button>
        </div>
      )}
    </div>
  );
}
