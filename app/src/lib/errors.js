const KNOWN = ['not_allowed', 'invalid_mobile', 'invalid_amount', 'donor_name_required', 'mobile_exists', 'last_admin',
  'cannot_change_own_role', 'reason_required', 'password_too_short', 'cannot_handover_self', 'not_found', 'signup_closed',
  'invalid_mode', 'member_not_found', 'invalid_role', 'db_update_needed', 'pin_invalid',
  'member_has_balance', 'member_has_pending', 'cannot_delete_admin', 'cannot_delete_self',
  'already_paid_back', 'already_set_off', 'paid_back_locked', 'use_settle_expense', 'not_member_expense', 'not_approved', 'not_paid_back'];

export function errMsg(e, t) {
  const m = String((e && (e.message || e.error_description || e.msg)) || e || '');
  for (const k of KNOWN) if (m.includes(k)) return t('err_' + k);
  if (/Email not confirmed|email_address_invalid|Email address .* is invalid|confirmation e-?mail/i.test(m)) return t('err_email_confirm');
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return t('network_error');
  if (/Invalid login credentials/i.test(m)) return t('login_failed');
  if (/already registered|already exists|duplicate key/i.test(m)) return t('err_mobile_exists');
  if (/Password should be at least|weak.password|Password should contain|easy to guess|pwned/i.test(m)) return t('err_weak_pin');
  if (/reauthenticat/i.test(m)) return t('err_relogin');
  if (/same_password|should be different from the old/i.test(m)) return t('err_same_pin');
  if (/row-level security|permission denied/i.test(m)) return t('err_not_allowed');
  return m && m !== '{}' ? m : t('error_generic');
}
