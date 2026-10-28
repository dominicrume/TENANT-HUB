"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RecordFieldSuggestions } from "./RecordFields";

/**
 * useIntakeSuggestions — shared property + room dropdown behaviour for every
 * editable intake step (review, extract/OCR, voice). Previously only review
 * had this; extract and voice rendered a bare text field, so a staff member
 * taking the OCR or Voice path could type a room number for a room that was
 * already occupied and only find out at /complete with a 409. Rume
 * 2026-10-28: "same as putting an email that's already registered — rejected
 * the moment you type it, not at the end".
 *
 * What it does:
 *   · fetches /api/properties once (landlord-scoped by the server already — 096)
 *   · watches `data.address`; when it matches a saved property, auto-fills
 *     `postcode` on `data` and fetches that property's units
 *   · filters units to AVAILABLE ones only — occupied rooms never reach the
 *     dropdown, so the staff member cannot pick one by accident
 *   · when a different property is picked (via the Address / Property
 *     dropdown), clears `data.room_number` and the carried `unit_id` so a
 *     stale value from the previous property can't ghost onto this one
 *   · exposes `onUnitPicked` so the picked unit id rides along with the draft
 *     (commit creates the tenancy against the right room without a second data
 *     entry)
 *   · surfaces `propertyFullyOccupied` + `unitsTotal` so the field itself can
 *     show a clear "All N rooms occupied" state (see RecordFields.tsx)
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
  /** Called when the user picks a unit from the dropdown; store the id in your
   *  draft's machine_state so commit can link the tenancy to this specific
   *  unit. Pass `undefined` to leave the unit unmanaged (voice/extract may do
   *  this before they're ready to carry draft-state). */
  onUnitPicked?: (unitId: string | null) => void;
}

export function useIntakeSuggestions({ data, setData, onUnitPicked }: UseIntakeSuggestionsInput): RecordFieldSuggestions {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [matchedPropertyId, setMatchedPropertyId] = useState<string | null>(null);
  const [unitsForProperty, setUnitsForProperty] = useState<UnitRow[]>([]);

  // One fetch on mount; the server already filters to the active landlord
  // (096), so this list is the right one without any extra scope here.
  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch("/api/properties", { cache: "no-store" });
        if (r.ok) setProperties(await r.json());
      } catch { /* non-fatal: field falls back to plain text input */ }
    })();
  }, []);

  // Match the typed/picked address against a saved property, auto-fill postcode.
  useEffect(() => {
    const addr = String(data.address ?? "").trim().toLowerCase();
    if (!addr || properties.length === 0) { setMatchedPropertyId(null); return; }
    const match = properties.find((p) => {
      const label = [p.address_line1, p.city].filter(Boolean).join(", ").toLowerCase();
      return label === addr || (p.address_line1 ?? "").toLowerCase() === addr;
    });
    if (!match) { setMatchedPropertyId(null); return; }
    setMatchedPropertyId(match.id);
    if (match.postcode && !data.postcode) {
      setData((d) => ({ ...d, postcode: match.postcode }));
    }
  }, [data.address, data.postcode, properties, setData]);

  // Pull units for the matched property.
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

  const handlePropertyPicked = useCallback((propertyId: string) => {
    const p = properties.find((x) => x.id === propertyId);
    if (!p) return;
    if (p.postcode) setData((d) => ({ ...d, postcode: p.postcode }));
    setMatchedPropertyId(propertyId);
    // Clear any stale room from the previous property. The old reference
    // (e.g. "Room 1") will almost never match a room on the new property, so
    // leaving it visible fools the staff member into thinking it's confirmed.
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

    return {
      properties: properties.map((p) => ({
        id: p.id,
        address: p.address_line1 ?? p.name,
        postcode: p.postcode,
        label: [p.address_line1, p.city].filter(Boolean).join(", ") || p.name,
      })),
      units: availableUnits.map((u) => ({
        id: u.id,
        reference: u.reference,
        label: u.reference,
      })),
      propertyFullyOccupied,
      unitsTotal: unitsForProperty.length,
      onPropertyPicked: handlePropertyPicked,
      onUnitPicked: handleUnitPicked,
    };
  }, [properties, unitsForProperty, matchedPropertyId, handlePropertyPicked, handleUnitPicked]);
}
