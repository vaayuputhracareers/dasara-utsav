import { supabase } from './supabase.js';

/** The database version (supabase/setup.sql → get_db_version) this build of the app needs. */
export const REQUIRED_DB_VERSION = 12;

/** 1 = database from before get_db_version existed, null = could not check (offline). */
export async function getDbVersion() {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_db_version');
  if (error) {
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message || '')) return 1;
    return null;
  }
  return Number(data) || 1;
}

/** The full supabase/setup.sql (loaded only when the admin taps "Copy SQL"). */
export async function setupSqlText() {
  const m = await import('../../../supabase/setup.sql?raw');
  return m.default;
}
