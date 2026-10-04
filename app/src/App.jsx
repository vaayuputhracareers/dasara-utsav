import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LangProvider } from './lib/i18n.jsx';
import { isConfigured } from './lib/supabase.js';
import { ToastProvider, Splash } from './components/ui.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import Layout from './components/Layout.jsx';
import { Login, Signup, Waiting, SetupNeeded, SetPin } from './pages/Auth.jsx';
import { needsPin } from './lib/pin.js';
import MemberHome from './pages/MemberHome.jsx';
import NewDonation from './pages/NewDonation.jsx';
import ReceiptDone from './pages/ReceiptDone.jsx';
import Donations from './pages/Donations.jsx';
import Expenses from './pages/Expenses.jsx';
import Programs from './pages/Programs.jsx';
import Me from './pages/Me.jsx';

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Handover = lazy(() => import('./pages/Handover.jsx'));
const Members = lazy(() => import('./pages/Members.jsx'));
const SettingsPage = lazy(() => import('./pages/Settings.jsx'));
const PublicSettings = lazy(() => import('./pages/PublicSettings.jsx'));
const More = lazy(() => import('./pages/More.jsx'));
const History = lazy(() => import('./pages/History.jsx'));
const CashBank = lazy(() => import('./pages/CashBank.jsx'));
const PublicPage = lazy(() => import('./pages/PublicPage.jsx'));
const ReceiptView = lazy(() => import('./pages/ReceiptView.jsx'));
const Festival = lazy(() => import('./pages/Festival.jsx'));   // version 12 – photos, saree donors, saree auction
const AllList = lazy(() => import('./pages/AllList.jsx'));     // version 12 – members: all donations / all expenses

// "/dasara-utsav/" when hosted at https://<user>.github.io/dasara-utsav/, otherwise "/".
// The trailing "/" keeps the home address inside the installed app's scope.
const BASENAME = import.meta.env.BASE_URL;

function Private() {
  const { loading, profileLoading, session, profile, isAdmin } = useAuth();
  if (!isConfigured) return <SetupNeeded />;
  if (loading || (session && profileLoading && !profile)) return <Splash />;
  if (!session) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  // Accounts from before the switch to PINs choose a 6-digit PIN once (blocked/closed accounts don't).
  if (profile && (profile.status === 'active' || profile.status === 'pending') && needsPin(session)) return <SetPin />;
  if (!profile || profile.status !== 'active') return <Waiting />;
  return (
    <SettingsProvider>
      <Layout>
        <Suspense fallback={<Splash />}>
          <Routes>
            <Route path="/" element={isAdmin ? <Dashboard /> : <MemberHome />} />
            <Route path="/donate" element={<NewDonation />} />
            <Route path="/donate/done/:id" element={<ReceiptDone />} />
            <Route path="/donations" element={<Donations />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/programs" element={<Programs />} />
            <Route path="/puja" element={<Programs />} />
            <Route path="/me" element={<Me />} />
            <Route path="/photos" element={<Festival />} />
            <Route path="/sarees" element={<Festival />} />
            <Route path="/auction" element={<Festival />} />
            <Route path="/all-donations" element={<AllList />} />
            <Route path="/all-expenses" element={<AllList />} />
            {isAdmin && (
              <>
                <Route path="/handover" element={<Handover />} />
                <Route path="/cash-bank" element={<CashBank />} />
                <Route path="/members" element={<Members />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/public-page" element={<PublicSettings />} />
                <Route path="/history" element={<History />} />
                <Route path="/more" element={<More />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <LangProvider>
      <ToastProvider>
        <BrowserRouter basename={BASENAME}>
          <Suspense fallback={<Splash />}>
            <Routes>
              <Route path="/p/:slug" element={isConfigured ? <PublicPage /> : <SetupNeeded />} />
              <Route path="/r/:token" element={isConfigured ? <ReceiptView /> : <SetupNeeded />} />
              <Route path="/*" element={<AuthProvider><Private /></AuthProvider>} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </LangProvider>
  );
}
