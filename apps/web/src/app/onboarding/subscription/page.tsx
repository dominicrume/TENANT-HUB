"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function SubscriptionGatewayContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [processing, setProcessing] = useState(false);

  const plan = searchParams.get("plan") || "premium";
  
  let price = "300";
  let planName = "Premium Workspace";
  if (plan === "professional") {
    price = "99";
    planName = "Professional Workspace";
  } else if (plan === "starter") {
    price = "49";
    planName = "Starter Workspace";
  }

  const handleSimulatedPayment = () => {
    setProcessing(true);
    // Simulate a gateway delay
    setTimeout(() => {
      // After successful simulated payment, redirect to the real staff signup flow
      router.push(`/signup?plan=${plan}`);
    }, 1500);
  };

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#0f172a", color: "#f8fafc", fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
      <div style={{ maxWidth: "480px", width: "100%", background: "#1e293b", padding: "3rem 2rem", borderRadius: "1.5rem", border: "1px solid #334155", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)", textAlign: "center" }}>
        
        <div style={{ width: "64px", height: "64px", background: "var(--amber, #E8A84C)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 2rem", color: "var(--navy, #0B1B3D)", fontSize: "24px", fontWeight: 800, fontFamily: "'Sora', sans-serif" }}>
          M
        </div>

        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Matty's Place {planName.replace(" Workspace", "")}</h1>
        <p style={{ color: "#94a3b8", fontSize: "1.1rem", marginBottom: "2.5rem" }}>
          Complete your subscription to unlock the full workspace.
        </p>

        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "1rem", padding: "1.5rem", marginBottom: "2.5rem", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "1rem" }}>
            <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{planName}</span>
            <span style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff" }}>£{price}<span style={{ fontSize: "1rem", color: "#94a3b8", fontWeight: 400 }}>/mo</span></span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, color: "#94a3b8", fontSize: "0.95rem", display: "flex", flexDirection: "column", gap: "0.5rem", textAlign: "left" }}>
            <li style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ color: "#34C87A" }}>✓</span> {plan === 'professional' ? "Up to 50 Active Tenants" : plan === 'starter' ? "Up to 10 Tenants" : "Unlimited Active Tenants"}</li>
            <li style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ color: "#34C87A" }}>✓</span> AI Brain Document Extraction</li>
            <li style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ color: "#34C87A" }}>✓</span> Advanced Audit & Risk Flags</li>
          </ul>
        </div>

        <button 
          onClick={handleSimulatedPayment}
          disabled={processing}
          style={{ 
            width: "100%", 
            background: processing ? "#475569" : "#38bdf8", 
            color: processing ? "#cbd5e1" : "#0f172a", 
            padding: "1rem", 
            borderRadius: "0.75rem", 
            fontSize: "1.1rem", 
            fontWeight: 700, 
            border: "none", 
            cursor: processing ? "wait" : "pointer",
            transition: "all 0.2s",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px"
          }}
        >
          {processing ? (
            <>
              <svg className="animate-spin" style={{ width: "20px", height: "20px", animation: "spin 1s linear infinite" }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing Gateway...
            </>
          ) : `Confirm & Enter (£${price})`}
        </button>

        <Link href="/" style={{ color: "#64748b", textDecoration: "none", fontSize: "0.9rem" }}>
          Cancel and return home
        </Link>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}} />
    </main>
  );
}

export default function SubscriptionGateway() {
  return (
    <Suspense fallback={<div style={{ color: "#fff", padding: "2rem", textAlign: "center" }}>Loading checkout...</div>}>
      <SubscriptionGatewayContent />
    </Suspense>
  );
}
