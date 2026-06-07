"use client";

import { useState, useEffect, useCallback } from "react";
import { formatShortDate } from "../../lib/format";
import { FormSection } from "../form/fields";

export function NotesTab({ tenantId }: { tenantId: string }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/staff-notes?tenantId=${tenantId}`);
    if (res.ok) setNotes(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  async function onSave() {
    if (!content.trim()) return;
    setSaving(true);
    const res = await fetch("/api/staff-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        note_content: content
      })
    });
    setSaving(false);
    if (res.ok) {
      setContent("");
      void load();
    }
  }

  if (loading) return <div style={{ padding: "20px" }}>Loading notes...</div>;

  return (
    <div style={{ marginTop: "20px" }}>
      <FormSection title="Leave a Staff Note">
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write a private note for staff only..."
            style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px", minHeight: "80px", boxSizing: "border-box", fontFamily: "'Sora', sans-serif" }}
          />
        </div>
        <button
          onClick={onSave}
          disabled={saving || !content.trim()}
          style={{ minHeight: "44px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: saving || !content.trim() ? "not-allowed" : "pointer", fontFamily: "'Sora', sans-serif" }}
        >
          {saving ? "Saving..." : "Add Note"}
        </button>
      </FormSection>

      <div style={{ marginTop: "30px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px" }}>Staff Notes History</h3>
        {notes.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#7A8499" }}>No internal notes yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {notes.map(n => (
              <div key={n.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px", background: "#F8F4EF", borderRadius: "8px", border: "1px solid #EDE8E1" }}>
                <div style={{ flex: 1, paddingRight: "16px" }}>
                  <p style={{ fontSize: "13px", color: "var(--navy)", margin: 0, whiteSpace: "pre-wrap" }}>{n.note_content}</p>
                </div>
                <div style={{ textAlign: "right", fontSize: "11px", color: "#7A8499", minWidth: "120px" }}>
                  <div style={{ fontWeight: 600, color: "var(--amber)", marginBottom: "4px" }}>{n.author_name}</div>
                  <div>{formatShortDate(n.created_at)}</div>
                  <div style={{ fontSize: "10px", marginTop: "2px" }}>{new Date(n.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
