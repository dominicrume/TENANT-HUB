/**
 * Step 3 — Staff review & confirm. Edit any field, then confirm: we compute the
 * canonical hash over the record (H4 anchor), record who/when, and advance to
 * the tenant verification portal.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RecordFields, type RecordFieldSuggestions } from "../../../../../components/intake/RecordFields";
import { useAuth } from "../../../../../contexts/AuthContext";
import { hashRecord } from "../../../../../lib/hash";
import { TenantCreateSchema } from "@tenant-hub/validation";
import { canonicalSubset, type Draft } from "../../../../../lib/intake";

/** Shape returned by GET /api/properties — only the fields the picker needs. */
interface PropertyRow { id: string; name: string; address_line1: string | null; city: string | null; postcode: string | null; units?: Array<{ id: string; reference: string; status: string }> }

export default function ReviewPage() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<Record<string, unknown>>({});
  // Everything else the draft carries (lead_id, unit_id…) rides along untouched — rewriting
  // machine_state from scratch here is what lost the lead on 2026-10-15.
  const [carried, setCarried] = useState<Record<string, unknown>>({});
  const [mode, setMode] = useState("manual");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Saved properties for the active landlord (Rume 2026-10-27 walkthrough): when staff type
  // in Address, the properties we already manage show up as suggestions, picking one auto-
  // fills Postcode and loads that property's rooms into the Room Number dropdown. GET
  // /api/properties already respects the active-landlord scope (096), so this list is
  // ALREADY narrowed to the right landlord without us doing anything here.
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [matchedPropertyId, setMatchedPropertyId] = useState<string | null>(null);
  const [unitsForProperty, setUnitsForProperty] = useState<Array<{ id: string; reference: string; status: string }>>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/drafts/${draftId}`, { cache: "no-store" });
    if (res.ok) {
      const d = (await res.json()) as Draft;
      setData((d.machine_state?.extracted as Record<string, unknown>) ?? {});
      setCarried((d.machine_state as unknown as Record<string, unknown>) ?? {});
      setMode(d.machine_state?.input_mode ?? "manual");
    }
    setLoaded(true);
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load saved properties once on mount — the picker list for Address / Property.
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/properties", { cache: "no-store" });
        if (r.ok) setProperties(await r.json());
      } catch {
        // Non-fatal: the field falls back to free-text, same as before this change.
      }
    })();
  }, []);

  // When the staff member types/picks an Address that matches a saved property, pull in
  // that property's rooms (so Room Number offers the right dropdown) and auto-fill
  // Postcode. The match is on EXACT address string from the datalist — a half-typed string
  // leaves both free-form.
  useEffect(() => {
    const addr = String(data.address ?? "").trim().toLowerCase();
    if (!addr || properties.length === 0) { setMatchedPropertyId(null); return; }
    const match = properties.find((p) => {
      const label = [p.address_line1, p.city].filter(Boolean).join(", ").toLowerCase();
      return label === addr || (p.address_line1 ?? "").toLowerCase() === addr;
    });
    if (!match) { setMatchedPropertyId(null); return; }
    setMatchedPropertyId(match.id);
    // Auto-fill postcode if the matched property has one and the user hasn't already typed a different one.
    if (match.postcode && !data.postcode) {
      setData((d) => ({ ...d, postcode: match.postcode }));
    }
  }, [data.address, data.postcode, properties]);

  // When a property is matched, fetch its rooms (one query — endpoint already returns units).
  useEffect(() => {
    if (!matchedPropertyId) { setUnitsForProperty([]); return; }
    void (async () => {
      try {
        const r = await fetch(`/api/properties/${matchedPropertyId}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json() as { units?: Array<{ id: string; reference: string; status: string }> };
        setUnitsForProperty(d.units ?? []);
      } catch { /* non-fatal */ }
    })();
  }, [matchedPropertyId]);

  const suggestions: RecordFieldSuggestions = {
    properties: properties.map((p) => ({
      id: p.id,
      address: p.address_line1 ?? p.name,
      postcode: p.postcode,
      label: [p.address_line1, p.city].filter(Boolean).join(", ") || p.name,
    })),
    units: unitsForProperty.map((u) => ({
      id: u.id,
      reference: u.reference,
      label: `${u.reference}${u.status === "occupied" ? " · occupied" : ""}`,
    })),
    onPropertyPicked: (propertyId) => {
      const p = properties.find((x) => x.id === propertyId);
      if (!p) return;
      // Auto-fill postcode now (don't wait for the address-watch effect, which lags one render).
      if (p.postcode) setData((d) => ({ ...d, postcode: p.postcode }));
      setMatchedPropertyId(propertyId);
    },
    // The commit step reads `carried.unit_id` and creates the tenancy against that unit.
    // Setting it here means picking the room on this screen is enough — no second data entry
    // to assign the tenant to the room when the draft is committed.
    onUnitPicked: (unitId) => {
      setCarried((c) => ({ ...c, unit_id: unitId }));
    },
  };

  async function confirm() {
    setBusy(true);
    setValidationErrors({});

    const formSchema = TenantCreateSchema.omit({ brand: true, entry_method: true });
    const parsed = formSchema.safeParse(data);
    
    if (!parsed.success) {
      const issues: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        const key = i.path[0] as string;
        if (!issues[key]) issues[key] = i.message;
      });
      setValidationErrors(issues);
      setBusy(false);
      return;
    }

    // Check for duplicates
    try {
      const dupRes = await fetch('/api/intake/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nino: data.nino,
          mobile: data.mobile,
        }),
      });

      if (dupRes.ok) {
        const { duplicates } = await dupRes.json();
        if (duplicates && Object.keys(duplicates).length > 0) {
          setValidationErrors(duplicates);
          setBusy(false);
          return;
        }
      }
    } catch (err) {
      console.error("Failed to check duplicates", err);
      // proceed anyway if the check fails?
      // better to let it fail or log it
    }

    const hash = await hashRecord(canonicalSubset(data));
    const res = await fetch(`/api/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machine_state: {
          ...carried,
          input_mode: mode,
          extracted: data,
          confirmed_by: profile?.id,
          confirmed_at: new Date().toISOString(),
        },
        step: 3,
        canonical_hash: hash,
      }),
    });
    
    if (!res.ok) {
      alert("Failed to save draft. Please try again.");
      setBusy(false);
      return;
    }
    
    router.push(`/intake/${draftId}/verify`);
  }

  if (!loaded || authLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "200px", color: "var(--navy)" }}>
        Loading draft details...
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--navy)", marginBottom: "6px" }}>Review &amp; confirm</h1>
      <p style={{ fontSize: "12px", color: "#7A8499", marginBottom: "16px" }}>
        Confirming as: <strong style={{ color: "var(--navy)" }}>{profile?.full_name || profile?.email || "—"}</strong> · {profile?.role?.replace("_", " ")}
      </p>

      <RecordFields
        data={data}
        onChange={(k, v) => setData((d) => ({ ...d, [k]: v }))}
        errors={validationErrors}
        suggestions={suggestions}
      />

      {/* Blockchain stamp preview */}
      <div style={{ marginTop: "18px", background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "10px", padding: "12px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", color: "#4B2E83" }}>
        <div>⛓ Will be recorded on confirm:</div>
        <div>Entered by: {profile?.full_name || profile?.email || "—"}</div>
        <div>Method: {mode}</div>
        <div>Hash preview: will be computed on confirm</div>
      </div>

      {Object.keys(validationErrors).length > 0 && (
        <div style={{ marginTop: "18px", padding: "12px", background: "#FEF2F2", border: "1px solid #F87171", borderRadius: "8px", color: "#B91C1C", fontSize: "14px" }}>
          <strong style={{ display: "block" }}>Please fix the errors highlighted above.</strong>
        </div>
      )}

      <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={confirm} disabled={busy}
          style={{ minHeight: "56px", padding: "0 24px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Confirming…" : "Confirm & Continue →"}
        </button>
      </div>
    </div>
  );
}
