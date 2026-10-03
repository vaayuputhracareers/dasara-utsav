/**
 * sheets: [{ name, rows: [ {col: value} ] }]                      ← table (header = object keys)
 *      or [{ name, aoa: [[...], [...]], cols: [widths] }]          ← free layout (e.g. a summary)
 * Optional per sheet:
 *   money:      ['Amount', ...]  column names (rows) or indexes (aoa) shown as money (#,##0 / #,##0.00)
 *   filter:     true             adds Excel filter buttons to the header row
 *   dateNF:     'dd-mm-yyyy'     how JS Date values are shown
 */
export async function exportSheets(fileName, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const s of sheets) {
    const opts = { cellDates: true, dateNF: s.dateNF || 'dd-mm-yyyy' };
    let ws;
    let moneyCols = [];
    if (s.aoa) {
      ws = XLSX.utils.aoa_to_sheet(s.aoa, opts);
      if (s.cols) ws['!cols'] = s.cols.map((w) => ({ wch: w }));
      moneyCols = (s.money || []).filter((c) => typeof c === 'number');
    } else {
      const rows = s.rows.length ? s.rows : [{ '-': '' }];
      ws = XLSX.utils.json_to_sheet(rows, opts);
      const keys = Object.keys(rows[0]);
      ws['!cols'] = keys.map((k) => ({
        wch: Math.min(40, Math.max(10, k.length + 2, ...rows.slice(0, 200).map((r) => (r[k] instanceof Date ? 12 : String(r[k] ?? '').length + 1)))),
      }));
      moneyCols = (s.money || []).map((k) => keys.indexOf(k)).filter((i) => i >= 0);
      if (s.filter && s.rows.length && ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
    }
    if (moneyCols.length && ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (const c of moneyCols) {
        const cells = [];
        for (let r = range.s.r; r <= range.e.r; r++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell && cell.t === 'n') cells.push(cell);
        }
        const fmt = cells.every((x) => Number.isInteger(x.v)) ? '#,##0' : '#,##0.00';
        cells.forEach((x) => { x.z = fmt; });
      }
    }
    // Excel sheet names: max 31 characters, no : \ / ? * [ ] and unique
    let nm = String(s.name || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Sheet';
    for (let i = 2; used.has(nm.toLowerCase()); i++) nm = `${nm.slice(0, 28)} ${i}`;
    used.add(nm.toLowerCase());
    XLSX.utils.book_append_sheet(wb, ws, nm);
  }
  XLSX.writeFile(wb, fileName, { compression: true });
}
