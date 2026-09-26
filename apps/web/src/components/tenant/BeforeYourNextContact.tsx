/**
 * BeforeYourNextContact — the still-open promises made to or by this tenant,
 * lifted from their staff notes, sessions and communications by the
 * interaction-memory agent (BUILD_PLAN C25). Sits at the top of the tenant
 * record so nobody calls or visits without knowing what was already promised.
 * Silent when there is nothing outstanding — a promise kept leaves no trace
 * here, only the empty list.
 */
"use client";

import { useEffect, useState } from "react";
import { formatShortDate } from "../../lib/format";

interface Commitment { id: string; text: string; owner: string; due_on: string | null; status: "open" | "overdue"; source_table: string }

const OWNER_LABEL: Record<string, string> = {
  landlord: "Landlord", tenant: "Tenant", contractor: "Contractor", support_worker: "Support worker", council: "Council",
};
const SOURCE_LABEL: Record<string, string> = { staff_notes: "a staff note", sessions: "a session", communications: "a message" };

export function BeforeYourNextContact({ tenantId }: { tenantId: string }) {
  const [rows, setRows] = useState<Commitment[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/commitments?tenant=${tenantId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (live) setRows(data as Commitment[]); })
      .catch(() => { if (live) setRows((p) => p ?? []); });
    return () => { live = false; };
  }, [tenantId]);

  if (!rows || rows.length === 0) return null;

  return (
    <section className="card" style={{ marginBottom: 18, borderColor: rows.some((r) => r.status === "overdue") ? "var(--brick)" : undefined }}>
      <div className="ch"><h3>Before your next contact</h3></div>
      {rows.map((c) => (
        <div className="li" key={c.id}>
          <span className={c.status === "overdue" ? "tag" : "tag sup"} style={c.status === "overdue" ? { background: "rgba(178,74,49,.12)", color: "var(--brick)", marginTop: 3 } : { marginTop: 3 }}>
            {c.status === "overdue" ? "Overdue" : "Open"}
          </span>
          <div className="body">
            <b>{c.text}</b>
            <p>
              {OWNER_LABEL[c.owner] ?? c.owner}
              {c.due_on ? ` · due ${formatShortDate(c.due_on)}` : ""} · from {SOURCE_LABEL[c.source_table] ?? c.source_table}
            </p>
          </div>
        </div>
      ))}
    </section>
  );
}
