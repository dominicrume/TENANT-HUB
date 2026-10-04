import Link from "next/link";
import { db, hasDatabaseUrl, findSessionByTokenHash } from "@tenant-hub/db";
import { hashToken } from "@tenant-hub/auth";
import { readSessionToken } from "../lib/session-cookie";

/**
 * Landing page. Rebuilt on the real design tokens (navy/amber/cream, Sora) —
 * it previously used a generic dark-blue SaaS template (Inter font, Tailwind
 * sky-blue #38bdf8 throughout), which directly violated this project's own
 * "never use generic Tailwind colour names in branded components" rule and
 * looked like a different product from the rest of the app. Client feedback,
 * 2026-09-27. Copy also dropped generic SaaS language ("Enterprise DBMS",
 * "Deploy Premium") for plain words about what the product actually does.
 *
 * "Already signed in?" check moved off Supabase Auth onto the app's own
 * sessions (DECISIONS D27) — found crashing a deployment with no Supabase
 * configured at all: this ran at request time (this page is force-dynamic,
 * same as everywhere else — see the root layout) and threw before ever
 * reaching the JSX below. A page with no session system configured
 * (!hasDatabaseUrl()) just shows the signed-out state, same as a genuine
 * signed-out visitor — never a crash.
 */
export default async function LandingPage() {
  let session: { id: string } | null = null;
  if (hasDatabaseUrl()) {
    const token = readSessionToken();
    if (token) {
      const found = await findSessionByTokenHash(db(), hashToken(token)).catch(() => null);
      if (found) session = { id: found.profileId };
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F8F4EF", color: "#16202E", fontFamily: "'Sora', sans-serif" }}>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 5%", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: "#0F1C2E", display: "flex", alignItems: "center", justifyContent: "center", color: "#E8A84C", fontWeight: 800, fontSize: 18 }}>M</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0F1C2E" }}>Matty&apos;s Place</div>
        </div>
        {session ? (
          <Link href="/dashboard" style={btnPrimary}>Open the console</Link>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <Link href="/login" style={btnGhost}>Log in</Link>
            <Link href="/onboarding/subscription" style={btnPrimary}>Start free trial</Link>
          </div>
        )}
      </nav>

      <section style={{ textAlign: "center", padding: "6rem 1rem 4rem", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "inline-block", padding: "6px 14px", background: "rgba(232,168,76,.15)", color: "#C6871F", borderRadius: 99, fontSize: 13, fontWeight: 700, marginBottom: "1.5rem" }}>
          Supported housing, run by an operations console
        </div>
        <h1 style={{ fontSize: "clamp(2.4rem, 6vw, 3.6rem)", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-.02em", margin: "0 0 1.25rem", color: "#0F1C2E" }}>
          Every morning, it tells you exactly what needs you today.
        </h1>
        <p style={{ fontSize: "1.15rem", color: "#5C6673", lineHeight: 1.6, maxWidth: 560, margin: "0 auto 2.5rem" }}>
          Housing benefit chased, rent reconciled, certificates watched, repairs triaged — all
          checked every day. You see only the decisions that need a person, and nothing else.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href={session ? "/dashboard" : "/login"} style={{ ...btnPrimary, padding: "14px 28px", fontSize: 16 }}>Get started</Link>
          <Link href="#pricing" style={{ ...btnGhost, padding: "14px 28px", fontSize: 16, border: "1.5px solid #C9C0B0" }}>See pricing</Link>
        </div>
      </section>

      <section style={{ padding: "4rem 1rem 6rem" }} id="pricing">
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "3rem" }}>
            <h2 style={{ fontSize: "2rem", fontWeight: 700, color: "#0F1C2E", marginBottom: 8 }}>Simple, transparent pricing</h2>
            <p style={{ color: "#5C6673", fontSize: 15 }}>One price per organisation size — no hidden tiers.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
            <PlanCard name="Starter" price={49} tagline="For a small home just getting started." features={["Up to 10 active tenants", "Basic AI intake extraction", "Standard reporting", "Email support"]} href="/signup?plan=starter" cta="Choose starter" />
            <PlanCard name="Professional" price={99} tagline="For a growing service with real compliance needs." features={["Up to 50 tenants", "Advanced form generation", "API access", "Standard support"]} href="/onboarding/subscription?plan=professional" cta="Choose professional" featured />
            <PlanCard name="Enterprise" price={300} tagline="For an association running several HMOs at scale." features={["Unlimited tenants and properties", "Full agent automation", "White-label tenant portal", "Priority support"]} href="/onboarding/subscription?plan=premium" cta="Talk to us" />
          </div>
        </div>
      </section>

      <footer style={{ padding: "3rem 1rem", textAlign: "center", color: "#8A93A0", fontSize: 13, borderTop: "1px solid #E9E1D4" }}>
        © {new Date().getFullYear()} Matty&apos;s Place.
      </footer>
    </main>
  );
}

function PlanCard({ name, price, tagline, features, href, cta, featured }: { name: string; price: number; tagline: string; features: string[]; href: string; cta: string; featured?: boolean }) {
  return (
    <div style={{
      background: "#FFFFFF", borderRadius: 16, padding: "2rem 1.75rem",
      border: featured ? "2px solid #E8A84C" : "1px solid #E9E1D4",
      boxShadow: featured ? "0 10px 30px -18px rgba(16,28,46,.35)" : "0 1px 0 rgba(16,28,46,.04)",
      display: "flex", flexDirection: "column",
    }}>
      {featured && <div style={{ fontSize: 11, fontWeight: 700, color: "#C6871F", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Most popular</div>}
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#5C6673", margin: "0 0 6px" }}>{name}</h3>
      <div style={{ fontSize: "2.2rem", fontWeight: 700, color: "#0F1C2E", marginBottom: 10 }}>£{price}<span style={{ fontSize: 14, fontWeight: 500, color: "#8A93A0" }}>/mo</span></div>
      <p style={{ color: "#5C6673", fontSize: 14, lineHeight: 1.5, marginBottom: "1.5rem" }}>{tagline}</p>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem", display: "flex", flexDirection: "column", gap: 10 }}>
        {features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#16202E" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2E9E6B" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
            {f}
          </li>
        ))}
      </ul>
      <Link href={href} style={featured ? { ...btnPrimary, textAlign: "center" } : { ...btnGhost, textAlign: "center", border: "1.5px solid #C9C0B0" }}>{cta}</Link>
    </div>
  );
}

const btnPrimary: React.CSSProperties = { background: "#E8A84C", color: "#0F1C2E", padding: "10px 18px", borderRadius: 9, fontWeight: 700, textDecoration: "none", display: "inline-block" };
const btnGhost: React.CSSProperties = { background: "transparent", color: "#0F1C2E", padding: "10px 18px", borderRadius: 9, fontWeight: 600, textDecoration: "none", display: "inline-block" };
