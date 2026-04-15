import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ChatBadgeProvider } from './contexts/ChatBadgeContext'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import HouseRulesAgreement from './components/HouseRulesAgreement'
import VersionBadge from './components/VersionBadge'
import PwaUpdatePrompt from './components/PwaUpdatePrompt'
import AppBadge from './components/AppBadge'
import NotificationRegistration from './components/NotificationRegistration'
import Register from './pages/Register'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import Home from './pages/Home'
import AdminDashboard from './pages/AdminDashboard'
import InstallGuide from './pages/InstallGuide'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfUse from './pages/TermsOfUse'
import Tokushoho from './pages/Tokushoho'
import AdvertisingNotice from './pages/AdvertisingNotice'
import Licenses from './pages/Licenses'
import NotificationSettings from './pages/NotificationSettings'

function DocumentLangSync() {
  const { i18n } = useTranslation()
  useEffect(() => {
    const base = i18n.language.split('-')[0]
    document.documentElement.lang = base === 'en' ? 'en' : base === 'vi' ? 'vi' : 'ja'
  }, [i18n.language])
  return null
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <DocumentLangSync />
        <HouseRulesAgreement />
        <VersionBadge />
        <PwaUpdatePrompt />
        <AuthProvider>
          <ChatBadgeProvider>
            <AppBadge />
            <NotificationRegistration />
            <Routes>
              <Route path="/install-guide" element={<InstallGuide />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfUse />} />
              <Route path="/tokushoho" element={<Tokushoho />} />
              <Route path="/advertising" element={<AdvertisingNotice />} />
              <Route path="/licenses" element={<Licenses />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route
                path="/settings/notifications"
                element={
                  <ProtectedRoute>
                    <NotificationSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ChatBadgeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
