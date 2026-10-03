import { supabase } from '../lib/supabase.js';
import { useLang } from '../lib/i18n.jsx';
import { useAsync } from '../lib/useAsync.js';
import { inr, fmtDateTime, personName } from '../lib/format.js';
import { Page, Spinner, Empty } from '../components/ui.jsx';

function describe(a, t, people, lang) {
  const d = a.details || {};
  const pair = (v, f = (x) => x) => (Array.isArray(v) && String(v[0]) !== String(v[1]) ? `${f(v[0])} → ${f(v[1])}` : null);
  const parts = [];
  if (a.entity === 'donation') {
    parts.push(a.entity_id);
    const am = pair(d.amount, inr); if (am) parts.push(am);
    const md = pair(d.mode); if (md) parts.push(md);
    const dn = pair(d.donor); if (dn) parts.push(dn);
    if (d.reason) parts.push(t('reason_x', { reason: d.reason }));
  } else if (a.entity === 'handover') {
    parts.push(personName(people[d.member], lang));
    parts.push(`${t('received_x', { amount: inr(d.received) })} / ${t('expected_x', { amount: inr(d.expected) })}`);
  } else if (a.entity === 'expense') {
    if (d.category) parts.push(d.category);
    const am = pair(d.amount, inr); if (am) parts.push(am); else if (Array.isArray(d.amount)) parts.push(inr(d.amount[1])); else if (d.amount != null) parts.push(inr(d.amount));
    if (d.member) parts.push(personName(people[d.member], lang));   // pay back (version 7)
    if (d.mode) parts.push(d.mode === 'upi' ? t('temple_upi') : t('cash'));
    if (d.note) parts.push(d.note);
  } else if (a.entity === 'transfer') {   // version 8: cash ⇄ bank entries
    const last = (v) => (Array.isArray(v) ? v[1] : v);
    parts.push(last(d.kind) === 'withdrawal' ? t('tr_withdrawal') : t('tr_deposit'));
    const am = pair(d.amount, inr); if (am) parts.push(am); else if (last(d.amount) != null) parts.push(inr(last(d.amount)));
    const dt = pair(d.date); if (dt) parts.push(dt); else if (last(d.date)) parts.push(last(d.date));
    if (d.note) parts.push(d.note);
  } else if (a.entity === 'all' && a.action === 'data_deleted') {
    parts.push(t('audit_deleted_x', { d: d.donations ?? 0, e: d.expenses ?? 0, h: d.handovers ?? 0 }));
    if (d.members_removed) parts.push(`${t('del_members')}: ${d.members_removed}`);
  } else if (a.entity === 'export') {
    parts.push(a.entity_id === 'all' ? t('all_years') : a.entity_id);
    if (d.file) parts.push(d.file);
  } else if (a.entity === 'profile') {
    parts.push(d.name || personName(people[a.entity_id], lang) || '');
    const r = pair(d.role); if (r) parts.push(r);
    const s = pair(d.status); if (s) parts.push(s);
  }
  return parts.filter(Boolean).join(' · ');
}

export default function History() {
  const { t, lang } = useLang();
  const { data, loading } = useAsync(async () => {
    const [a, p] = await Promise.all([
      supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(300),
      supabase.from('profiles').select('id,full_name,name_te'),
    ]);
    if (a.error) throw a.error;
    return { log: a.data, people: Object.fromEntries((p.data || []).map((x) => [x.id, x])) };
  }, []);
  return (
    <Page title={`📜 ${t('audit_title')}`} back="/more" wide>
      <div className="card">
        {loading ? <Spinner /> : !data?.log?.length ? <Empty icon="📜" text={t('nothing_here')} /> : (
          <div className="list">
            {data.log.map((a) => (
              <div key={a.id} className="li" style={{ cursor: 'default' }}>
                <div className="grow">
                  <div className="main-t">{t('audit_' + a.action) !== 'audit_' + a.action ? t('audit_' + a.action) : a.action}</div>
                  <div className="sub-t">{describe(a, t, data.people, lang)}</div>
                  <div className="sub-t num">{fmtDateTime(a.at, lang)}{a.actor ? ` · ${t('by_x', { name: personName(data.people[a.actor], lang) })}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
