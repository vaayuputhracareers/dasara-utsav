import { createClient } from '@supabase/supabase-js';

const raw = (typeof window !== 'undefined' && window.APP_CONFIG) || {};
// Tolerate copy/paste slips: spaces, a trailing "/", or the ".../rest/v1" address.
const cfg = {
  supabaseUrl: String(raw.supabaseUrl || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/i, ''),
  supabaseKey: String(raw.supabaseKey || '').trim(),
};
export const isConfigured = Boolean(cfg.supabaseUrl && cfg.supabaseKey);
export const SUPABASE_URL = isConfigured
  ? new URL(cfg.supabaseUrl, window.location.origin).href.replace(/\/$/, '')
  : '';
const KEY = cfg.supabaseKey;

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'utsav-auth' },
    })
  : null;

/** A throw-away client used by the admin to create a member account
 *  without logging the admin out. */
export function makeTempClient() {
  return createClient(SUPABASE_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'utsav-tmp-' + Date.now() },
  });
}

/* Members log in with their MOBILE NUMBER. Internally Supabase needs an
   e-mail, so we map 9876543210 -> 9876543210@members.utsav.invalid
   (".invalid" is a reserved domain: no e-mail is ever delivered there). */
export const LOGIN_DOMAIN = 'members.utsav.invalid';

export function cleanMobile(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
export const isValidMobile = (m) => /^[6-9][0-9]{9}$/.test(cleanMobile(m));
export const mobileToEmail = (m) => `${cleanMobile(m)}@${LOGIN_DOMAIN}`;
/** What a mobile box keeps while typing/pasting: digits only, at most 10 ("+91 98765 43210" → "9876543210"). */
export const toMobile10 = (v) => cleanMobile(v).slice(0, 10);
/** Logins use a 6-digit PIN (stored as the account password). */
export const isPin = (v) => /^[0-9]{6}$/.test(String(v || ''));

/** Fetch every row of a query, 1000 at a time (Supabase returns max 1000 per call). */
export async function fetchAll(build, pageSize = 1000) {
  let from = 0;
  let out = [];
  for (;;) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
