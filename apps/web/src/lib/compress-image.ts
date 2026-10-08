/**
 * Resizes and re-compresses an image client-side before it ever reaches the
 * network. A phone camera photo is routinely 3-8MB at a resolution no avatar
 * display needs — uploading that raw (and storing it as-is in Postgres,
 * document_blobs) is most of why a photo upload felt slow. Caps the longest
 * edge at maxDimension and re-encodes as JPEG at the given quality; falls
 * back to the original file if anything about this fails (canvas/image
 * decode errors), so a slow network is the worst case, never a broken
 * upload.
 */
export async function compressImage(file: File, maxDimension = 1024, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // never upload something bigger than the original

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
