"use client";

import { useState, useEffect, useCallback } from "react";
import { formatShortDate } from "../../lib/format";

export function DocumentsTab({ tenantId }: { tenantId: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/documents?tenantId=${tenantId}`);
    if (res.ok) setDocs(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  // For Sprint 3, we simulate the upload to Supabase storage to keep the walkthrough seamless
  async function simulateUpload() {
    const name = prompt("Enter document name (e.g. Right to Rent ID):");
    if (!name) return;
    
    await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        name: name,
        file_url: `dummy://tenant-documents/${tenantId}/${Date.now()}.pdf`
      })
    });
    void load();
  }

  if (loading) return <div style={{ padding: "20px" }}>Loading documents...</div>;

  return (
    <div style={{ marginTop: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy)", margin: 0 }}>Document Vault</h3>
        <button onClick={simulateUpload} style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "var(--amber)", color: "var(--navy)", fontWeight: 700, fontSize: "12px", cursor: "pointer" }}>
          + Upload Document
        </button>
      </div>

      <p style={{ fontSize: "13px", color: "#7A8499", marginBottom: "20px" }}>
        Securely store Right to Rent checks, IDs, Tenancy Agreements, and Warning Letters.
      </p>

      {docs.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", background: "#F8F4EF", borderRadius: "8px", border: "1px dashed #EDE8E1" }}>
          <span style={{ fontSize: "24px", display: "block", marginBottom: "8px" }}>📄</span>
          <p style={{ fontSize: "13px", color: "#7A8499", margin: 0 }}>No documents uploaded yet.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
          {docs.map(d => (
            <div key={d.id} style={{ border: "1px solid #EDE8E1", borderRadius: "8px", padding: "16px", background: "#fff", display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "24px" }}>📄</span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--navy)", wordBreak: "break-word" }}>{d.name}</span>
              <div style={{ fontSize: "11px", color: "#7A8499", marginTop: "auto" }}>
                <div>Uploaded {formatShortDate(d.created_at)}</div>
                <div>by {d.uploaded_by}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
