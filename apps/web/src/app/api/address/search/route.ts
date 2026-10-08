import { NextResponse } from "next/server";
import { addressLookup } from "@tenant-hub/adapters";
import { withRouteHandler } from "../../../../lib/api-handler";
import { toSafeErrorMessage } from "../../../../lib/safe-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/address/search?q=… — UK address suggestions for the address
 * picker. Proxied through here rather than called from the browser so the
 * provider can be swapped (OpenStreetMap today, Google Places the moment
 * GOOGLE_PLACES_API_KEY exists) with no frontend change, and so the
 * provider sees one identified caller (Nominatim's usage policy) rather
 * than every staff browser. Returns { mode, source, results } — mode is
 * surfaced so a simulated provider is never mistaken for real addresses.
 */
export const GET = withRouteHandler({ resource: "properties", action: "read", rateLimit: true }, async (req) => {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 3) return NextResponse.json({ mode: "live", source: "none", results: [] });
  try {
    const r = await addressLookup().search(q);
    return NextResponse.json({ mode: r.mode, source: r.source, results: r.data });
  } catch (err) {
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 502 });
  }
});
