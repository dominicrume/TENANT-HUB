/**
 * Report Issue — Tenant Maintenance portal.
 *
 * Allows tenants to see their active maintenance tickets, see their status,
 * and submit a new ticket with optional photo upload.
 * Designed with large touch targets, simple language, and warm feedback.
 */
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { getSupabaseBrowser } from "../../../lib/supabase-browser";

interface Ticket {
  id: string;
  issue_type: string;
  description: string;
  status: "Open" | "Assigned" | "Resolved" | string;
  created_at: string;
  photo_url?: string | null;
}

export default function ReportIssuePage() {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [issueType, setIssueType] = useState("Plumbing");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const supabase = getSupabaseBrowser();

  async function loadTickets() {
    try {
      const res = await fetch("/api/tenant-portal/tickets", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load your repairs history");
      const json = await res.json();
      setTickets(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load repairs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      let photo_url = null;
      if (photoFile) {
        const ext = photoFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("maintenance-photos")
          .upload(fileName, photoFile);
        if (uploadError) throw new Error("Photo upload failed: " + uploadError.message);
        if (uploadData) {
          photo_url = uploadData.path;
        }
      }

      const res = await fetch("/api/tenant-portal/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issue_type: issueType,
          description,
          photo_url,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to submit request");
      }

      setSuccess(true);
      setDescription("");
      setPhotoFile(null);
      await loadTickets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPhotoFile(e.target.files[0]);
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>Report a Repair</h1>
      <p style={styles.pageSubtitle}>
        Let us know if something in your room or building needs fixing.
      </p>

      {error && (
        <div style={styles.errorBanner}>
          ⚠️ {error}
        </div>
      )}

      {success ? (
        <div style={styles.successCard}>
          <span style={{ fontSize: "48px" }}>✅</span>
          <h2 style={styles.successTitle}>Repair Request Received</h2>
          <p style={styles.successText}>
            Thank you! We have logged your request. Our support team or maintenance worker will contact you.
          </p>
          <button onClick={() => setSuccess(false)} style={styles.resetBtn}>
            Report Another Issue
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={styles.formCard}>
          <div style={styles.fieldGroup}>
            <label htmlFor="issueType" style={styles.label}>
              What needs fixing?
            </label>
            <select
              id="issueType"
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              style={styles.select}
            >
              <option value="Plumbing">🚰 Plumbing (Taps, toilet, shower, leaks)</option>
              <option value="Electrical">💡 Electrical (Lights, sockets, switches)</option>
              <option value="Heating">🔥 Heating (Radiator, boiler, cold room)</option>
              <option value="Locks & Keys">🔑 Locks &amp; Keys (Door lock, lost keys)</option>
              <option value="Appliances">🔌 Appliance (Fridge, microwave, cooker)</option>
              <option value="Furniture">🪑 Furniture / Room structure (Window, bed, door)</option>
              <option value="Other">❓ Other issue</option>
            </select>
          </div>

          <div style={styles.fieldGroup}>
            <label htmlFor="description" style={styles.label}>
              Describe the problem
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Please describe what is broken and where it is..."
              required
              rows={4}
              style={styles.textarea}
            />
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>
              Add a photo (optional)
            </label>
            <div style={styles.fileInputWrapper}>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={styles.fileInput}
                id="photo-upload"
              />
              <label htmlFor="photo-upload" style={styles.fileLabel}>
                {photoFile ? `📸 ${photoFile.name}` : "📁 Choose a photo"}
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              ...styles.submitBtn,
              opacity: submitting ? 0.7 : 1,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {submitting ? "Sending..." : "Submit Repair Request"}
          </button>
        </form>
      )}

      {/* ── Repairs list ────────────────────────────────────── */}
      <div style={styles.historySection}>
        <h2 style={styles.historyTitle}>Your Repair Requests</h2>
        {loading ? (
          <div style={styles.listSkeleton}>
            <div style={{ ...styles.skeletonBar, height: "60px", marginBottom: "8px" }} />
            <div style={{ ...styles.skeletonBar, height: "60px" }} />
          </div>
        ) : tickets.length === 0 ? (
          <div style={styles.emptyState}>
            <span style={{ fontSize: "28px" }}>🔧</span>
            <p style={styles.emptyText}>You haven&apos;t reported any issues yet.</p>
          </div>
        ) : (
          <div style={styles.listContainer}>
            {tickets.map((t) => {
              const dateStr = new Date(t.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              const statusColor =
                t.status === "Resolved"
                  ? "#3DBB7A"
                  : t.status === "Assigned"
                  ? "var(--amber)"
                  : "#E85454";
              return (
                <div key={t.id} style={styles.row}>
                  <div style={styles.rowTop}>
                    <span style={styles.rowType}>{t.issue_type}</span>
                    <span
                      style={{
                        ...styles.statusBadge,
                        background:
                          t.status === "Resolved"
                            ? "#ECFDF5"
                            : t.status === "Assigned"
                            ? "rgba(232,168,76,0.1)"
                            : "#FEF2F2",
                        color: statusColor,
                      }}
                    >
                      {t.status}
                    </span>
                  </div>
                  <p style={styles.rowDesc}>{t.description}</p>
                  <span style={styles.rowDate}>Reported on {dateStr}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Inline styles ────────────────────────────────────────────── */
const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: "24px 16px 100px",
    maxWidth: "720px",
    margin: "0 auto",
    fontFamily: "'Sora', sans-serif",
  },
  pageTitle: {
    fontSize: "22px",
    fontWeight: 700,
    color: "var(--navy)",
    margin: "0 0 4px",
  },
  pageSubtitle: {
    fontSize: "14px",
    color: "#7A8494",
    margin: "0 0 20px",
  },
  errorBanner: {
    background: "#FEF2F2",
    color: "#E85454",
    padding: "12px 16px",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: 600,
    marginBottom: "16px",
  },
  formCard: {
    background: "#fff",
    borderRadius: "14px",
    padding: "20px",
    boxShadow: "0 1px 4px rgba(15,28,46,0.06)",
    marginBottom: "32px",
  },
  fieldGroup: {
    marginBottom: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--navy)",
  },
  select: {
    padding: "12px",
    borderRadius: "10px",
    border: "2px solid #EDE8E1",
    fontSize: "14px",
    fontFamily: "'Sora',sans-serif",
    background: "#fff",
    minHeight: "48px",
    outline: "none",
  },
  textarea: {
    padding: "12px",
    borderRadius: "10px",
    border: "2px solid #EDE8E1",
    fontSize: "14px",
    fontFamily: "'Sora',sans-serif",
    minHeight: "100px",
    resize: "vertical",
    outline: "none",
  },
  fileInputWrapper: {
    position: "relative",
    display: "inline-block",
    width: "100%",
  },
  fileInput: {
    position: "absolute",
    left: 0,
    top: 0,
    opacity: 0,
    width: "100%",
    height: "100%",
    cursor: "pointer",
  },
  fileLabel: {
    display: "block",
    padding: "12px",
    borderRadius: "10px",
    border: "2px dashed #EDE8E1",
    textAlign: "center",
    fontSize: "14px",
    color: "#7A8494",
    cursor: "pointer",
    background: "#FAF9F6",
  },
  submitBtn: {
    width: "100%",
    padding: "14px",
    borderRadius: "12px",
    border: "none",
    background: "var(--navy)",
    color: "#fff",
    fontWeight: 700,
    fontSize: "15px",
    fontFamily: "'Sora',sans-serif",
    marginTop: "8px",
  },
  successCard: {
    textAlign: "center",
    padding: "40px 20px",
    background: "#fff",
    borderRadius: "14px",
    boxShadow: "0 1px 4px rgba(15,28,46,0.06)",
    marginBottom: "32px",
  },
  successTitle: {
    fontSize: "18px",
    fontWeight: 700,
    color: "var(--navy)",
    marginTop: "16px",
    marginBottom: "8px",
  },
  successText: {
    fontSize: "14px",
    color: "#7A8494",
    lineHeight: 1.5,
    margin: "0 0 24px 0",
  },
  resetBtn: {
    padding: "12px 24px",
    borderRadius: "10px",
    border: "2px solid var(--navy)",
    background: "transparent",
    color: "var(--navy)",
    fontWeight: 700,
    fontSize: "14px",
    fontFamily: "'Sora',sans-serif",
    cursor: "pointer",
  },
  historySection: {
    marginTop: "32px",
  },
  historyTitle: {
    fontSize: "16px",
    fontWeight: 700,
    color: "var(--navy)",
    marginBottom: "14px",
  },
  listSkeleton: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  skeletonBar: {
    borderRadius: "10px",
    background: "#E8E3DC",
  },
  emptyState: {
    textAlign: "center",
    padding: "32px 16px",
    background: "#fff",
    borderRadius: "14px",
    boxShadow: "0 1px 3px rgba(15,28,46,0.04)",
  },
  emptyText: {
    fontSize: "14px",
    color: "#7A8494",
    marginTop: "8px",
  },
  listContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  row: {
    background: "#fff",
    borderRadius: "12px",
    padding: "16px",
    boxShadow: "0 1px 3px rgba(15,28,46,0.05)",
  },
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  rowType: {
    fontSize: "13px",
    fontWeight: 700,
    color: "var(--navy)",
  },
  statusBadge: {
    fontSize: "11px",
    fontWeight: 700,
    padding: "3px 10px",
    borderRadius: "20px",
  },
  rowDesc: {
    fontSize: "13px",
    color: "#4A5464",
    margin: "0 0 8px 0",
    lineHeight: 1.4,
  },
  rowDate: {
    fontSize: "11px",
    color: "#9AA6BC",
  },
};
