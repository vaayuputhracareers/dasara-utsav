// Version 8 – Cash & Bank (admin): net position = cash in hand + cash at bank, how each is worked out,
// and the cash deposited into / withdrawn from the bank (so both balances stay right).
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAsync } from '../lib/useAsync.js';
import { errMsg } from '../lib/errors.js';
import { inr, inrSigned, fmtDay, todayIST, personName } from '../lib/format.js';
import { TRANSFER_SELECT, hasCashBank, hasOpening, openingOf, netOf, OPENING_KINDS, KIND_KEY, transferEffect } from '../lib/cashbank.js';
import { Page, Spinner, Empty, Field, Seg, Modal, useToast } from '../components/ui.jsx';
import { DbUpdateNotice, useDbVersion } from '../components/DbUpdate.jsx';

const n = (v) => Number(v || 0);

function Line({ sign, label, value, total }) {
  return (
    <div className={`cb-line ${total ? 'total' : ''}`}>
      <i>{sign}</i><span>{label}</span><b className="num">{inr(value)}</b>
    </div>
  );
}

export default function CashBank() {
  const { t, lang } = useLang();
  const [dbVersion, checkDb] = useDbVersion();
  const [modal, setModal] = useState(null);   // { kind, edit?, key }
  const [openingModal, setOpeningModal] = useState(false);
  const { data, loading, error, reload } = useAsync(async () => {
    const [dash, list, open] = await Promise.all([
      supabase.rpc('get_dashboard'),
      supabase.from('cash_transfers').select(TRANSFER_SELECT).in('kind', ['deposit', 'withdrawal'])
        .order('transfer_date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
      supabase.from('cash_transfers').select(TRANSFER_SELECT).in('kind', OPENING_KINDS),
    ]);
    if (dash.error) throw dash.error;
    return { d: dash.data, list: list.data || [], openings: open.data || [], ready: hasCashBank(dash.data) && !list.error };
  }, []);

  useEffect(() => {
    const onFocus = () => document.visibilityState === 'visible' && reload(true);
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [reload]);

  const d = data?.d;
  const owed = n(d?.owed_to_members);
  const net = netOf(d);
  const opening = openingOf(d);
  const openingDate = data?.openings?.[0]?.transfer_date;

  return (
    <Page title={t('cb_title')} back wide>
      <DbUpdateNotice version={dbVersion} onCheck={checkDb} />
      {loading && !data ? <Spinner /> : error && !data ? (
        <div className="alert err">{t('network_error')} <button className="btn ghost xs" onClick={() => reload()}>{t('retry')}</button></div>
      ) : data && !data.ready ? (
        <div className="alert info" data-testid="cb-needs-db">{t('cb_needs_db')}</div>
      ) : data && (
        <>
          <div className={`net net-col ${net >= 0 ? 'pos' : 'neg'}`}>
            <div className="net-top">
              <div><small>{t('net_position')}</small><div className="big" data-testid="cb-net">{inrSigned(net)}</div>
                <small>{owed > 0 ? t('cb_formula_owed') : t('cb_formula')}</small></div>
              <span className="pill">{net >= 0 ? t('surplus') : t('deficit')}</span>
            </div>
          </div>

          {hasOpening(d) ? (
            <div className="card" data-testid="cb-opening">
              <div className="card-title">{t('opening_title')}
                <button type="button" className="btn ghost xs" data-testid="opening-edit" onClick={() => setOpeningModal(true)}>
                  {opening > 0 ? `✏️ ${t('edit')}` : `➕ ${t('opening_set')}`}</button>
              </div>
              {opening > 0 ? (
                <div className="cb-where">
                  <div><small>{t('cash_in_hand')}</small><b className="num" data-testid="opening-cash">{inr(d.opening_cash)}</b></div>
                  <div><small>{t('cash_at_bank')}</small><b className="num" data-testid="opening-bank">{inr(d.opening_bank)}</b></div>
                </div>
              ) : <p className="hint">{t('opening_none')}</p>}
              {opening > 0 && openingDate && <p className="hint" style={{ marginTop: 6 }}>{t('opening_as_on', { date: fmtDay(openingDate, lang, true) })}</p>}
            </div>
          ) : <div className="alert info">{t('cb_needs_db_opening')}</div>}

          <div className="cols2">
            <div className="card cb-card" data-testid="cb-cash">
              <div className="cb-head"><span>{t('cash_in_hand')}</span><b className="num" data-testid="cb-cash-total">{inr(d.cash_in_hand)}</b></div>
              <div className="cb-where">
                <div><small>{t('cb_with_committee')}</small><b className="num" data-testid="cb-committee">{inr(d.cash_with_committee)}</b></div>
                <Link to="/handover"><small>{t('cb_with_members')} →</small><b className="num" data-testid="cb-members">{inr(d.cash_with_members)}</b></Link>
              </div>
              <div className="cb-calc">
                <div className="lbl">{t('cb_how_calc')}</div>
                {n(d.opening_cash) > 0 && <Line sign="+" label={t('cb_opening_line')} value={d.opening_cash} />}
                <Line sign="+" label={t('cb_cash_donations')} value={d.cash_total} />
                <Line sign="−" label={t('cb_cash_exp')} value={d.committee_cash_exp} />
                <Line sign="−" label={t('cb_setoff')} value={d.member_exp_setoff} />
                <Line sign="−" label={t('cb_paid_back_cash')} value={d.paid_back_cash} />
                <Line sign="−" label={t('cb_deposited')} value={d.deposits_total} />
                <Line sign="+" label={t('cb_withdrawn')} value={d.withdrawals_total} />
                {owed > 0 && <Line sign="+" label={t('cb_owed_add')} value={owed} />}
                <Line sign="=" label={t('cash_in_hand')} value={d.cash_in_hand} total />
              </div>
            </div>

            <div className="card cb-card" data-testid="cb-bank">
              <div className="cb-head"><span>{t('cash_at_bank')}</span><b className="num" data-testid="cb-bank-total">{inr(d.bank_balance)}</b></div>
              <div className="cb-calc">
                <div className="lbl">{t('cb_how_calc')}</div>
                {n(d.opening_bank) > 0 && <Line sign="+" label={t('cb_opening_line')} value={d.opening_bank} />}
                <Line sign="+" label={t('cb_upi_donations')} value={d.upi_total} />
                <Line sign="−" label={t('cb_upi_exp')} value={d.committee_upi_exp} />
                <Line sign="−" label={t('cb_paid_back_upi')} value={d.paid_back_upi} />
                <Line sign="+" label={t('cb_deposited')} value={d.deposits_total} />
                <Line sign="−" label={t('cb_withdrawn')} value={d.withdrawals_total} />
                <Line sign="=" label={t('cash_at_bank')} value={d.bank_balance} total />
              </div>
              {n(d.upi_unverified_total) > 0 && <p className="hint">{t('bank_unchecked_x', { amount: inr(d.upi_unverified_total) })}</p>}
            </div>
          </div>

          {owed > 0 && <div className="alert info">{t('net_owed_line', { amount: inr(owed) })}</div>}
          {n(d.cash_with_committee) < 0 && <div className="alert warn" data-testid="cb-committee-negative">{t('cb_committee_negative')}</div>}
          {n(d.bank_balance) < 0 && <div className="alert warn" data-testid="cb-bank-negative">{t('cb_bank_negative')}</div>}

          <div className="cb-actions">
            <button type="button" className="btn primary" data-testid="tr-deposit" onClick={() => setModal({ kind: 'deposit', key: Date.now() })}>{t('tr_deposit_btn')}</button>
            <button type="button" className="btn ghost" data-testid="tr-withdraw" onClick={() => setModal({ kind: 'withdrawal', key: Date.now() })}>{t('tr_withdraw_btn')}</button>
          </div>
          <p className="hint">{t('cb_expense_rule')}</p>

          <div className="card">
            <div className="card-title">{t('tr_list_title')}</div>
            {data.list.length === 0 ? <Empty icon="🏦" text={t('tr_none')} /> : (
              <div className="list" data-testid="tr-list">
                {data.list.map((x) => (
                  <div key={x.id} className="li" role="button" tabIndex={0} onClick={() => setModal({ kind: x.kind, edit: x, key: x.id })}
                    onKeyDown={(e) => e.key === 'Enter' && setModal({ kind: x.kind, edit: x, key: x.id })}>
                    <div className="avatar sm">{x.kind === 'withdrawal' ? '💵' : '🏦'}</div>
                    <div className="grow">
                      <div className="main-t">{t(KIND_KEY[x.kind] || 'tr_deposit')}</div>
                      <div className="sub-t">{fmtDay(x.transfer_date, lang, true)}{x.note ? ` · ${x.note}` : ''}</div>
                      {x.creator && <div className="sub-t">{t('by_x', { name: personName(x.creator, lang) })}</div>}
                    </div>
                    <div className="amt num">{inr(x.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      {openingModal && data?.ready && hasOpening(d) && (
        <OpeningModal openings={data.openings} onClose={() => setOpeningModal(false)}
          onSaved={() => { setOpeningModal(false); reload(true); }} />
      )}
      {modal && data?.ready && (
        <TransferModal key={modal.key} kind={modal.kind} edit={modal.edit} d={d}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(true); }} />
      )}
    </Page>
  );
}

// Version 9 – opening balance: one "cash in hand" and one "cash at bank" amount (0 / empty = none).
function OpeningModal({ openings, onClose, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const cur = (k) => openings.find((x) => x.kind === k);
  const [date, setDate] = useState(openings[0]?.transfer_date || todayIST());
  const [cash, setCash] = useState(cur('opening_cash') ? String(Number(cur('opening_cash').amount)) : '');
  const [bank, setBank] = useState(cur('opening_bank') ? String(Number(cur('opening_bank').amount)) : '');
  const [busy, setBusy] = useState(false);
  const amt = (v) => (v === '' ? 0 : Math.round(Number(v) * 100) / 100);
  const ok = [cash, bank].every((v) => { const a = amt(v); return Number.isFinite(a) && a >= 0 && a < 1e10; });

  const save = async () => {
    if (!ok) { toast(t('tr_invalid_amount'), 'error'); return; }
    setBusy(true);
    try {
      for (const [kind, v] of [['opening_cash', cash], ['opening_bank', bank]]) {
        const a = amt(v);
        const old = cur(kind);
        let res = null;
        if (a > 0) {
          res = old
            ? await supabase.from('cash_transfers').update({ amount: a, transfer_date: date || todayIST() }).eq('id', old.id)
            : await supabase.from('cash_transfers').insert({ kind, amount: a, transfer_date: date || todayIST(), note: '' });
        } else if (old) {
          res = await supabase.from('cash_transfers').delete().eq('id', old.id);
        }
        if (res?.error) throw res.error;
      }
      toast(t('opening_saved'), 'success');
      onSaved();
    } catch (e) {
      toast(errMsg(e, t), 'error');
    }
    setBusy(false);
  };

  return (
    <Modal open onClose={onClose} title={t('opening_title')}>
      <div className="stack" data-testid="opening-modal">
        <p className="hint">{t('opening_none')}</p>
        <Field label={t('opening_date')}><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t('opening_cash_label')} hint={t('opening_hint')}>
          <input className="input big" inputMode="decimal" placeholder="₹" value={cash} data-testid="opening-cash-input"
            onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ''))} />
        </Field>
        <Field label={t('opening_bank_label')} hint={t('opening_hint')}>
          <input className="input big" inputMode="decimal" placeholder="₹" value={bank} data-testid="opening-bank-input"
            onChange={(e) => setBank(e.target.value.replace(/[^0-9.]/g, ''))} />
        </Field>
        <button type="button" className="btn ok block" disabled={busy || !ok} onClick={save} data-testid="opening-save">✓ {t('save')}</button>
      </div>
    </Modal>
  );
}

function TransferModal({ kind: kind0, edit, d, onClose, onSaved }) {
  const { t } = useLang();
  const toast = useToast();
  const [kind, setKind] = useState(edit?.kind || kind0);
  const [date, setDate] = useState(edit?.transfer_date || todayIST());
  const [amount, setAmount] = useState(edit ? String(Number(edit.amount)) : '');
  const [note, setNote] = useState(edit?.note || '');
  const [busy, setBusy] = useState(false);

  // balances without this entry (when editing), so the "now" hint and the check are right
  const old = edit ? transferEffect(edit) : { cash: 0, bank: 0 };
  const committee = n(d.cash_with_committee) - old.cash;
  const bank = n(d.bank_balance) - old.bank;
  const amt = Math.round(Number(amount) * 100) / 100;
  const available = kind === 'deposit' ? committee : bank;
  const valid = amount !== '' && Number.isFinite(amt) && amt > 0 && amt < 1e10;

  const save = async () => {
    if (!valid) { toast(t('tr_invalid_amount'), 'error'); return; }
    setBusy(true);
    const row = { kind, transfer_date: date || todayIST(), amount: amt, note: note.trim() };
    const { error } = edit
      ? await supabase.from('cash_transfers').update(row).eq('id', edit.id)
      : await supabase.from('cash_transfers').insert(row);
    setBusy(false);
    if (error) { toast(errMsg(error, t), 'error'); return; }
    toast(t('tr_saved'), 'success');
    onSaved();
  };
  const remove = async () => {
    if (!window.confirm(t('tr_delete_confirm', { kind: t(KIND_KEY[edit.kind] || 'tr_deposit'), amount: inr(edit.amount) }))) return;
    setBusy(true);
    const { error } = await supabase.from('cash_transfers').delete().eq('id', edit.id);
    setBusy(false);
    if (error) { toast(errMsg(error, t), 'error'); return; }
    toast(t('tr_deleted'), 'success');
    onSaved();
  };

  return (
    <Modal open onClose={onClose} title={edit ? t('tr_edit_title') : kind === 'deposit' ? t('tr_deposit_btn') : t('tr_withdraw_btn')}>
      <div className="stack" data-testid="tr-modal">
        <Field label={t('tr_kind')}>
          <Seg value={kind} onChange={setKind} options={[{ value: 'deposit', label: `🏦 ${t('tr_deposit')}` }, { value: 'withdrawal', label: `💵 ${t('tr_withdrawal')}` }]} />
        </Field>
        <Field label={t('date')}><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={`${t('amount')} *`}
          hint={kind === 'deposit' ? t('tr_have_cash', { amount: inr(committee) }) : t('tr_have_bank', { amount: inr(bank) })}
          error={valid && amt > available ? t('tr_more_than') : null}>
          <input className="input big" inputMode="decimal" placeholder="₹" value={amount} data-testid="tr-amount"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} autoFocus={!edit} />
        </Field>
        <Field label={t('note')} optional>
          <input className="input" value={note} placeholder={t('tr_note_ph')} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
        <button type="button" className="btn ok block" disabled={busy || !valid} onClick={save} data-testid="tr-save">✓ {t('save')}</button>
        {edit && <button type="button" className="btn ghost danger-t block" disabled={busy} onClick={remove} data-testid="tr-delete">🗑️ {t('delete')}</button>}
      </div>
    </Modal>
  );
}
