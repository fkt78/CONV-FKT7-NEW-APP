import { lazy, Suspense, useEffect } from 'react'
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

const Register = lazy(() => import('./pages/Register'))
const Login = lazy(() => import('./pages/Login'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const Home = lazy(() => import('./pages/Home'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const InstallGuide = lazy(() => import('./pages/InstallGuide'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'))
const Tokushoho = lazy(() => import('./pages/Tokushoho'))
const AdvertisingNotice = lazy(() => import('./pages/AdvertisingNotice'))
const Licenses = lazy(() => import('./pages/Licenses'))
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'))

function PageLoader() {
  return (
    <div className="h-dvh flex items-center justify-center bg-[#f5f5f7]">
      <div className="flex flex-col items-center gap-3">
        <span className="text-[#0095B6] text-3xl">♛</span>
        <div className="w-6 h-6 border-2 border-[#0095B6]/30 border-t-[#0095B6] rounded-full animate-spin" />
      </div>
    </div>
  )
}

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
            <Suspense fallback={<PageLoader />}>
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
            </Suspense>
          </ChatBadgeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
