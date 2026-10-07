/**
 * Session export (BUILD_PLAN C53) — "download as a Word document or PDF, not
 * just view it on screen."
 *
 * No new dependency pulled in for either format, in keeping with this app's
 * existing convention (every other "Export PDF" button in the app — Reports,
 * the tenant statement, the print dossier — is a clean print-friendly view
 * plus the browser's own print-to-PDF, not a server-rendered PDF file):
 *   - PDF: a clean printable view in a new tab, same pattern as everywhere
 *     else in the app.
 *   - Word: an HTML document served with a .doc filename and the
 *     application/msword type — Word (and Google Docs) opens this natively.
 *     It is real HTML, not a genuine binary .docx, which is an honest
 *     trade-off for zero new dependencies; it opens and edits correctly in
 *     Word either way.
 */
import type { Session } from "@tenant-hub/validation";
import { formatShortDate } from "./format";

function sessionTitle(s: Session): string {
  return `${s.session_type.charAt(0).toUpperCase()}${s.session_type.slice(1)} session, ${formatShortDate(s.session_date)}`;
}

function sessionBodyHtml(s: Session, tenantName?: string): string {
  const title = sessionTitle(s);
  const notes = (s.notes ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
  return `<h1>${title}</h1>
<p class="meta">${tenantName ? `${tenantName} · ` : ""}Logged by ${s.entered_by_name ?? "—"}${s.blockchain_hash ? ` · Record hash ${s.blockchain_hash.slice(0, 12)}…` : ""}</p>
<div class="notes">${notes || "(no notes recorded)"}</div>`;
}

const STYLE = `body{font-family:Georgia,serif;color:#0F1C2E;max-width:700px;margin:2rem auto;line-height:1.5}
h1{font-size:20px;margin-bottom:4px}.meta{color:#5C6673;font-size:13px;margin-bottom:20px}
.notes{white-space:pre-wrap;font-size:14px}`;

/** Downloads the session as a Word-openable .doc file. */
export function downloadSessionAsWord(s: Session, tenantName?: string) {
  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>${sessionTitle(s)}</title><style>${STYLE}</style></head>
<body>${sessionBodyHtml(s, tenantName)}</body></html>`;
  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `session-${s.session_date}-${s.session_type}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Opens a clean printable view of the session — "Save as PDF" via the browser's own print dialog. */
export function printSession(s: Session, tenantName?: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${sessionTitle(s)}</title><style>${STYLE}</style></head><body>${sessionBodyHtml(s, tenantName)}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
