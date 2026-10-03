import { fmtDateNum, num } from './format.js';

export const DEFAULT_TEMPLATE = `🙏 {temple} {event} – {year} 🙏

{donor} గారికి నమస్కారం,
మీరు అందించిన ₹{amount} విరాళాన్ని కృతజ్ఞతతో స్వీకరించాము.

🧾 రసీదు సంఖ్య: {receipt_no}
📅 తేదీ: {date}
💵 చెల్లింపు: {mode}
🪔 ఉద్దేశం: {purpose}
👤 స్వీకరించిన వారు: {collector}
🔗 రసీదు చూడండి: {link}

అమ్మవారి అనుగ్రహం మీ కుటుంబంపై సదా ఉండాలని ప్రార్థిస్తున్నాము.
– {committee}, {village}`;

export const TEMPLATE_TAGS = ['donor', 'amount', 'receipt_no', 'date', 'mode', 'purpose', 'collector', 'link', 'temple', 'event', 'year', 'committee', 'village'];

/** Fills {tags}. A line whose tag is empty and that ends with a label (":")
 *  is removed; trailing commas are cleaned. */
export function fillTemplate(tpl, vars) {
  const lines = String(tpl || '').split('\n').map((line) => {
    let hadEmpty = false;
    const out = line.replace(/\{(\w+)\}/g, (m, k) => {
      if (!(k in vars)) return m;
      const v = vars[k] == null ? '' : String(vars[k]);
      if (v.trim() === '') hadEmpty = true;
      return v;
    });
    if (!hadEmpty) return out;
    const tr = out.trim();
    if (tr === '' || /[:：]$/.test(tr)) return null;
    return out.replace(/[,،]\s*$/, '').replace(/ {2,}/g, ' ').replace(/\s+$/, '');
  });
  return lines.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Web address of the app, used in receipt links, the QR poster and login messages.
 *  Settings → "App web address" wins; otherwise the current site address
 *  (including a GitHub Pages folder such as /dasara-utsav). */
export function appBaseUrl(settings) {
  const b = (settings?.public_base_url || '').trim();
  return (b || window.location.origin + import.meta.env.BASE_URL).replace(/\/+$/, '');
}
export const receiptLink = (settings, token) => `${appBaseUrl(settings)}/r/${token}`;
export const publicPageLink = (settings) => `${appBaseUrl(settings)}/p/${settings.public_slug}`;

export function receiptVars(settings, d, collectorName) {
  return {
    temple: settings.temple_name_te || settings.temple_name_en || '',
    event: settings.event_title_te || settings.event_title_en || '',
    year: settings.event_year || '',
    donor: d.donor_name,
    amount: num(d.amount),
    receipt_no: d.receipt_no,
    date: fmtDateNum(d.collected_at || new Date()),
    mode: d.payment_mode === 'upi' ? 'UPI' : 'నగదు',
    purpose: d.purpose_te || d.purpose_en || '',
    collector: collectorName || '',
    link: d.verify_token ? receiptLink(settings, d.verify_token) : '',
    committee: settings.committee_name_te || settings.committee_name_en || '',
    village: settings.village_te || settings.village_en || '',
  };
}

export function buildReceiptMessage(settings, d, collectorName) {
  return fillTemplate(settings.receipt_template || DEFAULT_TEMPLATE, receiptVars(settings, d, collectorName));
}

export const waLink = (mobile, text) => `https://wa.me/91${mobile}?text=${encodeURIComponent(text)}`;
export const smsLink = (mobile, text) => `sms:+91${mobile}?body=${encodeURIComponent(text)}`;

/** The temple's UPI ID: name@bank (letters, digits, dot, dash, underscore before the @). */
export const UPI_ID_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

/** Note on public-page donations ("Dasara Sharannavaratri Mahotsavalu 2026 donation") – English letters only, as some UPI apps refuse others. */
export function donateNote(b) {
  const ascii = (v) => String(v || '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${ascii(b?.event_title_en)} ${b?.event_year || ''} donation`.replace(/\s+/g, ' ').trim().slice(0, 50);
}

export function upiLink({ upiId, payee, amount, note }) {
  // '@' stays as it is (standard UPI QR codes have it plain; some UPI apps don't decode %40)
  const parts = [`pa=${encodeURIComponent(String(upiId || '').trim()).replace(/%40/gi, '@')}`, `pn=${encodeURIComponent(payee || '')}`, 'cu=INR'];
  if (Number(amount) > 0) parts.push(`am=${Number(amount).toFixed(2)}`);
  if (note) parts.push(`tn=${encodeURIComponent(note.slice(0, 60))}`);
  return `upi://pay?${parts.join('&')}`;
}
