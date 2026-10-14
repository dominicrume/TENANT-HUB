/**
 * /tenants/[id]/signup/[section]/[slot] — one form: filled from the record
 * (nothing typed twice), read on screen, signed on the pad (iPad, a USB
 * signing board, or a mouse), then "Signed" → PDF built here → filed into
 * the section with its SHA-256 → the slot goes green.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { SIGNUP_SECTIONS } from "../../../../../../../lib/signup";
import { fillForm, type SignupContext } from "../../../../../../../lib/signup-forms";
import { buildSignedPdf } from "../../../../../../../lib/signed-pdf";
import { uploadFile } from "../../../../../../../components/files/upload";
import { DigitalSignaturePad } from "../../../../../../../components/form/DigitalSignaturePad";
import { useAuth } from "../../../../../../../contexts/AuthContext";

export default function SignupFormPage() {
  const { id, section, slot } = useParams<{ id: string; section: string; slot: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const n = Number(section);
  const slotName = decodeURIComponent(slot);
  const sec = SIGNUP_SECTIONS.find((s) => s.n === n);
  const [ctx, setCtx] = useState<SignupContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tenantSig, setTenantSig] = useState("");
  const [staffSig, setStaffSig] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/tenants/${id}/signup-context`).then(async (r) => { const b = await r.json().catch(() => null); if (!r.ok) setError(b?.error ?? "Couldn't load"); else setCtx(b); }).catch(() => setError("Could not reach the server."));
  }, [id]);

  if (error) return <div style={{ padding: "1.75rem" }}><p style={{ color: "var(--brick)" }}>{error}</p></div>;
  if (!ctx || !sec) return <div style={{ padding: "1.75rem" }}><p className="muted">Filling the form from the record…</p></div>;
  const form = fillForm(slotName, ctx);
  const needTenant = form.signatures.includes("tenant"); const needStaff = form.signatures.includes("staff");
  const canSign = (!needTenant || tenantSig) && (!needStaff || staffSig);

  async function sign() {
    if (!ctx) return;
    setBusy(true); setError(null);
    try {
      const file = await buildSignedPdf(form, ctx, { tenantSignature: tenantSig || null, staffSignature: staffSig || null, signedBy: profile?.full_name ?? ctx.staff, signedAt: new Date() });
      await uploadFile({ entity: "tenant", id, kind: "document", type: slotName, file, section: n });
      setDone(true);
      setTimeout(() => { router.push(`/tenants/${id}/signup/${n}`); router.refresh(); }, 900);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not file the signed form"); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ padding: "1.75rem", maxWidth: 860 }}>
      <p style={{ margin: "0 0 10px", fontSize: 12.5 }}><Link href={`/tenants/${id}`} style={{ color: "var(--slate)" }}>{String(ctx.tenant["full_name"])}</Link> <span className="muted">/</span> <Link href={`/tenants/${id}/signup`} style={{ color: "var(--slate)" }}>Sign-up</Link> <span className="muted">/</span> <Link href={`/tenants/${id}/signup/${n}`} style={{ color: "var(--slate)" }}>Section {n}</Link> <span className="muted">/</span> {slotName}</p>

      {/* The document, as it will print. */}
      <article className="card print-area" style={{ padding: "28px 32px", borderTop: "6px solid var(--amber)", fontFamily: "'Sora', sans-serif" }}>
        <div style={{ marginBottom: 18 }}>
          <b style={{ fontSize: 17, display: "block" }}>{ctx.landlord?.name ?? ctx.organisation}</b>
          <span className="muted" style={{ fontSize: 12 }}>{ctx.landlord && ctx.landlord.name !== ctx.organisation ? `managed by ${ctx.organisation} · ` : ""}{[ctx.landlord?.phone, ctx.landlord?.email].filter(Boolean).join(" · ")}</span>
        </div>
        <h1 style={{ fontSize: 24, margin: "0 0 10px" }}>{form.title}</h1>
        {form.intro && <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 18px" }}>{form.intro}</p>}
        {form.fields.length > 0 && (
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px 24px", margin: "0 0 18px" }}>
            {form.fields.map(([k, v]) => <div key={k}><dt className="lbl" style={{ margin: 0 }}>{k}</dt><dd style={{ margin: 0, fontSize: 14, color: v === "—" ? "var(--brick)" : "var(--navy)" }}>{v}</dd></div>)}
          </dl>
        )}
        {form.clauses.length > 0 && <ol style={{ fontSize: 13.5, lineHeight: 1.6, paddingLeft: 20, margin: "0 0 18px" }}>{form.clauses.map((c) => <li key={c}>{c}</li>)}</ol>}
        <p className="muted" style={{ fontSize: 11.5, margin: 0 }}>Filled from the record on {new Date(ctx.today).toLocaleDateString("en-GB")}. A red dash means the record is missing that detail — fix it on the tenant&apos;s page before signing. Standard wording under the landlord&apos;s name; the landlord&apos;s own template replaces the wording when it&apos;s supplied.</p>
      </article>

      <section className="card" style={{ marginTop: 18 }}>
        <div className="ch"><h3>Sign</h3><span className="muted">On the pad, the iPad, or with the mouse</span></div>
        <div className="li" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
          {needTenant && <div><DigitalSignaturePad label={`${String(ctx.tenant["full_name"])} (tenant)`} value={tenantSig} onChange={(b64) => setTenantSig(b64)} /></div>}
          {needStaff && <div><DigitalSignaturePad label={`${profile?.full_name ?? ctx.staff} (for ${ctx.organisation})`} value={staffSig} onChange={(b64) => setStaffSig(b64)} /></div>}
        </div>
        <div className="li" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" className="rel" disabled={!canSign || busy || done} onClick={() => void sign()}>{done ? "Signed and filed ✓" : busy ? "Filing the signed PDF…" : "Signed — file it"}</button>
          <Link href={`/tenants/${id}/signup/${n}`} className="btn ghost sm">Back</Link>
          <span className="muted" style={{ fontSize: 12.5 }}>Makes a PDF with the signature{needTenant && needStaff ? "s" : ""}, files it in section {n} with its fingerprint, and turns the slot green.</span>
        </div>
        {error && <div className="li"><p style={{ color: "var(--brick)", margin: 0, fontSize: 13 }}>{error}</p></div>}
      </section>
    </div>
  );
}
