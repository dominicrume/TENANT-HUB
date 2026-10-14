/**
 * /tenants/[id]/signup — station 3 opens here, full page: the seven
 * sections. Click a section for its forms; each form is filled from the
 * record, signed on the pad, filed back into the section (Matloob,
 * 2026-10-15).
 */
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { SIGNUP_SECTIONS, slotMatches } from "../../../../../lib/signup";
import type { FilesResponse } from "../../../../../components/files/upload";

export default function SignupSectionsPage() {
  const { id } = useParams<{ id: string }>();
  const [files, setFiles] = useState<FilesResponse | null>(null);
  const [tenant, setTenant] = useState<{ full_name: string } | null>(null);
  useEffect(() => {
    fetch(`/api/files?entity=tenant&id=${id}`).then((r) => (r.ok ? r.json() : null)).then(setFiles).catch(() => {});
    fetch(`/api/tenants/${id}`).then((r) => (r.ok ? r.json() : null)).then(setTenant).catch(() => {});
  }, [id]);
  const docs = (files?.items ?? []).filter((f) => f.kind === "document" && f.blobId);
  return (
    <div style={{ padding: "1.75rem", maxWidth: 900 }}>
      <p style={{ margin: "0 0 10px", fontSize: 12.5 }}><Link href={`/tenants/${id}`} style={{ color: "var(--slate)" }}>{tenant?.full_name ?? "Tenant"}</Link> <span className="muted">/</span> Sign-up</p>
      <h1 style={{ margin: 0 }}>Sign-up{tenant ? ` · ${tenant.full_name}` : ""}</h1>
      <p className="sub">Seven sections, the way the folders are kept. Open a section, open a form: it&apos;s filled from the record, the tenant signs on the pad, and it&apos;s filed. The licence agreement in section 1 turns station 3 green.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
        {SIGNUP_SECTIONS.map((sec) => {
          const have = sec.slots.filter((sl) => docs.some((d) => slotMatches(sl, d.name))).length;
          const extra = docs.filter((d) => d.section === sec.n && !sec.slots.some((sl) => slotMatches(sl, d.name))).length;
          const complete = sec.slots.length > 0 && have === sec.slots.length;
          return (
            <Link key={sec.n} href={`/tenants/${id}/signup/${sec.n}`} className="card" style={{ padding: 18, textDecoration: "none", color: "inherit", display: "grid", gap: 8, borderColor: complete ? "var(--live)" : undefined }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 40, height: 40, borderRadius: 10, background: complete ? "var(--live)" : sec.slots.length === 0 ? "#E9E1D4" : "var(--navy)", color: complete || sec.slots.length ? "#fff" : "var(--slate)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 16 }}>{complete ? "✓" : sec.n}</span>
                <div><b style={{ display: "block", fontSize: 15 }}>Section {sec.n}</b><span className="muted" style={{ fontSize: 12.5 }}>{sec.title !== `Section ${sec.n}` ? sec.title : "Nothing required yet"}</span></div>
              </div>
              <div style={{ fontSize: 13, color: sec.slots.length ? "var(--navy)" : "var(--slate)" }}>{sec.slots.length ? `${have} of ${sec.slots.length} forms on file${extra ? ` · +${extra} added` : ""}` : extra ? `${extra} document${extra === 1 ? "" : "s"} added` : "Empty — you can still add documents"}</div>
              {sec.slots.length > 0 && <div style={{ height: 6, borderRadius: 3, background: "var(--cream)", overflow: "hidden" }}><div style={{ width: `${Math.round((have / sec.slots.length) * 100)}%`, height: "100%", background: complete ? "var(--live)" : "var(--amber)" }} /></div>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
