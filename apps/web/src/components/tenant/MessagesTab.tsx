/**
 * MessagesTab — messages sent to this tenant, and one form to send another.
 * Folded in from the org-wide Communications page (BUILD_PLAN C05): a message is
 * about a person, so it lives on the person's record.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { formatShortDate } from "../../lib/format";
import { FormSection } from "../form/fields";

interface Log { id: string; sent_at: string; channel: string; message_type: string; content: string; sent_by: string | null }

export function MessagesTab({ tenantId, tenantName }: { tenantId: string; tenantName?: string }) {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [channel, setChannel] = useState("Email");
  const [msgType, setMsgType] = useState("General Update");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/communications?tenantId=${tenantId}`);
    if (res.ok) setLogs((await res.json()) as Log[]);
    else setLogs((prev) => prev ?? []);
  }, [tenantId]);
  useEffect(() => { void load(); }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setBusy(true); setError(null);
    const res = await fetch("/api/communications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, channel, message_type: msgType, content }),
    });
    setBusy(false);
    if (res.ok) { setContent(""); void load(); }
    else setError((await res.json().catch(() => null))?.error ?? "Couldn't send. Nothing was lost. Try again.");
  }

  async function draft() {
    setDrafting(true);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, messageType: msgType, recipientName: tenantName ?? "the tenant" }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.draft) setContent(String(data.draft).trim());
      else setError(data?.error ?? "The draft didn't come back. Write it yourself or try again.");
    } finally { setDrafting(false); }
  }

  return (
    <div style={{ marginTop: "20px" }}>
      <FormSection title="Send a message">
        <form onSubmit={send} style={{ display: "grid", gap: "10px" }}>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <label style={{ flex: 1, minWidth: 140 }}><span className="lbl">How</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} style={sel}><option>Email</option><option>SMS</option></select></label>
            <label style={{ flex: 1, minWidth: 180 }}><span className="lbl">About</span>
              <select value={msgType} onChange={(e) => setMsgType(e.target.value)} style={sel}>
                <option>General Update</option><option>Arrears Reminder</option><option>Missing Intake Form</option></select></label>
          </div>
          <label><span className="lbl">What to say</span>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} required placeholder="Plain words. It goes out exactly as written." style={{ ...sel, minHeight: 96, resize: "vertical" }} /></label>
          {error && <p className="form-error">{error}</p>}
          <div className="btns">
            <button type="submit" className="rel" disabled={busy || !content.trim()}>{busy ? "Sending…" : "Send"}</button>
            <button type="button" className="btn ghost" onClick={draft} disabled={drafting}>{drafting ? "Drafting…" : "Draft it for me"}</button>
          </div>
        </form>
      </FormSection>

      <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--navy)", margin: "28px 0 12px" }}>Messages sent</h3>
      {logs === null ? <p className="muted">Loading…</p>
        : logs.length === 0 ? <p className="muted">Nothing sent yet. The first message you send appears here.</p>
        : <div className="card">{logs.map((l) => (
            <div className="li" key={l.id}>
              <div className="body"><b>{l.message_type} · {l.channel}</b><p style={{ whiteSpace: "pre-wrap" }}>{l.content}</p></div>
              <span className="muted" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{formatShortDate(l.sent_at)}<br />{l.sent_by}</span>
            </div>))}</div>}
    </div>
  );
}

const sel: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
