import Link from "next/link";
import { createSupabaseServer } from "../lib/supabase-server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const supabase = createSupabaseServer();
  const { data: { session } } = await supabase.auth.getSession();

  return (
    <main style={{ 
      minHeight: "100vh", 
      backgroundColor: "#0B1121", 
      color: "#f8fafc", 
      fontFamily: "'Inter', system-ui, sans-serif",
      position: "relative",
      overflow: "hidden"
    }}>
      {/* Background ambient light */}
      <div style={{
        position: "absolute",
        top: "-15%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "80%",
        height: "500px",
        background: "radial-gradient(ellipse at center, rgba(56, 189, 248, 0.15) 0%, rgba(11, 17, 33, 0) 70%)",
        pointerEvents: "none",
        zIndex: 0
      }} />

      {/* Navigation */}
      <nav style={{ 
        position: "relative",
        zIndex: 10,
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center", 
        padding: "1.5rem 5%", 
        maxWidth: "1200px", 
        margin: "0 auto",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(255,255,255,0.05)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "38px", height: "38px", borderRadius: "10px", background: "linear-gradient(135deg, #E8A84C, #f59e0b)",
            display: "flex", alignItems: "center", justifyContent: "center", color: "#0B1B3D", fontWeight: 800, fontSize: "20px"
          }}>
            T
          </div>
          <div style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em", color: "#fff" }}>
            Tenant<span style={{ color: "#38bdf8" }}>Hub</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {session ? (
            <Link href="/dashboard" style={btnPrimary}>Enter Workspace</Link>
          ) : (
            <>
              <Link href="/login" style={btnGhost}>Log In</Link>
              <Link href="/onboarding/subscription" style={btnPrimary}>Start Free Trial</Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{ 
        position: "relative",
        zIndex: 10,
        textAlign: "center", 
        padding: "8rem 1rem 6rem", 
        maxWidth: "900px", 
        margin: "0 auto" 
      }}>
        <div style={{
          display: "inline-block",
          padding: "6px 16px",
          background: "rgba(56, 189, 248, 0.1)",
          color: "#38bdf8",
          borderRadius: "99px",
          fontSize: "0.875rem",
          fontWeight: 600,
          marginBottom: "2rem",
          border: "1px solid rgba(56, 189, 248, 0.2)",
          letterSpacing: "0.05em",
          textTransform: "uppercase"
        }}>
          The Premier OS for Supported Housing
        </div>
        <h1 style={{ 
          fontSize: "clamp(3rem, 8vw, 5rem)", 
          fontWeight: 800, 
          lineHeight: 1.1, 
          marginBottom: "1.5rem", 
          background: "linear-gradient(180deg, #FFFFFF 0%, #94A3B8 100%)", 
          WebkitBackgroundClip: "text", 
          WebkitTextFillColor: "transparent",
          letterSpacing: "-0.04em"
        }}>
          Transform how you manage tenants.
        </h1>
        <p style={{ 
          fontSize: "1.25rem", 
          color: "#94a3b8", 
          marginBottom: "3rem", 
          lineHeight: 1.6,
          maxWidth: "700px",
          margin: "0 auto 3rem auto"
        }}>
          Automate intake forms, track tenant progress, and stay strictly compliant with AI-powered file management. Stop drowning in paperwork.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <Link href={session ? "/dashboard" : "/onboarding/subscription"} style={{ ...btnPrimary, padding: "1.125rem 2.5rem", fontSize: "1.125rem", boxShadow: "0 10px 25px -5px rgba(56, 189, 248, 0.4)" }}>
            Get Started Today
          </Link>
          <Link href="#pricing" style={{ ...btnGhost, padding: "1.125rem 2.5rem", fontSize: "1.125rem", border: "1px solid rgba(255,255,255,0.1)" }}>
            View Pricing
          </Link>
        </div>
      </section>

      {/* Pricing Section */}
      <section style={{ padding: "6rem 1rem", position: "relative", zIndex: 10 }} id="pricing">
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "5rem" }}>
            <h2 style={{ fontSize: "3rem", fontWeight: 800, color: "#fff", marginBottom: "1rem", letterSpacing: "-0.03em" }}>Simple, transparent pricing</h2>
            <p style={{ color: "#94a3b8", fontSize: "1.25rem" }}>Choose the DBMS tier that fits your organisation's scale.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2rem", alignItems: "center" }}>
            
            {/* Starter Plan */}
            <div style={pricingCard}>
              <h3 style={{ fontSize: "1.25rem", color: "#94a3b8", marginBottom: "1rem", fontWeight: 600 }}>Starter</h3>
              <div style={{ fontSize: "3rem", fontWeight: 800, color: "#fff", marginBottom: "1rem", display: "flex", alignItems: "baseline" }}>
                £49<span style={{ fontSize: "1.125rem", color: "#64748b", fontWeight: 500, marginLeft: "4px" }}>/mo</span>
              </div>
              <p style={{ color: "#cbd5e1", marginBottom: "2.5rem", lineHeight: 1.5 }}>Perfect for small homes just getting started.</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2.5rem 0", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <li style={listItem}><CheckIcon /> Up to 10 Active Tenants</li>
                <li style={listItem}><CheckIcon /> Basic AI Intake Extraction</li>
                <li style={listItem}><CheckIcon /> Standard Reporting</li>
                <li style={listItem}><CheckIcon /> Email Support</li>
              </ul>
              <Link href="/signup?plan=starter" style={btnGhostFull}>Select Starter</Link>
            </div>

            {/* Premium / Enterprise SaaS Plan (The DBMS White Label equivalent) */}
            <div style={{ 
              ...pricingCard, 
              background: "linear-gradient(145deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))",
              border: "1px solid rgba(56, 189, 248, 0.5)", 
              transform: "scale(1.05)", 
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 40px rgba(56, 189, 248, 0.15)",
              position: "relative",
              zIndex: 2
            }} className="premium-card">
              <div style={{ position: "absolute", top: "-14px", left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg, #38bdf8, #818cf8)", color: "#fff", fontSize: "0.85rem", fontWeight: 700, padding: "6px 16px", borderRadius: "99px", textTransform: "uppercase", letterSpacing: "0.05em", boxShadow: "0 4px 10px rgba(56, 189, 248, 0.3)" }}>
                Premium White-Label
              </div>
              <h3 style={{ fontSize: "1.25rem", color: "#38bdf8", marginBottom: "1rem", fontWeight: 600 }}>Enterprise DBMS</h3>
              <div style={{ fontSize: "3.5rem", fontWeight: 800, color: "#fff", marginBottom: "1rem", display: "flex", alignItems: "baseline" }}>
                £300<span style={{ fontSize: "1.125rem", color: "#94a3b8", fontWeight: 500, marginLeft: "4px" }}>/mo</span>
              </div>
              <p style={{ color: "#e2e8f0", marginBottom: "2.5rem", lineHeight: 1.5 }}>The ultimate database management system for scaling associations.</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2.5rem 0", color: "#f1f5f9", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <li style={listItem}><CheckIcon highlighted /> Unlimited Tenants & Properties</li>
                <li style={listItem}><CheckIcon highlighted /> Full AI Brain Capabilities</li>
                <li style={listItem}><CheckIcon highlighted /> Advanced White-Label Portals</li>
                <li style={listItem}><CheckIcon highlighted /> Priority 24/7 SLA Support</li>
              </ul>
              <Link href="/onboarding/subscription?plan=premium" style={{...btnPrimary, width: "100%", textAlign: "center", padding: "1rem", fontSize: "1.125rem", boxShadow: "0 8px 20px -5px rgba(56, 189, 248, 0.5)" }}>Deploy Premium</Link>
            </div>

            {/* Professional Plan */}
            <div style={pricingCard}>
              <h3 style={{ fontSize: "1.25rem", color: "#94a3b8", marginBottom: "1rem", fontWeight: 600 }}>Professional</h3>
              <div style={{ fontSize: "3rem", fontWeight: 800, color: "#fff", marginBottom: "1rem", display: "flex", alignItems: "baseline" }}>
                £99<span style={{ fontSize: "1.125rem", color: "#64748b", fontWeight: 500, marginLeft: "4px" }}>/mo</span>
              </div>
              <p style={{ color: "#cbd5e1", marginBottom: "2.5rem", lineHeight: 1.5 }}>For growing organizations with advanced compliance needs.</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2.5rem 0", color: "#94a3b8", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <li style={listItem}><CheckIcon /> Up to 50 Tenants</li>
                <li style={listItem}><CheckIcon /> Advanced Form Generation</li>
                <li style={listItem}><CheckIcon /> Basic API Access</li>
                <li style={listItem}><CheckIcon /> Standard Support</li>
              </ul>
              <Link href="/onboarding/subscription?plan=professional" style={btnGhostFull}>Select Professional</Link>
            </div>

          </div>
        </div>
      </section>

      <footer style={{ padding: "4rem 1rem", textAlign: "center", color: "#475569", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <p>© {new Date().getFullYear()} Tenant Hub. All rights reserved.</p>
      </footer>
      
      <style dangerouslySetInnerHTML={{__html: `
        .premium-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .premium-card:hover {
          transform: scale(1.07);
          box-shadow: 0 30px 60px -12px rgba(0,0,0,0.6), 0 0 50px rgba(56, 189, 248, 0.25) !important;
        }
      `}} />
    </main>
  );
}

// Inline Styles & Icons
const CheckIcon = ({ highlighted = false }) => (
  <svg style={{ width: "20px", height: "20px", color: highlighted ? "#38bdf8" : "#10b981", flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

const listItem = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  fontSize: "1.05rem"
};

const btnPrimary = {
  background: "linear-gradient(90deg, #38bdf8, #0ea5e9)",
  color: "#ffffff",
  padding: "0.6rem 1.2rem",
  borderRadius: "8px",
  fontWeight: 600,
  textDecoration: "none",
  transition: "all 0.2s ease",
  display: "inline-block",
  border: "none",
  cursor: "pointer",
};

const btnGhost = {
  background: "transparent",
  color: "#f8fafc",
  padding: "0.6rem 1.2rem",
  borderRadius: "8px",
  fontWeight: 600,
  textDecoration: "none",
  transition: "all 0.2s ease",
};

const btnGhostFull = {
  ...btnGhost,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.03)",
  width: "100%",
  textAlign: "center" as const,
  display: "block",
};

const pricingCard = {
  background: "rgba(30, 41, 59, 0.4)",
  backdropFilter: "blur(12px)",
  borderRadius: "1.5rem",
  padding: "3rem 2rem",
  border: "1px solid rgba(255,255,255,0.05)",
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between",
  transition: "all 0.3s ease",
};
