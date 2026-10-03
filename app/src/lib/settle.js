/** Excel: how an approved member expense was settled (database version 7). */
export function settlementLabel(e) {
  if (!e.paid_by || e.status !== 'approved') return '';
  if (e.settled_mode) return e.settled_mode === 'upi' ? 'Paid back – temple UPI' : 'Paid back – cash';
  return e.handover_id ? 'Set off (in a cash handover)' : 'Set off against collections';
}
