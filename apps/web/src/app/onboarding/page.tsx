"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function Onboarding() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName })
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        console.error("Failed to create org");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-50 p-4">
      <div className="max-w-md w-full bg-white shadow-lg rounded-xl p-8 text-center">
        <h2 className="text-3xl font-bold text-navy-900 mb-2">Welcome to Tenant Hub</h2>
        <p className="text-navy-600 mb-6">Let's set up your organisation to get started.</p>
        
        <form onSubmit={handleCreateOrg} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="Housing Association Name"
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !orgName.trim()}
            className="w-full px-6 py-3 bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Organisation"}
          </button>
        </form>
      </div>
    </div>
  );
}
