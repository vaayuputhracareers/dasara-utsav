import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = useCallback(async (s) => {
    if (!s) { setProfile(null); return null; }
    setProfileLoading(true);
    let { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    if (!data) {
      // safety net: create the profile if the database trigger could not (see setup.sql)
      const r = await supabase.rpc('ensure_my_profile');
      if (r.data) data = r.data;
      else if (r.error && /signup_closed/.test(r.error.message || '')) data = { id: s.user.id, status: 'closed', full_name: '', mobile: (s.user.email || '').split('@')[0] };
    }
    setProfile(data || null);
    setProfileLoading(false);
    return data;
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return undefined; }
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (alive) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        if (s) setProfileLoading(true);
        setTimeout(() => loadProfile(s), 0); // never call supabase inside this callback directly
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const value = {
    session, profile, loading, profileLoading,
    isAdmin: profile?.role === 'admin' && profile?.status === 'active',
    refreshProfile: () => loadProfile(session),
    signOut,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
