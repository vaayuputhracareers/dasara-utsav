// Version 8 – cash in hand / cash at bank: shared bits for the Cash & Bank page, the Dashboard report and the yearly export.
import { fmtDateTime } from './format.js';

/** Cash ⇄ bank entries with the name of the admin who wrote them. */
export const TRANSFER_SELECT = '*, creator:profiles!cash_transfers_created_by_fkey(full_name,name_te)';

/** The Dashboard numbers include the split only from database version 8 on. */
export const hasCashBank = (d) => !!d && d.bank_balance !== undefined && d.bank_balance !== null;

/** How one entry moves the two balances: deposit = cash ↓ bank ↑, withdrawal = bank ↓ cash ↑. */
export const transferEffect = (x) => {
  const a = Number(x?.amount || 0);
  return x?.kind === 'withdrawal' ? { cash: a, bank: -a } : { cash: -a, bank: a };
};

/** Excel rows ("Cash & Bank" sheet). dateCell turns 'YYYY-MM-DD' into what the sheet should show. */
export function transferRows(list, dateCell = (d) => d) {
  return (list || []).map((x) => {
    const fx = transferEffect(x);
    return {
      Date: dateCell(x.transfer_date),
      Entry: x.kind === 'withdrawal' ? 'Cash withdrawn from bank' : 'Cash deposited into bank',
      Amount: Number(x.amount),
      'Cash In Hand': fx.cash,
      'Cash At Bank': fx.bank,
      Note: x.note || '',
      'Entered By': x.creator?.full_name || x.creator?.name_te || '',
      'Entered On': fmtDateTime(x.created_at, 'en'),
    };
  });
}
