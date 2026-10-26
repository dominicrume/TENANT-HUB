/**
 * Platform Owner Console — the permanent fix for the terminal-script
 * workflow (Rume, 2026-10-26). Every organisation on the platform, every
 * profile inside each, with four buttons per row: Reset password · Change
 * email · Delete profile · Delete whole org. Only renders when the signed-in
 * email is on PLATFORM_OWNER_EMAILS; everyone else is redirected home.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Profile { id: string; email: string; fullName: string; role: string; createdAt: string }
interface Org { id: string | null; name: string | null; createdAt: string | null; profiles: Profile[] }

type ActionNote = { kind: "ok" | "err"; text: string; copy?: { label: string; value: string }[] };

export default function PlatformConsolePage() {
  const router = useRouter();
  const [owner, setOwner] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<ActionNote | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/platform/me").then((r) => (r.ok ? r.json() : null)).then((j) => {
      const ok = Boolean(j?.isPlatformOwner); setOwner(ok);
      if (!ok) { router.replace("/dashboard"); return; }
      void load();
    }).catch(() => { setOwner(false); router.replace("/dashboard"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const r = await fetch("/api/platform/orgs");
      const b = await r.json().catch(() => null);
      if (!r.ok) { setError(b?.error ?? "Could not load."); return; }
      setOrgs(b.orgs); setError(null);
    } catch { setError("Could not reach the server."); }
  }

  const filtered = useMemo(() => {
    if (!orgs) return null;
    if (!search.trim()) return orgs;
    const q = search.trim().toLowerCase();
    return orgs.map((o) => ({ ...o, profiles: o.profiles.filter((p) => p.email.toLowerCase().includes(q) || p.fullName.toLowerCase().includes(q) || (o.name ?? "").toLowerCase().includes(q)) })).filter((o) => o.profiles.length > 0);
  }, [orgs, search]);

  async function reset(p: Profile) {
    if (!window.confirm(`Issue ${p.fullName} <${p.email}> a new password? The old one stops working everywhere, now.`)) return;
    setBusy(p.id); setNote(null);
    try {
      const r = await fetch(`/api/platform/profiles/${p.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setNote({ kind: "err", text: b?.error ?? "Could not reset." }); return; }
      setNote({ kind: "ok", text: `New password for ${p.fullName}. Every previous session has been signed out.`, copy: [{ label: "Email", value: b.email }, { label: "Password", value: b.password }] });
    } catch { setNote({ kind: "err", text: "Could not reach the server." }); } finally { setBusy(null); }
  }

  async function changeEmail(p: Profile) {
    const next = window.prompt(`Change ${p.fullName}'s email from "${p.email}" to:`, p.email)?.trim();
    if (!next || next === p.email) return;
    setBusy(p.id); setNote(null);
    try {
      const r = await fetch(`/api/platform/profiles/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: next }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setNote({ kind: "err", text: b?.error ?? "Could not change email." }); return; }
      setNote({ kind: "ok", text: `Email changed: ${b.from} → ${b.to}. Password is unchanged.` });
      void load();
    } catch { setNote({ kind: "err", text: "Could not reach the server." }); } finally { setBusy(null); }
  }

  async function remove(p: Profile, orgName: string | null, soleMember: boolean) {
    const msg = soleMember
      ? `${p.fullName} is the only profile in "${orgName ?? "(no org)"}". Deleting them wipes the ENTIRE organisation and every tenant/property/landlord in it. Type DELETE to confirm:`
      : `Remove ${p.fullName} from the platform? The rest of "${orgName ?? "(no org)"}" stays. Type DELETE to confirm:`;
    const typed = window.prompt(msg);
    if (typed !== "DELETE") return;
    setBusy(p.id); setNote(null);
    try {
      const r = await fetch(`/api/platform/profiles/${p.id}`, { method: "DELETE" });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setNote({ kind: "err", text: b?.error ?? "Could not delete." }); return; }
      setNote({ kind: "ok", text: b.wipedOrg ? `"${b.wipedOrg.name}" and ${b.wipedProfile} are gone. Both are free to reuse on /signup.` : `${b.wipedProfile} removed. Their organisation stays.` });
      void load();
    } catch { setNote({ kind: "err", text: "Could not reach the server." }); } finally { setBusy(null); }
  }

  if (owner === null) return <div style={{ padding: "1.75rem" }}><p className="muted">Checking access…</p></div>;
  if (!owner) return null;

  return (
    <div style={{ padding: "1.75rem", maxWidth: 1040 }}>
      <h1 style={{ margin: 0 }}>Platform owner console</h1>
      <p className="sub">Every organisation and every profile on this instance of Tenant Hub. Only accounts in PLATFORM_OWNER_EMAILS see this page. Every change here is audited.</p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "6px 0 14px" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by email, name, or organisation…" style={{ flex: 1, minWidth: 260, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14 }} />
        <button type="button" className="btn ghost sm" onClick={() => void load()}>Refresh</button>
      </div>

      {note && (
        <div className="card" style={{ marginBottom: 14, borderColor: note.kind === "ok" ? "var(--live)" : "var(--brick)" }}>
          <div className="li" style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, color: note.kind === "ok" ? "var(--live)" : "var(--brick)", fontWeight: 600, fontSize: 13.5 }}>{note.text}</p>
            {note.copy && (
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 8, alignItems: "center" }}>
                {note.copy.map((c) => (
                  <>
                    <span key={`${c.label}-l`} style={{ fontSize: 11, fontWeight: 600, color: "var(--slate-2)", textTransform: "uppercase", letterSpacing: ".04em" }}>{c.label}</span>
                    <input key={`${c.label}-v`} readOnly value={c.value} onFocus={(e) => e.currentTarget.select()} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)" }} />
                    <button key={`${c.label}-b`} type="button" className="btn ghost sm" onClick={() => void navigator.clipboard.writeText(c.value).catch(() => {})}>Copy</button>
                  </>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
      {!filtered && !error ? <p className="muted">Loading…</p> : null}

      {filtered?.map((o) => {
        const key = o.id ?? "null";
        const open = expanded[key] !== false;
        return (
          <section className="card" key={key} style={{ marginBottom: 14 }}>
            <div className="ch" style={{ cursor: "pointer" }} onClick={() => setExpanded((s) => ({ ...s, [key]: !open }))}>
              <h3 style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span aria-hidden="true">{open ? "▾" : "▸"}</span>
                {o.name ?? "(no organisation)"}
                <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>· {o.profiles.length} {o.profiles.length === 1 ? "profile" : "profiles"}</span>
              </h3>
              {o.id && (
                <span className="muted" style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{o.id.slice(0, 8)}…</span>
              )}
            </div>
            {open && o.profiles.map((p) => (
              <div key={p.id} className="li" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="body">
                  <b>{p.fullName}</b>
                  <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{p.email}  ·  {p.role}</p>
                </div>
                <div className="btns">
                  <button type="button" className="btn ghost sm" disabled={busy === p.id} onClick={() => void reset(p)}>Reset password</button>
                  <button type="button" className="btn ghost sm" disabled={busy === p.id} onClick={() => void changeEmail(p)}>Change email</button>
                  <button type="button" className="btn ghost sm" disabled={busy === p.id} style={{ color: "var(--brick)" }} onClick={() => void remove(p, o.name, o.profiles.length === 1)}>{o.profiles.length === 1 ? "Delete profile + org" : "Delete profile"}</button>
                </div>
              </div>
            ))}
          </section>
        );
      })}

      {filtered && filtered.length === 0 && <div className="card"><div className="li"><p className="muted">No profiles match that filter.</p></div></div>}

      <p className="muted" style={{ margin: "16px 0 0", fontSize: 12 }}>
        <Link href="/settings" style={{ color: "var(--amber-deep)", fontWeight: 600 }}>Back to Settings</Link> · For emergencies when this page itself is down, the equivalent scripts still live in <code>packages/db/scripts/</code>.
      </p>
    </div>
  );
}
