import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
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
import Home from './pages/Home'
import AdminDashboard from './pages/AdminDashboard'
import InstallGuide from './pages/InstallGuide'
import PrivacyPolicy from './pages/PrivacyPolicy'
import TermsOfUse from './pages/TermsOfUse'
import Tokushoho from './pages/Tokushoho'
import Licenses from './pages/Licenses'
import NotificationSettings from './pages/NotificationSettings'

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <HouseRulesAgreement />
        <VersionBadge />
        <PwaUpdatePrompt />
        <AuthProvider>
          <AppBadge />
          <NotificationRegistration />
          <Routes>
            <Route path="/install-guide" element={<InstallGuide />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfUse />} />
            <Route path="/tokushoho" element={<Tokushoho />} />
            <Route path="/licenses" element={<Licenses />} />
            <Route path="/register" element={<Register />} />
            <Route path="/login" element={<Login />} />
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
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
