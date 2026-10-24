/**
 * Settings — Users / Service Charges / Brands / Blockchain Status / Billing.
 * Users + Blockchain read live data; Service Charges default and Brand
 * details are local until a settings table exists (noted inline). Rebuilt
 * onto the console design system; no data logic changed. Billing errors show
 * inline now instead of a native browser alert.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBrand, BRAND_LABELS } from "../../../contexts/BrandContext";
import { useAuth } from "../../../contexts/AuthContext";
import { formatDateTime, truncateHash } from "../../../lib/format";
import { SecurityTab } from "../../../components/settings/SecurityTab";
import { IntegrationsTab } from "../../../components/settings/IntegrationsTab";

type Tab = "users" | "security" | "charges" | "brands" | "billing" | "integrations" | "blockchain";

interface Profile { id: string; full_name: string; role: string; email: string | null }

const INVITE_ROLES = [
  { value: "admin", label: "Admin — adds people, everything else too" },
  { value: "manager", label: "Manager" },
  { value: "support_worker", label: "Support worker" },
  { value: "contractor", label: "Contractor" },
  { value: "tenant", label: "Tenant" },
] as const;
const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" }, { value: "manager", label: "Manager" }, { value: "support_worker", label: "Support worker" }, { value: "contractor", label: "Contractor" }, { value: "tenant", label: "Tenant" },
] as const;

// Matlub's three staff groups — the structure every managing agent's team maps
// onto (walkthrough 2026-10-24): "Management board / Support workers / Maintenance team".
// Admin + Manager = board; support_worker = support workers; contractor = maintenance.
// A tenant isn't staff — kept out of these groups.
type StaffGroupKey = "management" | "support" | "maintenance";
const STAFF_GROUPS: Array<{ key: StaffGroupKey; label: string; roles: string[]; description: string; tint: string; dot: string }> = [
  { key: "management", label: "Management board", roles: ["admin", "manager"], description: "Full access · adds people, changes settings, sees every record and the audit log", tint: "rgba(232,168,76,.14)", dot: "var(--amber-deep)" },
  { key: "support",    label: "Support workers",  roles: ["support_worker"],    description: "Tenants, sessions, support plans and the sign-up pack — nothing in finance or settings", tint: "rgba(46,158,107,.10)", dot: "var(--live)" },
  { key: "maintenance", label: "Maintenance team", roles: ["contractor"],       description: "Only the repair jobs dispatched to their trade — no tenant personal data", tint: "rgba(107,91,209,.10)", dot: "var(--violet)" },
];
const GROUP_FOR_ROLE: Record<string, StaffGroupKey | "other"> = {
  admin: "management", manager: "management", support_worker: "support", contractor: "maintenance", tenant: "other",
};
interface Stamp { id: string; status: string; audit_hash: string; tx_hash: string | null; created_at: string; tenant_id: string | null }

const STAMP_TONE: Record<string, { color: string; label: string }> = {
  pending: { color: "var(--amber-deep)", label: "pending" },
  processing: { color: "var(--amber-deep)", label: "processing" },
  done: { color: "var(--live)", label: "done" },
  failed: { color: "var(--brick)", label: "failed" },
  dead_letter: { color: "var(--brick)", label: "failed" },
};

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [landlords, setLandlords] = useState<Array<{ id: string; name: string }>>([]);
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [rate, setRate] = useState("150");
  const [settingId, setSettingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTenantsCount, setActiveTenantsCount] = useState<number>(0);
  const [aiExtractionsCount, setAiExtractionsCount] = useState<number>(0);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateSaved, setRateSaved] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof INVITE_ROLES)[number]["value"]>("manager");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  // The link itself comes back to the admin too (2026-10-15): email can't be the only road in,
  // so it's shown here to copy or send by WhatsApp. Pending invites can be given a fresh link.
  // Accounts are issued (067): the admin gets the sign-in link AND the generated password back,
  // shows/copies/WhatsApps them, and can reveal or re-issue a password from the people list.
  const [inviteLink, setInviteLink] = useState<{ email: string; url: string; delivered: boolean; password: string | null; title?: string } | null>(null);
  const [copied, setCopied] = useState<"link" | "password" | "both" | null>(null);
  // "Add a managing agent" — the super-admin flow Rume uses to onboard a new
  // Managing Agent (e.g. Osama at Reliable Living) with its own admin, in one go.
  const [maName, setMaName] = useState(""); const [maAdminEmail, setMaAdminEmail] = useState(""); const [maAdminName, setMaAdminName] = useState("");
  const [maBusy, setMaBusy] = useState(false); const [maError, setMaError] = useState<string | null>(null);
  const [maCreated, setMaCreated] = useState<{ organisation: { id: string; name: string }; admin: { email: string; fullName: string; inviteUrl: string; password: string | null; delivered: boolean } } | null>(null);
  async function createManagingAgent(e: React.FormEvent) {
    e.preventDefault(); setMaBusy(true); setMaError(null); setMaCreated(null);
    try {
      const r = await fetch("/api/organisations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: maName, adminEmail: maAdminEmail, adminFullName: maAdminName }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setMaError(b?.error ?? "Could not create the managing agent."); return; }
      setMaCreated({ organisation: b.organisation, admin: b.admin });
      setMaName(""); setMaAdminEmail(""); setMaAdminName("");
      fetch("/api/organisations/mine").then((r) => (r.ok ? r.json() : [])).then((d) => setOrgCount(Array.isArray(d) ? d.length : 0)).catch(() => {});
    } catch { setMaError("Could not reach the server."); } finally { setMaBusy(false); }
  }
  function loadInvites() { /* invites no longer wait on anyone — accounts exist the moment they're issued */ }
  async function copyText(what: "link" | "password" | "both") {
    if (!inviteLink) return;
    const text = what === "link" ? inviteLink.url : what === "password" ? (inviteLink.password ?? "") : `Sign in: ${inviteLink.url}\nPassword: ${inviteLink.password ?? ""}`;
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch { window.prompt("Copy this:", text); }
  }
  async function revealPassword(p: Profile) {
    setUserBusy(p.id); setUserNotice(null);
    try {
      const r = await fetch(`/api/profiles/${p.id}/password`); const b = await r.json().catch(() => null);
      if (!r.ok) { setUserNotice(b?.error ?? "Could not reveal."); return; }
      setInviteLink({ email: b.email, url: `${window.location.origin}/login?email=${encodeURIComponent(b.email)}`, delivered: true, password: b.password, title: `Password on record for ${p.full_name} · issued by ${b.issuedBy ?? "—"} ${formatDateTime(b.issuedAt)} · revealed ${b.reveals}×` }); setCopied(null);
      document.getElementById("issued-credential")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch { setUserNotice("Could not reach the server."); } finally { setUserBusy(null); }
  }
  async function newPassword(p: Profile) {
    if (!window.confirm(`Issue ${p.full_name} a new password? The old one stops working everywhere, now.`)) return;
    setUserBusy(p.id); setUserNotice(null);
    try {
      const r = await fetch(`/api/profiles/${p.id}/password`, { method: "POST" }); const b = await r.json().catch(() => null);
      if (!r.ok) { setUserNotice(b?.error ?? "Could not issue."); return; }
      setInviteLink({ email: b.email, url: b.url, delivered: !!b.delivered, password: b.password, title: `New password for ${p.full_name}` }); setCopied(null);
      setUserNotice(`New password issued to ${p.full_name}${b.vaulted ? " and kept in the vault" : ""}.`);
      document.getElementById("issued-credential")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch { setUserNotice("Could not reach the server."); } finally { setUserBusy(null); }
  }
  const [orgCount, setOrgCount] = useState(0);
  // People who asked to join via /register (migration 055). Approving issues
  // the invite email on the spot — the same path as "Invite someone" below.
  interface AccessRequest { id: string; fullName: string; email: string; phone: string | null; roleWanted: string; message: string | null; createdAt: string }
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  function loadAccessRequests() {
    fetch("/api/access-requests").then((r) => (r.ok ? r.json() : [])).then((d) => setAccessRequests(Array.isArray(d) ? d : [])).catch(() => {});
  }
  async function decideRequest(id: string, decision: "approve" | "decline") {
    setDecidingId(id); setRequestNotice(null);
    try {
      const r = await fetch("/api/access-requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setRequestNotice(b?.error ?? "Could not record that decision."); return; }
      const who = accessRequests.find((x) => x.id === id);
      if (decision === "approve" && b?.inviteUrl && who) { setInviteLink({ email: who.email, url: b.inviteUrl, delivered: !!b.invited, password: b.password ?? null, title: `Account for ${who.fullName}` }); setCopied(null); }
      setRequestNotice(decision === "approve" ? `Approved ${who?.fullName ?? ""}. Their sign-in link and password are below — ${b?.invited ? "they were emailed too." : "hand them over yourself; the email did not go out."}` : `Declined ${who?.fullName ?? ""}.`);
      loadAccessRequests(); loadProfiles(); loadInvites();
    } catch { setRequestNotice("Could not reach the server."); }
    finally { setDecidingId(null); }
  }

  // Who may add/change people: the org's admin, or a manager while the org has
  // no admin yet (mirrors lib/user-admin.ts — the server enforces it).
  const { profile } = useAuth();
  const admins = profiles.filter((p) => p.role === "admin");
  const canManage = profile?.role === "admin" || (profile?.role === "manager" && admins.length === 0);
  const [userBusy, setUserBusy] = useState<string | null>(null);
  const [userNotice, setUserNotice] = useState<string | null>(null);
  async function changeRole(id: string, role: string) {
    setUserBusy(id); setUserNotice(null);
    try {
      const r = await fetch(`/api/profiles/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setUserNotice(b?.error ?? "Could not change the role."); return; }
      setUserNotice("Role changed.");
      loadProfiles();
    } catch { setUserNotice("Could not reach the server."); }
    finally { setUserBusy(null); }
  }
  async function removeUser(p: Profile) {
    if (!window.confirm(`Remove ${p.full_name}? They're signed out everywhere now and can't sign in again. Their name stays on everything they recorded.`)) return;
    setUserBusy(p.id); setUserNotice(null);
    try {
      const r = await fetch(`/api/profiles/${p.id}`, { method: "DELETE" });
      const b = await r.json().catch(() => null);
      if (!r.ok) { setUserNotice(b?.error ?? "Could not remove."); return; }
      setUserNotice(`Removed ${p.full_name}.`);
      loadProfiles();
    } catch { setUserNotice("Could not reach the server."); }
    finally { setUserBusy(null); }
  }

  const { brand } = useBrand();

  function loadProfiles() {
    fetch("/api/profiles").then((r) => (r.ok ? r.json() : [])).then((d) => setProfiles(Array.isArray(d) ? d : [])).catch(() => {});
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setInviteError(null);
    setInviteLink(null);
    try {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, fullName: inviteName || undefined }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setInviteError(body?.error ?? "Could not send the invite. Try again.");
        return;
      }
      setInviteLink({ email: inviteEmail, url: body?.inviteUrl ?? "", delivered: !!body?.delivered, password: body?.password ?? null, title: `Account for ${inviteName || inviteEmail}` }); setCopied(null);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("manager");
      loadInvites();
    } catch {
      setInviteError("Could not reach the server. The invite was not sent.");
    } finally {
      setInviteBusy(false);
    }
  }

  useEffect(() => {
    loadProfiles();
    loadAccessRequests();
    loadInvites();
    fetch("/api/stamp-queue").then((r) => (r.ok ? r.json() : [])).then((d) => setStamps(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/tenants").then((r) => (r.ok ? r.json() : [])).then((d) => setActiveTenantsCount(Array.isArray(d) ? d.length : 0)).catch(() => {});
    fetch("/api/drafts").then((r) => (r.ok ? r.json() : [])).then((d) => setAiExtractionsCount(Array.isArray(d) ? d.length : 0)).catch(() => {});
    // Migration 046: only worth showing a "switch workspace" link at all if
    // this account actually has more than one to switch between.
    fetch("/api/organisations/mine").then((r) => (r.ok ? r.json() : [])).then((d) => setOrgCount(Array.isArray(d) ? d.length : 0)).catch(() => {});
    // Landlords for the Dynamic hierarchy card at the top of Users.
    fetch("/api/landlords").then((r) => (r.ok ? r.json() : [])).then((d) => setLandlords(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/settings?brand=${brand}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (d && d.length > 0) { setSettingId(d[0].id); setRate(String(d[0].service_charge_default)); } })
      .catch(() => {});
  }, [brand]);

  async function handleSaveRate() {
    if (!settingId) return;
    setSaving(true);
    setRateError(null);
    setRateSaved(false);
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: settingId, service_charge_default: Number(rate) }) });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setRateError(b?.error ?? "Could not save the rate. Try again.");
        return;
      }
      setRateSaved(true);
    } catch {
      setRateError("Could not reach the server. The rate was not saved.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStripePortal() {
    setBillingBusy(true);
    setBillingError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setBillingError(data.error || "Couldn't open Stripe. Try again in a moment.");
    } catch {
      setBillingError("Couldn't reach Stripe. Check the connection and try again.");
    } finally {
      setBillingBusy(false);
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "users", label: "Users" },
    { key: "security", label: "Security" },
    { key: "charges", label: "Service charges" },
    { key: "brands", label: "Brands" },
    { key: "billing", label: "Billing" },
    { key: "integrations", label: "Integrations" },
    { key: "blockchain", label: "Blockchain status" },
  ];

  return (
    <div style={{ padding: "1.75rem", display: "flex", gap: 24, flexWrap: "wrap", maxWidth: 920 }}>
      <nav style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 170 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? "btn sm" : "btn ghost sm"} style={{ textAlign: "left" }} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
        {orgCount > 1 && (
          <Link href="/choose-workspace" className="btn ghost sm" style={{ textAlign: "left", marginTop: 8 }}>
            Switch landlord
          </Link>
        )}
      </nav>

      <div style={{ flex: 1, minWidth: 280 }}>
        {tab === "users" && (
          <>
            {/* Dynamic — the hierarchy Matlub drew: Managing Agent → Landlords and Staff.
                Whose software this is, who it manages for, who runs it; all one picture at the top. */}
            <section className="card dyn-hub" style={{ marginBottom: 18 }}>
              <div className="ch"><h3>Your organisation at a glance</h3><span className="muted" style={{ fontSize: 12 }}>Dynamic — the shape of {profile?.org_name ?? "this account"}</span></div>
              <div className="dyn-body">
                <div className="dyn-ma">
                  <small>Managing agent</small>
                  <b>{profile?.org_name ?? "—"}</b>
                  <span>Everything below belongs here. Nothing crosses to another managing agent.</span>
                </div>
                <div className="dyn-arms">
                  <div className="dyn-arm">
                    <div className="arm-hd"><h4>Landlords</h4><span className="n">{landlords.length}</span></div>
                    <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>Property owners you manage for.</p>
                    {landlords.length === 0 ? (
                      <Link href="/properties?addLandlord=1" className="dyn-empty">Add the first landlord →</Link>
                    ) : (
                      <ul className="dyn-list">
                        {landlords.map((l) => <li key={l.id}><Link href={`/landlords/${l.id}`}><span className="pip">{l.name.slice(0, 1).toUpperCase()}</span><span>{l.name}</span><span className="chev">›</span></Link></li>)}
                      </ul>
                    )}
                  </div>
                  <div className="dyn-arm">
                    <div className="arm-hd"><h4>Staff</h4><span className="n">{profiles.filter((p) => p.role !== "tenant").length}</span></div>
                    <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>People you issued a login to — grouped three ways below.</p>
                    <ul className="dyn-staff">
                      {STAFF_GROUPS.map((g) => {
                        const n = profiles.filter((p) => g.roles.includes(p.role)).length;
                        return (
                          <li key={g.key}>
                            <span className="dot" style={{ background: g.dot, boxShadow: `0 0 0 3px ${g.tint}` }} />
                            <span className="lbl">{g.label}</span>
                            <span className="n">{n}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
                <p className="dyn-foot">Each person signs in with their own name — every change is stamped with their initials, the date and the time.</p>
              </div>
            </section>

            {canManage && (
              <section className="card" style={{ marginBottom: 18 }}>
                <div className="ch"><h3>Add a managing agent</h3><span className="muted" style={{ fontSize: 12 }}>a brand-new organisation with its own admin — data stays isolated</span></div>
                <form onSubmit={createManagingAgent} className="li" style={{ display: "grid", gap: 10 }}>
                  <p className="muted" style={{ margin: "0 0 2px", fontSize: 12.5 }}>Use this to onboard another managing agent (not a landlord under this one). The admin you name below will sign in with their own password and only ever see their own organisation&apos;s data — same as how your own account works.</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
                    <label><span className="lbl">Managing agent name</span><input value={maName} onChange={(e) => setMaName(e.target.value)} placeholder="e.g. Reliable Living" required style={inp} /></label>
                    <label><span className="lbl">Admin&apos;s full name</span><input value={maAdminName} onChange={(e) => setMaAdminName(e.target.value)} placeholder="e.g. Osama Loumilli" required style={inp} /></label>
                    <label style={{ gridColumn: "1 / -1" }}><span className="lbl">Admin&apos;s email</span><input type="email" value={maAdminEmail} onChange={(e) => setMaAdminEmail(e.target.value)} placeholder="e.g. loumilli@reliableliving.co.uk" required style={inp} /></label>
                  </div>
                  {maError && <p className="form-error" style={{ margin: 0 }}>{maError}</p>}
                  <div><button type="submit" className="rel sm" disabled={maBusy || !maName.trim() || !maAdminEmail.trim() || !maAdminName.trim()}>{maBusy ? "Creating…" : "Create the managing agent"}</button></div>
                </form>
                {maCreated && (
                  <div className="li" style={{ display: "grid", gap: 10, background: "rgba(30,127,79,.07)" }}>
                    <b style={{ fontSize: 13.5 }}>{maCreated.organisation.name} is live · {maCreated.admin.fullName} is its admin</b>
                    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 8, alignItems: "center" }}>
                      <span className="lbl" style={{ margin: 0 }}>Sign in</span>
                      <input readOnly value={maCreated.admin.inviteUrl} onFocus={(e) => e.currentTarget.select()} style={{ ...inp, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
                      <button type="button" className="btn ghost sm" onClick={() => { void navigator.clipboard.writeText(maCreated.admin.inviteUrl).catch(() => {}); }}>Copy</button>
                      <span className="lbl" style={{ margin: 0 }}>Password</span>
                      <input readOnly value={maCreated.admin.password ?? "— not available —"} onFocus={(e) => e.currentTarget.select()} style={{ ...inp, fontFamily: "'JetBrains Mono', monospace", fontSize: 14, letterSpacing: ".04em", fontWeight: 600 }} />
                      <button type="button" className="btn ghost sm" onClick={() => { if (maCreated.admin.password) void navigator.clipboard.writeText(maCreated.admin.password).catch(() => {}); }} disabled={!maCreated.admin.password}>Copy</button>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" className="rel sm" onClick={() => { if (!maCreated.admin.password) return; void navigator.clipboard.writeText(`Your Tenant Hub account for ${maCreated.organisation.name} is ready.\nSign in: ${maCreated.admin.inviteUrl}\nPassword: ${maCreated.admin.password}\nYou're the admin — add your team from Settings → Users.`).catch(() => {}); }} disabled={!maCreated.admin.password}>Copy both</button>
                      <a className="btn ghost sm" href={`https://wa.me/?text=${encodeURIComponent(`Your Tenant Hub account for ${maCreated.organisation.name} is ready.\nSign in: ${maCreated.admin.inviteUrl}\nPassword: ${maCreated.admin.password ?? ""}\nYou're the admin — add your team from Settings → Users.`)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: maCreated.admin.delivered ? "var(--live)" : "var(--brick)" }}>{maCreated.admin.delivered ? "Emailed to them as well." : "The email did not go out (the sending domain isn't verified yet) — hand these over yourself."} {maCreated.admin.fullName} will not see any of your data; you will not see theirs.</p>
                  </div>
                )}
              </section>
            )}

            {accessRequests.length > 0 && (
              <section className="card" style={{ marginBottom: 18, borderColor: "var(--amber)" }}>
                <div className="ch"><h3>Access requests · {accessRequests.length}</h3></div>
                {accessRequests.map((r) => (
                  <div className="li" key={r.id} style={{ alignItems: "flex-start" }}>
                    <div className="body">
                      <b>{r.fullName} <span className="muted" style={{ fontWeight: 500 }}>wants {r.roleWanted.replace("_", " ")} access</span></b>
                      <p>{r.email}{r.phone ? ` · ${r.phone}` : ""} · asked {formatDateTime(r.createdAt)}</p>
                      {r.message && <p style={{ fontStyle: "italic" }}>&ldquo;{r.message}&rdquo;</p>}
                    </div>
                    <div className="btns">
                      <button type="button" className="btn ghost sm" disabled={decidingId === r.id} onClick={() => void decideRequest(r.id, "decline")}>Decline</button>
                      <button type="button" className="rel sm" disabled={decidingId === r.id} onClick={() => void decideRequest(r.id, "approve")}>{decidingId === r.id ? "…" : "Approve & invite"}</button>
                    </div>
                  </div>
                ))}
                {requestNotice && <div className="li"><p style={{ margin: 0, fontSize: 13, color: requestNotice.startsWith("Could") ? "var(--brick)" : "var(--live)" }}>{requestNotice}</p></div>}
              </section>
            )}

            {!canManage && (
              <section className="card" style={{ marginBottom: 18 }}>
                <div className="li"><div className="body"><b>Only the admin adds people</b><p>Your organisation&apos;s admin{admins.length ? ` (${admins.map((a) => a.full_name).join(", ")})` : ""} invites staff and approves access requests. Everyone signs in as themselves, so every change carries their own name.</p></div></div>
              </section>
            )}
            {canManage && (
            <section className="card" style={{ marginBottom: 18 }}>
              <div className="ch"><h3>Add someone</h3><span className="muted">The account is made now, with a password the system generates and keeps on record</span></div>
              <form onSubmit={handleSendInvite} className="li" style={{ display: "grid", gap: 10 }}>
                <label><span className="lbl">Full name (optional)</span>
                  <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} type="text" style={inp} /></label>
                <label><span className="lbl">Email</span>
                  <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" required style={inp} /></label>
                <label><span className="lbl">Role</span>
                  <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)} style={inp}>
                    {STAFF_GROUPS.map((g) => (
                      <optgroup key={g.key} label={g.label}>
                        {INVITE_ROLES.filter((r) => GROUP_FOR_ROLE[r.value] === g.key).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </optgroup>
                    ))}
                    {INVITE_ROLES.filter((r) => GROUP_FOR_ROLE[r.value] === "other").map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
                {inviteError && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13 }}>{inviteError}</p>}
                <div><button type="submit" className="rel sm" disabled={inviteBusy || !inviteEmail}>{inviteBusy ? "Working…" : "Create the account"}</button></div>
              </form>
              {inviteLink && (
                <div id="issued-credential" className="li" style={{ display: "grid", gap: 8, background: "rgba(30,127,79,.07)" }}>
                  <b style={{ fontSize: 13.5 }}>{inviteLink.title ?? `Account for ${inviteLink.email}`}</b>
                  <div style={{ display: "grid", gridTemplateColumns: "90px 1fr auto", gap: 8, alignItems: "center" }}>
                    <span className="lbl" style={{ margin: 0 }}>Sign in</span>
                    <input readOnly value={inviteLink.url} onFocus={(e) => e.currentTarget.select()} style={{ ...inp, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }} />
                    <button type="button" className="btn ghost sm" onClick={() => void copyText("link")}>{copied === "link" ? "Copied ✓" : "Copy"}</button>
                    <span className="lbl" style={{ margin: 0 }}>Password</span>
                    <input readOnly value={inviteLink.password ?? "— not available —"} onFocus={(e) => e.currentTarget.select()} style={{ ...inp, fontFamily: "'JetBrains Mono', monospace", fontSize: 14, letterSpacing: ".04em", fontWeight: 600 }} />
                    <button type="button" className="btn ghost sm" onClick={() => void copyText("password")} disabled={!inviteLink.password}>{copied === "password" ? "Copied ✓" : "Copy"}</button>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="rel sm" onClick={() => void copyText("both")} disabled={!inviteLink.password}>{copied === "both" ? "Copied ✓" : "Copy both"}</button>
                    <a className="btn ghost sm" href={`https://wa.me/?text=${encodeURIComponent(`Your Tenant Hub account is ready.\nSign in: ${inviteLink.url}\nPassword: ${inviteLink.password ?? ""}\nKeep it safe — only the admin can issue a new one.`)}`} target="_blank" rel="noreferrer">Send on WhatsApp</a>
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: inviteLink.delivered ? "var(--live)" : "var(--brick)" }}>{inviteLink.delivered ? "Emailed to them as well." : "The email did not go out (the sending domain isn't verified yet) — hand these over yourself."} They can&apos;t change this password; you can reveal or re-issue it from the list below.</p>
                </div>
              )}
            </section>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              {userNotice && <div className="card"><div className="li"><p style={{ margin: 0, fontSize: 13, color: userNotice.startsWith("Could") || userNotice.startsWith("That") || userNotice.startsWith("You") ? "var(--brick)" : "var(--live)" }}>{userNotice}</p></div></div>}
              {STAFF_GROUPS.map((g) => {
                const members = profiles.filter((p) => g.roles.includes(p.role));
                return (
                  <section className="card" key={g.key}>
                    <div className="ch" style={{ borderBottom: `1px solid var(--line-soft)`, background: g.tint }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: g.dot, boxShadow: `0 0 0 3px ${g.tint}`, flex: "none" }} />
                        <h3 style={{ margin: 0 }}>{g.label}</h3>
                        <span className="muted" style={{ fontSize: 12 }}>· {members.length} {members.length === 1 ? "person" : "people"}</span>
                      </div>
                      <span className="muted" style={{ fontSize: 11.5, flex: "1 1 auto", textAlign: "right", minWidth: 160 }}>{g.description}</span>
                    </div>
                    {members.length === 0 ? (
                      <div className="li"><p className="muted" style={{ margin: 0, fontSize: 13 }}>Nobody in this group yet. {canManage ? "Add someone above and pick one of these roles." : "Ask your admin to add someone."}</p></div>
                    ) : members.map((p) => {
                      const me = p.id === profile?.id;
                      return (
                        <div className="li" key={p.id} style={{ alignItems: "center" }}>
                          <span className="avatar" aria-hidden="true" style={{ background: p.role === "admin" ? "var(--amber)" : "var(--navy)", color: p.role === "admin" ? "var(--navy)" : "#fff" }}>{p.full_name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                          <div className="body"><b>{p.full_name}{me ? <span className="muted" style={{ fontWeight: 500 }}> · you</span> : null}</b><p>{p.email}{p.role !== "admin" && p.role !== "manager" ? "" : ` · ${ROLE_OPTIONS.find((r) => r.value === p.role)?.label ?? p.role}`}</p></div>
                          {canManage && !me ? (
                            <div className="btns">
                              <select value={p.role} onChange={(e) => void changeRole(p.id, e.target.value)} disabled={userBusy === p.id} aria-label={`Role for ${p.full_name}`} style={{ ...inp, maxWidth: 170, minHeight: 36, padding: "6px 10px" }}>
                                {STAFF_GROUPS.map((grp) => (
                                  <optgroup key={grp.key} label={grp.label}>
                                    {ROLE_OPTIONS.filter((r) => GROUP_FOR_ROLE[r.value] === grp.key).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                  </optgroup>
                                ))}
                                {ROLE_OPTIONS.filter((r) => GROUP_FOR_ROLE[r.value] === "other").map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                              {p.role !== "admin" && <button type="button" className="btn ghost sm" disabled={userBusy === p.id} onClick={() => void revealPassword(p)} title="Show the password on record for this person">Reveal password</button>}
                              {p.role !== "admin" && <button type="button" className="btn ghost sm" disabled={userBusy === p.id} onClick={() => void newPassword(p)} title="Issue a new password; the old one stops working">New password</button>}
                              <button type="button" className="btn ghost sm" disabled={userBusy === p.id} onClick={() => void removeUser(p)} style={{ color: "var(--brick)" }}>Remove</button>
                            </div>
                          ) : (
                            <span className="tag" style={{ background: p.role === "admin" ? "rgba(232,168,76,.16)" : "rgba(15,28,46,.06)", color: p.role === "admin" ? "var(--amber-deep)" : "var(--navy)", textTransform: "capitalize" }}>{p.role.replace("_", " ")}</span>
                          )}
                        </div>
                      );
                    })}
                  </section>
                );
              })}
              <p className="muted" style={{ margin: "4px 2px 0", fontSize: 12.5 }}>Nobody shares an account. Every save, note and decision in What the system did is stamped with the name of the person who was signed in — their initials, the date and the time, on every row.</p>
            </div>
          </>
        )}

        {tab === "charges" && (
          <section className="card">
            <div className="ch"><h3>Service charges</h3></div>
            <div className="li" style={{ display: "grid", gap: 10 }}>
              <label><span className="lbl">Default weekly rate (£)</span>
                <input value={rate} onChange={(e) => { setRate(e.target.value); setRateSaved(false); }} type="number" style={inp} /></label>
              {rateError && <p style={{ color: "var(--brick)", margin: 0, fontSize: 13 }}>{rateError}</p>}
              {rateSaved && !rateError && <p style={{ color: "var(--live)", margin: 0, fontSize: 13 }}>Saved.</p>}
              <div><button type="button" className="rel sm" onClick={handleSaveRate} disabled={saving || !settingId}>{saving ? "Saving…" : "Save rate"}</button></div>
            </div>
          </section>
        )}

        {tab === "brands" && (
          <section className="card">
            <div className="ch"><h3>Brands</h3></div>
            {Object.entries(BRAND_LABELS).map(([key, label]) => (
              <div className="li" key={key}><div className="body"><b>{label}</b><p>Signatory: Ahsan Rehman</p></div></div>
            ))}
          </section>
        )}

        {tab === "billing" && (
          <>
            <section className="card" style={{ marginBottom: 18 }}>
              <div className="ch"><h3>Plan</h3></div>
              <div className="li">
                <div className="body">
                  <b>Professional plan</b>
                  <p>£99/mo · next billing date 1st July</p>
                </div>
                <div className="btns">
                  <button type="button" className="btn ghost sm" onClick={handleStripePortal} disabled={billingBusy}>View invoices</button>
                  <button type="button" className="rel sm" onClick={handleStripePortal} disabled={billingBusy}>{billingBusy ? "Opening…" : "Manage in Stripe"}</button>
                </div>
              </div>
              {billingError && <div className="li"><p style={{ color: "var(--brick)", margin: 0, fontSize: 13.5 }}>{billingError}</p></div>}
            </section>
            <section className="card">
              <div className="ch"><h3>Usage</h3></div>
              <div className="li" style={{ display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span>Active tenants</span><b>{activeTenantsCount} / 50</b></div>
                <div style={{ width: "100%", height: 8, background: "var(--line-soft)", borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
                  <div style={{ width: `${Math.min((activeTenantsCount / 50) * 100, 100)}%`, height: "100%", background: "var(--live)" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}><span>AI intake extractions</span><b>{aiExtractionsCount} / 500</b></div>
                <div style={{ width: "100%", height: 8, background: "var(--line-soft)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min((aiExtractionsCount / 500) * 100, 100)}%`, height: "100%", background: "var(--amber)" }} />
                </div>
              </div>
            </section>
          </>
        )}

        {tab === "security" && <SecurityTab />}

        {tab === "integrations" && <IntegrationsTab />}

        {tab === "blockchain" && (
          <section className="card">
            <div className="ch"><h3>Blockchain status</h3></div>
            {stamps.length === 0 ? <div className="li"><p className="muted">No stamp queue entries.</p></div> : stamps.map((s) => {
              const tone = STAMP_TONE[s.status] ?? { color: "var(--slate)", label: s.status };
              return (
                <div className="li" key={s.id}>
                  <div className="body">
                    <b style={{ color: tone.color, textTransform: "capitalize" }}>● {tone.label}</b>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace" }}>{truncateHash(s.audit_hash, 14)}{s.tx_hash ? ` · tx ${truncateHash(s.tx_hash, 10)}` : ""}</p>
                  </div>
                  <span className="muted" style={{ fontSize: 12.5 }}>{formatDateTime(s.created_at)}</span>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", maxWidth: 220, minHeight: 44, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, fontFamily: "inherit", background: "var(--surface)", boxSizing: "border-box" };
