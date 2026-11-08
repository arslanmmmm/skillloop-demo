import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import './App.css'

// Each page is downloaded the first time it is opened, so the first load is
// smaller (bug #8). AppLayout shows "Loading…" under the header meanwhile.
const AdminPage = lazy(() => import('./pages/Admin.jsx'))
const ChatPage = lazy(() => import('./pages/Chat.jsx'))
const FeedPage = lazy(() => import('./pages/Feed.jsx'))
const LoginPage = lazy(() => import('./pages/Login.jsx'))
const MatchesPage = lazy(() => import('./pages/Matches.jsx'))
const ProfilePage = lazy(() => import('./pages/Profile.jsx'))
const ReviewPage = lazy(() => import('./pages/Review.jsx'))
const WritePage = lazy(() => import('./pages/Write.jsx'))

export default function App() {
  return (
    <Suspense fallback={<p className="hint page-loading">Loading…</p>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="/chat/:requestId" element={<ChatPage />} />
            <Route path="/write" element={<WritePage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/feed" replace />} />
        <Route path="*" element={<Navigate to="/feed" replace />} />
      </Routes>
    </Suspense>
  )
}
