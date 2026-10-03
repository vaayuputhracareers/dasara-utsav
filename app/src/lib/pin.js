import { supabase } from './supabase.js';

/** Accounts made or reset after the switch to PINs carry user_metadata.pin_set = true.
 *  Older accounts (password login) are asked once to choose a PIN. */
export const needsPin = (session) => !!session && session.user?.user_metadata?.pin_set !== true;

/** Saves a new 6-digit PIN for the logged-in user. Returns null or an error. */
export async function savePin(pin) {
  let { error } = await supabase.auth.updateUser({ password: pin, data: { pin_set: true } });
  if (error && /same_password|should be different/i.test(`${error.code || ''} ${error.message || ''}`)) {
    // This PIN already is the account's password – only remember that it is a PIN now.
    ({ error } = await supabase.auth.updateUser({ data: { pin_set: true } }));
  }
  return error || null;
}

const WEAK = /^(\d)\1{5}$|^(012345|123456|234567|345678|456789|987654|876543|765432|654321|543210)$/;
/** Random 6-digit PIN for a new member / a PIN reset (never 111111, 123456 and the like). */
export function genPin() {
  for (;;) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
    const p = String(n).padStart(6, '0');
    if (!WEAK.test(p)) return p;
  }
}
