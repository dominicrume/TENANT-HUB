"use client";

import { useEffect, useState, useCallback } from "react";
import { SelectField } from "../form/fields";

const AREAS = [
  "Achieve Economic Wellbeing (AEW)",
  "Being healthy (BH)",
  "Enjoy and Achieve (EAA)",
  "Make a positive contribution (Mpc)",
  "Staying Safe (SS)",
];

const CATEGORIES: Record<string, string[]> = {
  "Achieve Economic Wellbeing (AEW)": ["Accessing benefits", "Reduce debt", "Budgeting", "Setting up bank account", "Learning how to shop wisely", "Recoup money owed"],
  "Being healthy (BH)": ["Registering with GP", "Attending appointments", "Medication management", "Healthy eating", "Substance misuse support", "Mental health support"],
  "Enjoy and Achieve (EAA)": ["Enrolling in education", "Finding employment", "Volunteering", "Hobbies and activities", "Life skills training"],
  "Make a positive contribution (Mpc)": ["Community engagement", "Peer support", "Feedback and advocacy", "Reconnecting with family"],
  "Staying Safe (SS)": ["Personal safety", "Home safety", "Managing visitors", "Safeguarding", "Emergency contacts", "Risk awareness"],
};

interface GoalUpdate {
  id: string;
  comment: string;
  entered_by: { full_name: string; role: string };
  created_at: string;
}

interface Goal {
  id: string;
  area: string;
  sub_category: string;
  status: string;
  created_at: string;
  review_date: string;
  tenant_goal_updates?: GoalUpdate[];
}

export function GoalsTab({ tenantId }: { tenantId: string }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  // New Goal State
  const defaultArea = AREAS[0] as string;
  const [newArea, setNewArea] = useState(defaultArea);
  const [newCategory, setNewCategory] = useState(CATEGORIES[defaultArea]?.[0] || "");
  const [initialComment, setInitialComment] = useState("");
  const [adding, setAdding] = useState(false);

  // Updates State
  const [updateText, setUpdateText] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/goals`);
    if (res.ok) setGoals(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  async function createGoal() {
    setAdding(true);
    const res = await fetch(`/api/tenants/${tenantId}/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ area: newArea, sub_category: newCategory, initial_comment: initialComment }),
    });
    setAdding(false);
    if (res.ok) {
      setInitialComment("");
      await load();
    }
  }

  async function addUpdate(goalId: string) {
    const text = updateText[goalId];
    if (!text?.trim()) return;

    setUpdating((prev) => ({ ...prev, [goalId]: true }));
    const res = await fetch(`/api/goals/${goalId}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: text }),
    });
    setUpdating((prev) => ({ ...prev, [goalId]: false }));

    if (res.ok) {
      setUpdateText((prev) => ({ ...prev, [goalId]: "" }));
      await load();
    }
  }

  if (loading) return <div style={{ padding: "40px", color: "#7A8499" }}>Loading Support Plan...</div>;

  return (
    <div style={{ marginTop: "24px" }}>
      {/* Create Goal Section */}
      <div style={{ background: "#F8F4EF", padding: "20px", borderRadius: "12px", border: "1px solid #EDE8E1", marginBottom: "30px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--navy)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Add New Support Goal</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Area</label>
            <select
              value={newArea}
              onChange={(e) => {
                setNewArea(e.target.value);
                setNewCategory(CATEGORIES[e.target.value]?.[0] || "");
              }}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #EDE8E1", fontSize: "13px" }}
            >
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Sub-category</label>
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #EDE8E1", fontSize: "13px" }}
            >
              {(CATEGORIES[newArea] || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", fontSize: "12px", color: "#7A8499", marginBottom: "6px" }}>Initial Step / Discussion (Optional)</label>
          <textarea
            value={initialComment}
            onChange={(e) => setInitialComment(e.target.value)}
            style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #EDE8E1", fontSize: "13px", minHeight: "60px", boxSizing: "border-box" }}
            placeholder="E.g. Discussed with tenant, agreed to look at forms next week..."
          />
        </div>
        <button
          onClick={createGoal}
          disabled={adding}
          style={{ padding: "10px 20px", borderRadius: "8px", background: "var(--navy)", color: "#fff", border: "none", fontWeight: 600, cursor: adding ? "not-allowed" : "pointer" }}
        >
          {adding ? "Adding..." : "+ Create Support Goal"}
        </button>
      </div>

      {/* Goals List */}
      <div>
        <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy)", marginBottom: "16px" }}>Active Support Plan</h3>
        {goals.length === 0 ? (
          <p style={{ fontSize: "13px", color: "#7A8499" }}>No goals have been created for this tenant yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {goals.map((g) => {
              const isPastReview = new Date(g.review_date) < new Date();
              return (
                <div key={g.id} style={{ border: "1px solid #EDE8E1", borderRadius: "12px", overflow: "hidden" }}>
                  {/* Goal Header */}
                  <div style={{ background: "#fff", padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #EDE8E1" }}>
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                        {g.area}
                      </div>
                      <h4 style={{ fontSize: "16px", fontWeight: 700, color: "var(--navy)", margin: 0 }}>
                        {g.sub_category}
                      </h4>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "11px", color: "#7A8499", marginBottom: "4px" }}>Next Review</div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: isPastReview ? "#E05252" : "var(--navy)", background: isPastReview ? "rgba(224,82,82,0.1)" : "transparent", padding: "4px 8px", borderRadius: "4px" }}>
                        {isPastReview && "⚠️ "}{new Date(g.review_date).toLocaleDateString("en-GB")}
                      </div>
                    </div>
                  </div>

                  {/* Updates Section */}
                  <div style={{ background: "#FAFAFA", padding: "16px" }}>
                    <h5 style={{ fontSize: "12px", fontWeight: 600, color: "#7A8499", marginBottom: "12px", textTransform: "uppercase" }}>Steps &amp; Interactions</h5>
                    
                    {g.tenant_goal_updates && g.tenant_goal_updates.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
                        {g.tenant_goal_updates.map((u) => (
                          <div key={u.id} style={{ background: "#fff", padding: "12px", borderRadius: "8px", border: "1px solid #EDE8E1" }}>
                            <div style={{ fontSize: "11px", color: "#7A8499", marginBottom: "6px", display: "flex", justifyContent: "space-between" }}>
                              <strong>{u.entered_by.full_name} ({u.entered_by.role.replace("_", " ")})</strong>
                              <span>{new Date(u.created_at).toLocaleDateString("en-GB")} {new Date(u.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            <div style={{ fontSize: "13px", color: "var(--navy)", lineHeight: 1.5 }}>{u.comment}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: "12px", color: "#9AA6BC", fontStyle: "italic", marginBottom: "16px" }}>No interactions logged yet.</p>
                    )}

                    {/* Add Update Input */}
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
                      <div style={{ flex: 1 }}>
                        <textarea
                          placeholder="Log a new interaction, discussion, or completed step..."
                          value={updateText[g.id] ?? ""}
                          onChange={(e) => setUpdateText((prev) => ({ ...prev, [g.id]: e.target.value }))}
                          style={{ width: "100%", padding: "10px", borderRadius: "8px", border: "1px solid #D9D2C7", fontSize: "13px", minHeight: "60px", boxSizing: "border-box" }}
                        />
                      </div>
                      <button
                        onClick={() => addUpdate(g.id)}
                        disabled={updating[g.id] || !updateText[g.id]?.trim()}
                        style={{ height: "44px", padding: "0 16px", borderRadius: "8px", background: "#E8A84C", color: "var(--navy)", border: "none", fontWeight: 700, cursor: (updating[g.id] || !updateText[g.id]?.trim()) ? "not-allowed" : "pointer" }}
                      >
                        {updating[g.id] ? "Saving..." : "Sign & Date"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
