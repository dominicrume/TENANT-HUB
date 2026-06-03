export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--cream)" }}>
      <div style={{ background: "var(--surface)", borderRadius: "14px",
        padding: "2rem", width: "100%", maxWidth: "400px",
        boxShadow: "0 12px 32px rgba(15,28,46,0.14)" }}>
        <h1 style={{ fontFamily: "'Sora',sans-serif", fontSize: "22px",
          fontWeight: 700, color: "var(--navy)", marginBottom: "4px" }}>
          Tenant Hub
        </h1>
        <p style={{ fontSize: "12px", color: "#7A8499", marginBottom: "1.5rem" }}>
          Ash Shahada Housing Association Ltd · Matty's Place · Reliance
        </p>
        {/* Auth form wired to Supabase in implementation sprint */}
        <p style={{ fontSize: "12px", color: "#7A8499", textAlign: "center" }}>
          ⚠️ Auth form — wire to packages/auth in Sprint 1
        </p>
      </div>
    </main>
  );
}
