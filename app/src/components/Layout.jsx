import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useLang } from '../lib/i18n.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { supabase } from '../lib/supabase.js';

function usePendingCounts(enabled) {
  const loc = useLocation();
  const [c, setC] = useState({ expenses: 0, members: 0 });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const [e, m] = await Promise.all([
        supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      if (alive) setC({ expenses: e.count || 0, members: m.count || 0 });
    })();
    return () => { alive = false; };
  }, [enabled, loc.pathname]);
  return c;
}

export default function Layout({ children }) {
  const { t, L } = useLang();
  const { isAdmin } = useAuth();
  const { settings } = useSettings();
  const pc = usePendingCounts(isAdmin);
  const morePending = pc.members;

  const memberNav = [
    { to: '/', icon: '🏠', label: t('nav_home'), end: true },
    { to: '/donate', icon: '➕', label: t('nav_donate'), accent: true },
    { to: '/expenses', icon: '🧾', label: t('nav_expense') },
    { to: '/programs', icon: '📅', label: t('nav_programs') },
    { to: '/me', icon: '👤', label: t('nav_me') },
  ];
  const adminNav = [
    { to: '/', icon: '📊', label: t('nav_dashboard'), end: true },
    { to: '/donations', icon: '💰', label: t('nav_donations') },
    { to: '/donate', icon: '➕', label: t('nav_donate'), accent: true },
    { to: '/expenses', icon: '🧾', label: t('nav_expenses'), badge: pc.expenses },
    { to: '/more', icon: '☰', label: t('nav_more'), badge: morePending },
  ];
  const side = isAdmin ? [
    { to: '/', icon: '📊', label: t('nav_dashboard'), end: true },
    { to: '/donate', icon: '➕', label: t('nav_new_donation') },
    { to: '/donations', icon: '💰', label: t('nav_donations') },
    { to: '/expenses', icon: '🧾', label: t('nav_expenses'), badge: pc.expenses },
    { to: '/handover', icon: '🤝', label: t('nav_handover') },
    { to: '/programs', icon: '📅', label: t('nav_programs') },
    { to: '/members', icon: '👥', label: t('nav_members'), badge: pc.members },
    { to: '/public-page', icon: '📱', label: t('nav_public') },
    { to: '/settings', icon: '⚙️', label: t('nav_settings') },
    { to: '/history', icon: '📜', label: t('nav_history') },
    { to: '/me', icon: '👤', label: t('nav_me') },
  ] : [
    { to: '/', icon: '🏠', label: t('nav_home'), end: true },
    { to: '/donate', icon: '➕', label: t('nav_new_donation') },
    { to: '/donations', icon: '📋', label: t('nav_my_receipts') },
    { to: '/expenses', icon: '🧾', label: t('nav_expenses') },
    { to: '/programs', icon: '📅', label: t('nav_programs') },
    { to: '/me', icon: '👤', label: t('nav_me') },
  ];
  const bottom = isAdmin ? adminNav : memberNav;
  const temple = L(settings, 'temple_name') || t('app_name');

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          {settings.logo_url ? <img src={settings.logo_url} alt="" /> : <div className="lamp">🪔</div>}
          <div><b>{temple}</b><small>{L(settings, 'event_title')} {settings.event_year}</small></div>
        </div>
        {side.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <i>{n.icon}</i>{n.label}{n.badge ? <span className="nav-badge">{n.badge}</span> : null}
          </NavLink>
        ))}
      </aside>
      <div className="main">{children}</div>
      <nav className="bottom-nav">
        {bottom.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `${isActive ? 'active' : ''} ${n.accent ? 'accent' : ''}`}>
            <i>{n.icon}</i><span>{n.label}</span>{n.badge ? <span className="nav-badge">{n.badge}</span> : null}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
