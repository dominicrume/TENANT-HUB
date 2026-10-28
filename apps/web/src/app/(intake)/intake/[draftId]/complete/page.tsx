/**
 * Step 5 — Complete + commit. On load, POSTs the draft to /api/intake/commit,
 * which creates the tenant via writeWithAudit (atomic tenant + audit + async
 * stamp enqueue, H6). Shows the two stamps and links into the new record.
 *
 * Error recovery (106 / D1): the agent audit flagged that we rendered every
 * 4xx as a generic "Could not complete intake" with a single "← Back to
 * verification" link — forcing the staff member to re-sign for a 1-character
 * fix. We now branch on the commit response's `code`:
 *   · room_occupied — tenant was still created (race condition during final
 *     commit), link straight to the tenant record so staff can place them on
 *     the property page without starting over.
 *   · otherwise — generic message + back-to-verification, same as before.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { truncateHash } from "../../../../../lib/format";

interface CommitError {
  message: string;
  code?: string;
  tenantId?: string | null;
}

export default function CompletePage() {
  const { draftId } = useParams<{ draftId: string }>();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<CommitError | null>(null);
  const committed = useRef(false);

  useEffect(() => {
    if (committed.current) return;
    committed.current = true;
    fetch("/api/intake/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId }),
    })
      .then(async (r) => {
        const b = await r.json().catch(() => null);
        if (!r.ok) {
          setError({
            message: b?.error ?? "Commit failed",
            code: b?.code,
            tenantId: b?.tenant_id ?? null,
          });
          return;
        }
        setTenantId(b.tenant?.id ?? null);
        setHash(b.tenant?.tenant_signature_hash ?? null);
      })
      .catch((e) => setError({ message: e instanceof Error ? e.message : "Commit failed" }));
  }, [draftId]);

  if (error) {
    // Room occupied race (104 translates Postgres 23505 to this code). The
    // tenant WAS created — commit returns their id in the error payload — so
    // we send staff straight to the tenant record where they can place them
    // against a free room without reliving the whole intake + signature flow.
    if (error.code === "room_occupied") {
      return (
        <div style={{ maxWidth: "560px", margin: "0 auto", padding: "24px 0" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#B24A31" }}>
            Room was just taken — but the tenant was created.
          </h1>
          <p style={{ fontSize: "14px", color: "#445", marginTop: "10px", lineHeight: 1.6 }}>
            {error.message}
          </p>
          <p style={{ fontSize: "14px", color: "#445", marginTop: "10px", lineHeight: 1.6 }}>
            Open the tenant record and place them against a different room on the property page — nothing is lost, no need to re-enter their details.
          </p>
          <div style={{ display: "flex", gap: "10px", marginTop: "18px", flexWrap: "wrap" }}>
            {error.tenantId && (
              <Link href={`/tenants/${error.tenantId}`}
                style={{ minHeight: "48px", display: "inline-flex", alignItems: "center", padding: "0 20px", borderRadius: "8px", background: "var(--navy)", color: "#fff", textDecoration: "none", fontWeight: 700 }}>
                Open the tenant record
              </Link>
            )}
            <Link href="/properties"
              style={{ minHeight: "48px", display: "inline-flex", alignItems: "center", padding: "0 20px", borderRadius: "8px", border: "1px solid #EDE8E1", color: "var(--navy)", textDecoration: "none", fontWeight: 600 }}>
              Browse properties
            </Link>
          </div>
        </div>
      );
    }
    // Generic fallback: everything else that could land here (H4 "Record
    // changed since review", draft-already-completed, auth, etc.). Back to
    // verify is the right next step — nothing was created.
    return (
      <div style={{ maxWidth: "560px", margin: "0 auto", padding: "24px 0" }}>
        <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#E05252" }}>Could not complete intake</h1>
        <p style={{ fontSize: "14px", color: "#445", marginTop: "8px", lineHeight: 1.6 }}>{error.message}</p>
        <p style={{ marginTop: "14px" }}>
          <Link href={`/intake/${draftId}/verify`} style={{ color: "var(--navy)", fontSize: "13px", fontWeight: 600 }}>← Back to verification</Link>
          <span style={{ margin: "0 10px", color: "#999" }}>·</span>
          <Link href={`/intake/${draftId}/review`} style={{ color: "var(--navy)", fontSize: "13px", fontWeight: 600 }}>Back to review</Link>
        </p>
      </div>
    );
  }

  const stampCard: React.CSSProperties = {
    border: "1px solid rgba(124,58,237,0.3)", borderRadius: "10px", padding: "12px 14px",
    fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#4B2E83",
    background: "rgba(124,58,237,0.05)",
  };

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "rgba(52,200,122,0.15)", color: "#1E7F4F", fontSize: "34px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        ✓
      </div>
      <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--navy)" }}>
        {tenantId ? "Tenant record created successfully." : "Finalising…"}
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "20px auto", maxWidth: "440px", textAlign: "left" }}>
        <div style={stampCard}>
          <div>⛓ Staff Entry Stamp</div>
          <div>Hash: {truncateHash(hash, 16)}</div>
          <div>Status: <span style={{ color: "#E8A84C" }}>● Pending</span> → Done when the worker drains the queue</div>
        </div>
        <div style={stampCard}>
          <div>⛓ Tenant Signature Stamp</div>
          <div>Status: <span style={{ color: "#1E7F4F" }}>● Confirmed</span></div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
        {tenantId && (
          <Link href={`/tenants/${tenantId}`}
            style={{ minHeight: "56px", display: "inline-flex", alignItems: "center", padding: "0 22px", borderRadius: "8px", background: "var(--navy)", color: "#fff", textDecoration: "none", fontWeight: 700 }}>
            Open Tenant Record
          </Link>
        )}
        <Link href="/intake/new"
          style={{ minHeight: "56px", display: "inline-flex", alignItems: "center", padding: "0 22px", borderRadius: "8px", border: "1px solid #EDE8E1", color: "var(--navy)", textDecoration: "none", fontWeight: 600 }}>
          Add Another Tenant
        </Link>
      </div>
    </div>
  );
}
