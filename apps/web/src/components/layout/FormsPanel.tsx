/**
 * The right rail on the tenant page: the sign-up pack, section by section —
 * the SAME seven sections as /tenants/[id]/signup, nothing else (Rume,
 * 2026-10-15: the old "Forms" list conflicted with how the office actually
 * files things; one form system, theirs). Print and the eviction notice stay
 * at the bottom.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CanonicalTenant } from "@tenant-hub/validation";
import { EvictionNoticeModal } from "../EvictionNoticeModal";
import { SIGNUP_SECTIONS, slotMatches } from "../../lib/signup";
import type { FilesResponse } from "../files/upload";

export function FormsPanel({ tenant }: { tenant: CanonicalTenant }) {
  const [files, setFiles] = useState<FilesResponse | null>(null);
  const [evictionOpen, setEvictionOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/files?entity=tenant&id=${tenant.id}`).then((r) => (r.ok ? r.json() : null)).then((d) => alive && setFiles(d)).catch(() => {});
    return () => { alive = false; };
  }, [tenant.id]);

  const docs = (files?.items ?? []).filter((f) => f.kind === "document" && f.blobId);
  const rows = SIGNUP_SECTIONS.map((sec) => {
    const have = sec.slots.filter((sl) => docs.some((d) => slotMatches(sl, d.name))).length;
    const extra = docs.filter((d) => d.section === sec.n && !sec.slots.some((sl) => slotMatches(sl, d.name))).length;
    return { sec, have, extra, complete: sec.slots.length > 0 && have === sec.slots.length };
  });
  const totalSlots = rows.reduce((n, r) => n + r.sec.slots.length, 0);
  const totalHave = rows.reduce((n, r) => n + r.have, 0);

  return (
    <>
      <aside className="forms-panel" style={{ width: "280px", flexShrink: 0, background: "var(--surface)", borderLeft: "1px solid #EDE8E1", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--navy)" }}>Sign-up pack</span>
          <span className="muted" style={{ fontSize: 12 }}>{files ? `${totalHave} of ${totalSlots}` : "…"}</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: "var(--cream)", overflow: "hidden" }}><div style={{ width: `${totalSlots ? Math.round((totalHave / totalSlots) * 100) : 0}%`, height: "100%", background: totalHave === totalSlots && totalSlots > 0 ? "var(--live)" : "var(--amber)", transition: "width .6s ease" }} /></div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {rows.map(({ sec, have, extra, complete }) => (
            <Link key={sec.n} href={`/tenants/${tenant.id}/signup/${sec.n}`}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 10, textDecoration: "none", color: "inherit", border: complete ? "1px solid rgba(30,127,79,.3)" : "1px solid #E2E8F0", background: complete ? "#F4FDF8" : "#fff" }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13, background: complete ? "var(--live)" : sec.slots.length === 0 ? "#F1EDE6" : "var(--navy)", color: complete || sec.slots.length ? "#fff" : "var(--slate)" }}>{complete ? "✓" : sec.n}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: complete ? "#1E7F4F" : "var(--navy)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sec.title !== `Section ${sec.n}` ? sec.title : `Section ${sec.n}`}</span>
                <span className="muted" style={{ display: "block", fontSize: 11.5 }}>{sec.slots.length ? `${have} of ${sec.slots.length} forms${extra ? ` · +${extra}` : ""}` : extra ? `${extra} added` : "empty — add anything"}</span>
              </span>
              {sec.slots.length > 0 && !complete && <span style={{ fontSize: 10, fontWeight: 700, color: have ? "var(--amber-deep)" : "#94A3B8", textTransform: "uppercase", letterSpacing: ".05em" }}>{have ? "in progress" : "to do"}</span>}
            </Link>
          ))}
          <Link href={`/tenants/${tenant.id}/signup`} className="btn ghost sm" style={{ justifyContent: "center" }}>Open the pack →</Link>
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingTop: "16px", borderTop: "1px dashed #E2E8F0" }}>
          <button onClick={() => window.open(`/tenants/${tenant.id}/print`, "_blank")} style={{ minHeight: "44px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
            🖨 Print the record
          </button>
          <button onClick={() => setEvictionOpen(true)} style={{ minHeight: "44px", borderRadius: "8px", border: "1px solid rgba(224,82,82,0.3)", background: "rgba(224,82,82,0.06)", color: "#E05252", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
            ⚠️ Eviction Notice
          </button>
        </div>
      </aside>
      <EvictionNoticeModal tenant={tenant} open={evictionOpen} onClose={() => setEvictionOpen(false)} />
    </>
  );
}
