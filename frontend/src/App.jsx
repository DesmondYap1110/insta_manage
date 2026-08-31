import { Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import AdminLoginPage from './pages/AdminLoginPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import AccountsPage from './pages/AccountsPage.jsx'
import AccountDetailPage from './pages/AccountDetailPage.jsx'
import BrowsePage from './pages/BrowsePage.jsx'
import MediaLibraryPage from './pages/MediaLibraryPage.jsx'
import JobsPage from './pages/JobsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

// App is the root component and the auth gate. Until the session check
// finishes we show a splash; if there's no admin session the ONLY thing
// rendered is the sign-in screen, so no page or data is reachable without
// logging in. Once authenticated, AppLayout paints the shell and <Routes>
// swaps one page into it based on the URL.
export default function App() {
  const { admin, checking } = useAuth()

  if (checking) {
    return (
      <div className="auth-splash">
        <span className="spinner-border spinner-border-sm" />
        Checking session...
      </div>
    )
  }

  if (!admin) {
    return <AdminLoginPage />
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/accounts/:accountId" element={<AccountDetailPage />} />
        <Route path="/accounts/:accountId/browse" element={<BrowsePage />} />
        <Route path="/media" element={<MediaLibraryPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppLayout>
  )
}
