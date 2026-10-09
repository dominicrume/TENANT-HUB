"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatDateTime } from "../../lib/format";

/**
 * Settings → Integrations: outbound webhooks (migration 052). One URL +
 * a secret, and Zapier / Make / n8n / Power Automate / your own script gets a
 * signed POST whenever something happens. This is "years of integrations"
 * bought as one mechanism instead of a connector per vendor.
 */
interface Hook { id: string; url: string; events: string[]; active: boolean; label: string | null; createdAt: string; secretHint: string }
interface Delivery { id: string; webhookId: string; event: string; statusCode: number | null; ok: boolean; error: string | null; attemptedAt: string }

const EVENT_HELP: Record<string, string> = {
  "tenant.created": "A tenant record is created (intake commit or quick add)",
  "tenancy.created": "A tenant is placed in a room",
  "ticket.created": "A maintenance ticket is raised (staff or tenant portal)",
  "document.filed": "A document is filed on a tenant",
  "document.received": "A property document is added or arrives from a landlord",
  "payment.recorded": "A rent / service-charge payment is recorded",
};

export function IntegrationsTab() {
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<{ url: string; secret: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/integrations");
      if (!r.ok) return;
      const b = await r.json();
      setHooks(b.hooks ?? []); setDeliveries(b.deliveries ?? []); setEvents(b.events ?? []);
    } catch { /* keep what we have (H8) */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNewSecret(null);
    try {
      const r = await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, label, events: picked }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not add the webhook."); return; }
      setNewSecret({ url: b.url, secret: b.secret });
      setUrl(""); setLabel(""); setPicked([]);
      await load();
    } catch { setError("Could not reach the server."); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this webhook? The other system will stop receiving events immediately.")) return;
    try { await fetch(`/api/integrations/${id}`, { method: "DELETE" }); await load(); } catch { /* list stays as is */ }
  }

  return (
    <>
      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>Add a webhook</h3></div>
        <form onSubmit={add} className="li" style={{ display: "grid", gap: 10 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Paste the URL Zapier, Make, n8n or your own system gives you. We POST a signed JSON event to it. Leave every event unticked to receive all of them.</p>
          <label><span className="lbl">Name (optional)</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Zapier → Google Sheet of new tenants" style={inp} /></label>
          <label><span className="lbl">URL</span><input value={url} onChange={(e) => setUrl(e.target.value)} type="url" required placeholder="https://hooks.zapier.com/hooks/catch/…" style={inp} /></label>
          <div>
            <span className="lbl">Events</span>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {events.map((ev) => (
                <label key={ev} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, cursor: "pointer" }}>
                  <input type="checkbox" checked={picked.includes(ev)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, ev] : p.filter((x) => x !== ev))} style={{ marginTop: 3 }} />
                  <span><code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}>{ev}</code><br /><span className="muted" style={{ fontSize: 12.5 }}>{EVENT_HELP[ev] ?? ""}</span></span>
                </label>
              ))}
            </div>
          </div>
          {error && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13 }}>{error}</p>}
          <div><button type="submit" className="rel sm" disabled={busy || !url}>{busy ? "Adding…" : "Add webhook"}</button></div>
        </form>
      </section>

      {newSecret && (
        <section className="card" style={{ marginBottom: 18, borderColor: "var(--amber)" }}>
          <div className="ch"><h3>Signing secret — copy it now</h3></div>
          <div className="li" style={{ display: "block" }}>
            <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>Shown only this once. Use it to check <code>X-TenantHub-Signature</code> (<code>sha256=</code> HMAC-SHA256 of <code>&lt;X-TenantHub-Timestamp&gt;.&lt;raw body&gt;</code>). If you don&apos;t verify signatures, you can ignore it.</p>
            <code style={{ display: "block", padding: "10px 12px", background: "var(--cream)", borderRadius: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, wordBreak: "break-all", userSelect: "all" }}>{newSecret.secret}</code>
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="button" className="btn ghost sm" onClick={() => navigator.clipboard?.writeText(newSecret.secret).catch(() => {})}>Copy</button>
              <button type="button" className="rel sm" onClick={() => setNewSecret(null)}>Done</button>
            </div>
          </div>
        </section>
      )}

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><h3>Webhooks</h3></div>
        {hooks.length === 0 ? <div className="li"><p className="muted">None yet. Add one above and the first matching event will reach it within a second of happening.</p></div> : hooks.map((h) => (
          <div className="li" key={h.id} style={{ alignItems: "flex-start" }}>
            <div className="body" style={{ minWidth: 0 }}>
              <b>{h.label || "Webhook"}</b>
              <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, wordBreak: "break-all" }}>{h.url}</p>
              <p className="muted" style={{ fontSize: 12.5 }}>{h.events.length ? h.events.join(", ") : "all events"} · secret {h.secretHint} · added {formatDateTime(h.createdAt)}</p>
            </div>
            <button type="button" className="btn ghost sm" onClick={() => remove(h.id)}>Remove</button>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="ch"><h3>Recent deliveries</h3></div>
        {deliveries.length === 0 ? <div className="li"><p className="muted">Nothing sent yet.</p></div> : deliveries.map((d) => (
          <div className="li" key={d.id}>
            <div className="body">
              <b style={{ color: d.ok ? "var(--live)" : "var(--brick)" }}>● {d.ok ? "Delivered" : "Failed"} · <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}>{d.event}</code></b>
              <p className="muted" style={{ fontSize: 12.5 }}>{d.statusCode ? `HTTP ${d.statusCode}` : ""}{d.error ? ` · ${d.error}` : ""} · {hooks.find((h) => h.id === d.webhookId)?.label || hooks.find((h) => h.id === d.webhookId)?.url || "removed webhook"}</p>
            </div>
            <span className="muted" style={{ fontSize: 12.5 }}>{formatDateTime(d.attemptedAt)}</span>
          </div>
        ))}
      </section>
    </>
  );
}

const inp: React.CSSProperties = { width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
