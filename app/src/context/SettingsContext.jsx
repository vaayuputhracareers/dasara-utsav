import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { Splash } from '../components/ui.jsx';
import { rememberSplash } from '../lib/splash.js';

const Ctx = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const { data, error: e } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (e) setError(e); else { setSettings(data); setError(null); rememberSplash(data); }
    return data;
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (patch) => {
    const { data, error: e } = await supabase.from('app_settings').update(patch).eq('id', 1).select().single();
    if (e) throw e;
    setSettings(data);
    rememberSplash(data);
    return data;
  }, []);

  if (!settings) return <Splash error={error} onRetry={reload} />;
  return <Ctx.Provider value={{ settings, reload, save }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
