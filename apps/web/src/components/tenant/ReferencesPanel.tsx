"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatShortDate } from "../../lib/format";

/**
 * Tenant referencing (migration 052) — lives under the Right to Rent tab:
 * the ID check says who they are; a reference says how it went last time.
 * The referee gets an email with a one-shot link; the answer appears here.
 */
interface Ref {
  id: string; kind: string; refereeName: string; refereeEmail: string; status: "requested" | "received" | "declined";
  decision: "positive" | "negative" | "unable" | null; response: string | null; notifiedAt: string | null; respondedAt: string | null; expiresAt: string; requestedBy: string; createdAt: string;
}

const KIND_LABEL: Record<string, string> = { previous_landlord: "Previous landlord", employer: "Employer", support_worker: "Support worker", character: "Character" };
const DECISION: Record<string, { label: string; color: string; bg: string }> = {
  positive: { label: "Positive", color: "#1E7F4F", bg: "rgba(30,127,79,.12)" },
  negative: { label: "Negative", color: "#E05252", bg: "rgba(224,82,82,.12)" },
  unable: { label: "Couldn't say", color: "var(--amber-deep)", bg: "rgba(232,168,76,.16)" },
};

export function ReferencesPanel({ tenantId }: { tenantId: string }) {
  const [refs, setRefs] = useState<Ref[]>([]);
  const [kind, setKind] = useState("previous_landlord");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await fetch(`/api/tenants/${tenantId}/references`); if (r.ok) setRefs(await r.json()); } catch { /* keep what we have (H8) */ }
  }, [tenantId]);
  useEffect(() => { void load(); }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null); setManualUrl(null);
    try {
      const r = await fetch(`/api/tenants/${tenantId}/references`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, refereeName: name, refereeEmail: email }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not send the request."); return; }
      if (b?.notified) setNotice(`Asked ${name} by email. The link works once, for 21 days.`);
      else { setNotice(`Email isn't configured on this environment, so the request wasn't sent automatically. Send ${name} this link yourself:`); setManualUrl(b?.url ?? null); }
      setName(""); setEmail("");
      await load();
    } catch { setError("Could not reach the server. Nothing was sent."); }
    finally { setBusy(false); }
  }

  return (
    <section className="card" style={{ marginTop: 18 }}>
      <div className="ch"><h3>References</h3></div>
      <form onSubmit={onSubmit} className="li" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "end" }}>
        <label><span className="lbl">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={inp}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label><span className="lbl">Referee name</span><input value={name} onChange={(e) => setName(e.target.value)} required style={inp} /></label>
        <label><span className="lbl">Referee email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inp} /></label>
        <div><button type="submit" className="rel sm" disabled={busy || !name || !email}>{busy ? "Sending…" : "Ask for a reference"}</button></div>
        {error && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13, gridColumn: "1 / -1" }}>{error}</p>}
        {notice && <p style={{ color: "var(--live)", margin: 0, fontSize: 13, gridColumn: "1 / -1" }}>{notice}{manualUrl && <> <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, wordBreak: "break-all" }}>{manualUrl}</code></>}</p>}
      </form>
      {refs.length === 0 ? <div className="li"><p className="muted">No references asked for yet.</p></div> : refs.map((r) => {
        const d = r.decision ? DECISION[r.decision] : null;
        return (
          <div className="li" key={r.id} style={{ alignItems: "flex-start" }}>
            <div className="body">
              <b>{KIND_LABEL[r.kind] ?? r.kind} · {r.refereeName}</b>
              <p>{r.refereeEmail} · asked {formatShortDate(r.createdAt)} by {r.requestedBy}{!r.notifiedAt && r.status === "requested" ? " · email not sent" : ""}</p>
              {r.response && <p style={{ marginTop: 6, whiteSpace: "pre-wrap", color: "var(--ink)" }}>&ldquo;{r.response}&rdquo;</p>}
            </div>
            {d ? <span className="tag" style={{ background: d.bg, color: d.color }}>{d.label}{r.respondedAt ? ` · ${formatShortDate(r.respondedAt)}` : ""}</span>
               : <span className="tag" style={{ background: "rgba(232,168,76,.16)", color: "var(--amber-deep)" }}>Waiting · expires {formatShortDate(r.expiresAt)}</span>}
          </div>
        );
      })}
    </section>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
