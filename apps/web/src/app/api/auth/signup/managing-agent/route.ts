import { NextResponse } from "next/server";
import { db, hasDatabaseUrl, createProfileWithPassword, findProfileByEmail, createSession, recordLoginAttempt, recentFailedAttempts, isLoginThrottled } from "@tenant-hub/db";
import { hashPassword, generateToken, hashToken } from "@tenant-hub/auth";
import { isSameOriginPost } from "../../../../../lib/csrf";
import { setSessionCookie } from "../../../../../lib/session-cookie";
import { toSafeErrorMessage } from "../../../../../lib/safe-error";

/**
 * POST /api/auth/signup/managing-agent — the public, standing-on-their-own-feet
 * signup Matlub asked for (2026-10-24): a would-be Managing Agent opens
 * /signup/managing-agent, types their organisation's name, their own name,
 * their email and a password; the account is created and they are signed in
 * on the spot, with their own fresh organisation (isolated by `org_id`, H2).
 *
 * No invite from a developer, no touching of anyone else's account. The
 * caller never sees anyone else's data; nobody else sees theirs.
 *
 * Rate-limited by IP so a bot cannot create a thousand organisations.
 * CSRF-checked (same-origin only).
 */
export async function POST(req: Request) {
  if (!isSameOriginPost(req)) return NextResponse.json({ error: "Refused" }, { status: 403 });
  if (!hasDatabaseUrl()) return NextResponse.json({ error: "Signup is not configured on this environment yet" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const orgName = typeof body?.orgName === "string" ? body.orgName.trim() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!orgName) return NextResponse.json({ error: "A managing agent name is required" }, { status: 422 });
  if (!fullName) return NextResponse.json({ error: "Your full name is required so your work carries your signature" }, { status: 422 });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "A real email address is required" }, { status: 422 });
  if (!password || password.length < 6) return NextResponse.json({ error: "A password of at least 6 characters is required" }, { status: 422 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const client = db();

  // Reuse the login throttle: a bot that bulk-registers behaves like a bot that bulk-guesses.
  const failures = await recentFailedAttempts(client, { email, ip });
  if (isLoginThrottled(failures)) return NextResponse.json({ error: "Too many attempts from this address. Try again in a few minutes." }, { status: 429 });

  try {
    const existing = await findProfileByEmail(client, email);
    if (existing) return NextResponse.json({ error: `${email} already has an account. If this is you, sign in instead — or reset the password from the sign-in page.` }, { status: 409 });

    const dupe = await client.query<{ id: string }>("SELECT id FROM organisations WHERE lower(name) = lower($1)", [orgName]);
    if (dupe.rows[0]) return NextResponse.json({ error: `A managing agent called ${orgName} is already on the platform. Pick a name that only you use (e.g. add your city — "${orgName} Birmingham").` }, { status: 409 });

    const orgRow = (await client.query<{ id: string; name: string }>("INSERT INTO organisations (name, subscription_status) VALUES ($1, 'active') RETURNING id, name", [orgName])).rows[0];
    if (!orgRow) throw new Error("Could not create the managing agent");

    const { id: profileId } = await createProfileWithPassword(client, {
      email,
      fullName,
      role: "admin",
      orgId: orgRow.id,
      brand: "mattys_place",
      tenantId: null,
      passwordHash: await hashPassword(password),
    });

    // Sign them in immediately — no "check your email" step; they land on their dashboard.
    const token = generateToken();
    await createSession(client, { profileId, tokenHash: hashToken(token), ip, userAgent: req.headers.get("user-agent") });
    setSessionCookie(token);
    await recordLoginAttempt(client, { email, ip, succeeded: true });

    return NextResponse.json({ success: true, organisation: orgRow, profile: { id: profileId, email, fullName, role: "admin" } }, { status: 201 });
  } catch (err) {
    console.error("[signup/managing-agent:POST]", err);
    return NextResponse.json({ error: toSafeErrorMessage(err) }, { status: 500 });
  }
}
