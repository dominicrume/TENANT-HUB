/**
 * Builds the signed PDF of a sign-up form in the browser (pdf-lib): the
 * landlord's name as the letterhead, the filled fields, the clauses, the
 * signature image(s), who signed and when. Returned as a File ready for
 * the single upload path, so it files into its section like any other
 * document — with a SHA-256 the audit trail can vouch for.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { FilledForm, SignupContext } from "./signup-forms";

const NAVY = rgb(0.06, 0.11, 0.18); const SLATE = rgb(0.36, 0.42, 0.5); const AMBER = rgb(0.91, 0.66, 0.3);

export async function buildSignedPdf(form: FilledForm, ctx: SignupContext, i: { tenantSignature: string | null; staffSignature: string | null; signedBy: string; signedAt: Date }): Promise<File> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]); // A4
  const M = 48; let y = 841.89 - M;
  const newPage = () => { page = pdf.addPage([595.28, 841.89]); y = 841.89 - M; };
  const ensure = (h: number) => { if (y - h < M) newPage(); };
  const wrap = (text: string, size: number, f = font, width = 595.28 - M * 2) => {
    const words = text.split(/\s+/); const lines: string[] = []; let line = "";
    for (const w of words) { const t = line ? `${line} ${w}` : w; if (f.widthOfTextAtSize(t, size) > width && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  };
  const para = (text: string, size = 10.5, f = font, colour = NAVY, gap = 6) => { for (const l of wrap(text, size, f)) { ensure(size + 4); page.drawText(l, { x: M, y, size, font: f, color: colour }); y -= size + 4; } y -= gap; };

  // Letterhead: the landlord, through the managing agent.
  page.drawRectangle({ x: 0, y: 841.89 - 6, width: 595.28, height: 6, color: AMBER });
  page.drawText(ctx.landlord?.name ?? ctx.organisation, { x: M, y, size: 16, font: bold, color: NAVY }); y -= 18;
  page.drawText(`${ctx.landlord && ctx.landlord.name !== ctx.organisation ? `managed by ${ctx.organisation} · ` : ""}${[ctx.landlord?.phone, ctx.landlord?.email].filter(Boolean).join(" · ")}`, { x: M, y, size: 9, font, color: SLATE }); y -= 26;
  page.drawText(form.title, { x: M, y, size: 20, font: bold, color: NAVY }); y -= 28;
  if (form.intro) para(form.intro, 11);

  // Fields, two columns.
  if (form.fields.length) {
    const colW = (595.28 - M * 2) / 2;
    for (let k = 0; k < form.fields.length; k += 2) {
      ensure(30);
      for (let c = 0; c < 2; c++) {
        const fld = form.fields[k + c]; if (!fld) continue;
        const x = M + c * colW;
        page.drawText(fld[0].toUpperCase(), { x, y, size: 7.5, font: bold, color: SLATE });
        page.drawText(wrap(fld[1], 10.5, font, colW - 10)[0] ?? "", { x, y: y - 12, size: 10.5, font, color: NAVY });
      }
      y -= 30;
    }
    y -= 6;
  }
  if (form.clauses.length) {
    for (let n = 0; n < form.clauses.length; n++) para(`${n + 1}. ${form.clauses[n]}`, 10.5, font, NAVY, 3);
    y -= 8;
  }

  // Signatures.
  ensure(130);
  const sigBlock = async (label: string, dataUrl: string | null, x: number) => {
    page.drawText(label, { x, y, size: 8, font: bold, color: SLATE });
    page.drawLine({ start: { x, y: y - 56 }, end: { x: x + 220, y: y - 56 }, thickness: 0.8, color: SLATE });
    if (dataUrl) {
      const png = await pdf.embedPng(dataUrl);
      const dims = png.scaleToFit(210, 48);
      page.drawImage(png, { x: x + 4, y: y - 54, width: dims.width, height: dims.height });
    }
  };
  if (form.signatures.includes("tenant")) await sigBlock(`SIGNED · ${String(ctx.tenant["full_name"] ?? "tenant")}`, i.tenantSignature, M);
  if (form.signatures.includes("staff")) await sigBlock(`FOR ${ctx.organisation.toUpperCase()} · ${ctx.staff}`, i.staffSignature, form.signatures.includes("tenant") ? M + 250 : M);
  y -= 70;
  page.drawText(`Signed ${i.signedAt.toLocaleString("en-GB")} · recorded by ${i.signedBy} · Tenant Hub`, { x: M, y, size: 8, font, color: SLATE });

  const bytes = await pdf.save();
  const safe = form.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new File([bytes], `${safe}-${String(ctx.tenant["full_name"] ?? "tenant").toString().replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${i.signedAt.toISOString().slice(0, 10)}.pdf`, { type: "application/pdf" });
}
