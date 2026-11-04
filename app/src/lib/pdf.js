// A tiny PDF writer (change 28): one full-page JPEG picture per A4 page. Used by the accounts report.
const enc = new TextEncoder();

/** PDF text string in UTF-16 (any language). */
export function pdfText(s) {
  const str = String(s || '');
  let h = 'FEFF';
  for (let i = 0; i < str.length; i++) h += str.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  return `<${h}>`;
}

/** pages: [{ bytes: Uint8Array (JPEG), w, h }] → Blob (application/pdf), A4 portrait. */
export function pdfFromJpegs(pages, title = '') {
  const parts = [];
  const offsets = [];
  let len = 0;
  const put = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const start = (id) => { offsets[id] = len; put(`${id} 0 obj\n`); };
  const pid = (i) => 3 + i * 3;
  const n = pages.length;
  put('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
  start(1); put('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  start(2); put(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pid(i)} 0 R`).join(' ')}] /Count ${n} >>\nendobj\n`);
  pages.forEach((p, i) => {
    const a = pid(i);
    start(a);
    put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im${i} ${a + 2} 0 R >> >> /Contents ${a + 1} 0 R >>\nendobj\n`);
    const cs = `q 595.28 0 0 841.89 0 0 cm /Im${i} Do Q`;
    start(a + 1); put(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);
    start(a + 2);
    put(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`);
    put(p.bytes);
    put('\nendstream\nendobj\n');
  });
  const info = pid(n);
  start(info); put(`<< /Title ${pdfText(title)} /Producer (Dasara app) >>\nendobj\n`);
  const xref = len;
  let x = `xref\n0 ${info + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= info; i++) x += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  put(x);
  put(`trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
