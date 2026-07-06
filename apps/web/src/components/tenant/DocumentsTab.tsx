"use client";

import React, { useState, useEffect, useCallback } from "react";
import { formatShortDate } from "../../lib/format";
import { getSupabaseBrowser } from "../../lib/supabase-browser";

export function DocumentsTab({ tenantId }: { tenantId: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents?tenantId=${tenantId}`);
      if (res.ok) setDocs(await res.json());
    } catch (err) {
      console.error("Failed to load documents", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const supabase = getSupabaseBrowser();
      const ext = file.name.split('.').pop();
      const fileName = `tenant-${tenantId}-${Date.now()}.${ext}`;

      // 1. Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("tenant-documents")
        .upload(fileName, file);

      if (uploadError) {
        alert("Document upload failed: " + uploadError.message);
        return;
      }

      // 2. Save record to DB
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          name: file.name, // Skip prompting the user, use actual file name
          file_url: uploadData.path
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        alert("Failed to save document record: " + (errData?.error || "Unknown error"));
      }
    } catch (err: any) {
      alert("An error occurred during upload: " + err.message);
    } finally {
      e.target.value = '';
      setUploading(false);
      void load();
    }
  }

  async function handleDownload(id: string, fileUrl: string) {
    setActioningId(id);
    const supabase = getSupabaseBrowser();
    try {
      const { data, error } = await supabase.storage
        .from("tenant-documents")
        .createSignedUrl(fileUrl, 300); // URL valid for 5 minutes

      if (error) {
        alert("Error generating download link: " + error.message);
        return;
      }

      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank");
      }
    } catch (err: any) {
      alert("Failed to open file: " + err.message);
    } finally {
      setActioningId(null);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation(); // Prevent card click (triggering download)
    if (!window.confirm("Are you sure you want to permanently delete this document?")) return;

    setActioningId(id);
    try {
      const res = await fetch(`/api/documents?id=${id}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        alert("Failed to delete document: " + (errData?.error || "Unknown error"));
      }
    } catch (err: any) {
      alert("An error occurred: " + err.message);
    } finally {
      setActioningId(null);
      void load();
    }
  }

  if (loading) return <div style={{ padding: "20px", color: "var(--navy)" }}>Loading documents...</div>;

  return (
    <div style={{ marginTop: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy)", margin: 0 }}>Document Vault</h3>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileSelected} 
        />
        <button 
          onClick={() => fileInputRef.current?.click()} 
          disabled={uploading}
          style={{ 
            padding: "8px 16px", 
            borderRadius: "6px", 
            border: "none", 
            background: uploading ? "#ccc" : "var(--amber)", 
            color: "var(--navy)", 
            fontWeight: 700, 
            fontSize: "12px", 
            cursor: uploading ? "not-allowed" : "pointer" 
          }}
        >
          {uploading ? "⏳ Uploading..." : "+ Upload Document"}
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" }}>
          {docs.map(d => (
            <div 
              key={d.id} 
              onClick={() => handleDownload(d.id, d.file_url)}
              style={{ 
                border: "1px solid #EDE8E1", 
                borderRadius: "8px", 
                padding: "16px", 
                background: "#fff", 
                display: "flex", 
                flexDirection: "column", 
                gap: "8px",
                position: "relative",
                cursor: actioningId === d.id ? "wait" : "pointer",
                transition: "transform 0.2s, box-shadow 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 4px 6px rgba(15, 28, 46, 0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontSize: "24px" }}>📄</span>
                <button 
                  onClick={(e) => handleDelete(e, d.id)}
                  title="Delete Document"
                  style={{ 
                    background: "transparent", 
                    border: "none", 
                    color: "#E05252", 
                    fontSize: "16px", 
                    cursor: "pointer", 
                    padding: "4px",
                    borderRadius: "4px"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#FEE2E2"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  🗑️
                </button>
              </div>

              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--navy)", wordBreak: "break-all", marginTop: "4px" }}>
                {d.name}
              </span>

              <div style={{ fontSize: "11px", color: "#7A8499", marginTop: "auto", borderTop: "1px solid #F8F4EF", paddingTop: "8px" }}>
                <div>Uploaded {formatShortDate(d.created_at)}</div>
                <div>by {d.uploaded_by}</div>
              </div>

              {actioningId === d.id && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(255,255,255,0.7)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--navy)",
                  borderRadius: "8px"
                }}>
                  Processing...
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
