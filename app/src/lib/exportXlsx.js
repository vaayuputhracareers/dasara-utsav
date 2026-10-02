/** sheets: [{ name, rows: [ {col: value} ] }] */
export async function exportSheets(fileName, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ '-': '' }]);
    const keys = Object.keys(s.rows[0] || { '-': '' });
    ws['!cols'] = keys.map((k) => ({ wch: Math.min(40, Math.max(10, k.length + 2, ...s.rows.slice(0, 200).map((r) => String(r[k] ?? '').length + 1))) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, fileName);
}
