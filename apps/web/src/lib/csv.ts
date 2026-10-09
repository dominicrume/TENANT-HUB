/** Tiny CSV writer for the ledger exports — quotes everything, Excel-safe BOM, no dependency. Browser only. */
export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.style.display = "none";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
