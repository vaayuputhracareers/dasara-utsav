/** Shrinks a phone photo (often 4–8 MB) to a light JPEG before upload.
 *  keepAlpha: pictures that can be see-through (PNG/WebP/GIF) are kept as PNG, so a logo with a
 *  transparent background stays transparent. Everything else becomes JPEG on a white background
 *  (JPEG has no transparency – without the white fill see-through parts would turn black). */
export async function compressImage(file, maxSide = 1400, quality = 0.72, { keepAlpha = false } = {}) {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const png = keepAlpha && /png|webp|gif|svg/i.test(file.type || '');
    if (!png) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const blob = await new Promise((res) => c.toBlob(res, png ? 'image/png' : 'image/jpeg', quality));
    return blob || file;
  } catch {
    return file;
  }
}

/** File extension for an image type ("image/png" → "png"). */
export const imageExt = (type) => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[type] || 'jpg');
