// Tiny ZIP writer (files are stored without compression – bill photos are JPEGs, already compressed).
// Used by Settings → Export data → "Bill photos (ZIP)".

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dos(d) {
  return {
    time: ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xffff,
    date: ((Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff,
  };
}

/** files: [{ name: 'folder/photo.jpg', data: Uint8Array, date?: Date }] → Blob (application/zip) */
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  const used = new Set();
  let offset = 0;
  let cenSize = 0;
  for (const f of files) {
    // unique names (two bills with the same name would hide each other)
    let nm = f.name;
    for (let i = 2; used.has(nm.toLowerCase()); i++) nm = f.name.replace(/(\.[^./]+)?$/, `-${i}$1`);
    used.add(nm.toLowerCase());
    const name = enc.encode(nm);
    const data = f.data;
    const crc = crc32(data);
    const { time, date } = dos(f.date || new Date());

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);        // version needed
    lh.setUint16(6, 0x0800, true);    // names are UTF-8
    lh.setUint16(8, 0, true);         // stored
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(lh, name, data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);        // version made by
    ch.setUint16(6, 20, true);        // version needed
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    // extra, comment, disk, internal attrs = 0
    ch.setUint32(38, 0, true);        // external attrs
    ch.setUint32(42, offset, true);   // where the local header starts
    central.push(ch, name);

    offset += 30 + name.length + data.length;
    cenSize += 46 + name.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/** Start a browser download of a Blob. */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
