// mynclex/lib/media/resize-image.ts
//
// Browser-only image downscaler. Picks a raster image, draws it onto
// a canvas scaled to fit within a max box, and re-encodes it to the
// same MIME type. Returns a fresh File the caller can hand straight
// to uploadAssetAction.
//
// Generic by design — any future "shrink before upload" purpose
// (avatars, rationale images, …) reuses this. The Image block in the
// tutor library (slice 11.6a) is the first caller, passed to
// <UploadField transform={…}>.
//
// Guarantees:
//   • Only re-encodes png / jpeg / webp (the types canvas can write).
//     Anything else is returned untouched.
//   • Never upscales — an image already within the box is returned
//     as-is, preserving the original bytes (and quality).
//   • Preserves the original MIME type and filename.

export interface ResizeImageOptions {
  /** Longest-edge ceiling in CSS pixels. Default 1600. */
  maxWidth?: number;
  maxHeight?: number;
  /** Encoder quality for lossy types (jpeg / webp). Ignored for png. */
  quality?: number;
}

const REENCODABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function resizeImage(
  file: File,
  options: ResizeImageOptions = {},
): Promise<File> {
  const { maxWidth = 1600, maxHeight = 1600, quality = 0.85 } = options;

  // Types canvas can't write back (e.g. gif) pass through unchanged.
  if (!REENCODABLE.has(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Corrupt or undecodable — let the upload action / bucket reject
    // it with a clearer error than we could give here.
    return file;
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, maxWidth / width, maxHeight / height);

  // Already within the box — nothing to gain from re-encoding.
  if (scale >= 1) {
    bitmap.close();
    return file;
  }

  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, file.type, quality),
  );
  if (!blob) return file;

  return new File([blob], file.name, {
    type: file.type,
    lastModified: Date.now(),
  });
}
