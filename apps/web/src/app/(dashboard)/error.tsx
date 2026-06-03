/**
 * Dashboard error boundary — a thrown render error shows the message instead of
 * a blank screen, and offers a retry. One bad record can't white-screen the app.
 */
"use client";

export default function DashboardError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: "2rem", fontFamily: "'Sora', sans-serif" }}>
      <h2 style={{ color: "var(--navy)", fontSize: "18px", fontWeight: 700 }}>Something went wrong loading this view.</h2>
      <p style={{ color: "#E05252", fontSize: "13px", marginTop: "8px" }}>{error.message}</p>
      <button onClick={reset} style={{ marginTop: "14px", minHeight: "44px", padding: "0 18px", borderRadius: "8px", border: "none", background: "var(--navy)", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
        Try again
      </button>
    </div>
  );
}
