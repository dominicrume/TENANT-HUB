import Link from "next/link";
import { createSupabaseServer } from "../lib/supabase-server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const supabase = createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();

  // If already logged in, show a subtle banner at the top, but let them see the landing page
  // Alternatively, just redirect. For SaaS, we usually let them see the page but change CTA.
  
  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      {/* Navigation */}
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.5rem 5%", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.05em", color: "#fff" }}>
          Tenant<span style={{ color: "#38bdf8" }}>Hub</span>
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          {session ? (
            <Link href="/dashboard" style={btnPrimary}>Go to Dashboard</Link>
          ) : (
            <>
              <Link href="/login" style={btnGhost}>Log in</Link>
              <Link href="/signup" style={btnPrimary}>Start Free Trial</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{ textAlign: "center", padding: "8rem 1rem 6rem", maxWidth: "800px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "4rem", fontWeight: 800, lineHeight: 1.1, marginBottom: "1.5rem", background: "linear-gradient(to right, #fff, #94a3b8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          The complete operating system for supported housing.
        </h1>
        <p style={{ fontSize: "1.25rem", color: "#94a3b8", marginBottom: "3rem", lineHeight: 1.6 }}>
          Automate intake forms, track tenant progress, and stay compliant with AI-powered file management. Stop drowning in paperwork and focus on support.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link href={session ? "/dashboard" : "/signup"} style={{ ...btnPrimary, padding: "1rem 2rem", fontSize: "1.125rem" }}>
            Get Started Today
          </Link>
        </div>
      </section>

      {/* Pricing Section */}
      <section style={{ padding: "5rem 1rem", background: "#1e293b" }} id="pricing">
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "4rem" }}>
            <h2 style={{ fontSize: "2.5rem", fontWeight: 700, color: "#fff", marginBottom: "1rem" }}>Simple, transparent pricing</h2>
            <p style={{ color: "#94a3b8", fontSize: "1.125rem" }}>Choose the plan that fits your organisation.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "2rem" }}>
            
            {/* Starter Plan */}
            <div style={pricingCard}>
              <h3 style={{ fontSize: "1.5rem", color: "#fff", marginBottom: "0.5rem" }}>Starter</h3>
              <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "#fff", marginBottom: "1rem" }}>£49<span style={{ fontSize: "1rem", color: "#94a3b8", fontWeight: 400 }}>/mo</span></div>
              <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>Perfect for small homes just getting started.</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem 0", color: "#cbd5e1", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <li>✓ Up to 10 Tenants</li>
                <li>✓ Basic AI Intake Extraction</li>
                <li>✓ Standard Reporting</li>
                <li>✓ Email Support</li>
              </ul>
              <Link href="/signup?plan=starter" style={btnGhostFull}>Select Starter</Link>
            </div>

            {/* Pro Plan */}
            <div style={{ ...pricingCard, border: "2px solid #38bdf8", transform: "scale(1.05)", position: "relative" }}>
              <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: "#38bdf8", color: "#0f172a", fontSize: "0.75rem", fontWeight: 700, padding: "4px 12px", borderRadius: "99px", textTransform: "uppercase" }}>Most Popular</div>
              <h3 style={{ fontSize: "1.5rem", color: "#fff", marginBottom: "0.5rem" }}>Professional</h3>
              <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "#fff", marginBottom: "1rem" }}>£99<span style={{ fontSize: "1rem", color: "#94a3b8", fontWeight: 400 }}>/mo</span></div>
              <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>For growing organizations with advanced needs.</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem 0", color: "#cbd5e1", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <li>✓ Up to 50 Tenants</li>
                <li>✓ Advanced AI Multi-Form Intake</li>
                <li>✓ Custom Form Generation</li>
                <li>✓ Priority Support</li>
              </ul>
              <Link href="/signup?plan=pro" style={{...btnPrimary, width: "100%", textAlign: "center" }}>Select Professional</Link>
            </div>

            {/* Enterprise Plan */}
            <div style={pricingCard}>
              <h3 style={{ fontSize: "1.5rem", color: "#fff", marginBottom: "0.5rem" }}>Enterprise</h3>
              <div style={{ fontSize: "2.5rem", fontWeight: 700, color: "#fff", marginBottom: "1rem" }}>Custom</div>
              <p style={{ color: "#94a3b8", marginBottom: "2rem" }}>For large housing associations requiring scale.</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem 0", color: "#cbd5e1", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <li>✓ Unlimited Tenants</li>
                <li>✓ Dedicated Account Manager</li>
                <li>✓ Custom API Integrations</li>
                <li>✓ SLA & Phone Support</li>
              </ul>
              <Link href="mailto:sales@tenanthub.com" style={btnGhostFull}>Contact Sales</Link>
            </div>

          </div>
        </div>
      </section>

      <footer style={{ padding: "3rem 1rem", textAlign: "center", color: "#64748b", borderTop: "1px solid #1e293b" }}>
        <p>© {new Date().getFullYear()} Tenant Hub. All rights reserved.</p>
      </footer>
    </main>
  );
}

// Inline Styles
const btnPrimary = {
  background: "#38bdf8",
  color: "#0f172a",
  padding: "0.5rem 1rem",
  borderRadius: "0.5rem",
  fontWeight: 600,
  textDecoration: "none",
  transition: "all 0.2s",
};

const btnGhost = {
  background: "transparent",
  color: "#f8fafc",
  padding: "0.5rem 1rem",
  borderRadius: "0.5rem",
  fontWeight: 600,
  textDecoration: "none",
  transition: "all 0.2s",
};

const btnGhostFull = {
  ...btnGhost,
  border: "1px solid #475569",
  width: "100%",
  textAlign: "center" as const,
  display: "block",
};

const pricingCard = {
  background: "#0f172a",
  borderRadius: "1rem",
  padding: "2rem",
  border: "1px solid #334155",
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between",
};
