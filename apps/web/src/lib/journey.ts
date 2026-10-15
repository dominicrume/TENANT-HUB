/**
 * The tenant journey — eight stations (Matloob, 2026-10-14, sketched live):
 *   1 lead received · 2 viewing · 3 signed up · 4 moved in · 5 claim done
 *   · 6 email sent (documents to the council, with evidence) · 7 onboarded
 *   to the landlord's portal · 8 moved out.
 * Green = done, red = not yet, grey = not needed for this landlord.
 * Pure: the API gathers the facts, this decides the colours. Nothing here
 * is a second copy of the truth — a station is green because the thing it
 * stands for exists (the HB form IS in Documents), never because someone
 * ticked a box instead. The two that are a person's own act (viewing done,
 * moved out) are ticks in tenant_stations.
 */
export type StationKey = "lead_received" | "viewing" | "signed_up" | "moved_in" | "claim_done" | "email_sent" | "onboarded" | "moved_out";
export type StationStatus = "done" | "todo" | "na";

export interface StationDef { key: StationKey; n: number; label: string; what: string; evidence?: string }

/** Document types that ARE the evidence for a station (matched on prefix, case-insensitive, in tenant_documents.name). */
export const STATION_EVIDENCE: Partial<Record<StationKey, string>> = {
  claim_done: "Housing Benefit form",
  email_sent: "Evidence · documents sent to council",
  onboarded: "Evidence · landlord portal onboarding",
  signed_up: "Tenancy agreement",
};

export const STATIONS: StationDef[] = [
  { key: "lead_received", n: 1, label: "Lead received", what: "Say how they came to us: self-referred, professionally referred, or via an advert." },
  { key: "viewing", n: 2, label: "Viewing", what: "Assign the viewing to one of your people with a time — it goes into their diary. Tick it when it's done." },
  { key: "signed_up", n: 3, label: "Signed up", what: "The sign-up pack (seven sections) — green once the licence agreement is signed and filed.", evidence: STATION_EVIDENCE.signed_up },
  { key: "moved_in", n: 4, label: "Moved in", what: "Confirm the day they moved in — it goes on the record and the room shows as taken." },
  { key: "claim_done", n: 5, label: "Claim done", what: "Green only when the Housing Benefit form is in Documents — not when someone says so.", evidence: STATION_EVIDENCE.claim_done },
  { key: "email_sent", n: 6, label: "Email sent", what: "The documents went to Birmingham City Council. Upload the screenshot of the sent email as evidence.", evidence: STATION_EVIDENCE.email_sent },
  { key: "onboarded", n: 7, label: "On the landlord's portal", what: "Added to the landlord's own portal (Reliance, Dawson). Upload a screenshot or note the reference.", evidence: STATION_EVIDENCE.onboarded },
  { key: "moved_out", n: 8, label: "Moved out", what: "When they leave — a week or two years later." },
];

export interface JourneyFacts {
  /** How they came to us — self / professional / advert. Station 1 is green only once this is said. */
  referralSource: string | null;
  hasLead: boolean; leadStage: string | null; leadViewingAt: string | null;
  signatureHash: string | null; movedIn: string | null; activeTenancy: boolean;
  documents: string[];                      // tenant_documents names (received)
  ticks: Partial<Record<StationKey, { doneAt: string | null; doneBy: string | null; assignedTo: string | null; note: string | null }>>;
  landlordHasPortal: boolean | null;        // null = no landlord known → treat as needed
  isActive: boolean;
}

export interface Station { key: StationKey; n: number; label: string; what: string; status: StationStatus; doneAt: string | null; by: string | null; assignedTo: string | null; note: string | null; evidenceType: string | null; evidenceFound: string | null }

const hasDoc = (docs: string[], type: string) => docs.find((d) => d.toLowerCase().startsWith(type.toLowerCase())) ?? null;

export function computeJourney(f: JourneyFacts): Station[] {
  return STATIONS.map((s) => {
    const tick = f.ticks[s.key];
    let status: StationStatus = "todo"; let doneAt: string | null = tick?.doneAt ?? null; let by: string | null = tick?.doneBy ?? null; let evidenceFound: string | null = null;
    switch (s.key) {
      case "lead_received": status = f.referralSource ? "done" : "todo"; break; // "once you select one of the three, boom, it becomes green"
      case "viewing": status = tick?.doneAt ? "done" : "todo"; if (!doneAt && f.leadViewingAt) doneAt = f.leadViewingAt; break;
      case "signed_up": evidenceFound = hasDoc(f.documents, STATION_EVIDENCE.signed_up!) ?? f.documents.find((d) => /licence agreement|license agreement/i.test(d)) ?? null; status = f.signatureHash || evidenceFound ? "done" : "todo"; break;
      case "moved_in": status = f.movedIn || f.activeTenancy ? "done" : "todo"; doneAt = doneAt ?? f.movedIn; break;
      case "claim_done": evidenceFound = hasDoc(f.documents, STATION_EVIDENCE.claim_done!); status = evidenceFound ? "done" : "todo"; break;
      case "email_sent": evidenceFound = hasDoc(f.documents, STATION_EVIDENCE.email_sent!); status = evidenceFound ? "done" : "todo"; break;
      case "onboarded": evidenceFound = hasDoc(f.documents, STATION_EVIDENCE.onboarded!); status = f.landlordHasPortal === false ? "na" : (evidenceFound || tick?.doneAt) ? "done" : "todo"; break;
      case "moved_out": status = tick?.doneAt || !f.isActive ? "done" : "todo"; break;
    }
    return { key: s.key, n: s.n, label: s.label, what: s.what, status, doneAt, by, assignedTo: tick?.assignedTo ?? null, note: tick?.note ?? null, evidenceType: s.evidence ?? null, evidenceFound };
  });
}

/** The next red station a manager should act on (moved out is never "next" — it happens when it happens). */
export function nextStation(stations: Station[]): Station | null {
  return stations.find((s) => s.status === "todo" && s.key !== "moved_out") ?? null;
}
