"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecordFieldSuggestions } from "./RecordFields";

/**
 * useIntakeSuggestions — shared property + room dropdown behaviour for every
 * editable intake step (review, extract/OCR, voice). Earlier revisions had
 * three latent bugs the QA audit caught (2026-10-28), all closed in 104:
 *
 *   · A1 — the dropdown's "available" filter was reading units.status, which
 *     is seeded by migration 033 and never updated by any code. We now derive
 *     occupancy live from active tenancies in /api/properties/[id] and get a
 *     correct status per unit on every fetch.
 *   · A3 — the dropdown only HID occupied rooms from suggestions; it never
 *     REJECTED a room number the OCR/voice path had already written into
 *     data.room_number. User breezed through to /complete and ate the 409.
 *     Now the hook emits a per-field error — "Room 3 at this property is
 *     already occupied" — that the Confirm button must respect.
 *   · A4 — onUnitPicked only fired on datalist onChange, so programmatic
 *     writes (OCR extraction, voice extraction) never carried unit_id into
 *     the draft; the commit auto-link became a no-op. Now we auto-fire it
 *     whenever a known room reference matches an available unit.
 *   · A5 — address matching was strict string equality; "72 Knowle Rd"
 *     didn't match a saved "72 Knowle Road" and the dropdown vanished on the
 *     OCR path. Now we normalise both sides (lowercase, strip punctuation,
 *     expand common UK road abbreviations) and also match by postcode as a
 *     backstop.
 */

interface PropertyRow {
  id: string;
  name: string;
  address_line1: string | null;
  city: string | null;
  postcode: string | null;
  units?: Array<{ id: string; reference: string; status: string }>;
}

interface UnitRow { id: string; reference: string; status: string }

export interface UseIntakeSuggestionsInput {
  data: Record<string, unknown>;
  setData: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  onUnitPicked?: (unitId: string | null) => void;
}

export interface UseIntakeSuggestionsResult {
  suggestions: RecordFieldSuggestions;
  /** Per-field errors the hook has detected. Merge with your own validation
   *  errors (yours should win on conflict) and pass into RecordFields.errors.
   *  Also, if any key here is non-empty, the Confirm button should be disabled
   *  — these are blocking errors, not advisory ones. */
  fieldErrors: Record<string, string>;
}

// Expand common UK road abbreviations so OCR output matches saved addresses.
// Kept short on purpose — exhaustive dictionaries are hard to tune and tend
// to over-match ("ct" → "court" vs "ct." as a day-abbrev etc.). This covers
// the top offenders from the four live landlords.
const ROAD_ABBR: Array<[RegExp, string]> = [
  [/\brd\b/g,  "road"],
  [/\bst\b/g,  "street"],
  [/\bave\b/g, "avenue"],
  [/\bln\b/g,  "lane"],
  [/\bdr\b/g,  "drive"],
  [/\bct\b/g,  "court"],
  [/\bpl\b/g,  "place"],
  [/\bter\b/g, "terrace"],
  [/\bcres\b/g,"crescent"],
  [/\bgdns\b/g,"gardens"],
];

function normaliseAddress(s: string): string {
  const lower = s.toLowerCase().trim();
  const no_punct = lower.replace(/[,.()\/\\'"]/g, " ").replace(/\s+/g, " ").trim();
  let expanded = no_punct;
  for (const [re, into] of ROAD_ABBR) expanded = expanded.replace(re, into);
  return expanded;
}

function normalisePostcode(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

function matchProperty(address: string, postcode: string, properties: PropertyRow[]): PropertyRow | null {
  const addrN = normaliseAddress(address);
  const pcN = postcode ? normalisePostcode(postcode) : "";
  // Primary: address match on normalised string (full "line1, city" or line1 alone).
  const byAddress = properties.find((p) => {
    const label = normaliseAddress([p.address_line1, p.city].filter(Boolean).join(" "));
    const line1 = normaliseAddress(p.address_line1 ?? "");
    return label === addrN || line1 === addrN;
  });
  if (byAddress) return byAddress;
  // Backstop: postcode equality (canonical, unlike free-text address).
  if (pcN) {
    const byPc = properties.find((p) => p.postcode && normalisePostcode(p.postcode) === pcN);
    if (byPc) return byPc;
  }
  return null;
}

export function useIntakeSuggestions({ data, setData, onUnitPicked }: UseIntakeSuggestionsInput): UseIntakeSuggestionsResult {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [matchedPropertyId, setMatchedPropertyId] = useState<string | null>(null);
  const [unitsForProperty, setUnitsForProperty] = useState<UnitRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/properties", { cache: "no-store" });
        if (r.ok) setProperties(await r.json());
      } catch { /* non-fatal */ }
    })();
  }, []);

  // A5: normalised address matching, with postcode backstop.
  useEffect(() => {
    const addr = String(data.address ?? "").trim();
    const pc   = String(data.postcode ?? "").trim();
    if (!addr && !pc) { setMatchedPropertyId(null); return; }
    if (properties.length === 0) return;
    const match = matchProperty(addr, pc, properties);
    if (!match) { setMatchedPropertyId(null); return; }
    setMatchedPropertyId(match.id);
    if (match.postcode && !pc) {
      setData((d) => ({ ...d, postcode: match.postcode }));
    }
  }, [data.address, data.postcode, properties, setData]);

  // Fetch the matched property's units. Server now returns a LIVE status
  // (A1), so no need to re-filter here on anything other than the agreed
  // "occupied" value.
  useEffect(() => {
    if (!matchedPropertyId) { setUnitsForProperty([]); return; }
    void (async () => {
      try {
        const r = await fetch(`/api/properties/${matchedPropertyId}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json() as { units?: UnitRow[] };
        setUnitsForProperty(d.units ?? []);
      } catch { /* non-fatal */ }
    })();
  }, [matchedPropertyId]);

  // A4: when units arrive and data.room_number ALREADY matches one of them,
  // auto-fire onUnitPicked so the draft carries unit_id without the user
  // ever having to open the datalist. This is what makes OCR/voice paths
  // actually produce a tenancy on commit, not just a floating tenant row.
  useEffect(() => {
    if (!onUnitPicked) return;
    const rn = String(data.room_number ?? "").trim();
    if (!rn || unitsForProperty.length === 0) return;
    const match = unitsForProperty.find((u) => u.reference.toLowerCase() === rn.toLowerCase() && u.status !== "occupied");
    if (match) onUnitPicked(match.id);
  }, [unitsForProperty, data.room_number, onUnitPicked]);

  const handlePropertyPicked = useCallback((propertyId: string) => {
    const p = properties.find((x) => x.id === propertyId);
    if (!p) return;
    if (p.postcode) setData((d) => ({ ...d, postcode: p.postcode }));
    setMatchedPropertyId(propertyId);
    setData((d) => ({ ...d, room_number: "" }));
    if (onUnitPicked) onUnitPicked(null);
  }, [properties, setData, onUnitPicked]);

  const handleUnitPicked = useCallback((unitId: string) => {
    if (onUnitPicked) onUnitPicked(unitId);
  }, [onUnitPicked]);

  return useMemo(() => {
    const availableUnits = unitsForProperty.filter((u) => u.status !== "occupied");
    const propertyFullyOccupied = matchedPropertyId !== null
      && unitsForProperty.length > 0
      && availableUnits.length === 0;

    const suggestions: RecordFieldSuggestions = {
      properties: properties.map((p) => ({
        id: p.id,
        address: p.address_line1 ?? p.name,
        postcode: p.postcode,
        label: [p.address_line1, p.city].filter(Boolean).join(", ") || p.name,
      })),
      units: availableUnits.map((u) => ({ id: u.id, reference: u.reference, label: u.reference })),
      propertyFullyOccupied,
      unitsTotal: unitsForProperty.length,
      onPropertyPicked: handlePropertyPicked,
      onUnitPicked: handleUnitPicked,
    };

    // A3: field-level error for a room number that doesn't match any
    // available unit on the matched property. Blocks confirm — see each
    // intake page's Confirm button.
    const fieldErrors: Record<string, string> = {};
    const rn = String(data.room_number ?? "").trim();
    if (matchedPropertyId && rn && unitsForProperty.length > 0) {
      const isAvailable = availableUnits.some((u) => u.reference.toLowerCase() === rn.toLowerCase());
      if (!isAvailable) {
        // Narrow the message: is it occupied, or does it not exist on this property?
        const occupied = unitsForProperty.some((u) => u.reference.toLowerCase() === rn.toLowerCase() && u.status === "occupied");
        fieldErrors.room_number = occupied
          ? `${rn} at this property is already occupied — pick another room.`
          : `${rn} isn't a known room at this property — pick one from the list.`;
      }
    }

    return { suggestions, fieldErrors };
  }, [properties, unitsForProperty, matchedPropertyId, data.room_number, handlePropertyPicked, handleUnitPicked]);
}
