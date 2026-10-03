// Versions 8–9 – opening balance, cash in hand, cash at bank: shared bits for the Cash & Bank page, the Dashboard,
// the members' financial position and the Excel exports.
import { fmtDateTime } from './format.js';

/** Cash ⇄ bank entries with the name of the admin who wrote them. */
export const TRANSFER_SELECT = '*, creator:profiles!cash_transfers_created_by_fkey(full_name,name_te)';

/** The split is there from database version 8 on, the opening balance from version 9 on. */
export const hasCashBank = (d) => !!d && d.bank_balance !== undefined && d.bank_balance !== null;
export const hasOpening = (d) => !!d && d.opening_cash !== undefined && d.opening_cash !== null;
export const openingOf = (d) => Number(d?.opening_cash || 0) + Number(d?.opening_bank || 0);

/** Net position = opening balance + donations − approved expenses (= cash in hand + cash at bank − owed to members). */
export const netOf = (d) => (!d ? 0 : d.net_position != null ? Number(d.net_position)
  : Number(d.donations_total || 0) - Number(d.expenses_total || 0));

export const OPENING_KINDS = ['opening_cash', 'opening_bank'];
export const isOpening = (x) => OPENING_KINDS.includes(x?.kind);

/** Text (i18n key) of each kind of entry. */
export const KIND_KEY = { deposit: 'tr_deposit', withdrawal: 'tr_withdrawal', opening_cash: 'tr_opening_cash', opening_bank: 'tr_opening_bank' };
const KIND_EN = {
  deposit: 'Cash deposited into bank', withdrawal: 'Cash withdrawn from bank',
  opening_cash: 'Opening balance – cash in hand', opening_bank: 'Opening balance – cash at bank',
};

/** How one entry moves the two balances. */
export const transferEffect = (x) => {
  const a = Number(x?.amount || 0);
  switch (x?.kind) {
    case 'withdrawal': return { cash: a, bank: -a };
    case 'opening_cash': return { cash: a, bank: 0 };
    case 'opening_bank': return { cash: 0, bank: a };
    default: return { cash: -a, bank: a };   // deposit
  }
};

/** Excel rows ("Cash & Bank" sheet). dateCell turns 'YYYY-MM-DD' into what the sheet should show. */
export function transferRows(list, dateCell = (d) => d) {
  return (list || []).map((x) => {
    const fx = transferEffect(x);
    return {
      Date: dateCell(x.transfer_date),
      Entry: KIND_EN[x.kind] || x.kind,
      Amount: Number(x.amount),
      'Cash In Hand': fx.cash,
      'Cash At Bank': fx.bank,
      Note: x.note || '',
      'Entered By': x.creator?.full_name || x.creator?.name_te || '',
      'Entered On': fmtDateTime(x.created_at, 'en'),
    };
  });
}
