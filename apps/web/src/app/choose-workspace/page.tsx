"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as s from "../(auth)/_authStyles";

interface OrgOption { id: string; name: string }

/**
 * /choose-workspace — shown right after a manager logs in, before the
 * dashboard (migration 046: a manager account can belong to more than one
 * organisation now). Almost every account has exactly one org, so this
 * page's default behaviour is to skip itself instantly — the picker only
 * ever actually shows for an account with real multi-org access.
 */
export default function ChooseWorkspacePage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/organisations/mine")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data: OrgOption[]) => {
        if (data.length <= 1) {
          router.replace("/dashboard");
          return;
        }
        setOrgs(data);
      })
      .catch(() => setError("Could not load your workspaces. Try again."));
  }, [router]);

  async function choose(orgId: string) {
    setSwitching(orgId);
    setError(null);
    try {
      const res = await fetch("/api/auth/switch-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not switch workspace. Try again.");
        setSwitching(null);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
      setSwitching(null);
    }
  }

  return (
    <main style={s.page}>
      <div style={s.card}>
        <h1 style={s.heading}>Which workspace?</h1>
        <p style={s.subBrands}>Pick the organisation you want to work in. You can switch again later.</p>

        {error && <div style={s.errorBox}>{error}</div>}

        {orgs === null && !error ? (
          <p style={{ fontSize: 14, color: "#7A8499" }}>Loading your workspaces…</p>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
            {orgs?.map((org) => (
              <button
                key={org.id}
                type="button"
                className="btn-dyn"
                onClick={() => void choose(org.id)}
                disabled={switching !== null}
                style={{
                  ...s.input,
                  textAlign: "left",
                  minHeight: 56,
                  fontWeight: 600,
                  color: "var(--navy)",
                  background: "var(--surface)",
                  cursor: switching !== null ? "wait" : "pointer",
                }}
              >
                {switching === org.id ? "Switching…" : org.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
