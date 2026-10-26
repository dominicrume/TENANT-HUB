import { NextResponse } from "next/server";
import { isPublicSignupAllowed } from "../../../../../lib/user-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/signup/status — tells the public /signup page whether the
 * form should render or whether to show the "self-signup is closed" message
 * immediately. No session needed; no data leaked beyond the one bit.
 */
export async function GET() {
  return NextResponse.json({ open: isPublicSignupAllowed() }, { headers: { "Cache-Control": "no-store" } });
}
