/**
 * My jobs — a contractor's own dispatch queue (BUILD_PLAN C33). Read-only:
 * a contractor reads what's been sent to their trade; marking a job done is
 * a staff action on the Repairs board (packages/auth/src/rbac.ts grants
 * contractor "read" only, CI-enforced by rbac.test.ts). Previously this page
 * was entirely fake — hardcoded setTimeout data, no API call at all.
 */
"use client";

import { useEffect, useState } from "react";
import { formatShortDate } from "../../../lib/format";

interface Ticket {
  id: string; room_number: string; issue_type: string; category: string | null;
  severity: "emergency" | "urgent" | "routine" | "cosmetic" | null;
  description: string; status: string; created_at: string;
}
interface Job {
  id: string; proposed_at: string; dispatched_at: string | null; completed_at: string | null;
  cost: number | null; ticket: Ticket | null;
}

const SEVERITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  emergency: { bg: "rgba(178,74,49,.14)", color: "var(--brick)", label: "Emergency" },
  urgent:    { bg: "rgba(178,74,49,.08)", color: "var(--brick)", label: "Urgent" },
  routine:   { bg: "rgba(232,168,76,.16)", color: "var(--amber-deep)", label: "Routine" },
  cosmetic:  { bg: "rgba(92,102,115,.10)", color: "var(--slate)", label: "Cosmetic" },
};

export default function ContractorJobsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/jobs")
      .then(async (res) => {
        if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error ?? `${res.status} ${res.statusText}`); }
        return res.json() as Promise<Job[]>;
      })
      .then(setJobs)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your jobs"));
  }, []);

  return (
    <div style={{ padding: "1.75rem", maxWidth: 760, margin: "0 auto", fontFamily: "'Sora', sans-serif" }}>
      <h1 style={{ color: "var(--navy)", fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>My jobs</h1>
      <p style={{ fontSize: 13, color: "var(--slate)", margin: "0 0 24px" }}>Repairs sent to your trade. Once you&apos;ve been round, let the office know and they&apos;ll close it out.</p>

      {error && <p style={{ color: "var(--brick)" }}>{error}</p>}

      {!error && jobs === null && <p className="muted">Loading…</p>}

      {jobs !== null && jobs.length === 0 && (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--slate)" }}>
          Nothing dispatched to you right now.
        </div>
      )}

      {jobs && jobs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {jobs.map((job) => {
            const t = job.ticket;
            const tone = t?.severity ? SEVERITY_STYLE[t.severity] : null;
            const done = Boolean(job.completed_at);
            return (
              <div key={job.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--amber-deep)", textTransform: "uppercase" }}>
                      {t?.category || t?.issue_type || "Repair"}
                    </span>
                    {tone && (
                      <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: tone.bg, color: tone.color }}>
                        {tone.label}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: "var(--slate)" }}>{formatShortDate(job.proposed_at)}</span>
                </div>
                <p style={{ fontSize: 14, color: "var(--navy)", fontWeight: 600, margin: "8px 0 4px" }}>{t?.description ?? "No description given"}</p>
                <p style={{ fontSize: 12.5, color: "var(--slate)", margin: 0 }}>Room: <strong>{t?.room_number ?? "—"}</strong></p>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 12.5, color: done ? "var(--live)" : "var(--slate)", fontWeight: 600 }}>
                  {done ? `Marked complete ${formatShortDate(job.completed_at!)}` : job.dispatched_at ? "Confirmed — not yet marked done" : "Proposed — awaiting confirmation"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
