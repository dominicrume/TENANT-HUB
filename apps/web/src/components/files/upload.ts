/**
 * Client side of the file layer (docs/FILES_SPEC.md): one upload call for
 * every surface, with a device-made thumbnail for images and real progress.
 */
import { compressImage } from "../../lib/compress-image";

export type FileEntity = "tenant" | "property" | "unit" | "landlord";
export type FileKind = "photo" | "document";

export interface FileItemView {
  id: string; kind: FileKind; table: "entity_media" | "tenant_documents" | "property_documents" | "landlord_documents";
  entity: FileEntity; entityId: string; blobId: string | null; name: string; fileName: string | null; mimeType: string | null; size: number | null;
  sha256: string | null; hasThumb: boolean; isCover: boolean; status: "received" | "requested"; uploadedBy: string | null; createdAt: string; expiresOn: string | null;
  section?: number | null;
  url: string | null; downloadUrl: string | null; thumbUrl: string | null;
}
export interface ChecklistItem { type: string; status: "have" | "missing" | "expired" | "requested"; fileId?: string }
export interface FilesResponse { items: FileItemView[]; checklist: ChecklistItem[]; documentTypes: string[]; counts: { photos: number; documents: number; requested: number } }

/** ≤320px JPEG for the grid, made here so the server never decodes images. Returns null for anything that can't be drawn. */
export async function makeThumbnail(file: File, max = 320): Promise<{ blob: Blob; width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.78));
    return blob ? { blob, width: bitmap.width, height: bitmap.height } : null;
  } catch { return null; }
}

export function formatBytes(n: number | null | undefined): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fileIcon(mime: string | null | undefined, name?: string | null): string {
  const m = (mime ?? "").toLowerCase(); const n = (name ?? "").toLowerCase();
  if (m.startsWith("image/")) return "🖼️";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "📄";
  if (m.includes("word") || n.endsWith(".doc") || n.endsWith(".docx")) return "📝";
  if (m.includes("sheet") || m.includes("excel") || n.endsWith(".xls") || n.endsWith(".xlsx") || n.endsWith(".csv")) return "📊";
  return "📎";
}

/** Uploads one file through /api/files/upload with progress. Images are compressed first and get a thumbnail. */
export function uploadFile(i: { entity: FileEntity; id: string; kind: FileKind; type: string; file: File; expiresOn?: string | null; section?: number | null; onProgress?: (pct: number) => void }): Promise<{ item: FileItemView | null; items: FileItemView[] }> {
  return new Promise(async (resolve, reject) => {
    try {
      const isImage = i.file.type.startsWith("image/");
      const file = isImage ? await compressImage(i.file) : i.file;
      const thumb = isImage ? await makeThumbnail(file) : null;
      const fd = new FormData();
      fd.append("entity", i.entity); fd.append("id", i.id); fd.append("kind", i.kind); fd.append("type", i.type);
      if (i.expiresOn) fd.append("expiresOn", i.expiresOn);
      if (i.section) fd.append("section", String(i.section));
      fd.append("file", file, i.file.name);
      if (thumb) { fd.append("thumb", thumb.blob, "thumb.jpg"); fd.append("width", String(thumb.width)); fd.append("height", String(thumb.height)); }
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/files/upload");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && i.onProgress) i.onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        let body: any = null; try { body = JSON.parse(xhr.responseText); } catch { /* not json */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body?.error ?? `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error("Could not reach the server"));
      xhr.send(fd);
    } catch (e) { reject(e instanceof Error ? e : new Error("Upload failed")); }
  });
}
